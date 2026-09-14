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
  cleanQuery,
  createTag,
  deleteSavedView,
  isFavourite,
  listAllTags,
  listFavourites,
  listRecentlyViewed,
  listSavedViews,
  noteViewed,
  pathTo,
  savedViewInputSchema,
  saveView,
  setTagActive,
  setTags,
  tagInputSchema,
  tagsFor,
  toggleFavourite,
} from '../src/lib/workspace.ts';
import { globalSearch, looksLikeIdNumber } from '../src/lib/search.ts';
import { buildExport, listExportLog, refusesColumn } from '../src/lib/exports.ts';
import { listNotifications, markAllRead, markRead, notify, unreadCount, usersWithPermission } from '../src/lib/notifications.ts';
import { systemHealth } from '../src/lib/health.ts';
import { dashboard } from '../src/lib/reports.ts';
import { dataQuality } from '../src/lib/data-quality.ts';
import { inviteUser, inviteInputSchema, listPendingInvitations, listUsers, revokeInvitation, setPermissionOverride, setUserRoles, setUserStatus } from '../src/lib/users.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let agent: TestUser;
let otherAgent: TestUser;
let managementCtx: Ctx;
let agentCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT', fullName: 'Ayden Grobler' });
  agent = await createTestUser({ role: 'AGENT', fullName: 'Nadia Agent' });
  otherAgent = await createTestUser({ role: 'AGENT', fullName: 'Pieter Agent' });
  managementCtx = await ctxFor(management);
  agentCtx = await ctxFor(agent);
});

after(shutdown);

async function aPerson(owner: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(owner, (db) =>
    createPerson(
      db,
      ctx,
      parseOrThrow(personInputSchema, {
        firstName: 'John',
        surname: 'Smith',
        idNumber: '8001015009087',
        businessArea: 'sales',
        clientTypes: ['seller'],
        contacts: [{ contactType: 'mobile', value: '082 543 2681' }],
        addresses: [{ suburb: 'Wilderness', city: 'George' }],
        primaryAgentId: owner.id,
        ...overrides,
      }),
    ),
  );
}

async function aProperty(owner: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(owner, (db) =>
    createProperty(
      db,
      ctx,
      parseOrThrow(propertyInputSchema, {
        erfNumber: '1234',
        streetAddress: '18 Main Road',
        suburb: 'Wilderness',
        city: 'George',
        propertyType: 'house',
        currentAskingPrice: '2950000',
        businessArea: 'sales',
        propertyStatus: 'on_market',
        salesStatus: 'on_market',
        primaryAgentId: owner.id,
        ...overrides,
      }),
    ),
  );
}

// =====================================================================
describe('global search (spec 17, 84, 97)', () => {
  it('finds a person by surname, reference and mobile however it is typed', async () => {
    const person = await aPerson(management, managementCtx);

    for (const query of ['Smith', 'GRLP-', '0825432681', '082 543 2681', '543 2681']) {
      const result = await readingAs(management, (db) => globalSearch(db, query));
      assert.ok(
        result.hits.some((hit) => hit.entityId === person.id),
        `"${query}" should find the person`,
      );
    }
  });

  it('finds a property by address, suburb, erf and reference', async () => {
    const property = await aProperty(management, managementCtx);

    for (const query of ['Main Road', 'Wilderness', '1234', 'GRLP-P']) {
      const result = await readingAs(management, (db) => globalSearch(db, query));
      assert.ok(
        result.hits.some((hit) => hit.entityId === property.id),
        `"${query}" should find the property`,
      );
    }
  });

  it('REFUSES to search by identity number, rather than quietly finding nothing', async () => {
    await aPerson(management, managementCtx);

    const result = await readingAs(management, (db) => globalSearch(db, '8001015009087'));
    assert.equal(result.refusedIdNumber, true);
    assert.equal(result.hits.length, 0, 'nothing is returned, and nothing is looked up');

    // Spaces and dashes do not get round it.
    assert.equal(looksLikeIdNumber('800101 5009 087'), true);
    assert.equal(looksLikeIdNumber('8001015009087'), true);
    assert.equal(looksLikeIdNumber('080123'), false);
  });

  it("does not reach another agent's records", async () => {
    await aPerson(agent, agentCtx, { primaryAgentId: agent.id });

    const own = await readingAs(agent, (db) => globalSearch(db, 'Smith'));
    assert.equal(own.hits.length, 1);

    const someoneElse = await readingAs(otherAgent, (db) => globalSearch(db, 'Smith'));
    assert.equal(someoneElse.hits.length, 0, 'row level security, not the interface');
  });

  it('says nothing at all for one character', async () => {
    await aPerson(management, managementCtx);
    const result = await readingAs(management, (db) => globalSearch(db, 'S'));
    assert.equal(result.hits.length, 0);
  });

  it('knows where every kind of record lives', () => {
    assert.equal(pathTo('person', 'abc'), '/people/abc');
    assert.equal(pathTo('property', 'abc'), '/properties/abc');
    assert.equal(pathTo('commission', 'abc'), '/commissions/abc');
    assert.equal(pathTo('company', 'abc'), '/companies/abc');
  });
});

