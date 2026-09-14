import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asUser,
  createTestUser,
  ctxFor,
  readingAs,
  rejects,
  resetData,
  shutdown,
  type TestUser,
} from './helpers/harness.ts';
import {
  archivePerson,
  assignPersonAgent,
  createPerson,
  updatePerson,
  addPersonRelationship,
} from '../src/lib/people/mutations.ts';
import { getPerson, listPeople, readIdentity } from '../src/lib/people/queries.ts';
import { findPersonDuplicates, listPersonDuplicatePairs } from '../src/lib/people/duplicates.ts';
import { getMergeComparison, mergePeople } from '../src/lib/people/merge.ts';
import { personInputSchema } from '../src/lib/people/types.ts';
import { parseOrThrow } from '../src/lib/validate.ts';
import { fingerprintIdentity, maskedIdentity, validateSaIdNumber } from '../src/lib/identity.ts';
import { formatZaPhone, normaliseZaPhone, telHref, whatsappHref, mailtoHref } from '../src/lib/phone.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let ayden: TestUser;
let johan: TestUser;
let managementCtx: Ctx;
let aydenCtx: Ctx;
let johanCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT', fullName: 'Kandy Management' });
  ayden = await createTestUser({ role: 'AGENT', fullName: 'Ayden Agent' });
  johan = await createTestUser({ role: 'AGENT', fullName: 'Johan Agent' });
  managementCtx = await ctxFor(management);
  aydenCtx = await ctxFor(ayden);
  johanCtx = await ctxFor(johan);
});
after(async () => {
  await shutdown();
});

function personInput(overrides: Record<string, unknown> = {}) {
  return parseOrThrow(personInputSchema, {
    firstName: 'John',
    surname: 'Smith',
    businessArea: 'sales_rentals',
    clientTypes: ['seller', 'landlord'],
    contacts: [
      { contactType: 'mobile', value: '082 543 2681', isPrimary: true },
      { contactType: 'email', value: 'test@example.com', isPrimary: true },
    ],
    addresses: [{ addressType: 'physical', suburb: 'Wilderness', city: 'George', province: 'Western Cape' }],
    ...overrides,
  });
}

// =====================================================================
describe('South African telephone numbers (spec 18)', () => {
  it('treats the three ways of writing one number as the same number', () => {
    const expected = '+27825432681';
    assert.equal(normaliseZaPhone('082 543 2681'), expected);
    assert.equal(normaliseZaPhone('0825432681'), expected);
    assert.equal(normaliseZaPhone('+27 82 543 2681'), expected);
    assert.equal(normaliseZaPhone('27825432681'), expected);
    assert.equal(normaliseZaPhone('(082) 543-2681'), expected);
  });

  it('reads a number back the way a South African says it', () => {
    assert.equal(formatZaPhone('+27825432681'), '082 543 2681');
  });

  it('builds links that hand the conversation to the device, never sending anything', () => {
    assert.equal(telHref('082 543 2681'), 'tel:+27825432681');
    assert.equal(whatsappHref('082 543 2681'), 'https://wa.me/27825432681');
    assert.equal(mailtoHref('test@example.com'), 'mailto:test@example.com');
    assert.equal(telHref(''), null);
    assert.equal(whatsappHref(null), null);
  });
});

// =====================================================================
describe('South African ID numbers (spec 15)', () => {
  it('accepts a valid number and rejects a bad check digit', () => {
    assert.equal(validateSaIdNumber('8001015009087').valid, true);
    assert.equal(validateSaIdNumber('8001015009088').valid, false);
    assert.equal(validateSaIdNumber('800101500908').valid, false);
    assert.equal(validateSaIdNumber('8013015009087').valid, false);
  });

  it('masks everything but the last three digits', () => {
    assert.equal(maskedIdentity('087'), '**********087');
    assert.equal(maskedIdentity(null), 'Not recorded');
  });

  it('fingerprints the same number identically and cannot be reversed', () => {
    const a = fingerprintIdentity('8001015009087');
    const b = fingerprintIdentity('800101 5009 087');
    assert.equal(a, b);
    assert.ok(!a.includes('8001015009087'));
    assert.notEqual(a, fingerprintIdentity('8001015009095'));
  });
});

