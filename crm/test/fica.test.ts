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
import { createProperty } from '../src/lib/properties/mutations.ts';
import { propertyInputSchema } from '../src/lib/properties/types.ts';
import {
  archiveCompany,
  companiesForPerson,
  companiesForProperty,
  companyInputSchema,
  companyPersonInputSchema,
  createCompany,
  getCompany,
  linkCompanyToProperty,
  linkPersonToCompany,
  listCompanies,
  unlinkPersonFromCompany,
  updateCompany,
} from '../src/lib/companies.ts';
import {
  FICA_STATUSES,
  ficaFor,
  ficaHistory,
  ficaInputSchema,
  ficaSummary,
  getFicaRecord,
  listFicaChecks,
  listFicaRecords,
  setFicaCheck,
  startFicaRecord,
  updateFicaRecord,
} from '../src/lib/fica.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let accounts: TestUser;
let admin: TestUser;
let agent: TestUser;
let managementCtx: Ctx;
let accountsCtx: Ctx;
let adminCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT' });
  accounts = await createTestUser({ role: 'ACCOUNTS' });
  admin = await createTestUser({ role: 'ADMIN' });
  agent = await createTestUser({ role: 'AGENT' });
  managementCtx = await ctxFor(management);
  accountsCtx = await ctxFor(accounts);
  adminCtx = await ctxFor(admin);
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
        clientTypes: ['buyer'],
        contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        ...overrides,
      }),
    ),
  );
}

async function aCompany(user: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(user, (db) =>
    createCompany(
      db,
      ctx,
      parseOrThrow(companyInputSchema, {
        registeredName: 'Wilderness Holdings (Pty) Ltd',
        entityType: 'pty_ltd',
        registrationNumber: '2019/123456/07',
        city: 'George',
        ...overrides,
      }),
    ),
  );
}