// =====================================================================
describe('favourites and recent history are private (spec 89, 93)', () => {
  it('stars and unstars, and reports which it did', async () => {
    const person = await aPerson(management, managementCtx);

    assert.equal(
      await asUser(management, (db) => toggleFavourite(db, managementCtx, 'person', person.id)),
      'added',
    );
    assert.equal(
      await readingAs(management, (db) => isFavourite(db, management.id, 'person', person.id)),
      true,
    );
    assert.equal(
      await asUser(management, (db) => toggleFavourite(db, managementCtx, 'person', person.id)),
      'removed',
    );
    assert.equal(
      await readingAs(management, (db) => isFavourite(db, management.id, 'person', person.id)),
      false,
    );
  });

  it("keeps one person's favourites out of everybody else's reach, management included", async () => {
    const person = await aPerson(agent, agentCtx, { primaryAgentId: agent.id });
    await asUser(agent, (db) => toggleFavourite(db, agentCtx, 'person', person.id));

    const theirs = await readingAs(agent, (db) => listFavourites(db, agent.id));
    assert.equal(theirs.length, 1);

    // Even asking for somebody else's favourites by id returns nothing: the
    // policy is on the row, not on the query.
    const management_view = await readingAs(management, (db) => listFavourites(db, agent.id));
    assert.equal(
      management_view.length,
      0,
      'what somebody keeps an eye on is not office business',
    );
  });

  it('reads a label from the record itself, so the list survives an archive', async () => {
    const person = await aPerson(management, managementCtx);
    await asUser(management, (db) => toggleFavourite(db, managementCtx, 'person', person.id));

    const favourites = await readingAs(management, (db) => listFavourites(db, management.id));
    assert.equal(favourites[0]?.label, 'John Smith');
    assert.equal(favourites[0]?.href, `/people/${person.id}`);
  });

  it('remembers what was opened, most recent first, without duplicating', async () => {
    const person = await aPerson(management, managementCtx);
    const property = await aProperty(management, managementCtx);

    await asUser(management, (db) => noteViewed(db, management.id, 'person', person.id, 'John Smith'));
    await asUser(management, (db) =>
      noteViewed(db, management.id, 'property', property.id, '18 Main Road'),
    );
    await asUser(management, (db) => noteViewed(db, management.id, 'person', person.id, 'John Smith'));

    const recent = await readingAs(management, (db) => listRecentlyViewed(db, management.id));
    assert.equal(recent.length, 2, 'opening the same record twice is one entry');
    assert.equal(recent[0]?.entityId, person.id, 'the most recently opened comes first');
  });

  it('is never the reason a page fails', async () => {
    // A label far too long, and an id that is not a record. noteViewed
    // swallows both: a history of what was opened is not worth a broken
    // profile page.
    await asUser(management, (db) =>
      noteViewed(db, management.id, 'person', '11111111-1111-4111-8111-111111111111', 'x'.repeat(500)),
    );
    const recent = await readingAs(management, (db) => listRecentlyViewed(db, management.id));
    assert.ok(recent.length <= 1);
  });
});