// =====================================================================
describe('acceptance test — person (spec 123)', () => {
  it('creates John Smith with GRLP-00000001 and everything recorded', async () => {
    const created = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })),
    );
    assert.equal(created.clientRef, 'GRLP-00000001');

    const person = await readingAs(ayden, (db) => getPerson(db, created.id));
    assert.ok(person);
    assert.equal(person.fullName, 'John Smith');
    assert.equal(person.businessArea, 'sales_rentals');
    assert.deepEqual([...person.clientTypes].sort(), ['landlord', 'seller']);
    assert.equal(person.primaryAgentId, ayden.id);
    assert.equal(person.primaryAgentName, 'Ayden Agent');
    assert.equal(person.primaryMobile, '082 543 2681');
    assert.equal(person.primaryEmail, 'test@example.com');
    assert.equal(person.contacts.length, 2);
    assert.equal(person.addresses.length, 1);
    assert.equal(person.idIsRecorded, true);
    // Ayden may record an ID number but may not read one back.
    assert.equal(person.idDisplay, '**********087');
  });

  it('gives each new person the next reference and never reuses one', async () => {
    const first = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const second = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ firstName: 'Mary', surname: 'Jones', contacts: [] })),
    );
    assert.equal(first.clientRef, 'GRLP-00000001');
    assert.equal(second.clientRef, 'GRLP-00000002');

    // A failed create still consumes its number, so a reference is never reused.
    await rejects(
      asUser(ayden, (db) =>
        createPerson(db, aydenCtx, personInput({ firstName: 'X', surname: 'Y', idNumber: 'not-an-id' })),
      ),
    );
    const third = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ firstName: 'Piet', surname: 'Fourie', contacts: [] })),
    );
    assert.notEqual(third.clientRef, 'GRLP-00000002');
  });

  it('records the agent assignment in the history', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const history = await readingAs(ayden, (db) =>
      db.query<{ assignment: string; agent_id: string }>(
        'select assignment, agent_id from person_agent_assignments where person_id = $1',
        [created.id],
      ),
    );
    assert.equal(history.length, 1);
    assert.equal(history[0]?.agent_id, ayden.id);
  });
});

// =====================================================================
describe('identity protection (spec 15, 133)', () => {
  it('refuses to give the number itself to an agent', async () => {
    const created = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })),
    );
    const identity = await readingAs(ayden, (db) => readIdentity(db, created.id));
    assert.equal(identity, null, 'an agent must not be able to read a stored ID number');
  });

  it('gives the number to a user who holds PERSON_ID_VIEW', async () => {
    const created = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })),
    );
    const identity = await readingAs(management, (db) => readIdentity(db, created.id));
    assert.equal(identity?.idNumber, '8001015009087');
  });

  it('never writes the number into the audit log', async () => {
    const created = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })),
    );
    const logs = await readingAs(management, (db) =>
      db.query<{ body: string }>(
        'select coalesce(changes::text,\'\') || coalesce(context::text,\'\') as body from audit_logs where entity_id = $1',
        [created.id],
      ),
    );
    assert.ok(logs.length > 0);
    for (const log of logs) assert.ok(!log.body.includes('8001015009087'));
  });

  it('refuses two live people with the same identity number', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })));
    const error = await rejects(
      asUser(ayden, (db) =>
        createPerson(
          db,
          aydenCtx,
          personInput({ firstName: 'Jonathan', idNumber: '8001015009087', contacts: [] }),
        ),
      ),
    );
    assert.match(error.message, /already exists|duplicate key/i);
  });

  it('rejects an ID number that fails its check digit', async () => {
    const error = await rejects(
      asUser(ayden, (db) => createPerson(db, aydenCtx, personInput({ idNumber: '8001015009088' }))),
    );
    assert.match(error.message, /check the highlighted fields|not valid/i);
  });
});

