import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asOwner,
  asUser,
  createTestUser,
  ctxFor,
  readingAs,
  rejects,
  resetData,
  shutdown,
  type TestUser,
} from './helpers/harness.ts';
import { parseOrThrow } from '../src/lib/validate.ts';
import { createPerson } from '../src/lib/people/mutations.ts';
import { personInputSchema } from '../src/lib/people/types.ts';
import { getPerson } from '../src/lib/people/queries.ts';
import { createProperty } from '../src/lib/properties/mutations.ts';
import { propertyInputSchema } from '../src/lib/properties/types.ts';
import {
  communicationInputSchema,
  communicationStatistics,
  getCommunication,
  listCommunications,
  logCommunication,
  timelineFor,
  updateCommunication,
} from '../src/lib/communications.ts';
import {
  MERGE_FIELDS,
  createTemplate,
  listTemplates,
  mergeFieldsUsed,
  mergeValuesFor,
  renderTemplate,
  templateInputSchema,
  unknownMergeFields,
  updateTemplate,
} from '../src/lib/templates.ts';
import { COMMUNICATION_CHANNELS, COMMUNICATION_OUTCOMES } from '../src/lib/domain.ts';
import { getTask } from '../src/lib/tasks.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let agent: TestUser;
let otherAgent: TestUser;
let managementCtx: Ctx;
let agentCtx: Ctx;
let otherAgentCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT' });
  agent = await createTestUser({ role: 'AGENT' });
  otherAgent = await createTestUser({ role: 'AGENT' });
  managementCtx = await ctxFor(management);
  agentCtx = await ctxFor(agent);
  otherAgentCtx = await ctxFor(otherAgent);
});

after(shutdown);

async function aPerson(user: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(user, (db) =>
    createPerson(
      db,
      ctx,
      parseOrThrow(personInputSchema, {
        firstName: 'Johan',
        surname: 'van der Merwe',
        title: 'Mr',
        clientTypes: ['buyer'],
        contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        ...overrides,
      }),
    ),
  );
}

async function aProperty(user: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(user, (db) =>
    createProperty(
      db,
      ctx,
      parseOrThrow(propertyInputSchema, {
        erfNumber: '1234',
        streetAddress: '18 Main Road',
        suburb: 'Wilderness',
        city: 'George',
        currentAskingPrice: '2950000',
        bedrooms: '3',
        ...overrides,
      }),
    ),
  );
}

function logInput(overrides: Record<string, unknown> = {}) {
  return parseOrThrow(communicationInputSchema, {
    direction: 'outgoing',
    channel: 'call',
    body: 'Talked about the Wilderness house.',
    outcome: 'spoke_to_them',
    ...overrides,
  });
}

