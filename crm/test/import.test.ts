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
import { parseCsvRows } from '../src/lib/csv.ts';
import {
  hashBytes,
  looksLikeXlsx,
  parseCsvSheet,
  parseSheet,
  parseXlsxSheet,
} from '../src/lib/import/parse.ts';
import {
  applyMapping,
  mappingProblems,
  parseImportCount,
  parseImportDate,
  parseImportMoney,
  suggestMapping,
  suggestionsToMapping,
} from '../src/lib/import/mapping.ts';
import {
  cancelImportBatch,
  createImportBatch,
  getImportBatch,
  importRowCounts,
  listImportBatches,
  listImportRows,
  saveMapping,
} from '../src/lib/import/batches.ts';
import { commitImport, previewImport, rollbackImport } from '../src/lib/import/commit.ts';
import {
  hostIsAllowed,
  isForbiddenAddress,
  parseImportUrl,
  assertUrlIsFetchable,
} from '../src/lib/import/url.ts';
import { setSetting } from '../src/lib/settings.ts';
import { getPerson, listPeople } from '../src/lib/people/queries.ts';
import { createPerson } from '../src/lib/people/mutations.ts';
import { personInputSchema } from '../src/lib/people/types.ts';
import { parseOrThrow } from '../src/lib/validate.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let admin: TestUser;
let agent: TestUser;
let managementCtx: Ctx;
let adminCtx: Ctx;
let agentCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT' });
  admin = await createTestUser({ role: 'ADMIN' });
  agent = await createTestUser({ role: 'AGENT' });
  managementCtx = await ctxFor(management);
  adminCtx = await ctxFor(admin);
  agentCtx = await ctxFor(agent);
});

after(shutdown);

const bytesOf = (text: string) => new TextEncoder().encode(text);

const PEOPLE_CSV = [
  'First Name,Surname,Cell,Email,ID Number,Client Type,Suburb',
  'Johan,van der Merwe,082 123 4567,johan@example.co.za,8001015009087,Seller,Wilderness',
  'Thandi,Mokoena,0835551234,thandi@example.co.za,,Buyer;Tenant,George',
].join('\n');

async function aBatch(
  csv: string,
  overrides: Record<string, unknown> = {},
  user: TestUser = management,
  ctx: Ctx = managementCtx,
) {
  const bytes = bytesOf(csv);
  const sheet = parseCsvSheet(csv, bytes);
  return asUser(user, (db) =>
    createImportBatch(
      db,
      ctx,
      {
        name: 'Test import',
        entityType: 'person',
        sourceSystem: 'generic',
        notes: null,
        sourceKind: 'file',
        sourceName: 'people.csv',
        ...overrides,
      } as never,
      sheet,
    ),
  );
}