// =====================================================================
describe('agent scoping (spec 126)', () => {
  it('hides one agent\'s client from another agent', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));

    assert.ok(await readingAs(ayden, (db) => getPerson(db, created.id)));
    assert.equal(await readingAs(johan, (db) => getPerson(db, created.id)), null);
    assert.ok(await readingAs(management, (db) => getPerson(db, created.id)));
  });

  it('hides the contact details too, not only the person row', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const contacts = await readingAs(johan, (db) =>
      db.query('select id from person_contacts where person_id = $1', [created.id]),
    );
    assert.equal(contacts.length, 0);
  });

  it('refuses to let another agent edit the record', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const person = await readingAs(ayden, (db) => getPerson(db, created.id));
    const error = await rejects(
      asUser(johan, (db) =>
        updatePerson(db, johanCtx, created.id, personInput({ firstName: 'Hijacked' }), person!.rowVersion),
      ),
    );
    assert.match(error.message, /could not be found|permission/i);
  });

  it('keeps an agent out of the list as well as the profile', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const mine = await readingAs(ayden, (db) => listPeople(db, {}));
    const theirs = await readingAs(johan, (db) => listPeople(db, {}));
    const all = await readingAs(management, (db) => listPeople(db, {}));
    assert.equal(mine.total, 1);
    assert.equal(theirs.total, 0);
    assert.equal(all.total, 1);
  });

  it('lets management narrow the view to one agent and back again (spec 10, 127)', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    await asUser(johan, (db) =>
      createPerson(db, johanCtx, personInput({ firstName: 'Mary', surname: 'Jones', contacts: [] })),
    );

    const all = await readingAs(management, (db) => listPeople(db, {}));
    const onlyAyden = await readingAs(management, (db) => listPeople(db, { agentId: ayden.id }));
    assert.equal(all.total, 2);
    assert.equal(onlyAyden.total, 1);
    assert.equal(onlyAyden.rows[0]?.fullName, 'John Smith');
  });
});

// =====================================================================
describe('duplicate detection (spec 18, 124)', () => {
  it('finds the same person again from a differently written mobile number', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));

    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(db, {
        firstName: 'John',
        surname: 'Smith',
        contactValues: ['+27 82 543 2681'],
      }),
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.includes('Same telephone number'));
  });

  it('finds the same person from their email address', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(db, {
        firstName: 'J',
        surname: 'Smyth',
        contactValues: ['TEST@Example.com'],
      }),
    );
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.includes('Same email address'));
  });

  it('finds the same person from their identity number', async () => {
    await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ idNumber: '8001015009087' })),
    );
    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(db, {
        firstName: 'Totally',
        surname: 'Different',
        idNumber: '800101 5009 087',
      }),
    );
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.includes('Same identity number on file'));
  });

  it('flags a similar name as possible rather than certain', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(db, { firstName: 'Jon', surname: 'Smith', contactValues: [] }),
    );
    assert.equal(matches[0]?.confidence, 'possible');
  });

  it('does not flag a genuinely different person', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(db, {
        firstName: 'Pieter',
        surname: 'van Wyk',
        contactValues: ['083 111 2222'],
      }),
    );
    assert.equal(matches.length, 0);
  });

  it('excludes the record being edited from its own duplicate check', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const matches = await readingAs(ayden, (db) =>
      findPersonDuplicates(
        db,
        { firstName: 'John', surname: 'Smith', contactValues: ['0825432681'] },
        { excludeId: created.id },
      ),
    );
    assert.equal(matches.length, 0);
  });

  it('does not offer an agent a duplicate they may not see', async () => {
    await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const matches = await readingAs(johan, (db) =>
      findPersonDuplicates(db, {
        firstName: 'John',
        surname: 'Smith',
        contactValues: ['0825432681'],
      }),
    );
    assert.equal(matches.length, 0);
  });

  it('lists duplicate pairs for the data quality screen (spec 21)', async () => {
    await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    await asUser(management, (db) =>
      createPerson(db, managementCtx, personInput({ contacts: [{ contactType: 'mobile', value: '0825432681' }] })),
    );
    const pairs = await readingAs(management, (db) => listPersonDuplicatePairs(db, {}));
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.confidence, 'high');
  });
});