// =====================================================================
describe('saved views (spec 88)', () => {
  it('saves this page’s own filters, named', async () => {
    await asUser(management, (db) =>
      saveView(
        db,
        managementCtx,
        parseOrThrow(savedViewInputSchema, {
          name: 'Wilderness sellers',
          entityType: 'person',
          query: 'clientType=seller&area=Wilderness',
        }),
      ),
    );

    const views = await readingAs(management, (db) => listSavedViews(db, management.id, 'person'));
    assert.equal(views.length, 1);
    assert.equal(views[0]?.name, 'Wilderness sellers');
    assert.equal(views[0]?.href, '/people?clientType=seller&area=Wilderness');
    assert.equal(views[0]?.isMine, true);
  });

  it('keeps a private view private and a shared one visible to the office', async () => {
    await asUser(agent, (db) =>
      saveView(
        db,
        agentCtx,
        parseOrThrow(savedViewInputSchema, {
          name: 'Mine only',
          entityType: 'person',
          query: 'sort=recent',
        }),
      ),
    );
    await asUser(agent, (db) =>
      saveView(
        db,
        agentCtx,
        parseOrThrow(savedViewInputSchema, {
          name: 'For everyone',
          entityType: 'person',
          query: 'clientType=buyer',
          isShared: true,
        }),
      ),
    );

    const theirs = await readingAs(agent, (db) => listSavedViews(db, agent.id, 'person'));
    assert.equal(theirs.length, 2);

    const others = await readingAs(otherAgent, (db) => listSavedViews(db, otherAgent.id, 'person'));
    assert.equal(others.length, 1);
    assert.equal(others[0]?.name, 'For everyone');
    assert.equal(others[0]?.isMine, false);
    assert.equal(others[0]?.ownerName, 'Nadia Agent');
  });

  it('refuses to let a saved view point anywhere but back into the CRM', () => {
    // Anything with a scheme, a slash or a fragment is dropped, so a named
    // view can never become a link to somewhere else.
    assert.equal(cleanQuery('q=Smith&sort=recent'), 'q=Smith&sort=recent');
    assert.equal(cleanQuery('?q=Smith'), 'q=Smith');
    assert.equal(cleanQuery('q=https://evil.example/x'), '');
    assert.equal(cleanQuery('q=../../etc/passwd'), '');
    assert.equal(cleanQuery('q=' + 'x'.repeat(400)), '');
    assert.equal(cleanQuery('__proto__=1&q=ok'), 'q=ok');
  });

  it('saving the same name twice updates it rather than making a second', async () => {
    for (const query of ['sort=recent', 'sort=name']) {
      await asUser(management, (db) =>
        saveView(
          db,
          managementCtx,
          parseOrThrow(savedViewInputSchema, {
            name: 'My list',
            entityType: 'person',
            query,
          }),
        ),
      );
    }
    const views = await readingAs(management, (db) => listSavedViews(db, management.id, 'person'));
    assert.equal(views.length, 1);
    assert.equal(views[0]?.href, '/people?sort=name');
  });

  it("will not let one agent delete another's view", async () => {
    await asUser(agent, (db) =>
      saveView(
        db,
        agentCtx,
        parseOrThrow(savedViewInputSchema, {
          name: 'Shared',
          entityType: 'person',
          query: 'sort=recent',
          isShared: true,
        }),
      ),
    );
    const views = await readingAs(otherAgent, (db) => listSavedViews(db, otherAgent.id, 'person'));
    const view = views[0];
    assert.ok(view);

    await rejects(asUser(otherAgent, (db) => deleteSavedView(db, view.id)));

    const still = await readingAs(agent, (db) => listSavedViews(db, agent.id, 'person'));
    assert.equal(still.length, 1);
  });
});