// =====================================================================
describe('reading a file (spec 60)', () => {
  it('keeps a quoted line break inside one cell instead of shifting every column', () => {
    const rows = parseCsvRows('Name,Notes\n"Smith, John","Line one\nLine two",\nJane,Plain');
    assert.equal(rows.length, 3);
    assert.equal(rows[1]?.[0], 'Smith, John');
    assert.equal(rows[1]?.[1], 'Line one\nLine two');
    assert.equal(rows[2]?.[0], 'Jane');
  });

  it('reads a semicolon file, as a South African Excel writes it', () => {
    const rows = parseCsvRows('First Name;Surname\nJohan;Bekker');
    assert.deepEqual(rows[1], ['Johan', 'Bekker']);
  });

  it('strips the byte order mark Excel puts on the first heading', () => {
    const sheet = parseCsvSheet('﻿First Name,Surname\nA,B', bytesOf('x'));
    assert.deepEqual(sheet.headers, ['First Name', 'Surname']);
  });

  it('makes duplicate and blank headings usable, and says it did', () => {
    const sheet = parseCsvSheet('Notes,,Notes\n1,2,3', bytesOf('x'));
    assert.deepEqual(sheet.headers, ['Notes', 'Column 2', 'Notes (2)']);
    assert.equal(sheet.rows[0]?.['Notes'], '1');
    assert.equal(sheet.rows[0]?.['Notes (2)'], '3');
    assert.ok(sheet.warnings.some((warning: string) => /more than one column/i.test(warning)));
  });

  it('skips wholly blank lines rather than importing empty records', () => {
    const sheet = parseCsvSheet('A,B\n1,2\n\n,\n3,4', bytesOf('x'));
    assert.equal(sheet.rows.length, 2);
  });

  it('reads a real xlsx, including a number, a date and a formula result', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clients');
    sheet.addRow(['First Name', 'Surname', 'Bedrooms', 'Mandate Start', 'Computed']);
    sheet.addRow(['Nandi', 'Dlamini', 3, new Date('2026-03-04T00:00:00Z'), null]);
    // A formula whose cached result is what the spreadsheet displays.
    sheet.getCell('E2').value = { formula: 'A2&" "&B2', result: 'Nandi Dlamini' };

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseXlsxSheet(new Uint8Array(buffer as ArrayBuffer));

    assert.deepEqual(parsed.headers, [
      'First Name',
      'Surname',
      'Bedrooms',
      'Mandate Start',
      'Computed',
    ]);
    assert.equal(parsed.rows[0]?.['Bedrooms'], '3');
    assert.equal(parsed.rows[0]?.['Mandate Start'], '2026-03-04');
    assert.equal(
      parsed.rows[0]?.['Computed'],
      'Nandi Dlamini',
      'a formula contributes its result, never its expression',
    );
    assert.equal(parsed.sheetName, 'Clients');
  });

  it('refuses a binary file with a useful message rather than importing gibberish', async () => {
    const binary = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01, 0x02]);
    const error = await rejects(parseSheet({ bytes: binary, filename: 'old.xls' }));
    assert.match(error.message, /binary file rather than a CSV/i);
  });

  it('recognises a spreadsheet by name or by media type', () => {
    assert.equal(looksLikeXlsx('export.xlsx'), true);
    assert.equal(looksLikeXlsx('export.csv'), false);
    assert.equal(
      looksLikeXlsx('download', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      true,
    );
  });

  it('hashes the bytes, so the same file is recognisable later', () => {
    assert.equal(hashBytes(bytesOf('a')), hashBytes(bytesOf('a')));
    assert.notEqual(hashBytes(bytesOf('a')), hashBytes(bytesOf('b')));
  });
});

// =====================================================================
describe('matching columns to fields (spec 62, 63)', () => {
  it('proposes a mapping and says how sure it is', () => {
    const suggestions = suggestMapping(
      ['First Name', 'Cell', 'Contact Wibble', 'Nonsense'],
      'person',
    );
    const byHeader = new Map(suggestions.map((s) => [s.header, s]));

    assert.equal(byHeader.get('First Name')?.fieldKey, 'firstName');
    assert.equal(byHeader.get('First Name')?.confidence, 'exact');
    assert.equal(byHeader.get('Cell')?.fieldKey, 'mobile');
    assert.equal(byHeader.get('Cell')?.confidence, 'likely');
    assert.equal(byHeader.get('Nonsense')?.fieldKey, null);
    assert.equal(byHeader.get('Nonsense')?.confidence, 'none');
  });

  it('turns the suggestions into the mapping the wizard saves', () => {
    const mapping = suggestionsToMapping(
      suggestMapping(['First Name', 'Surname', 'Nonsense'], 'person'),
    );
    assert.deepEqual(mapping, { 'First Name': 'firstName', Surname: 'surname' });
    assert.ok(!('Nonsense' in mapping), 'an unmatched column is simply not imported');
  });

  it('never maps two columns to the same field', () => {
    const suggestions = suggestMapping(['Cell', 'Cell Number', 'Mobile'], 'person');
    const mapped = suggestions.map((s) => s.fieldKey).filter(Boolean);
    assert.equal(new Set(mapped).size, mapped.length);
  });

  it('prefers the longer match, so an alternative number is not read as the main one', () => {
    const suggestions = suggestMapping(['Contact Alternative Mobile'], 'person');
    assert.equal(suggestions[0]?.fieldKey, 'alternativeMobile');
  });

  it('knows what a PropCtrl export calls things', () => {
    const generic = suggestMapping(['Contact Category'], 'person', 'generic');
    const propctrl = suggestMapping(['Contact Category'], 'person', 'propctrl');
    assert.equal(propctrl[0]?.fieldKey, 'clientTypes');
    assert.equal(propctrl[0]?.confidence, 'exact');
    // The generic guess may or may not land; what matters is the export-aware
    // one is certain where the generic one is not.
    assert.notEqual(generic[0]?.confidence, 'exact');
  });

  it('refuses a mapping that could not identify anything', () => {
    assert.deepEqual(mappingProblems({ Notes: 'notes' }, 'person').length > 0, true);
    assert.match(
      mappingProblems({ Notes: 'notes' }, 'person').join(' '),
      /first name or a surname/i,
    );
    assert.equal(
      mappingProblems({ A: 'surname', B: 'mobile' }, 'person').length,
      0,
    );
  });
});