// =====================================================================
describe('merging (spec 19, 20)', () => {
  async function twoRecords(): Promise<{ masterId: string; mergedId: string }> {
    const master = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const merged = await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        personInput({
          preferredName: 'Johnny',
          clientTypes: ['buyer'],
          contacts: [{ contactType: 'mobile', value: '0825432681' }, { contactType: 'landline', value: '044 555 1234' }],
          addresses: [],
        }),
      ),
    );
    return { masterId: master.id, mergedId: merged.id };
  }

  it('compares the two records field by field before anything is decided', async () => {
    const { masterId, mergedId } = await twoRecords();
    const comparison = await readingAs(management, (db) =>
      getMergeComparison(db, masterId, mergedId),
    );
    const preferred = comparison.fields.find((f) => f.field === 'preferred_name');
    assert.equal(preferred?.differs, true);
    assert.equal(preferred?.mergedValue, 'Johnny');
    assert.equal(comparison.merged.counts.contacts, 2);
  });

  it('keeps one master record, moves the history and never reuses the reference', async () => {
    const { masterId, mergedId } = await twoRecords();
    const mergedRef = (await readingAs(management, (db) => getPerson(db, mergedId)))!.clientRef;

    const result = await asUser(management, (db) =>
      mergePeople(db, managementCtx, {
        masterId,
        mergedId,
        choices: { preferred_name: 'merged' },
        reason: 'Same person captured twice',
      }),
    );
    assert.equal(result.mergedReference, mergedRef);

    const master = await readingAs(management, (db) => getPerson(db, masterId));
    assert.equal(master?.preferredName, 'Johnny', 'the chosen value survived');
    // Buyer arrived from the losing record; seller and landlord stayed.
    assert.deepEqual([...master!.clientTypes].sort(), ['buyer', 'landlord', 'seller']);
    // The duplicate mobile was dropped rather than duplicated; the landline moved.
    const types = master!.contacts.map((c) => c.contactType).sort();
    assert.deepEqual(types, ['email', 'landline', 'mobile']);

    const loser = await readingAs(management, (db) => getPerson(db, mergedId));
    assert.equal(loser?.mergedIntoId, masterId);
    assert.equal(loser?.isArchived, true);
    assert.equal(loser?.clientRef, mergedRef, 'the reference stays with the record for ever');

    // A new person gets a fresh number, never the merged one.
    const next = await asUser(management, (db) =>
      createPerson(db, managementCtx, personInput({ firstName: 'New', surname: 'Person', contacts: [] })),
    );
    assert.notEqual(next.clientRef, mergedRef);
  });

  it('writes a merge record naming both references, the user and the reason', async () => {
    const { masterId, mergedId } = await twoRecords();
    await asUser(management, (db) =>
      mergePeople(db, managementCtx, { masterId, mergedId, choices: {}, reason: 'Duplicate import' }),
    );
    const record = await readingAs(management, (db) =>
      db.one<{
        master_reference: string;
        merged_reference: string;
        reason: string;
        performed_by: string;
        moved_counts: Record<string, unknown>;
      }>('select * from merge_records where entity_type = $1', ['person']),
    );
    assert.equal(record.reason, 'Duplicate import');
    assert.equal(record.performed_by, management.id);
    assert.ok(Object.keys(record.moved_counts).length > 0);
  });

  it('keeps the merged record out of lists and duplicate checks', async () => {
    const { masterId, mergedId } = await twoRecords();
    await asUser(management, (db) =>
      mergePeople(db, managementCtx, { masterId, mergedId, choices: {}, reason: null }),
    );
    const list = await readingAs(management, (db) => listPeople(db, {}));
    assert.equal(list.total, 1);
    const pairs = await readingAs(management, (db) => listPersonDuplicatePairs(db, {}));
    assert.equal(pairs.length, 0);
  });

  it('refuses a merge from someone without MERGE_RECORDS', async () => {
    const master = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const merged = await asUser(ayden, (db) =>
      createPerson(db, aydenCtx, personInput({ firstName: 'Jon', contacts: [] })),
    );
    const error = await rejects(
      asUser(ayden, (db) =>
        mergePeople(db, aydenCtx, {
          masterId: master.id,
          mergedId: merged.id,
          choices: {},
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /permission/i);
  });

  it('refuses to merge a record into itself', async () => {
    const person = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const error = await rejects(
      asUser(management, (db) =>
        mergePeople(db, managementCtx, {
          masterId: person.id,
          mergedId: person.id,
          choices: {},
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /into itself/i);
  });

  it('refuses to merge a record that has already been merged', async () => {
    const { masterId, mergedId } = await twoRecords();
    await asUser(management, (db) =>
      mergePeople(db, managementCtx, { masterId, mergedId, choices: {}, reason: null }),
    );
    const third = await asUser(management, (db) =>
      createPerson(db, managementCtx, personInput({ firstName: 'Third', contacts: [] })),
    );
    const error = await rejects(
      asUser(management, (db) =>
        mergePeople(db, managementCtx, {
          masterId: third.id,
          mergedId,
          choices: {},
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /already been merged/i);
  });

  it('leaves both records untouched when the merge fails', async () => {
    const { masterId, mergedId } = await twoRecords();
    await rejects(
      asUser(ayden, (db) =>
        mergePeople(db, aydenCtx, { masterId, mergedId, choices: {}, reason: null }),
      ),
    );
    const loser = await readingAs(management, (db) => getPerson(db, mergedId));
    assert.equal(loser?.mergedIntoId, null);
    assert.equal(loser?.isArchived, false);
  });
});

// =====================================================================
describe('first and last contact (spec 13, 14)', () => {
  it('is empty until something meaningful happens', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    const person = await readingAs(ayden, (db) => getPerson(db, created.id));
    assert.equal(person?.firstContactAt, null);
    assert.equal(person?.lastContactAt, null);
  });

  it('sets first contact once and moves last contact forward', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));

    await asUser(ayden, (db) =>
      db.query('select app.record_person_contact($1, $2::timestamptz, $3, $4)', [
        created.id, '2026-09-01T09:00:00Z', 'call', ayden.id,
      ]),
    );
    await asUser(ayden, (db) =>
      db.query('select app.record_person_contact($1, $2::timestamptz, $3, $4)', [
        created.id, '2026-09-10T14:30:00Z', 'whatsapp', ayden.id,
      ]),
    );

    const person = await readingAs(ayden, (db) => getPerson(db, created.id));
    assert.equal(person?.firstContactAt, '2026-09-01T09:00:00.000Z');
    assert.equal(person?.lastContactAt, '2026-09-10T14:30:00.000Z');
    assert.equal(person?.lastContactMethod, 'whatsapp');
  });

  it('does not move first contact backwards when an older interaction is imported', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    await asUser(ayden, (db) =>
      db.query('select app.record_person_contact($1,$2::timestamptz,$3,$4)', [
        created.id, '2026-09-10T14:30:00Z', 'whatsapp', ayden.id,
      ]),
    );
    await asUser(ayden, (db) =>
      db.query('select app.record_person_contact($1,$2::timestamptz,$3,$4)', [
        created.id, '2020-01-05T08:00:00Z', 'email', ayden.id,
      ]),
    );
    const person = await readingAs(ayden, (db) => getPerson(db, created.id));
    assert.equal(person?.firstContactAt, '2020-01-05T08:00:00.000Z');
    assert.equal(person?.lastContactAt, '2026-09-10T14:30:00.000Z');
    assert.equal(person?.lastContactMethod, 'whatsapp', 'an older import does not become the latest');
  });
});

// =====================================================================
describe('editing', () => {
  it('refuses to overwrite a change made by someone else (spec 105)', async () => {
    const created = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const loaded = await readingAs(management, (db) => getPerson(db, created.id));

    await asUser(management, (db) =>
      updatePerson(db, managementCtx, created.id, personInput({ firstName: 'Johnathan' }), loaded!.rowVersion),
    );

    const error = await rejects(
      asUser(management, (db) =>
        updatePerson(db, managementCtx, created.id, personInput({ firstName: 'Jonny' }), loaded!.rowVersion),
      ),
    );
    assert.match(error.message, /updated by another user/i);
  });

  it('keeps the previous agent in the assignment history on reassignment (spec 65)', async () => {
    const created = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));
    await asUser(management, (db) =>
      assignPersonAgent(db, managementCtx, created.id, {
        primaryAgentId: johan.id,
        secondaryAgentId: null,
        reason: 'Ayden to Johan',
      }),
    );

    const history = await readingAs(management, (db) =>
      db.query<{ agent_id: string; unassigned_at: Date | null }>(
        'select agent_id, unassigned_at from person_agent_assignments where person_id = $1 order by assigned_at',
        [created.id],
      ),
    );
    assert.equal(history.length, 2);
    assert.equal(history[0]?.agent_id, ayden.id);
    assert.ok(history[0]?.unassigned_at, 'the previous assignment was closed, not deleted');
    assert.equal(history[1]?.agent_id, johan.id);

    // The record moved: Ayden can no longer see it, Johan now can.
    assert.equal(await readingAs(ayden, (db) => getPerson(db, created.id)), null);
    assert.ok(await readingAs(johan, (db) => getPerson(db, created.id)));
  });

  it('archives rather than deletes, and keeps the record readable', async () => {
    const created = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    await asUser(management, (db) => archivePerson(db, managementCtx, created.id, 'Moved overseas'));

    const active = await readingAs(management, (db) => listPeople(db, { archived: 'active' }));
    const archived = await readingAs(management, (db) => listPeople(db, { archived: 'archived' }));
    assert.equal(active.total, 0);
    assert.equal(archived.total, 1);

    const person = await readingAs(management, (db) => getPerson(db, created.id));
    assert.equal(person?.archiveReason, 'Moved overseas');
    assert.equal(person?.contacts.length, 2, 'the history survived the archive');
  });

  it('does not allow a person to be deleted at all', async () => {
    const created = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const error = await rejects(
      asUser(management, (db) => db.query('delete from people where id = $1', [created.id])),
    );
    assert.match(error.message, /permission denied/i);
  });
});