// =====================================================================
describe('tags are retired, never deleted (spec 87, 104)', () => {
  it('ships the office some tags to start from', async () => {
    const tags = await readingAs(management, (db) => listAllTags(db));
    assert.ok(tags.length > 0);
    assert.ok(tags.some((tag) => tag.name === 'VIP'));
  });

  it('puts tags on a record and takes them off again', async () => {
    const person = await aPerson(management, managementCtx);
    const tags = await readingAs(management, (db) => listAllTags(db));
    const vip = tags.find((tag) => tag.name === 'VIP');
    const investor = tags.find((tag) => tag.name === 'Investor');
    assert.ok(vip && investor);

    await asUser(management, (db) =>
      setTags(db, managementCtx, 'person', person.id, [vip.id, investor.id]),
    );
    let held = await readingAs(management, (db) => tagsFor(db, 'person', person.id));
    assert.equal(held.length, 2);

    await asUser(management, (db) => setTags(db, managementCtx, 'person', person.id, [vip.id]));
    held = await readingAs(management, (db) => tagsFor(db, 'person', person.id));
    assert.deepEqual(held.map((tag) => tag.name), ['VIP']);
  });

  it('refuses a second tag with the same name', async () => {
    const error = await rejects(
      asUser(management, (db) =>
        createTag(db, managementCtx, parseOrThrow(tagInputSchema, { name: 'vip' })),
      ),
    );
    assert.match(error.message, /already exists/i);
  });

  it('leaves a retired tag on every record that already carries it', async () => {
    const person = await aPerson(management, managementCtx);
    const tags = await readingAs(management, (db) => listAllTags(db));
    const vip = tags.find((tag) => tag.name === 'VIP');
    assert.ok(vip);

    await asUser(management, (db) => setTags(db, managementCtx, 'person', person.id, [vip.id]));
    await asUser(management, (db) => setTagActive(db, vip.id, false));

    const held = await readingAs(management, (db) => tagsFor(db, 'person', person.id));
    assert.equal(held.length, 1, 'somebody decided that label applied; it stays');

    const all = await readingAs(management, (db) => listAllTags(db));
    const retired = all.find((tag) => tag.id === vip.id);
    assert.equal(retired?.isActive, false);
    assert.equal(retired?.useCount, 1);
  });

  it('will not let an agent write the office’s tag list', async () => {
    await rejects(
      asUser(agent, (db) =>
        createTag(db, agentCtx, parseOrThrow(tagInputSchema, { name: 'My own tag' })),
      ),
    );
  });
});