// =====================================================================
describe('companies and other entities (spec 30, 31)', () => {
  it('is its own master record with its own reference', async () => {
    const created = await aCompany(management, managementCtx);
    assert.match(created.companyRef, /^GRLP-C-\d{6}$/);

    const company = await readingAs(management, (db) => getCompany(db, created.id));
    assert.equal(company?.registeredName, 'Wilderness Holdings (Pty) Ltd');
    assert.equal(company?.entityType, 'pty_ltd');
    assert.equal(company?.registrationNumber, '2019/123456/07');
  });

  it('keeps who is behind it, which is the part FICA cares about', async () => {
    const company = await aCompany(management, managementCtx);
    const director = await aPerson(management, managementCtx, { firstName: 'Dirk' });
    const trustee = await aPerson(management, managementCtx, {
      firstName: 'Thandi',
      contacts: [{ contactType: 'mobile', value: '083 555 1234', isPrimary: true }],
    });

    await asUser(management, (db) =>
      linkPersonToCompany(
        db,
        managementCtx,
        company.id,
        parseOrThrow(companyPersonInputSchema, {
          personId: director.id,
          role: 'director',
          isPrimaryContact: true,
          shareholdingPercent: '60',
        }),
      ),
    );
    await asUser(management, (db) =>
      linkPersonToCompany(
        db,
        managementCtx,
        company.id,
        parseOrThrow(companyPersonInputSchema, {
          personId: trustee.id,
          role: 'shareholder',
          shareholdingPercent: '40',
        }),
      ),
    );

    const detail = await readingAs(management, (db) => getCompany(db, company.id));
    assert.equal(detail?.people.length, 2);
    assert.equal(detail?.people[0]?.isPrimaryContact, true);
    assert.equal(detail?.people[0]?.role, 'director');
    assert.equal(detail?.peopleCount, 2);
  });

  it('has only one primary contact, however many times one is set', async () => {
    const company = await aCompany(management, managementCtx);
    const first = await aPerson(management, managementCtx, { firstName: 'First' });
    const second = await aPerson(management, managementCtx, {
      firstName: 'Second',
      contacts: [{ contactType: 'mobile', value: '084 111 2222', isPrimary: true }],
    });

    for (const person of [first, second]) {
      await asUser(management, (db) =>
        linkPersonToCompany(
          db,
          managementCtx,
          company.id,
          parseOrThrow(companyPersonInputSchema, {
            personId: person.id,
            role: 'director',
            isPrimaryContact: true,
          }),
        ),
      );
    }

    const detail = await readingAs(management, (db) => getCompany(db, company.id));
    assert.equal(detail?.people.filter((entry) => entry.isPrimaryContact).length, 1);
    assert.equal(
      detail?.people.find((entry) => entry.isPrimaryContact)?.personId,
      second.id,
      'the most recent one holds it',
    );
  });

  it('owns property as an entity rather than pretending to be a person', async () => {
    const company = await aCompany(management, managementCtx);
    const property = await asUser(management, (db) =>
      createProperty(
        db,
        managementCtx,
        parseOrThrow(propertyInputSchema, {
          erfNumber: '4321',
          streetAddress: '9 Beach Road',
          suburb: 'Wilderness',
          city: 'George',
        }),
      ),
    );

    await asUser(management, (db) =>
      linkCompanyToProperty(db, managementCtx, {
        propertyId: property.id,
        companyId: company.id,
        role: 'owner',
        ownershipPercent: '100',
      }),
    );

    const onProperty = await readingAs(management, (db) =>
      companiesForProperty(db, property.id),
    );
    assert.equal(onProperty.length, 1);
    assert.equal(onProperty[0]?.role, 'owner');
    assert.equal(onProperty[0]?.registeredName, 'Wilderness Holdings (Pty) Ltd');

    const detail = await readingAs(management, (db) => getCompany(db, company.id));
    assert.equal(detail?.propertyCount, 1);
  });

  it('shows on the person’s side too, so a director is findable from either end', async () => {
    const company = await aCompany(management, managementCtx);
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      linkPersonToCompany(
        db,
        managementCtx,
        company.id,
        parseOrThrow(companyPersonInputSchema, { personId: person.id, role: 'trustee' }),
      ),
    );

    const theirs = await readingAs(management, (db) => companiesForPerson(db, person.id));
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0]?.role, 'trustee');
    assert.equal(theirs[0]?.companyRef, company.companyRef);
  });

  it('unlinks a person without touching the company or the person', async () => {
    const company = await aCompany(management, managementCtx);
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) =>
      linkPersonToCompany(
        db,
        managementCtx,
        company.id,
        parseOrThrow(companyPersonInputSchema, { personId: person.id, role: 'director' }),
      ),
    );
    const detail = await readingAs(management, (db) => getCompany(db, company.id));

    await asUser(management, (db) =>
      unlinkPersonFromCompany(db, managementCtx, company.id, detail!.people[0]!.id),
    );

    assert.equal((await readingAs(management, (db) => getCompany(db, company.id)))?.people.length, 0);
    assert.ok(await readingAs(management, (db) => getCompany(db, company.id)));
    assert.equal((await readingAs(management, (db) => companiesForPerson(db, person.id))).length, 0);
  });

  it('is archived with a reason rather than deleted', async () => {
    const company = await aCompany(management, managementCtx);
    await asUser(management, (db) =>
      archiveCompany(db, managementCtx, company.id, 'Deregistered'),
    );

    assert.equal((await readingAs(management, (db) => listCompanies(db, {}))).total, 0);
    const archived = await readingAs(management, (db) =>
      listCompanies(db, { archived: 'archived' }),
    );
    assert.equal(archived.total, 1);
    assert.equal((await readingAs(management, (db) => getCompany(db, company.id)))?.archiveReason, 'Deregistered');

    const refused = await rejects(asUser(management, (db) => db.query('delete from companies')));
    assert.match(refused.message, /permission denied/i);
  });

  it('refuses an archived company with no reason, at the database', async () => {
    const company = await aCompany(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query('update companies set is_archived = true where id = $1', [company.id]),
      ),
    );
    assert.match(refused.message, /archive_needs_reason|check constraint/i);
  });

  it('refuses a stale edit (spec 105)', async () => {
    const company = await aCompany(management, managementCtx);
    const refused = await rejects(
      asUser(management, (db) =>
        updateCompany(
          db,
          managementCtx,
          company.id,
          parseOrThrow(companyInputSchema, { registeredName: 'Changed' }),
          99,
        ),
      ),
    );
    assert.match(refused.message, /updated by another user/i);
  });

  it('searches by name, trading name or registration number', async () => {
    await aCompany(management, managementCtx, {
      registeredName: 'Knysna Coastal Trust',
      entityType: 'trust',
      registrationNumber: 'IT1234/2020',
    });
    await aCompany(management, managementCtx, { registeredName: 'Sedgefield Rentals CC' });

    assert.equal((await readingAs(management, (db) => listCompanies(db, { query: 'knysna' }))).total, 1);
    assert.equal((await readingAs(management, (db) => listCompanies(db, { query: 'IT1234' }))).total, 1);
    assert.equal(
      (await readingAs(management, (db) => listCompanies(db, { entityType: 'trust' }))).total,
      1,
    );
  });
});