// =====================================================================
describe('relationships (spec 16)', () => {
  it('links two people and shows the link from both sides', async () => {
    const john = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const mary = await asUser(management, (db) =>
      createPerson(db, managementCtx, personInput({ firstName: 'Mary', surname: 'Smith', contacts: [] })),
    );

    await asUser(management, (db) =>
      addPersonRelationship(db, managementCtx, john.id, {
        relatedPersonId: mary.id,
        relationshipType: 'spouse',
        startDate: '2010-06-12',
        endDate: null,
        notes: null,
      }),
    );

    const fromJohn = await readingAs(management, (db) => getPerson(db, john.id));
    const fromMary = await readingAs(management, (db) => getPerson(db, mary.id));
    assert.equal(fromJohn?.relationships[0]?.otherPersonName, 'Mary Smith');
    assert.equal(fromMary?.relationships[0]?.otherPersonName, 'John Smith');
  });

  it('refuses to relate a person to themselves', async () => {
    const john = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const error = await rejects(
      asUser(management, (db) =>
        addPersonRelationship(db, managementCtx, john.id, {
          relatedPersonId: john.id,
          relationshipType: 'spouse',
          startDate: null,
          endDate: null,
          notes: null,
        }),
      ),
    );
    assert.match(error.message, /themselves|highlighted/i);
  });
});