// =====================================================================
describe('turning text into values (spec 63)', () => {
  it('reads a South African date day-first', () => {
    assert.equal(parseImportDate('04/03/2026'), '2026-03-04');
    assert.equal(parseImportDate('4-3-2026'), '2026-03-04');
    assert.equal(parseImportDate('2026-03-04'), '2026-03-04');
    assert.equal(parseImportDate('4 March 2026'), '2026-03-04');
    assert.equal(parseImportDate('not a date'), null);
    assert.equal(parseImportDate('45/13/2026'), null);
  });

  it('treats a comma as a thousands separator, never a decimal comma', () => {
    // Getting this wrong turns R1,500,000 into one and a half rand.
    assert.equal(parseImportMoney('R1,500,000'), '1500000.00');
    assert.equal(parseImportMoney('1 500 000'), '1500000.00');
    assert.equal(parseImportMoney('ZAR 2950000.50'), '2950000.50');
    assert.equal(parseImportMoney('1,500'), '1500.00');
    assert.equal(parseImportMoney('POA'), null);
    assert.equal(parseImportCount('3'), '3');
    assert.equal(parseImportCount('2.5'), '2.5');
  });

  it('reports a value it cannot read instead of dropping it', () => {
    const mapped = applyMapping(
      { Cell: 'not a number', Email: 'nope', ID: '123', Price: 'POA', Surname: 'Bekker' },
      { Cell: 'mobile', Email: 'email', ID: 'idNumber', Surname: 'surname' },
      'person',
    );
    assert.equal(mapped.values.surname, 'Bekker');
    assert.equal(mapped.values.mobile, undefined);
    assert.equal(mapped.problems.length, 3);
    assert.match(mapped.problems.join(' '), /not a number we can use/i);
    assert.match(mapped.problems.join(' '), /does not look like an email/i);
    assert.match(mapped.problems.join(' '), /13 digits/i);
  });

  it('translates the words another system uses into ours', () => {
    const mapped = applyMapping(
      { Type: 'Sole Mandate', Status: 'Sold', Kind: 'Freestanding House', Prov: 'WC' },
      { Type: 'mandateType', Status: 'salesStatus', Kind: 'propertyType', Prov: 'province' },
      'property',
    );
    assert.equal(mapped.values.mandateType, 'sole');
    assert.equal(mapped.values.salesStatus, 'sale_concluded');
    assert.equal(mapped.values.propertyType, 'house');
    assert.equal(mapped.values.province, 'Western Cape');
  });

  it('splits a list of client types however it was separated', () => {
    const mapped = applyMapping(
      { Types: 'Buyer; Tenant / Investor' },
      { Types: 'clientTypes' },
      'person',
    );
    assert.deepEqual(mapped.values.clientTypes, ['buyer', 'tenant', 'investor']);
  });

  it('notices a row with nothing to identify it', () => {
    const empty = applyMapping({ Notes: 'just a note' }, { Notes: 'notes' }, 'person');
    assert.equal(empty.empty, true);
    const named = applyMapping({ S: 'Bekker' }, { S: 'surname' }, 'person');
    assert.equal(named.empty, false);
  });
});