// =====================================================================
describe('the V1 communication rule, at the database (spec 6, 143)', () => {
  it('has no column that could claim a message was delivered or read', async () => {
    const columns = await asOwner((db) =>
      db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'communications'`,
      ),
    );
    const names = columns.map((row) => row.column_name);

    // If a future integration adds any of these, it has to be a deliberate
    // migration — and this test is where the conversation starts.
    for (const forbidden of [
      'delivery_status',
      'delivered_at',
      'read_at',
      'opened_at',
      'provider_message_id',
      'external_message_id',
      'bounced',
      'bounce_reason',
      'send_status',
    ]) {
      assert.ok(!names.includes(forbidden), `communications must not have ${forbidden}`);
    }
    assert.ok(names.includes('occurred_at'), 'it records when a person says it happened');
    assert.ok(names.includes('logged_by_hand'));
  });

  it('refuses a row that claims to have been captured automatically', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into communications
             (person_id, direction, channel, body, logged_by_hand)
           values ($1, 'outgoing', 'email', 'x', false)`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /are_hand_logged|check constraint/i);
  });

  it('offers no outcome that asserts delivery', () => {
    // Every outcome describes what the PERSON observed. None of them asserts
    // something only a provider could tell us.
    const labels = Object.values(COMMUNICATION_OUTCOMES).join(' | ').toLowerCase();
    for (const forbidden of ['delivered', 'read receipt', 'opened', 'bounced', 'undeliverable']) {
      assert.ok(!labels.includes(forbidden), `no outcome may say "${forbidden}"`);
    }
    assert.ok(Object.keys(COMMUNICATION_OUTCOMES).includes('sent_from_my_own_app'));
    assert.ok(Object.keys(COMMUNICATION_OUTCOMES).includes('no_reply_yet'));
  });

  it('refuses an outcome the vocabulary does not contain', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into communications (person_id, direction, channel, body, outcome)
           values ($1,'outgoing','email','x','delivered')`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /outcome|check constraint/i);
  });
});

// =====================================================================
describe('logging what was said (spec 43)', () => {
  it('records a conversation against a person', async () => {
    const person = await aPerson(management, managementCtx);
    const logged = await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: person.id })),
    );

    const stored = await readingAs(management, (db) => getCommunication(db, logged.id));
    assert.ok(stored);
    assert.equal(stored.channel, 'call');
    assert.equal(stored.direction, 'outgoing');
    assert.equal(stored.outcome, 'spoke_to_them');
    assert.equal(stored.personName, 'Johan van der Merwe');
    assert.equal(stored.agentId, management.id, 'the conversation belongs to somebody');
  });

  it('records one they started, which is a different thing', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({
          personId: person.id,
          direction: 'incoming',
          channel: 'whatsapp',
          body: 'Asked whether the Wilderness house is still available.',
          outcome: 'they_replied',
        }),
      ),
    );

    const rows = await readingAs(management, (db) =>
      listCommunications(db, { personId: person.id, direction: 'incoming' }),
    );
    assert.equal(rows.total, 1);
    assert.equal(rows.rows[0]?.direction, 'incoming');
  });

  it('will not accept a conversation about nobody', () => {
    assert.throws(() => logInput({}), /check the highlighted fields|who or what/i);
  });

  it('will not accept a conversation with nothing recorded about it', () => {
    assert.throws(
      () => parseOrThrow(communicationInputSchema, { channel: 'call', personId: crypto.randomUUID() }),
      /check the highlighted fields|what was said/i,
    );
  });

  it('refuses a row with no substance at the database too', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into communications (person_id, direction, channel) values ($1,'outgoing','call')`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /needs_substance|check constraint/i);
  });

  it('keeps a length only where one makes sense', async () => {
    const person = await aPerson(management, managementCtx);
    const call = await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, channel: 'call', durationMinutes: '12' }),
      ),
    );
    assert.equal(
      (await readingAs(management, (db) => getCommunication(db, call.id)))?.durationMinutes,
      12,
    );

    assert.throws(
      () => logInput({ personId: person.id, channel: 'email', durationMinutes: '12' }),
      /check the highlighted fields|call or a meeting/i,
    );
  });

  it('can never be deleted by the application', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: person.id })),
    );
    const refused = await rejects(asUser(management, (db) => db.query('delete from communications')));
    assert.match(refused.message, /permission denied/i);
  });

  it('is corrected rather than replaced, and the correction is audited (spec 104)', async () => {
    const person = await aPerson(management, managementCtx);
    const logged = await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: person.id })),
    );
    const before = await readingAs(management, (db) => getCommunication(db, logged.id));

    await asUser(management, (db) =>
      updateCommunication(
        db,
        managementCtx,
        logged.id,
        logInput({
          personId: person.id,
          body: 'Talked about the Wilderness house. He wants to see it on Saturday.',
          outcome: 'spoke_to_them',
        }),
        before!.rowVersion,
      ),
    );

    const after = await readingAs(management, (db) => getCommunication(db, logged.id));
    assert.match(after?.body ?? '', /Saturday/);

    const audit = await asOwner((db) =>
      db.query<{ action: string }>(
        `select action from audit_logs where entity_id = $1 order by occurred_at`,
        [logged.id],
      ),
    );
    assert.deepEqual(audit.map((row) => row.action), [
      'communication.logged',
      'communication.corrected',
    ]);

    // A stale save is refused (spec 105).
    const refused = await rejects(
      asUser(management, (db) =>
        updateCommunication(
          db,
          managementCtx,
          logged.id,
          logInput({ personId: person.id }),
          before!.rowVersion,
        ),
      ),
    );
    assert.match(refused.message, /updated by another user/i);
  });
});

