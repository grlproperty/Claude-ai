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
import {
  addDoNotContact,
  addEvidence,
  complianceSummary,
  dncInputSchema,
  evidenceInputSchema,
  listDoNotContact,
  listEvidence,
  listPermissions,
  permissionHistory,
  permissionInputSchema,
  preflight,
  preflightMany,
  releaseDoNotContact,
  setPermission,
} from '../src/lib/compliance.ts';
import {
  addNumberToBatch,
  batchAsCsv,
  batchInputSchema,
  cancelBatch,
  createBatch,
  fillBatchWithUncheckedNumbers,
  getBatch,
  listBatchItems,
  loadBatchResults,
  markBatchSubmitted,
  parseResultsCsv,
} from '../src/lib/ncc.ts';
import { escapeCsvValue, safeFilename, toCsv } from '../src/lib/csv.ts';
import { contactLinks, stopNotice } from '../src/lib/contact-links.ts';
import { getNumberSetting, setSetting } from '../src/lib/settings.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let accounts: TestUser;
let agent: TestUser;
let otherAgent: TestUser;
let managementCtx: Ctx;
let accountsCtx: Ctx;
let agentCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT' });
  accounts = await createTestUser({ role: 'ACCOUNTS' });
  agent = await createTestUser({ role: 'AGENT' });
  otherAgent = await createTestUser({ role: 'AGENT' });
  managementCtx = await ctxFor(management);
  accountsCtx = await ctxFor(accounts);
  agentCtx = await ctxFor(agent);
});

after(shutdown);

async function aPerson(
  user: TestUser,
  ctx: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  return asUser(user, (db) =>
    createPerson(
      db,
      ctx,
      parseOrThrow(personInputSchema, {
        firstName: 'Thembi',
        surname: 'Nkosi',
        clientTypes: ['buyer'],
        contacts: [{ contactType: 'mobile', value: '082 111 2222', isPrimary: true }],
        ...overrides,
      }),
    ),
  );
}