// =====================================================================
describe('an import as a record (spec 59, 64)', () => {
  it('keeps the file rows exactly as they arrived and proposes a mapping', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));

    assert.ok(batch);
    assert.match(batch.batchRef, /^GRLP-IMP-\d{6}$/);
    assert.equal(batch.status, 'draft');
    assert.equal(batch.rowCount, 2);
    assert.equal(batch.mapping['First Name'], 'firstName');
    assert.equal(batch.mapping['Cell'], 'mobile');

    const rows = await readingAs(management, (db) => listImportRows(db, created.id));
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.raw['Cell'], '082 123 4567', 'kept as written, not normalised');
    assert.equal(rows[0]?.action, 'pending');
  });

  it('recognises the very same file coming round again (spec 68)', async () => {
    const first = await aBatch(PEOPLE_CSV);
    const second = await aBatch(PEOPLE_CSV);
    assert.equal(second.sameFileAs?.batchRef, first.batchRef);

    const different = await aBatch(`${PEOPLE_CSV}\nNew,Person,0821110000,,,,`);
    assert.equal(different.sameFileAs, null);
  });

  it('refuses a file with a heading row and nothing else', async () => {
    const error = await rejects(aBatch('First Name,Surname'));
    assert.match(error.message, /heading row but no data|nothing in it/i);
  });

  it('refuses a file bigger than the office allows', async () => {
    await asUser(management, (db) => setSetting(db, managementCtx, 'import.max_rows', 2));
    const rows = ['First Name,Surname', 'A,One', 'B,Two', 'C,Three'].join('\n');
    const error = await rejects(aBatch(rows));
    assert.match(error.message, /more than 2 rows/i);
  });

  it('will not accept a mapping naming a column the file does not have', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    const error = await rejects(
      asUser(management, (db) =>
        saveMapping(db, managementCtx, created.id, { Invented: 'surname' }, batch!.rowVersion),
      ),
    );
    assert.match(error.message, /does not match this file|no column called/i);
  });

  it('throws away the previous preview when the mapping changes', async () => {
    const created = await aBatch(PEOPLE_CSV);
    await asUser(management, (db) => previewImport(db, managementCtx, created.id));
    assert.equal(
      (await readingAs(management, (db) => importRowCounts(db, created.id))).create,
      2,
    );

    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    await asUser(management, (db) =>
      saveMapping(
        db,
        managementCtx,
        created.id,
        { 'First Name': 'firstName', Surname: 'surname', Cell: 'mobile' },
        batch!.rowVersion,
      ),
    );

    const counts = await readingAs(management, (db) => importRowCounts(db, created.id));
    assert.equal(counts.pending, 2, 'the old decisions no longer describe this mapping');
    assert.equal(counts.create, 0);
  });

  it('can be cancelled before it is run', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    await asUser(management, (db) =>
      cancelImportBatch(db, managementCtx, created.id, batch!.rowVersion),
    );
    assert.equal(
      (await readingAs(management, (db) => getImportBatch(db, created.id)))?.status,
      'cancelled',
    );
  });
});