// =====================================================================
describe('first and last contact, kept in step (spec 45)', () => {
  it('is set from the log rather than typed separately', async () => {
    const person = await aPerson(management, managementCtx);
    const fresh = await readingAs(management, (db) => getPerson(db, person.id));
    assert.equal(fresh?.firstContactAt, null, 'nothing until a conversation is logged');

    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2026-03-04T09:00', channel: 'call' }),
      ),
    );
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2026-05-06T14:30', channel: 'whatsapp' }),
      ),
    );

    const updated = await readingAs(management, (db) => getPerson(db, person.id));
    assert.match(updated?.firstContactAt ?? '', /^2026-03-04/);
    assert.match(updated?.lastContactAt ?? '', /^2026-05-06/);
    assert.equal(updated?.lastContactMethod, 'whatsapp');
    assert.equal(
      COMMUNICATION_CHANNELS[updated?.lastContactMethod as 'whatsapp'],
      'WhatsApp',
      'and the stored value is one the interface can label',
    );
  });

  it('does not let an out-of-order entry move the last contact backwards', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2026-05-06T14:30', channel: 'whatsapp' }),
      ),
    );
    // Somebody catching up on an older call they forgot to log.
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2026-01-02T10:00', channel: 'call' }),
      ),
    );

    const person2 = await readingAs(management, (db) => getPerson(db, person.id));
    assert.match(person2?.firstContactAt ?? '', /^2026-01-02/, 'the first moves back');
    assert.match(person2?.lastContactAt ?? '', /^2026-05-06/, 'the last stays put');
    assert.equal(person2?.lastContactMethod, 'whatsapp');
  });

  it('rebuilds the dates when a wrongly dated entry is corrected', async () => {
    const person = await aPerson(management, managementCtx);
    const logged = await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2027-12-31T10:00' }),
      ),
    );
    assert.match(
      (await readingAs(management, (db) => getPerson(db, person.id)))?.lastContactAt ?? '',
      /^2027-12-31/,
    );

    const before = await readingAs(management, (db) => getCommunication(db, logged.id));
    await asUser(management, (db) =>
      updateCommunication(
        db,
        managementCtx,
        logged.id,
        logInput({ personId: person.id, occurredAt: '2026-02-03T10:00' }),
        before!.rowVersion,
      ),
    );

    const fixed = await readingAs(management, (db) => getPerson(db, person.id));
    assert.match(
      fixed?.lastContactAt ?? '',
      /^2026-02-03/,
      'a correction has to be able to move the date back, not only forward',
    );
  });
});

// =====================================================================
describe('a follow-up that actually exists (spec 45)', () => {
  it('creates a real task, not a date in a note', async () => {
    const person = await aPerson(management, managementCtx);
    const logged = await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({
          personId: person.id,
          followUpAt: '2026-09-20T09:00',
          followUpTitle: 'Ring back about the Saturday viewing',
        }),
      ),
    );

    assert.ok(logged.taskId);
    const task = await readingAs(management, (db) => getTask(db, logged.taskId!));
    assert.equal(task?.title, 'Ring back about the Saturday viewing');
    assert.equal(task?.personId, person.id);
    assert.equal(task?.status, 'to_do');

    const stored = await readingAs(management, (db) => getCommunication(db, logged.id));
    assert.equal(stored?.taskId, logged.taskId, 'and the two know about each other');
  });

  it('insists on knowing what the follow-up is for', () => {
    assert.throws(
      () => logInput({ personId: crypto.randomUUID(), followUpAt: '2026-09-20T09:00' }),
      /check the highlighted fields|what the follow-up is for/i,
    );
  });
});