// =====================================================================
describe('the FICA honesty rule, at the database (spec 115)', () => {
  it('has no column that could claim an external check happened', async () => {
    const columns = await asOwner((db) =>
      db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'fica_records'`,
      ),
    );
    const names = columns.map((row) => row.column_name);

    for (const forbidden of [
      'home_affairs_result',
      'cipc_result',
      'sanctions_hit',
      'pep_list_result',
      'credit_score',
      'bureau_reference',
      'auto_verified',
    ]) {
      assert.ok(!names.includes(forbidden), `fica_records must not have ${forbidden}`);
    }

    // What it does have is somebody's name against the decision.
    assert.ok(names.includes('verified_by'));
    assert.ok(names.includes('verified_at'));
    assert.ok(names.includes('pep_declared'), 'declared by the client, not looked up');
  });

  /**
   * The single most important constraint in this stage. "Verified" must
   * always mean "a named person verified this on a known date", so the
   * database refuses the claim without both.
   */
  it('refuses a verified record with nobody’s name on it', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into fica_records (person_id, status) values ($1, 'verified')`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /verified_needs_a_person|check constraint/i);
  });

  it('refuses a rejected record with no reason', async () => {
    const person = await aPerson(management, managementCtx);
    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `insert into fica_records (person_id, status, rejected_at)
           values ($1, 'rejected', now())`,
          [person.id],
        ),
      ),
    );
    assert.match(refused.message, /rejected_needs_a_reason|check constraint/i);
  });

  it('insists a file is about one subject, not both and not neither', async () => {
    const person = await aPerson(management, managementCtx);
    const company = await aCompany(management, managementCtx);

    const refusedBoth = await rejects(
      asOwner((db) =>
        db.query('insert into fica_records (person_id, company_id) values ($1,$2)', [
          person.id,
          company.id,
        ]),
      ),
    );
    assert.match(refusedBoth.message, /one_subject|check constraint/i);

    const refusedNeither = await rejects(
      asOwner((db) => db.query('insert into fica_records (status) values (\'not_started\')')),
    );
    assert.match(refusedNeither.message, /one_subject|check constraint/i);
  });

  it('will not record a document as seen without saying who saw it', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));

    const refused = await rejects(
      asOwner((db) =>
        db.query(
          `update fica_document_checks set status = 'seen_against_original'
            where fica_record_id = $1 and item_id = $2`,
          [record.id, checks[0]!.itemId],
        ),
      ),
    );
    assert.match(refused.message, /needs_a_checker|check constraint/i);
  });

  it('offers no status that claims an outside system did the checking', () => {
    const labels = Object.values(FICA_STATUSES).join(' | ').toLowerCase();
    for (const forbidden of ['auto', 'automatically', 'api', 'home affairs', 'bureau']) {
      assert.ok(!labels.includes(forbidden), `no status may say "${forbidden}"`);
    }
    assert.equal(FICA_STATUSES.verified, 'Verified by us', 'it says who did it');
  });
});