// =====================================================================
describe('checking before importing (spec 65, 67)', () => {
  it('decides what each row will do, and says why', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const outcome = await asUser(management, (db) => previewImport(db, managementCtx, created.id));

    assert.deepEqual(outcome, { create: 2, update: 0, skip: 0, error: 0 });

    const rows = await readingAs(management, (db) => listImportRows(db, created.id));
    assert.equal(rows[0]?.action, 'create');
    assert.match(rows[0]?.actionReason ?? '', /nothing like this/i);
    assert.equal(rows[0]?.mapped?.mobile, '+27821234567', 'normalised at mapping');
    assert.deepEqual(rows[1]?.mapped?.clientTypes, ['buyer', 'tenant']);
  });

  it('offers to update rather than duplicate when the person is already on file', async () => {
    await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        parseOrThrow(personInputSchema, {
          firstName: 'Johan',
          surname: 'van der Merwe',
          clientTypes: ['buyer'],
          contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        }),
      ),
    );

    const created = await aBatch(PEOPLE_CSV);
    const outcome = await asUser(management, (db) => previewImport(db, managementCtx, created.id));

    assert.equal(outcome.update, 1);
    assert.equal(outcome.create, 1);

    const rows = await readingAs(management, (db) => listImportRows(db, created.id));
    const update = rows.find((row) => row.action === 'update');
    assert.ok(update?.targetId);
    assert.match(update?.actionReason ?? '', /already on the system/i);
    assert.match(update?.actionReason ?? '', /nothing already there is overwritten/i);
  });

  it('skips the same person appearing twice in one file', async () => {
    const csv = [
      'First Name,Surname,Cell',
      'Johan,Bekker,082 123 4567',
      'Johan,Bekker,082 123 4567',
    ].join('\n');
    const created = await aBatch(csv);
    const outcome = await asUser(management, (db) => previewImport(db, managementCtx, created.id));

    assert.equal(outcome.create, 1);
    assert.equal(outcome.skip, 1);
    const rows = await readingAs(management, (db) => listImportRows(db, created.id));
    assert.match(rows[1]?.actionReason ?? '', /appears on line 1 of this file/i);
  });

  it('marks a row with nothing to identify it as unimportable', async () => {
    const csv = ['First Name,Surname,Notes', ',,just a note', 'Real,Person,fine'].join('\n');
    const created = await aBatch(csv);
    const outcome = await asUser(management, (db) => previewImport(db, managementCtx, created.id));

    assert.equal(outcome.error, 1);
    assert.equal(outcome.create, 1);
    const rows = await readingAs(management, (db) => listImportRows(db, created.id));
    assert.match(rows[0]?.errors.join(' ') ?? '', /nothing in it that could identify/i);
  });

  it('will not run before the columns have been matched', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    // Clearing the mapping is not something the UI offers, so it is forced
    // here to prove the guard is on the server and not only in the form.
    await asUser(management, (db) =>
      db.query("update import_batches set mapping = '{}'::jsonb where id = $1", [created.id]),
    );
    const error = await rejects(
      asUser(management, (db) => previewImport(db, managementCtx, created.id)),
    );
    assert.match(error.message, /match the columns/i);
    assert.ok(batch);
  });
});