// =====================================================================
describe('who can see a conversation (spec 9)', () => {
  it('lets an agent see their own and their client’s, but not another agent’s', async () => {
    const mine = await aPerson(agent, agentCtx, { firstName: 'Mine' });
    const theirs = await aPerson(otherAgent, otherAgentCtx, { firstName: 'Theirs' });

    await asUser(agent, (db) => logCommunication(db, agentCtx, logInput({ personId: mine.id })));
    await asUser(otherAgent, (db) =>
      logCommunication(db, otherAgentCtx, logInput({ personId: theirs.id })),
    );

    assert.equal((await readingAs(agent, (db) => listCommunications(db, {}))).total, 1);
    assert.equal((await readingAs(otherAgent, (db) => listCommunications(db, {}))).total, 1);
    assert.equal(
      (await readingAs(management, (db) => listCommunications(db, {}))).total,
      2,
      'management sees the office',
    );
  });

  it('will not let one agent correct another agent’s note', async () => {
    const theirs = await aPerson(otherAgent, otherAgentCtx);
    const logged = await asUser(otherAgent, (db) =>
      logCommunication(db, otherAgentCtx, logInput({ personId: theirs.id })),
    );

    const refused = await rejects(
      asUser(agent, (db) =>
        updateCommunication(db, agentCtx, logged.id, logInput({ personId: theirs.id }), 1),
      ),
    );
    assert.match(refused.message, /not found|conversation|permission|policy/i);
  });

  it('keeps somebody whose permission has been withdrawn out', async () => {
    // Every role can record what was said, which is right — support staff
    // answer the phone too. The mechanism for stopping one person is the
    // per-user deny override, so that is what this checks.
    const person = await aPerson(management, managementCtx);
    const support = await createTestUser({ role: 'LIMITED' });

    await asOwner((db) =>
      db.query(
        `insert into user_permission_overrides (user_id, permission_id, effect, reason)
         select $1, id, 'deny', 'Test' from permissions where code = 'COMMUNICATION_CREATE'`,
        [support.id],
      ),
    );
    const supportCtx = await ctxFor(support);

    const refused = await rejects(
      asUser(support, (db) => logCommunication(db, supportCtx, logInput({ personId: person.id }))),
    );
    assert.match(refused.message, /policy|permission/i);
  });
});