// =====================================================================
describe('working a FICA file (spec 33 to 37)', () => {
  it('opens with the whole checklist as a to-do list', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    assert.match(record.ficaRef, /^GRLP-F-\d{6}$/);

    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));
    assert.ok(checks.length >= 5);
    assert.ok(checks.every((check) => check.status === 'not_provided'));
    // A person's file does not ask for company registration documents.
    assert.ok(!checks.some((check) => check.code === 'company_registration'));
    assert.ok(checks.some((check) => check.code === 'id_document'));
  });

  it('asks a company for what a company needs', async () => {
    const company = await aCompany(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { companyId: company.id })),
    );
    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));

    assert.ok(checks.some((check) => check.code === 'company_registration'));
    assert.ok(checks.some((check) => check.code === 'directors_ids'));
    assert.ok(checks.some((check) => check.code === 'resolution'));
    assert.ok(
      !checks.some((check) => check.code === 'id_document'),
      'an entity has no identity document of its own',
    );
  });

  it('will not let a file be verified while a required document is outstanding', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    const stored = await readingAs(accounts, (db) => getFicaRecord(db, record.id));

    const refused = await rejects(
      asUser(accounts, (db) =>
        updateFicaRecord(
          db,
          accountsCtx,
          record.id,
          parseOrThrow(ficaInputSchema, { personId: person.id, status: 'verified' }),
          stored!.rowVersion,
        ),
      ),
    );
    assert.match(refused.message, /outstanding/i);
    assert.equal(
      (await readingAs(accounts, (db) => getFicaRecord(db, record.id)))?.status,
      'not_started',
      'and nothing changed',
    );
  });

  it('verifies once the checklist is done, stamping who and when', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );

    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));
    for (const check of checks.filter((entry) => entry.isRequired)) {
      await asUser(accounts, (db) =>
        setFicaCheck(db, accountsCtx, record.id, {
          itemId: check.itemId,
          status: 'seen_against_original',
          note: 'Original produced at the office',
        }),
      );
    }

    const before = await readingAs(accounts, (db) => getFicaRecord(db, record.id));
    await asUser(accounts, (db) =>
      updateFicaRecord(
        db,
        accountsCtx,
        record.id,
        parseOrThrow(ficaInputSchema, {
          personId: person.id,
          status: 'verified',
          riskRating: 'low',
          pepDeclared: 'no',
          sourceOfFunds: 'Sale of previous home',
          verificationNote: 'All originals seen',
        }),
        before!.rowVersion,
      ),
    );

    const after = await readingAs(accounts, (db) => getFicaRecord(db, record.id));
    assert.equal(after?.status, 'verified');
    assert.equal(after?.verifiedById, accounts.id, 'a named person did it');
    assert.ok(after?.verifiedAt, 'on a known date');
    assert.equal(after?.riskRating, 'low');
    assert.equal(after?.pepDeclared, false);
    assert.ok(after?.expiresOn, 'and it has a date it needs redoing by');

    const history = await readingAs(accounts, (db) => ficaHistory(db, record.id));
    assert.equal(history[0]?.newStatus, 'verified');
    assert.equal(history[history.length - 1]?.newStatus, 'not_started');
  });

  it('records who looked at each document, and when', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));

    await asUser(accounts, (db) =>
      setFicaCheck(db, accountsCtx, record.id, {
        itemId: checks[0]!.itemId,
        status: 'seen_against_original',
      }),
    );

    const after = await readingAs(accounts, (db) => listFicaChecks(db, record.id));
    const done = after.find((entry) => entry.itemId === checks[0]!.itemId);
    assert.equal(done?.status, 'seen_against_original');
    assert.ok(done?.checkedByName, 'with a name against it');
    assert.ok(done?.checkedAt);
  });

  it('clears the checker when an item goes back to being merely asked for', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    const checks = await readingAs(accounts, (db) => listFicaChecks(db, record.id));

    await asUser(accounts, (db) =>
      setFicaCheck(db, accountsCtx, record.id, {
        itemId: checks[0]!.itemId,
        status: 'seen_against_original',
      }),
    );
    await asUser(accounts, (db) =>
      setFicaCheck(db, accountsCtx, record.id, {
        itemId: checks[0]!.itemId,
        status: 'requested',
        note: 'Copy was illegible, asked again',
      }),
    );

    const after = await readingAs(accounts, (db) => listFicaChecks(db, record.id));
    const item = after.find((entry) => entry.itemId === checks[0]!.itemId);
    assert.equal(item?.status, 'requested');
    assert.equal(item?.checkedByName, null, 'nobody has seen the new one yet');
  });

  it('keeps its history append-only (spec 104)', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );

    const refused = await rejects(
      asUser(accounts, (db) =>
        db.query('delete from fica_status_history where fica_record_id = $1', [record.id]),
      ),
    );
    assert.match(refused.message, /append-only|permission/i);
  });

  it('treats a file past its date as needing refreshing however it is stored', async () => {
    const person = await aPerson(management, managementCtx);
    const record = await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );

    await asOwner((db) =>
      db.query(
        `update fica_records
            set status = 'verified', verified_by = $2, verified_at = now(),
                expires_on = current_date - 1
          where id = $1`,
        [record.id, accounts.id],
      ),
    );

    const stored = await readingAs(accounts, (db) => getFicaRecord(db, record.id));
    assert.equal(stored?.status, 'verified', 'the stored status is what somebody set');
    assert.equal(stored?.isExpired, true, 'but it is out of date and says so');
    assert.ok((stored?.daysUntilExpiry ?? 0) < 0);
  });

  it('finds the file from the person, and the person from the file', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );

    const byPerson = await readingAs(accounts, (db) => ficaFor(db, { personId: person.id }));
    assert.ok(byPerson);
    assert.equal(byPerson.personName, 'Johan van der Merwe');

    const listed = await readingAs(accounts, (db) => listFicaRecords(db, { query: 'Johan' }));
    assert.equal(listed.length, 1);
  });
});