// =====================================================================
describe('importing (spec 69, 106)', () => {
  async function previewed(csv = PEOPLE_CSV) {
    const created = await aBatch(csv);
    await asUser(management, (db) => previewImport(db, managementCtx, created.id));
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    return { id: created.id, batchRef: created.batchRef, rowVersion: batch!.rowVersion };
  }

  it('creates the records and records where each came from', async () => {
    const batch = await previewed();
    const outcome = await asUser(management, (db) =>
      commitImport(db, managementCtx, batch.id, batch.rowVersion),
    );

    assert.equal(outcome.created, 2);
    assert.equal(outcome.updated, 0);

    const people = await readingAs(management, (db) => listPeople(db, { pageSize: 10 }));
    assert.equal(people.total, 2);

    const provenance = await readingAs(management, (db) =>
      db.query<{ n: number }>(
        'select count(*)::int as n from people where imported_from_batch_id = $1',
        [batch.id],
      ),
    );
    assert.equal(provenance[0]?.n, 2, 'each record knows which import made it');

    const stored = await readingAs(management, (db) => getImportBatch(db, batch.id));
    assert.equal(stored?.status, 'committed');
    assert.equal(stored?.createdCount, 2);
  });

  it('writes through the ordinary paths, so the values are properly normalised', async () => {
    const batch = await previewed();
    await asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion));

    const rows = await readingAs(management, (db) => listImportRows(db, batch.id));
    const person = await readingAs(management, (db) => getPerson(db, rows[0]!.targetId!));

    assert.ok(person);
    assert.equal(person.firstName, 'Johan');
    assert.match(person.clientRef, /^GRLP-\d{8}$/);
    assert.ok(
      person.contacts.some((contact) => contact.value === '+27821234567'),
      'the number was normalised by the same code a person typing uses',
    );
    assert.equal(person.idIsRecorded, true);
    assert.match(person.idDisplay, /\*+087$/, 'and the ID is masked like any other');
  });

  it('fills a blank field on an existing record but never overwrites one', async () => {
    const existing = await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        parseOrThrow(personInputSchema, {
          firstName: 'Johan',
          surname: 'van der Merwe',
          title: 'Mr',
          clientTypes: ['buyer'],
          contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        }),
      ),
    );

    const csv = [
      'First Name,Surname,Cell,Title,Email,Client Type',
      'Johan,van der Merwe,082 123 4567,Doctor,johan@example.co.za,Seller',
    ].join('\n');
    const batch = await previewed(csv);
    const outcome = await asUser(management, (db) =>
      commitImport(db, managementCtx, batch.id, batch.rowVersion),
    );
    assert.equal(outcome.updated, 1);

    const person = await readingAs(management, (db) => getPerson(db, existing.id));
    assert.equal(person?.title, 'Mr', 'what a person put there is left alone');
    assert.ok(
      person?.contacts.some((contact) => contact.value === 'johan@example.co.za'),
      'but a detail the record did not have is added',
    );
    assert.deepEqual(
      [...(person?.clientTypes ?? [])].sort(),
      ['buyer', 'seller'],
      'and client types are added to, not replaced',
    );
  });

  it('never overwrites an identity number that is already on file', async () => {
    const existing = await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        parseOrThrow(personInputSchema, {
          firstName: 'Johan',
          surname: 'van der Merwe',
          idNumber: '8001015009087',
          clientTypes: ['buyer'],
          contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        }),
      ),
    );

    // A different, also-valid ID number for the same matched person.
    const csv = [
      'First Name,Surname,Cell,ID Number',
      'Johan,van der Merwe,082 123 4567,9202204720082',
    ].join('\n');
    const batch = await previewed(csv);
    await asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion));

    const person = await readingAs(management, (db) => getPerson(db, existing.id));
    assert.match(
      person?.idDisplay ?? '',
      /087$/,
      'the checked number a person entered stands; the import did not replace it',
    );
  });

  it('imports nothing at all if any row fails (spec 106)', async () => {
    const batch = await previewed();

    // A row whose target disappears between preview and commit is the honest
    // version of "something unforeseen went wrong at row two".
    const rows = await readingAs(management, (db) => listImportRows(db, batch.id));
    await asUser(management, (db) =>
      db.query(
        `update import_rows set action = 'update', target_id = gen_random_uuid()
          where id = $1`,
        [rows[1]!.id],
      ),
    );

    const error = await rejects(
      asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion)),
    );
    assert.match(error.message, /nothing was imported/i);

    // The whole transaction was abandoned, so the first row is not there either.
    assert.equal((await readingAs(management, (db) => listPeople(db, {}))).total, 0);
    assert.equal(
      (await readingAs(management, (db) => getImportBatch(db, batch.id)))?.status,
      'previewed',
      'and the batch is still waiting, not half-done',
    );
  });

  it('refuses to import twice', async () => {
    const batch = await previewed();
    await asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion));

    const error = await rejects(
      asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion)),
    );
    assert.match(error.message, /check the import first|already been run/i);
    assert.equal((await readingAs(management, (db) => listPeople(db, {}))).total, 2);
  });

  it('refuses to import something nobody has checked', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    const error = await rejects(
      asUser(management, (db) => commitImport(db, managementCtx, created.id, batch!.rowVersion)),
    );
    assert.match(error.message, /check the import first/i);
  });

  it('is refused if somebody else changed the batch in the meantime (spec 105)', async () => {
    const batch = await previewed();
    const error = await rejects(
      asUser(management, (db) => commitImport(db, managementCtx, batch.id, batch.rowVersion + 5)),
    );
    assert.match(error.message, /updated by another user/i);
  });
});