// =====================================================================
describe('exports never carry an identity number (spec 15, 98)', () => {
  it('refuses a column that would take identity data out', () => {
    for (const heading of [
      'ID number',
      'id_number',
      'Identity Number',
      'passport number',
      'password',
      'ID fingerprint',
    ]) {
      assert.equal(refusesColumn(heading), true, `${heading} must be refused`);
    }
    assert.equal(refusesColumn('Surname'), false);
    assert.equal(refusesColumn('Mobile'), false);
  });

  it('refuses the whole export rather than dropping the column quietly', async () => {
    const error = await rejects(
      asUser(management, (db) =>
        buildExport(db, managementCtx, {
          entityType: 'people',
          columns: [
            { key: 'surname', header: 'Surname' },
            { key: 'id', header: 'ID number' },
          ],
          rows: [{ surname: 'Smith', id: '8001015009087' }],
        }),
      ),
    );
    assert.match(error.message, /never exported/i);

    const log = await readingAs(management, (db) => listExportLog(db));
    assert.equal(log.length, 0, 'a refused export is not a logged export');
  });

  it('writes an unalterable log entry for every export that happens', async () => {
    const result = await asUser(management, (db) =>
      buildExport(db, managementCtx, {
        entityType: 'people',
        columns: [
          { key: 'client_ref', header: 'Reference' },
          { key: 'surname', header: 'Surname' },
        ],
        rows: [{ client_ref: 'GRLP-00000001', surname: 'Smith' }],
        filters: { businessArea: 'sales' },
      }),
    );

    assert.match(result.filename, /^grlp-people-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(result.rowCount, 1);
    assert.match(result.csv, /Reference,Surname/);

    const log = await readingAs(management, (db) => listExportLog(db));
    assert.equal(log.length, 1);
    assert.equal(log[0]?.userName, 'Ayden Grobler');
    assert.equal(log[0]?.rowCount, 1);
    assert.equal(log[0]?.includedIdentity, false);
    assert.deepEqual(log[0]?.columns, ['Reference', 'Surname']);

    const blocked = await rejects(
      asOwner((db) => db.query('update export_logs set row_count = 999')),
    );
    assert.match(blocked.message, /append|cannot be changed|only be added/i);

    const undeletable = await rejects(asOwner((db) => db.query('delete from export_logs')));
    assert.match(undeletable.message, /append|cannot be changed|only be added/i);
  });

  it('escapes a cell that would otherwise run as a formula', async () => {
    const result = await asUser(management, (db) =>
      buildExport(db, managementCtx, {
        entityType: 'people',
        columns: [{ key: 'note', header: 'Note' }],
        rows: [{ note: '=1+1' }, { note: '+27825432681' }, { note: '@SUM(A1:A9)' }],
      }),
    );
    assert.equal(/^=1\+1/m.test(result.csv), false, 'a leading = must be neutralised');
    assert.match(result.csv, /'=1\+1|"'=1\+1"/);
  });

  it('refuses an export without the permission for it', async () => {
    const error = await rejects(
      asUser(agent, (db) =>
        buildExport(db, agentCtx, {
          entityType: 'people',
          columns: [{ key: 'surname', header: 'Surname' }],
          rows: [{ surname: 'Smith' }],
        }),
      ),
    );
    assert.match(error.message, /permission/i);
  });

  it('refuses to take the whole database out at once', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ surname: `Person ${index}` }));
    await asOwner((db) =>
      db.query("update settings set value = '10'::jsonb where key = 'export.max_rows'"),
    );

    const error = await rejects(
      asUser(management, (db) =>
        buildExport(db, managementCtx, {
          entityType: 'people',
          columns: [{ key: 'surname', header: 'Surname' }],
          rows,
        }),
      ),
    );
    assert.match(error.message, /narrow the filters/i);
  });

  it("keeps an agent's own exports visible to them but the log to the auditors", async () => {
    await asUser(management, (db) =>
      buildExport(db, managementCtx, {
        entityType: 'people',
        columns: [{ key: 'surname', header: 'Surname' }],
        rows: [{ surname: 'Smith' }],
      }),
    );

    // An agent holds neither AUDIT_LOG_VIEW nor this export, so they see none.
    const theirs = await readingAs(agent, (db) => listExportLog(db));
    assert.equal(theirs.length, 0);
  });
});