// =====================================================================
describe('contact permissions (spec 52, 53)', () => {
  it('records a permission and keeps its history', async () => {
    const person = await aPerson(management, managementCtx);

    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
        }),
      ),
    );

    const permissions = await readingAs(management, (db) => listPermissions(db, person.id));
    assert.equal(permissions.length, 1);
    assert.equal(permissions[0]?.status, 'granted');
    assert.ok(permissions[0]?.grantedAt, 'a granted permission records when');
  });

  it('never loses a withdrawal (spec 104)', async () => {
    const person = await aPerson(management, managementCtx);
    const grant = parseOrThrow(permissionInputSchema, {
      personId: person.id,
      channel: 'call',
      purpose: 'direct_marketing',
      status: 'granted',
      lawfulBasis: 'consent',
    });
    await asUser(management, (db) => setPermission(db, managementCtx, grant));
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'call',
          purpose: 'direct_marketing',
          status: 'withdrawn',
          reason: 'Asked us on the phone',
        }),
      ),
    );

    const history = await readingAs(management, (db) => permissionHistory(db, person.id));
    assert.equal(history.length, 2);
    assert.equal(history[0]?.newStatus, 'withdrawn');
    assert.equal(history[0]?.oldStatus, 'granted');
    assert.equal(history[0]?.reason, 'Asked us on the phone');
    assert.equal(history[1]?.newStatus, 'granted');

    const current = await readingAs(management, (db) => listPermissions(db, person.id));
    assert.equal(current[0]?.status, 'withdrawn');
    assert.ok(current[0]?.withdrawnAt);
  });

  it('refuses to let anyone rewrite the permission history', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'sms',
          purpose: 'direct_marketing',
          status: 'withdrawn',
        }),
      ),
    );

    const refusedUpdate = await rejects(
      asUser(management, (db) =>
        db.query(
          "update contact_permission_history set new_status = 'granted' where person_id = $1",
          [person.id],
        ),
      ),
    );
    assert.match(refusedUpdate.message, /append-only|permission/i);

    const refusedDelete = await rejects(
      asUser(management, (db) =>
        db.query('delete from contact_permission_history where person_id = $1', [person.id]),
      ),
    );
    assert.match(refusedDelete.message, /append-only|permission/i);
  });

  it('refuses a granted permission with no date, at the database', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into contact_permissions (person_id, channel, purpose, status)
           values ($1, 'email', 'direct_marketing', 'granted')`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /granted_needs_date|check constraint/i);
  });

  it('keeps evidence and links it to the permission', async () => {
    const person = await aPerson(management, managementCtx);
    const evidence = await asUser(management, (db) =>
      addEvidence(
        db,
        managementCtx,
        parseOrThrow(evidenceInputSchema, {
          personId: person.id,
          evidenceType: 'signed_form',
          reference: 'Mandate page 3',
        }),
      ),
    );
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
          evidenceId: evidence.id,
        }),
      ),
    );

    const stored = await readingAs(management, (db) => listEvidence(db, person.id));
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.evidenceType, 'signed_form');

    const permissions = await readingAs(management, (db) => listPermissions(db, person.id));
    assert.equal(permissions[0]?.evidenceId, evidence.id);
    assert.match(permissions[0]?.evidenceSummary ?? '', /signed_form/);
  });
});

// =====================================================================
describe('do not contact (spec 54)', () => {
  it('is released rather than deleted, with a reason', async () => {
    const person = await aPerson(management, managementCtx);
    const entry = await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, {
          personId: person.id,
          channel: 'all',
          source: 'client_request',
          reason: 'Asked at the office',
        }),
      ),
    );

    const active = await readingAs(management, (db) => listDoNotContact(db, { state: 'active' }));
    assert.equal(active.length, 1);

    await asUser(management, (db) =>
      releaseDoNotContact(db, managementCtx, entry.id, 'Signed a new mandate and agreed', 1),
    );

    assert.equal(
      (await readingAs(management, (db) => listDoNotContact(db, { state: 'active' }))).length,
      0,
    );
    const released = await readingAs(management, (db) =>
      listDoNotContact(db, { state: 'released' }),
    );
    assert.equal(released.length, 1, 'the record of the request survives');
    assert.equal(released[0]?.releaseReason, 'Signed a new mandate and agreed');
    assert.equal(released[0]?.reason, 'Asked at the office');
  });

  it('will not be released without a reason', async () => {
    const person = await aPerson(management, managementCtx);
    const entry = await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, { personId: person.id, source: 'complaint' }),
      ),
    );
    const refused = await rejects(
      asUser(management, (db) => releaseDoNotContact(db, managementCtx, entry.id, '   ', 1)),
    );
    assert.match(refused.message, /why/i);

    // And the database refuses it too, not just the application.
    const refusedAtDb = await rejects(
      asOwner((db) =>
        db.query('update do_not_contact set released_at = now() where id = $1', [entry.id]),
      ),
    );
    assert.match(refusedAtDb.message, /release_needs_reason|check constraint/i);
  });

  it('cannot be deleted by the application at all', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, { personId: person.id, source: 'client_request' }),
      ),
    );
    const refused = await rejects(
      asUser(management, (db) => db.query('delete from do_not_contact')),
    );
    assert.match(refused.message, /permission denied/i);
  });

  it('matches a number however it was typed', async () => {
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, { contactValue: '082 111 2222', source: 'client_request' }),
      ),
    );
    const row = await readingAs(management, (db) =>
      db.one<{ contact_value_normalised: string }>(
        'select contact_value_normalised from do_not_contact limit 1',
      ),
    );
    assert.equal(row.contact_value_normalised, '+27821112222');
  });

  it('needs either a person or a value', () => {
    let fieldErrors: Record<string, string[]> | undefined;
    try {
      parseOrThrow(dncInputSchema, { source: 'other' });
    } catch (thrown) {
      fieldErrors = (thrown as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    }
    assert.ok(fieldErrors, 'it must be refused');
    assert.match((fieldErrors.contactValue ?? []).join(' '), /person or a number/i);
  });
});

// =====================================================================
describe('the direct-marketing preflight (spec 57)', () => {
  it('is red when the person asked not to be contacted', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'call',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
        }),
      ),
    );
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, {
          personId: person.id,
          channel: 'all',
          source: 'client_request',
        }),
      ),
    );

    const verdict = await readingAs(management, (db) => preflight(db, person.id, 'call'));
    assert.equal(verdict.status, 'red');
    assert.match(verdict.reasons.join(' '), /asked not to be contacted/i);
  });

  it('is red when permission was withdrawn, even for a different channel', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'withdrawn',
        }),
      ),
    );

    assert.equal(
      (await readingAs(management, (db) => preflight(db, person.id, 'email'))).status,
      'red',
    );
    // The other channel was never asked about, so it is amber, not red and
    // not green.
    assert.equal(
      (await readingAs(management, (db) => preflight(db, person.id, 'call'))).status,
      'amber',
    );
  });

  it('is amber when nothing has been recorded', async () => {
    const person = await aPerson(management, managementCtx);
    const verdict = await readingAs(management, (db) => preflight(db, person.id, 'email'));
    assert.equal(verdict.status, 'amber');
    assert.match(verdict.reasons.join(' '), /no permission has been recorded/i);
  });

  it('is amber when permission is recorded but nothing backs it up', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
        }),
      ),
    );
    const verdict = await readingAs(management, (db) => preflight(db, person.id, 'email'));
    assert.equal(verdict.status, 'amber');
    assert.match(verdict.reasons.join(' '), /nothing was kept to back it up/i);
  });

  it('is green once permission is evidenced, for a channel needing no NCC check', async () => {
    const person = await aPerson(management, managementCtx, {
      contacts: [{ contactType: 'email', value: 'thembi@example.com', isPrimary: true }],
    });
    const evidence = await asUser(management, (db) =>
      addEvidence(
        db,
        managementCtx,
        parseOrThrow(evidenceInputSchema, {
          personId: person.id,
          evidenceType: 'website_form',
        }),
      ),
    );
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
          evidenceId: evidence.id,
        }),
      ),
    );

    const verdict = await readingAs(management, (db) => preflight(db, person.id, 'email'));
    assert.equal(verdict.status, 'green', verdict.reasons.join(' '));
  });

  it('stays amber for calling until the number has been checked against the register', async () => {
    const person = await aPerson(management, managementCtx);
    const evidence = await asUser(management, (db) =>
      addEvidence(
        db,
        managementCtx,
        parseOrThrow(evidenceInputSchema, { personId: person.id, evidenceType: 'signed_form' }),
      ),
    );
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'call',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
          evidenceId: evidence.id,
        }),
      ),
    );

    const verdict = await readingAs(management, (db) => preflight(db, person.id, 'call'));
    assert.equal(verdict.status, 'amber');
    assert.match(verdict.reasons.join(' '), /not been checked against the NCC register/i);
  });

  /**
   * The property the whole design turns on. An agent who cannot see a
   * do-not-contact entry must still be told red.
   */
  it('never returns green merely because the reader could not see the reason', async () => {
    const person = await aPerson(otherAgent, await ctxFor(otherAgent), {
      contacts: [{ contactType: 'email', value: 'private@example.com', isPrimary: true }],
    });
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, {
          personId: person.id,
          channel: 'all',
          source: 'complaint',
        }),
      ),
    );

    // This agent is confined to their own records and genuinely cannot read
    // the person, the permission or the do-not-contact row.
    assert.equal(
      (await readingAs(agent, (db) => listDoNotContact(db, { state: 'active' }))).length,
      0,
    );

    const verdict = await readingAs(agent, (db) => preflight(db, person.id, 'email'));
    assert.equal(verdict.status, 'red');
  });

  it('gives a verdict for a whole list before anything is sent', async () => {
    const clear = await aPerson(management, managementCtx, {
      firstName: 'Clear',
      contacts: [{ contactType: 'email', value: 'clear@example.com', isPrimary: true }],
    });
    const stopped = await aPerson(management, managementCtx, {
      firstName: 'Stopped',
      contacts: [{ contactType: 'email', value: 'stopped@example.com', isPrimary: true }],
    });

    const evidence = await asUser(management, (db) =>
      addEvidence(
        db,
        managementCtx,
        parseOrThrow(evidenceInputSchema, { personId: clear.id, evidenceType: 'email_reply' }),
      ),
    );
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: clear.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
          evidenceId: evidence.id,
        }),
      ),
    );
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, { personId: stopped.id, source: 'client_request' }),
      ),
    );

    const verdicts = await readingAs(management, (db) =>
      preflightMany(db, [clear.id, stopped.id], 'email'),
    );
    const byId = new Map(verdicts.map((row) => [row.personId, row.verdict.status]));
    assert.equal(byId.get(clear.id), 'green');
    assert.equal(byId.get(stopped.id), 'red');
  });
});

// =====================================================================
describe('the NCC register (spec 55, 56)', () => {
  it('is never described as connected', async () => {
    const { NCC_CONNECTION_STATUS } = await import('../src/lib/ncc.ts');
    assert.equal(NCC_CONNECTION_STATUS, 'NOT CONNECTED');
  });

  it('takes its cost from settings and keeps it even if the price later changes', async () => {
    await asUser(management, (db) => setSetting(db, managementCtx, 'ncc.cost_per_number', 2.25));

    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'September clean' })),
    );

    await asUser(management, (db) => setSetting(db, managementCtx, 'ncc.cost_per_number', 9.99));

    const stored = await readingAs(accounts, (db) => getBatch(db, batch.id));
    assert.equal(stored?.costPerNumber, '2.25');
    assert.equal(await readingAs(management, (db) => getNumberSetting(db, 'ncc.cost_per_number', 0)), 9.99);
  });

  it('gathers only the numbers that actually need checking, and costs the batch', async () => {
    await asUser(management, (db) => setSetting(db, managementCtx, 'ncc.cost_per_number', 1.5));
    await aPerson(management, managementCtx, { firstName: 'One' });
    await aPerson(management, managementCtx, {
      firstName: 'Two',
      contacts: [{ contactType: 'mobile', value: '083 333 4444', isPrimary: true }],
    });

    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'First run' })),
    );
    const filled = await asUser(accounts, (db) =>
      fillBatchWithUncheckedNumbers(db, accountsCtx, batch.id),
    );
    assert.equal(filled.added, 2);

    const stored = await readingAs(accounts, (db) => getBatch(db, batch.id));
    assert.equal(stored?.itemCount, 2);
    assert.equal(stored?.checkedCount, 0, 'nothing is checked until results come back');
    assert.equal(stored?.estimatedCost, 3);

    // Filling it again adds nothing, because the numbers are already in it.
    assert.equal(
      (await asUser(accounts, (db) => fillBatchWithUncheckedNumbers(db, accountsCtx, batch.id))).added,
      0,
    );
  });

  it('exports the batch as a file a person sends, with formulas neutralised', async () => {
    await aPerson(management, managementCtx, {
      firstName: '=cmd|/c calc',
      surname: 'Exploit',
      contacts: [{ contactType: 'mobile', value: '082 999 8888', isPrimary: true }],
    });
    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'Export test' })),
    );
    await asUser(accounts, (db) => fillBatchWithUncheckedNumbers(db, accountsCtx, batch.id));

    const csv = await readingAs(accounts, (db) => batchAsCsv(db, batch.id));
    assert.match(csv, /Our reference,Number,Name/);
    assert.ok(!/(^|,)=cmd/m.test(csv), 'a formula must not survive into the file');
    assert.match(csv, /'=cmd/, 'it is neutralised, not silently dropped');
  });

  it('will not change a batch once it has been sent', async () => {
    const person = await aPerson(management, managementCtx);
    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'Locked' })),
    );
    await asUser(accounts, (db) => addNumberToBatch(db, accountsCtx, batch.id, '082 111 2222', person.id));
    const before = await readingAs(accounts, (db) => getBatch(db, batch.id));
    await asUser(accounts, (db) =>
      markBatchSubmitted(db, accountsCtx, batch.id, 'Emailed to the provider', before!.rowVersion),
    );

    const refused = await rejects(
      asUser(accounts, (db) => addNumberToBatch(db, accountsCtx, batch.id, '083 000 1111')),
    );
    assert.match(refused.message, /already been sent/i);
  });

  it('refuses to send an empty batch', async () => {
    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'Empty' })),
    );
    const before = await readingAs(accounts, (db) => getBatch(db, batch.id));
    const refused = await rejects(
      asUser(accounts, (db) => markBatchSubmitted(db, accountsCtx, batch.id, null, before!.rowVersion)),
    );
    assert.match(refused.message, /nothing in this batch/i);
  });

  it('loads results, leaves unanswered numbers unchecked, and raises a DNC for a listing', async () => {
    const listedPerson = await aPerson(management, managementCtx, {
      firstName: 'Listed',
      contacts: [{ contactType: 'mobile', value: '082 111 2222', isPrimary: true }],
    });
    const quietPerson = await aPerson(management, managementCtx, {
      firstName: 'Quiet',
      contacts: [{ contactType: 'mobile', value: '083 555 6666', isPrimary: true }],
    });

    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'Results run' })),
    );
    await asUser(accounts, (db) => fillBatchWithUncheckedNumbers(db, accountsCtx, batch.id));
    let current = await readingAs(accounts, (db) => getBatch(db, batch.id));
    await asUser(accounts, (db) =>
      markBatchSubmitted(db, accountsCtx, batch.id, null, current!.rowVersion),
    );
    current = await readingAs(accounts, (db) => getBatch(db, batch.id));

    const outcome = await asUser(accounts, (db) =>
      loadBatchResults(
        db,
        accountsCtx,
        batch.id,
        [
          { number: '+27821112222', result: 'listed', note: null },
          { number: '+27849999999', result: 'not_listed', note: null },
        ],
        current!.rowVersion,
      ),
    );

    assert.equal(outcome.matched, 1);
    assert.equal(outcome.listed, 1);
    assert.deepEqual(outcome.unmatched, ['+27849999999']);

    const items = await readingAs(accounts, (db) => listBatchItems(db, batch.id));
    const listedItem = items.find((item) => item.personId === listedPerson.id);
    const quietItem = items.find((item) => item.personId === quietPerson.id);
    assert.equal(listedItem?.result, 'listed');
    assert.equal(
      quietItem?.result,
      'not_checked',
      'a number nobody answered about stays unchecked, never assumed clear',
    );

    // The register's answer has a real effect.
    const dnc = await readingAs(management, (db) =>
      listDoNotContact(db, { personId: listedPerson.id, state: 'active' }),
    );
    assert.equal(dnc.length, 1);
    assert.equal(dnc[0]?.source, 'ncc_register');

    const verdict = await readingAs(management, (db) => preflight(db, listedPerson.id, 'call'));
    assert.equal(verdict.status, 'red');
  });

  it('reads a provider file in whatever order and wording it arrives', () => {
    const parsed = parseResultsCsv(
      [
        'Comment,MSISDN,Outcome',
        'checked,0821112222,Yes',
        ',0833334444,clean',
        'nonsense,0844445555,perhaps',
        ',,Yes',
      ].join('\n'),
    );
    assert.equal(parsed.lines.length, 2);
    assert.equal(parsed.lines[0]?.result, 'listed');
    assert.equal(parsed.lines[1]?.result, 'not_listed');
    assert.equal(parsed.problems.length, 2);
    assert.match(parsed.problems.join(' '), /perhaps/);
  });

  it('says so plainly when a file cannot be read at all', () => {
    assert.match(parseResultsCsv('').problems.join(' '), /empty/i);
    assert.match(parseResultsCsv('a,b\n1,2').problems.join(' '), /needs a column/i);
  });

  it('cancels with a reason the database insists on', async () => {
    const batch = await asUser(accounts, (db) =>
      createBatch(db, accountsCtx, parseOrThrow(batchInputSchema, { name: 'Abandoned' })),
    );
    const before = await readingAs(accounts, (db) => getBatch(db, batch.id));
    assert.match(
      (await rejects(asUser(accounts, (db) => cancelBatch(db, accountsCtx, batch.id, '  ', before!.rowVersion))))
        .message,
      /why/i,
    );
    await asUser(accounts, (db) =>
      cancelBatch(db, accountsCtx, batch.id, 'Provider changed', before!.rowVersion),
    );
    assert.equal((await readingAs(accounts, (db) => getBatch(db, batch.id)))?.status, 'cancelled');
  });
});

// =====================================================================
describe('who may do what (spec 9)', () => {
  it('lets an agent see compliance for their own client but not release a stop', async () => {
    const person = await aPerson(agent, agentCtx);
    const entry = await asUser(agent, (db) =>
      addDoNotContact(
        db,
        agentCtx,
        parseOrThrow(dncInputSchema, { personId: person.id, source: 'client_request' }),
      ),
    );

    assert.equal(
      (await readingAs(agent, (db) => listDoNotContact(db, { personId: person.id }))).length,
      1,
    );

    // AGENT holds COMPLIANCE_VIEW and COMPLIANCE_CREATE but not COMPLIANCE_EDIT,
    // so it cannot be released, which is the act that lets marketing reach
    // someone who asked it not to.
    const refused = await rejects(
      asUser(agent, (db) => releaseDoNotContact(db, agentCtx, entry.id, 'Changed their mind', 1)),
    );
    assert.match(refused.message, /updated by another user|not found|permission/i);

    assert.equal(
      (await readingAs(management, (db) => listDoNotContact(db, { state: 'active' }))).length,
      1,
      'and it is still in force',
    );
  });

  it('keeps an agent out of another agent’s compliance records', async () => {
    const theirs = await aPerson(otherAgent, await ctxFor(otherAgent));
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: theirs.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
        }),
      ),
    );
    assert.equal((await readingAs(agent, (db) => listPermissions(db, theirs.id))).length, 0);
    assert.equal((await readingAs(management, (db) => listPermissions(db, theirs.id))).length, 1);
  });

  it('lets only an NCC administrator create a batch', async () => {
    const refused = await rejects(
      asUser(agent, (db) =>
        createBatch(db, agentCtx, parseOrThrow(batchInputSchema, { name: 'Not mine' })),
      ),
    );
    assert.match(refused.message, /policy|permission/i);
  });
});

// =====================================================================
describe('the compliance dashboard (spec 58)', () => {
  it('counts what needs attention', async () => {
    const person = await aPerson(management, managementCtx);
    await aPerson(management, managementCtx, { firstName: 'Nobody' });
    await asUser(management, (db) =>
      addDoNotContact(
        db,
        managementCtx,
        parseOrThrow(dncInputSchema, { personId: person.id, source: 'client_request' }),
      ),
    );
    await asUser(management, (db) =>
      setPermission(
        db,
        managementCtx,
        parseOrThrow(permissionInputSchema, {
          personId: person.id,
          channel: 'email',
          purpose: 'direct_marketing',
          status: 'granted',
          lawfulBasis: 'consent',
        }),
      ),
    );

    const summary = await readingAs(management, (db) => complianceSummary(db));
    assert.equal(summary.activeDnc, 1);
    assert.equal(summary.permissionsGranted, 1);
    assert.equal(summary.peopleWithNoPermission, 1);
    assert.equal(summary.numbersNeverChecked, 2);
  });
});

// =====================================================================
describe('writing CSV safely (spec 102)', () => {
  it('neutralises every formula lead-in', () => {
    for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      const written = escapeCsvValue(dangerous);
      // The apostrophe goes on before any quoting, so a value that also needs
      // quoting comes back as "'...", which is still neutral in a spreadsheet.
      assert.ok(
        written.startsWith("'") || written.startsWith('"\''),
        `${JSON.stringify(dangerous)} became ${JSON.stringify(written)}`,
      );
    }
  });

  it('quotes separators and doubles quotes', () => {
    assert.equal(escapeCsvValue('a,b'), '"a,b"');
    assert.equal(escapeCsvValue('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvValue('line\nbreak'), '"line\nbreak"');
    assert.equal(escapeCsvValue(null), '');
  });

  it('does not let a value become a new column', () => {
    const csv = toCsv(
      [
        { key: 'name', header: 'Name' },
        { key: 'note', header: 'Note' },
      ],
      [{ name: 'Smith, John', note: '=HYPERLINK("http://x","click")' }],
    );
    const dataLine = csv.trim().split('\r\n')[1]!;
    assert.match(dataLine, /^"Smith, John",/);
    assert.match(dataLine, /'=HYPERLINK/);
  });

  it('cannot be made to write outside its own name', () => {
    assert.equal(safeFilename('../../etc/passwd', 'csv'), 'etc-passwd.csv');
    // The header break is what matters; the remaining space is harmless.
    const cleaned = safeFilename('batch\r\nContent-Type: evil', 'csv');
    assert.ok(!/[\r\n:]/.test(cleaned), cleaned);
    assert.match(cleaned, /^batch-Content-Type- ?evil\.csv$/);
    assert.equal(safeFilename('', 'csv'), 'export.csv');
  });
});


// =====================================================================
describe('a stop actually stops something (spec 54, 143)', () => {
  it('takes away the outward links for the channels that were stopped', () => {
    const open = contactLinks({ mobile: '+27821112222', email: 'a@example.com' });
    assert.ok(open.tel && open.whatsapp && open.mailto);
    assert.equal(stopNotice(open), null);

    const all = contactLinks({
      mobile: '+27821112222',
      email: 'a@example.com',
      stoppedChannels: ['all'],
    });
    assert.equal(all.tel, null);
    assert.equal(all.whatsapp, null);
    assert.equal(all.mailto, null);
    assert.match(stopNotice(all) ?? '', /not to contact them/i);
  });

  it('leaves the other channels alone when only one was stopped', () => {
    const links = contactLinks({
      mobile: '+27821112222',
      email: 'a@example.com',
      stoppedChannels: ['email'],
    });
    assert.ok(links.tel, 'calling is still open');
    assert.ok(links.whatsapp, 'WhatsApp is still open');
    assert.equal(links.mailto, null, 'the stopped channel is gone');
    assert.match(stopNotice(links) ?? '', /email/);
  });

  it('stopping calls does not also stop WhatsApp, which is a separate answer', () => {
    const links = contactLinks({ mobile: '+27821112222', stoppedChannels: ['call'] });
    assert.equal(links.tel, null);
    assert.ok(links.whatsapp);
  });

  it('has nothing to offer when there is no contact detail at all', () => {
    const links = contactLinks({});
    assert.deepEqual(
      [links.tel, links.whatsapp, links.mailto],
      [null, null, null],
    );
  });
});