// =====================================================================
describe('rolling back (spec 70)', () => {
  it('archives what the import created, keeps what it only updated, and needs a reason', async () => {
    const existing = await asUser(management, (db) =>
      createPerson(
        db,
        managementCtx,
        parseOrThrow(personInputSchema, {
          firstName: 'Johan',
          surname: 'van der Merwe',
          clientTypes: ['buyer'],
          contacts: [{ contactType: 'mobile', value: '082 123 4567', isPrimary: true }],
        }),
      ),
    );

    const created = await aBatch(PEOPLE_CSV);
    await asUser(management, (db) => previewImport(db, managementCtx, created.id));
    let batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    await asUser(management, (db) =>
      commitImport(db, managementCtx, created.id, batch!.rowVersion),
    );
    batch = await readingAs(management, (db) => getImportBatch(db, created.id));

    assert.match(
      (
        await rejects(
          asUser(management, (db) =>
            rollbackImport(db, managementCtx, created.id, '   ', batch!.rowVersion),
          ),
        )
      ).message,
      /why/i,
    );

    const outcome = await asUser(management, (db) =>
      rollbackImport(db, managementCtx, created.id, 'Wrong file', batch!.rowVersion),
    );
    assert.equal(outcome.archived, 1, 'the one record it created');
    assert.equal(outcome.leftAlone, 1, 'the one it merely updated');

    // Archived, not destroyed: still there, still findable.
    const active = await readingAs(management, (db) => listPeople(db, { archived: 'active' }));
    assert.equal(active.total, 1);
    assert.equal(active.rows[0]?.id, existing.id, 'the record that existed before is untouched');
    assert.equal(
      (await readingAs(management, (db) => listPeople(db, { archived: 'archived' }))).total,
      1,
    );

    const stored = await readingAs(management, (db) => getImportBatch(db, created.id));
    assert.equal(stored?.status, 'rolled_back');
    assert.equal(stored?.rollbackReason, 'Wrong file');
  });

  it('will not roll back something that was never run', async () => {
    const created = await aBatch(PEOPLE_CSV);
    const batch = await readingAs(management, (db) => getImportBatch(db, created.id));
    const error = await rejects(
      asUser(management, (db) =>
        rollbackImport(db, managementCtx, created.id, 'Changed my mind', batch!.rowVersion),
      ),
    );
    assert.match(error.message, /has been run can be rolled back/i);
  });
});

// =====================================================================
describe('an import is not a back door (spec 9)', () => {
  it('puts the importer on what they import, exactly as if they had typed it', async () => {
    // ADMIN has no DATA_VIEW_ALL, so the records it creates are its own and
    // row level security confines them the same way a captured record is.
    const created = await aBatch(PEOPLE_CSV, {}, admin, adminCtx);
    await asUser(admin, (db) => previewImport(db, adminCtx, created.id));
    const batch = await readingAs(admin, (db) => getImportBatch(db, created.id));
    await asUser(admin, (db) => commitImport(db, adminCtx, created.id, batch!.rowVersion));

    assert.equal((await readingAs(admin, (db) => listPeople(db, {}))).total, 2);
    assert.equal(
      (await readingAs(agent, (db) => listPeople(db, {}))).total,
      0,
      'an agent who had nothing to do with it still cannot see them',
    );
  });

  it('keeps somebody without import permission out entirely', async () => {
    // An agent may capture a person by hand but may not run an import, so the
    // import cannot be used to do in bulk what the role cannot do at all.
    const error = await rejects(aBatch(PEOPLE_CSV, {}, agent, agentCtx));
    assert.match(error.message, /policy|permission/i);

    const limited = await createTestUser({ role: 'LIMITED' });
    const limitedCtx = await ctxFor(limited);
    const alsoRefused = await rejects(aBatch(PEOPLE_CSV, {}, limited, limitedCtx));
    assert.match(alsoRefused.message, /policy|permission/i);
  });

  it('shows every import to anyone who may see imports, because it is office work', async () => {
    await aBatch(PEOPLE_CSV, {}, admin, adminCtx);
    assert.equal((await readingAs(management, (db) => listImportBatches(db, {}))).length, 1);
  });
});