// =====================================================================
describe('notifications never leave the building (spec 6, 90, 143)', () => {
  it('writes a note that waits inside the CRM', async () => {
    await asUser(management, (db) =>
      notify(db, {
        userId: agent.id,
        kind: 'task_assigned',
        title: 'Confirm the Saturday viewing',
        body: 'Due tomorrow.',
        href: '/tasks',
      }),
    );

    assert.equal(await readingAs(agent, (db) => unreadCount(db, agent.id)), 1);
    const theirs = await readingAs(agent, (db) => listNotifications(db, agent.id));
    assert.equal(theirs[0]?.title, 'Confirm the Saturday viewing');
  });

  it('has no column anywhere that could claim something was sent', async () => {
    const columns = await asOwner((db) =>
      db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'notifications'`,
      ),
    );
    const names = columns.map((column) => column.column_name);

    for (const forbidden of [
      'sent_at',
      'delivered_at',
      'email_sent',
      'sms_sent',
      'push_sent',
      'provider_message_id',
      'delivery_status',
    ]) {
      assert.equal(names.includes(forbidden), false, `${forbidden} must not exist`);
    }
    // read_at is somebody opening the CRM, not a read receipt from a provider.
    assert.ok(names.includes('read_at'));
  });

  it("keeps one person's notifications out of another's reach", async () => {
    await asUser(management, (db) =>
      notify(db, { userId: agent.id, kind: 'mention', title: 'For Nadia' }),
    );

    const wrongPerson = await readingAs(otherAgent, (db) => listNotifications(db, agent.id));
    assert.equal(wrongPerson.length, 0);
    assert.equal(await readingAs(otherAgent, (db) => unreadCount(db, otherAgent.id)), 0);
  });

  it('marks one read, and then all of them', async () => {
    for (const title of ['One', 'Two', 'Three']) {
      await asUser(management, (db) =>
        notify(db, { userId: agent.id, kind: 'mention', title }),
      );
    }

    const first = await readingAs(agent, (db) => listNotifications(db, agent.id));
    const one = first[0];
    assert.ok(one);
    await asUser(agent, (db) => markRead(db, agentCtx, one.id));
    assert.equal(await readingAs(agent, (db) => unreadCount(db, agent.id)), 2);

    const remaining = await asUser(agent, (db) => markAllRead(db, agentCtx));
    assert.equal(remaining, 2);
    assert.equal(await readingAs(agent, (db) => unreadCount(db, agent.id)), 0);
  });

  it('finds everybody who may approve commission, for the one notice that needs it', async () => {
    const approvers = await readingAs(management, (db) =>
      usersWithPermission(db, 'COMMISSION_APPROVE'),
    );
    assert.ok(approvers.includes(management.id));
    assert.equal(approvers.includes(agent.id), false);
  });
});

// =====================================================================
describe('the dashboard and reports keep the statuses apart (spec 49, 94, 141)', () => {
  it('counts what is due today, and what is overdue, separately', async () => {
    const board = await readingAs(management, (db) => dashboard(db, management.id));
    assert.equal(typeof board.today.tasksDue, 'number');
    assert.equal(typeof board.today.tasksOverdue, 'number');
    assert.equal(board.attention.every((item) => item.count > 0), true);
  });

  it('counts an on-market property under property status, not sales status', async () => {
    await aProperty(management, managementCtx, {
      propertyStatus: 'on_market',
      salesStatus: 'prospect',
    });

    const board = await readingAs(management, (db) => dashboard(db, management.id));
    assert.equal(board.pipeline.propertiesOnMarket, 1);
  });

  it("shows an agent their own book and nobody else's", async () => {
    await aProperty(agent, agentCtx, { primaryAgentId: agent.id });

    const theirs = await readingAs(agent, (db) => dashboard(db, agent.id));
    assert.equal(theirs.pipeline.propertiesOnMarket, 1);

    const somebodyElse = await readingAs(otherAgent, (db) => dashboard(db, otherAgent.id));
    assert.equal(somebodyElse.pipeline.propertiesOnMarket, 0);
  });
});

// =====================================================================
describe('data quality reports contradictions, and fixes nothing (spec 96)', () => {
  it('finds a person with no way to contact them', async () => {
    await aPerson(management, managementCtx, { contacts: [] });

    const { issues } = await readingAs(management, dataQuality);
    const issue = issues.find((entry) => entry.code === 'people_no_contact');
    assert.ok(issue, 'somebody unreachable should be raised');
    assert.equal(issue.count, 1);
    assert.equal(issue.severity, 'high');
  });

  it('finds a mandate marked active but past its expiry, and leaves it alone', async () => {
    const property = await aProperty(management, managementCtx);
    await asOwner((db) =>
      db.query(
        `update properties
            set mandate_status = 'mandate_active', mandate_expiry = current_date - 10
          where id = $1`,
        [property.id],
      ),
    );

    const { issues } = await readingAs(management, dataQuality);
    const issue = issues.find((entry) => entry.code === 'mandate_active_but_expired');
    assert.ok(issue);
    assert.equal(issue.count, 1);

    // Reported, not corrected: the record is exactly as it was.
    const after = await asOwner((db) =>
      db.one<{ mandate_status: string }>('select mandate_status from properties where id = $1', [
        property.id,
      ]),
    );
    assert.equal(after.mandate_status, 'mandate_active');
  });

  it('says nothing about a tidy database', async () => {
    await aPerson(management, managementCtx);
    const { issues } = await readingAs(management, dataQuality);
    assert.equal(
      issues.some((entry) => entry.code === 'people_no_contact'),
      false,
    );
  });
});

// =====================================================================
describe('system health is honest about what is not connected (spec 107, 115)', () => {
  it('lists every external service as NOT CONNECTED, because it is', async () => {
    const health = await readingAs(management, systemHealth);

    const expected = [
      'Email sending',
      'WhatsApp',
      'National Consumer Commission register',
      'Property24 and Instagram',
      'Home Affairs, CIPC, deeds office, sanctions lists',
      'Bank feed and accounting',
    ];
    for (const name of expected) {
      const check = health.checks.find((entry) => entry.name === name);
      assert.ok(check, `${name} should be listed`);
      assert.equal(check.state, 'not_connected', `${name} must not be shown as working`);
    }
  });

  it('never shows a backup as done, because it takes none', async () => {
    const health = await readingAs(management, systemHealth);
    const backups = health.checks.find((entry) => entry.name === 'Backups');
    assert.ok(backups);
    assert.notEqual(backups.state, 'ok', 'a backup the CRM did not take is never green');
    assert.match(backups.detail, /Nobody is recorded as responsible|has not checked/i);
  });

  it('measures the database rather than guessing at it', async () => {
    const health = await readingAs(management, systemHealth);
    assert.match(health.database.version, /^\d+/);
    assert.ok(health.database.migrationsApplied > 0);
    assert.ok(health.database.sizeBytes > 0);
  });
});

// =====================================================================
describe('who may use the CRM (spec 7, 8, 10)', () => {
  it('invites somebody and hands back a link, because it cannot send one', async () => {
    const invitation = await asUser(management, (db) =>
      inviteUser(
        db,
        managementCtx,
        parseOrThrow(inviteInputSchema, {
          fullName: 'Thandi Ngwenya',
          email: 'thandi@grproperty.co.za',
          role: 'AGENT',
        }),
      ),
    );
    assert.ok(invitation.token.length > 20, 'the link is returned exactly once');

    const pending = await readingAs(management, (db) => listPendingInvitations(db));
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.email, 'thandi@grproperty.co.za');

    // The token itself is stored only as a hash, so it cannot be recovered.
    const stored = await asOwner((db) =>
      db.one<{ token_hash: string }>('select token_hash from user_invitations limit 1'),
    );
    assert.notEqual(stored.token_hash, invitation.token);
    assert.equal(stored.token_hash.includes(invitation.token), false);
  });

  it('refuses an address outside the company', async () => {
    assert.throws(() =>
      parseOrThrow(inviteInputSchema, {
        fullName: 'Somebody Else',
        email: 'somebody@gmail.com',
        role: 'AGENT',
      }),
    );
  });

  it('supersedes an earlier link rather than leaving two live', async () => {
    for (let round = 0; round < 2; round += 1) {
      await asUser(management, (db) =>
        inviteUser(
          db,
          managementCtx,
          parseOrThrow(inviteInputSchema, {
            fullName: 'Thandi Ngwenya',
            email: 'thandi@grproperty.co.za',
            role: 'AGENT',
          }),
        ),
      );
    }
    const pending = await readingAs(management, (db) => listPendingInvitations(db));
    assert.equal(pending.length, 1);
  });

  it('will not let an agent invite anybody', async () => {
    await rejects(
      asUser(agent, (db) =>
        inviteUser(
          db,
          agentCtx,
          parseOrThrow(inviteInputSchema, {
            fullName: 'A Friend',
            email: 'friend@grproperty.co.za',
            role: 'MANAGEMENT',
          }),
        ),
      ),
    );
  });

  it('suspends an account without deleting the person or their work', async () => {
    await asUser(management, (db) =>
      setUserStatus(db, managementCtx, agent.id, 'suspended', 'Left the company'),
    );

    const users = await readingAs(management, (db) => listUsers(db));
    const suspended = users.find((entry) => entry.id === agent.id);
    assert.ok(suspended, 'the row stays, so their name stays on what they did');
    assert.equal(suspended.status, 'suspended');
  });

  it('will not let somebody lock themselves out', async () => {
    const error = await rejects(
      asUser(management, (db) =>
        setUserStatus(db, managementCtx, management.id, 'disabled', 'Oops'),
      ),
    );
    assert.match(error.message, /Somebody else must do that/i);
  });

  it('will not let the office lock itself out entirely', async () => {
    const secondManager = await createTestUser({ role: 'MANAGEMENT' });
    const secondCtx = await ctxFor(secondManager);

    // One at a time is fine; the last one is refused.
    await asUser(secondManager, (db) =>
      setUserStatus(db, secondCtx, management.id, 'disabled', 'Left'),
    );

    const error = await rejects(
      asUser(secondManager, (db) =>
        setUserStatus(db, secondCtx, secondManager.id, 'disabled', 'Also left'),
      ),
    );
    assert.match(error.message, /Somebody else must do that|last person|cannot get back in/i);
  });

  it('refuses to leave somebody with no role at all', async () => {
    const error = await rejects(
      asUser(management, (db) => setUserRoles(db, managementCtx, agent.id, [])),
    );
    assert.match(error.message, /at least one role|see nothing/i);
  });

  it('records a per-user exception loudly', async () => {
    await asUser(management, (db) =>
      setPermissionOverride(db, managementCtx, agent.id, 'REPORTS_EXPORT', 'grant', 'For the audit'),
    );

    const users = await readingAs(management, (db) => listUsers(db));
    const entry = users.find((row) => row.id === agent.id);
    assert.ok(entry);
    assert.deepEqual(entry.overrides, [{ permission: 'REPORTS_EXPORT', allowed: true }]);

    const audit = await asOwner((db) =>
      db.query<{ action: string }>(
        "select action from audit_logs where action = 'user.permission_override'",
      ),
    );
    assert.equal(audit.length, 1);
  });

  it('revokes an invitation so its link stops working', async () => {
    const invitation = await asUser(management, (db) =>
      inviteUser(
        db,
        managementCtx,
        parseOrThrow(inviteInputSchema, {
          fullName: 'Thandi Ngwenya',
          email: 'thandi@grproperty.co.za',
          role: 'AGENT',
        }),
      ),
    );

    await asUser(management, (db) =>
      revokeInvitation(db, managementCtx, invitation.invitationId),
    );
    const pending = await readingAs(management, (db) => listPendingInvitations(db));
    assert.equal(pending.length, 0);
  });
});

// =====================================================================
describe('one person cannot reach into another’s notifications (spec 9, 102)', () => {
  it('refuses a direct insert for somebody else, even though app.notify allows it', async () => {
    // The narrow, audited path works.
    await asUser(management, (db) =>
      notify(db, { userId: agent.id, kind: 'mention', title: 'Through app.notify' }),
    );
    assert.equal(await readingAs(agent, (db) => unreadCount(db, agent.id)), 1);

    // Writing the row directly does not: the policy keeps a user to their own.
    const error = await rejects(
      asUser(management, (db) =>
        db.query(
          `insert into notifications (user_id, kind, title) values ($1, 'mention', 'Direct')`,
          [agent.id],
        ),
      ),
    );
    assert.match(error.message, /row-level security|policy|permission/i);
  });

  it('tells nobody at all when the account is not active', async () => {
    await asUser(management, (db) =>
      setUserStatus(db, managementCtx, otherAgent.id, 'disabled', 'Left'),
    );
    await asUser(management, (db) =>
      notify(db, { userId: otherAgent.id, kind: 'mention', title: 'Nobody will read this' }),
    );

    const count = await asOwner((db) =>
      db.one<{ n: number }>(
        'select count(*)::int as n from notifications where user_id = $1',
        [otherAgent.id],
      ),
    );
    assert.equal(Number(count.n), 0, 'a disabled account is not a person who will read it');
  });
});

// =====================================================================
describe('system health does not widen anybody’s access (spec 9, 102)', () => {
  it('refuses the operational counters to somebody without the permission', async () => {
    // Sessions and sign-in attempts are not readable by the application
    // role at all; the counters behind them need SETTINGS_ADMIN.
    const error = await rejects(
      asUser(agent, (db) => db.query('select * from app.system_counters()')),
    );
    assert.match(error.message, /permission/i);
  });

  it('still refuses a direct read of sessions and sign-in attempts', async () => {
    for (const table of ['user_sessions', 'login_attempts']) {
      const error = await rejects(
        asUser(management, (db) => db.query(`select count(*) from ${table}`)),
      );
      assert.match(
        error.message,
        /permission denied/i,
        `${table} must stay unreachable, even for management`,
      );
    }
  });
});