// =====================================================================
describe('templates (spec 44)', () => {
  it('ships a starting set that never claims the CRM sends anything', async () => {
    const templates = await readingAs(management, (db) => listTemplates(db, {}));
    assert.ok(templates.length >= 5);

    for (const template of templates) {
      const text = `${template.name} ${template.subject ?? ''} ${template.body}`;
      assert.ok(
        !/we have sent|email sent|whatsapp sent|message sent|automatically sent/i.test(text),
        `"${template.name}" must not imply the CRM sent something`,
      );
    }
  });

  it('every merge field in the shipped templates is a real one', async () => {
    const templates = await readingAs(management, (db) => listTemplates(db, {}));
    for (const template of templates) {
      const bad = unknownMergeFields(`${template.subject ?? ''} ${template.body}`);
      assert.deepEqual(bad, [], `"${template.name}" refers to ${bad.join(', ')}`);
    }
  });

  it('fills in what it can from the record in front of you', async () => {
    const person = await aPerson(management, managementCtx);
    const property = await aProperty(management, managementCtx);

    const detail = await readingAs(management, (db) => getPerson(db, person.id));
    const { getProperty } = await import('../src/lib/properties/queries.ts');
    const propertyDetail = await readingAs(management, (db) => getProperty(db, property.id));

    const values = mergeValuesFor({
      person: detail,
      property: propertyDetail,
      agent: { name: 'Ayden Grobler', phone: '082 000 0000', email: 'ayden@grproperty.co.za' },
    });

    const rendered = renderTemplate(
      {
        subject: 'About {{property_address}}',
        body: 'Good day {{first_name}}, {{property_ref}} is at {{asking_price}}. {{agent_name}}',
      },
      values,
    );

    assert.equal(rendered.subject, 'About 18 Main Road, Wilderness, George');
    assert.match(rendered.body, /Good day Johan/);
    assert.match(rendered.body, /GRLP-P-\d{8}/);
    assert.match(rendered.body.replace(/\s/g, ''), /R2950000/);
    assert.match(rendered.body, /Ayden Grobler$/);
    assert.deepEqual(rendered.unfilled, []);
  });

  /**
   * The behaviour that matters most: a person is about to send this by hand,
   * so a field with nothing behind it must be visible, not silently blank.
   */
  it('leaves a field it cannot fill visible rather than blanking it', () => {
    const rendered = renderTemplate(
      { subject: null, body: 'Good day {{first_name}}, about {{property_address}}.' },
      { first_name: 'Johan' },
    );
    assert.equal(rendered.body, 'Good day Johan, about {{property_address}}.');
    assert.deepEqual(rendered.unfilled, ['property_address']);
    assert.ok(!rendered.body.includes('about .'), 'never a sentence with a hole in it');
  });

  it('reports a field that is not a field at all', () => {
    const rendered = renderTemplate(
      { subject: null, body: 'Hello {{first_name}} {{bank_account}}' },
      { first_name: 'Johan' },
    );
    assert.deepEqual(rendered.unknown, ['bank_account']);
    assert.match(rendered.body, /\{\{bank_account\}\}/, 'and leaves it alone');
  });

  it('finds merge fields whatever the spacing and casing', () => {
    assert.deepEqual(
      mergeFieldsUsed('{{first_name}} {{ surname }} {{FIRST_NAME}}').sort(),
      ['first_name', 'surname'],
    );
  });

  it('is created and edited only by an administrator', async () => {
    const input = parseOrThrow(templateInputSchema, {
      name: 'Test wording',
      category: 'general',
      channel: 'email',
      subject: 'Hello {{first_name}}',
      body: 'Good day {{first_name}}, from {{agent_name}}.',
    });

    const created = await asUser(management, (db) => createTemplate(db, managementCtx, input));
    assert.ok(created.id);

    const refused = await rejects(asUser(agent, (db) => createTemplate(db, agentCtx, input)));
    assert.match(refused.message, /policy|permission/i);

    // But an agent can read them, because they compose with them.
    assert.ok((await readingAs(agent, (db) => listTemplates(db, {}))).length > 0);
  });

  it('refuses a stale edit', async () => {
    const created = await asUser(management, (db) =>
      createTemplate(
        db,
        managementCtx,
        parseOrThrow(templateInputSchema, { name: 'Versioned', body: 'Hello' }),
      ),
    );
    const refused = await rejects(
      asUser(management, (db) =>
        updateTemplate(
          db,
          managementCtx,
          created.id,
          parseOrThrow(templateInputSchema, { name: 'Versioned', body: 'Changed' }),
          99,
        ),
      ),
    );
    assert.match(refused.message, /updated by another user/i);
  });

  it('counts a template as used when a conversation names it', async () => {
    const person = await aPerson(management, managementCtx);
    const templates = await readingAs(management, (db) => listTemplates(db, {}));
    const template = templates[0]!;

    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, channel: 'email', templateId: template.id }),
      ),
    );

    const after = await readingAs(management, (db) => listTemplates(db, {}));
    assert.equal(after.find((row) => row.id === template.id)?.timesUsed, template.timesUsed + 1);
  });

  it('describes every merge field it offers', () => {
    for (const field of MERGE_FIELDS) {
      assert.ok(field.label.length > 0, field.key);
      assert.ok(field.example.length > 0, field.key);
    }
  });
});