// =====================================================================
describe('importing from a web address (spec 66, 102)', () => {
  it('refuses anything that is not a plain https address', () => {
    for (const bad of [
      'http://example.com/a.csv',
      'file:///etc/passwd',
      'gopher://example.com/',
      'ftp://example.com/a.csv',
      'not a url',
    ]) {
      assert.throws(() => parseImportUrl(bad), /https|valid web address/i, bad);
    }
    assert.throws(
      () => parseImportUrl('https://user:pass@example.com/a.csv'),
      /username and password/i,
    );
    assert.doesNotThrow(() => parseImportUrl('https://example.com/a.csv'));
  });

  /**
   * The addresses that matter. 169.254.169.254 is the cloud metadata service
   * and would hand out credentials to anything that can reach it.
   */
  it('refuses every private, loopback and link-local address', () => {
    for (const address of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'fc00::1',
      '::ffff:127.0.0.1',
      'not-an-address',
    ]) {
      assert.equal(isForbiddenAddress(address), true, address);
    }

    for (const address of ['8.8.8.8', '1.1.1.1', '41.0.0.1', '2606:4700::1111']) {
      assert.equal(isForbiddenAddress(address), false, address);
    }
  });

  it('matches an allowed host exactly or as a subdomain, never as a suffix', () => {
    const allowed = ['exports.example.com', 'propctrl.co.za'];
    assert.equal(hostIsAllowed('exports.example.com', allowed), true);
    assert.equal(hostIsAllowed('eu.propctrl.co.za', allowed), true);
    assert.equal(hostIsAllowed('PROPCTRL.CO.ZA', allowed), true);
    // The attack this guards against: a host somebody else registered that
    // merely ends with the allowed name.
    assert.equal(hostIsAllowed('evil-propctrl.co.za', allowed), false);
    assert.equal(hostIsAllowed('propctrl.co.za.evil.com', allowed), false);
    assert.equal(hostIsAllowed('example.com', allowed), false);
  });

  it('is switched off until an administrator lists the hosts', async () => {
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'import.url_allowed_hosts', []),
    );
    const error = await rejects(
      readingAs(management, (db) => assertUrlIsFetchable(db, 'https://exports.example.com/a.csv')),
    );
    assert.match(error.message, /switched off/i);
  });

  it('refuses a host that is not on the list', async () => {
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'import.url_allowed_hosts', ['exports.example.com']),
    );
    const error = await rejects(
      readingAs(management, (db) => assertUrlIsFetchable(db, 'https://elsewhere.example.net/a.csv')),
    );
    assert.match(error.message, /not on the list/i);
  });

  it('refuses a private address even when its host is on the list', async () => {
    // The allow-list is not a way to reach the machine the CRM runs on.
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'import.url_allowed_hosts', ['127.0.0.1', '169.254.169.254']),
    );
    for (const host of ['127.0.0.1', '169.254.169.254']) {
      const error = await rejects(
        readingAs(management, (db) => assertUrlIsFetchable(db, `https://${host}/a.csv`)),
      );
      assert.match(error.message, /private network/i, host);
    }
  });

  it('refuses a listed name that resolves into the private network', async () => {
    // localhost is on the allow-list and resolves to 127.0.0.1, which is
    // exactly the bypass the resolution check exists to close.
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'import.url_allowed_hosts', ['localhost']),
    );
    const error = await rejects(
      readingAs(management, (db) => assertUrlIsFetchable(db, 'https://localhost/a.csv')),
    );
    assert.match(error.message, /private network/i);
  });
});