// =====================================================================
describe('search (spec 17)', () => {
  beforeEach(async () => {
    await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        personInput({
          firstName: 'Annelize',
          surname: 'van der Merwe',
          contacts: [{ contactType: 'mobile', value: '083 111 2222' }],
          addresses: [{ addressType: 'physical', suburb: 'Sedgefield' }],
        }),
      ),
    );
  });

  it('finds a person by surname', async () => {
    const found = await readingAs(management, (db) => listPeople(db, { query: 'Merwe' }));
    assert.equal(found.total, 1);
    assert.equal(found.rows[0]?.fullName, 'Annelize van der Merwe');
  });

  it('finds a person by client reference', async () => {
    const found = await readingAs(management, (db) => listPeople(db, { query: 'GRLP-00000001' }));
    assert.equal(found.total, 1);
  });

  it('finds a person by a mobile number typed any way', async () => {
    for (const typed of ['0825432681', '082 543 2681', '+27 82 543 2681']) {
      const found = await readingAs(management, (db) => listPeople(db, { query: typed }));
      assert.equal(found.total, 1, `searching for ${typed}`);
      assert.equal(found.rows[0]?.fullName, 'John Smith');
    }
  });

  it('finds a person by email address', async () => {
    const found = await readingAs(management, (db) => listPeople(db, { query: 'test@example' }));
    assert.equal(found.total, 1);
  });

  it('filters by client type, business area and area', async () => {
    const sellers = await readingAs(management, (db) => listPeople(db, { clientType: 'seller' }));
    assert.equal(sellers.total, 2);
    const rentals = await readingAs(management, (db) => listPeople(db, { businessArea: 'rentals' }));
    assert.equal(rentals.total, 2, 'Sales & Rentals people appear in both single-area views');
    const sedgefield = await readingAs(management, (db) => listPeople(db, { area: 'sedge' }));
    assert.equal(sedgefield.total, 1);
  });
});