// =====================================================================
describe('the timeline (spec 99, 100)', () => {
  it('puts what happened in order, from the records themselves', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({ personId: person.id, occurredAt: '2026-03-04T09:00', body: 'First call' }),
      ),
    );
    await asUser(management, (db) =>
      logCommunication(
        db,
        managementCtx,
        logInput({
          personId: person.id,
          occurredAt: '2026-05-06T09:00',
          channel: 'whatsapp',
          body: 'Followed up',
        }),
      ),
    );

    const timeline = await readingAs(management, (db) =>
      timelineFor(db, { personId: person.id }, new Set(['COMMUNICATION_VIEW'])),
    );

    assert.equal(timeline.length, 2);
    assert.match(timeline[0]?.at ?? '', /^2026-05-06/, 'newest first');
    assert.match(timeline[0]?.title ?? '', /whatsapp/i);
    assert.equal(timeline[1]?.detail, 'First call');
  });

  /**
   * The parts of the timeline are separate queries against separate tables,
   * and a person relates to each of them differently — they are a lead's
   * person, but a transaction's BUYER or SELLER. Getting that wrong makes the
   * whole profile page fail rather than merely showing less, so every section
   * is exercised together here.
   */
  it('works for a person who is a party to a sale, and for the property', async () => {
    const buyer = await aPerson(management, managementCtx, { firstName: 'Bea' });
    const seller = await aPerson(management, managementCtx, {
      firstName: 'Sam',
      contacts: [{ contactType: 'mobile', value: '083 222 3333', isPrimary: true }],
    });
    const property = await aProperty(management, managementCtx);

    const { createTransaction, transactionInputSchema } = await import('../src/lib/sales.ts');
    await asUser(management, (db) =>
      createTransaction(
        db,
        managementCtx,
        parseOrThrow(transactionInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          transactionValue: '2850000',
          status: 'sale_concluded',
          saleDate: '2026-09-10',
        }),
      ),
    );
    await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: buyer.id })),
    );

    const everything = new Set([
      'COMMUNICATION_VIEW',
      'LEADS_VIEW',
      'SALES_VIEW',
      'COMPLIANCE_VIEW',
    ]);

    const forBuyer = await readingAs(management, (db) =>
      timelineFor(db, { personId: buyer.id }, everything),
    );
    assert.ok(
      forBuyer.some((entry) => entry.kind === 'transaction'),
      'the buyer sees the sale on their timeline',
    );
    assert.ok(forBuyer.some((entry) => entry.kind === 'communication'));

    const forSeller = await readingAs(management, (db) =>
      timelineFor(db, { personId: seller.id }, everything),
    );
    assert.ok(
      forSeller.some((entry) => entry.kind === 'transaction'),
      'and so does the seller',
    );

    const forProperty = await readingAs(management, (db) =>
      timelineFor(db, { propertyId: property.id }, everything),
    );
    assert.ok(forProperty.some((entry) => entry.kind === 'transaction'));
  });

  it('leaves out what the reader may not see', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: person.id })),
    );

    const withoutPermission = await readingAs(management, (db) =>
      timelineFor(db, { personId: person.id }, new Set(['LEADS_VIEW'])),
    );
    assert.equal(withoutPermission.length, 0, 'no communications section without the permission');
  });
});

// =====================================================================
describe('counting conversations for a dashboard', () => {
  it('counts by channel and notices who has never been contacted', async () => {
    const contacted = await aPerson(management, managementCtx, { firstName: 'Contacted' });
    await aPerson(management, managementCtx, {
      firstName: 'Forgotten',
      contacts: [{ contactType: 'mobile', value: '083 999 0000', isPrimary: true }],
    });

    await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: contacted.id, channel: 'call' })),
    );
    await asUser(management, (db) =>
      logCommunication(db, managementCtx, logInput({ personId: contacted.id, channel: 'whatsapp' })),
    );

    const stats = await readingAs(management, (db) => communicationStatistics(db));
    assert.equal(stats.total, 2);
    assert.equal(stats.peopleContacted, 1);
    assert.equal(stats.withoutAnyContact, 1, 'the one nobody has spoken to');
    assert.ok(stats.byChannel.some((row) => row.channel === 'call' && row.count === 1));
  });
});