// =====================================================================
describe('who may see a FICA file (spec 9)', () => {
  it('keeps an office administrator out, deliberately', async () => {
    // ADMIN runs the CRM but is not given FICA access, so an administrator
    // cannot read everybody's identity documents. That is the design, and it
    // is enforced by row level security rather than by hiding a menu item.
    const person = await aPerson(management, managementCtx);
    await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );

    assert.equal((await readingAs(accounts, (db) => listFicaRecords(db, {}))).length, 1);
    assert.equal(
      (await readingAs(admin, (db) => listFicaRecords(db, {}))).length,
      0,
      'an administrator sees nothing',
    );
    assert.equal(
      (await readingAs(agent, (db) => listFicaRecords(db, {}))).length,
      0,
      'and neither does an agent',
    );

    const refused = await rejects(
      asUser(admin, (db) =>
        startFicaRecord(db, adminCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
      ),
    );
    assert.match(refused.message, /policy|permission/i);
  });

  it('lets management see it, because management holds everything', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(accounts, (db) =>
      startFicaRecord(db, accountsCtx, parseOrThrow(ficaInputSchema, { personId: person.id })),
    );
    assert.equal((await readingAs(management, (db) => listFicaRecords(db, {}))).length, 1);
  });

  it('refuses a FICA document to somebody without FICA access', async () => {
    // The documents table gates the fica category on the permission, so a
    // FICA document is unreadable even to somebody who can see the person.
    const person = await aPerson(management, managementCtx);
    await asOwner((db) =>
      db.query(
        `insert into documents (category, file_name, content_type, byte_size, storage_key, person_id)
         values ('fica', 'id.pdf', 'application/pdf', 1024, 'fica/test-key', $1)`,
        [person.id],
      ),
    );

    const seenByAccounts = await readingAs(accounts, (db) =>
      db.query('select id from documents where person_id = $1', [person.id]),
    );
    const seenByAdmin = await readingAs(admin, (db) =>
      db.query('select id from documents where person_id = $1', [person.id]),
    );

    assert.equal(seenByAccounts.length, 1);
    assert.equal(seenByAdmin.length, 0, 'the category is gated, not merely hidden');
  });
});

// =====================================================================
describe('the FICA dashboard (spec 38)', () => {
  it('counts what is outstanding, expiring and missing entirely', async () => {
    const withFile = await aPerson(management, managementCtx, { firstName: 'Filed' });
    await aPerson(management, managementCtx, {
      firstName: 'Unfiled',
      contacts: [{ contactType: 'mobile', value: '083 444 5555', isPrimary: true }],
    });

    await asUser(accounts, (db) =>
      startFicaRecord(
        db,
        accountsCtx,
        parseOrThrow(ficaInputSchema, {
          personId: withFile.id,
          status: 'documents_requested',
        }),
      ),
    );

    const summary = await readingAs(accounts, (db) => ficaSummary(db));
    assert.equal(summary.outstanding, 1);
    assert.equal(summary.verified, 0);
    assert.equal(summary.peopleWithNoFile, 1, 'the client nobody has started a file for');
    assert.ok(summary.byStatus.some((row) => row.status === 'documents_requested'));
  });
});
