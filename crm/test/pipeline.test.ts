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
import { getProperty, getPropertyHistory } from '../src/lib/properties/queries.ts';
import { propertyInputSchema } from '../src/lib/properties/types.ts';
import {
  archiveLead,
  createLead,
  getLead,
  leadInputSchema,
  leadStatistics,
  listLeadLossReasons,
  listLeadSources,
  listLeads,
  setLeadStatus,
  updateLead,
} from '../src/lib/leads.ts';
import {
  appointmentInputSchema,
  completeTask,
  createAppointment,
  createTask,
  getAppointment,
  getTask,
  listAppointments,
  listTasks,
  listWithoutNextAction,
  taskCounts,
  taskInputSchema,
  updateAppointment,
  updateTask,
} from '../src/lib/tasks.ts';
import {
  createOffer,
  createTransaction,
  createValuation,
  getOffer,
  getTransaction,
  getTransactionHistory,
  getValuation,
  listOffers,
  listTransactions,
  listValuations,
  listViewings,
  offerInputSchema,
  recordViewing,
  registerTransaction,
  saveViewingFeedback,
  setOfferStatus,
  setTransactionAgents,
  transactionInputSchema,
  updateOffer,
  updateTransaction,
  updateValuation,
  valuationInputSchema,
  viewingFeedbackInputSchema,
} from '../src/lib/sales.ts';
import {
  createRentalApplication,
  getRentalApplication,
  listRentalApplications,
  listScreening,
  rentalApplicationInputSchema,
  setScreeningItem,
  updateRentalApplication,
} from '../src/lib/rentals.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let ayden: TestUser;
let johan: TestUser;
let managementCtx: Ctx;
let aydenCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT', fullName: 'Kandy Management' });
  ayden = await createTestUser({ role: 'AGENT', fullName: 'Ayden Agent' });
  johan = await createTestUser({ role: 'AGENT', fullName: 'Johan Agent' });
  managementCtx = await ctxFor(management);
  aydenCtx = await ctxFor(ayden);
});
after(async () => {
  await shutdown();
});

async function aPerson(user: TestUser, ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return asUser(user, (db) =>
    createPerson(
      db,
      ctx,
      parseOrThrow(personInputSchema, {
        firstName: 'John',
        surname: 'Smith',
        clientTypes: ['buyer'],
        contacts: [{ contactType: 'mobile', value: '082 543 2681', isPrimary: true }],
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
        propertyType: 'house',
        currentAskingPrice: '2950000',
        businessArea: 'sales',
        propertyStatus: 'on_market',
        salesStatus: 'on_market',
        ...overrides,
      }),
    ),
  );
}

// =====================================================================
describe('leads (spec 39 to 42)', () => {
  it('links a lead to a person rather than starting a second record', async () => {
    const person = await aPerson(ayden, aydenCtx);
    const sources = await readingAs(ayden, (db) => listLeadSources(db));
    const website = sources.find((source) => source.name === 'Website');

    const lead = await asUser(ayden, (db) =>
      createLead(
        db,
        aydenCtx,
        parseOrThrow(leadInputSchema, {
          personId: person.id,
          businessArea: 'sales',
          leadType: 'buyer',
          status: 'new',
          sourceId: website?.id,
          enquirySummary: 'Looking for a three bedroom in Wilderness',
          budgetMin: '2000000',
          budgetMax: '3000000',
        }),
      ),
    );

    const loaded = await readingAs(ayden, (db) => getLead(db, lead.id));
    assert.equal(loaded?.personId, person.id);
    assert.equal(loaded?.personName, 'John Smith');
    assert.equal(loaded?.sourceName, 'Website');
    assert.equal(loaded?.status, 'new');
    assert.equal(loaded?.statusHistory.length, 1);
    assert.equal(loaded?.statusHistory[0]?.newStatus, 'new');
  });

  it('keeps a status history as the lead moves', async () => {
    const lead = await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    await asUser(ayden, (db) =>
      setLeadStatus(db, aydenCtx, lead.id, {
        status: 'contacted',
        lossReasonId: null,
        reason: 'Phoned on Tuesday',
      }),
    );
    await asUser(ayden, (db) =>
      setLeadStatus(db, aydenCtx, lead.id, {
        status: 'qualified',
        lossReasonId: null,
        reason: null,
      }),
    );

    const loaded = await readingAs(ayden, (db) => getLead(db, lead.id));
    assert.equal(loaded?.status, 'qualified');
    assert.equal(loaded?.statusHistory.length, 3);
    assert.equal(loaded?.statusHistory[0]?.newStatus, 'qualified');
    assert.equal(loaded?.statusHistory[1]?.reason, 'Phoned on Tuesday');
  });

  it('refuses to record a lost lead without a reason', async () => {
    const lead = await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    const error = await rejects(
      asUser(ayden, (db) =>
        setLeadStatus(db, aydenCtx, lead.id, {
          status: 'lost',
          lossReasonId: null,
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /why this lead was lost/i);
  });

  it('records a lost lead with its reason and stamps the date', async () => {
    const reasons = await readingAs(ayden, (db) => listLeadLossReasons(db));
    const price = reasons.find((reason) => reason.name === 'Price');
    const lead = await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    await asUser(ayden, (db) =>
      setLeadStatus(db, aydenCtx, lead.id, {
        status: 'lost',
        lossReasonId: price?.id ?? null,
        reason: 'Bought at a lower price elsewhere',
      }),
    );
    const loaded = await readingAs(ayden, (db) => getLead(db, lead.id));
    assert.equal(loaded?.status, 'lost');
    assert.equal(loaded?.lossReasonName, 'Price');
    assert.ok(loaded?.lostAt);
  });

  it('refuses a budget whose top is below its bottom', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(leadInputSchema, {
          leadType: 'buyer',
          budgetMin: '3000000',
          budgetMax: '2000000',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('hides one agent\'s leads from another', async () => {
    await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    assert.equal((await readingAs(ayden, (db) => listLeads(db, {}))).total, 1);
    assert.equal((await readingAs(johan, (db) => listLeads(db, {}))).total, 0);
    assert.equal((await readingAs(management, (db) => listLeads(db, {}))).total, 1);
  });

  it('reports conversion and loss reasons (spec 109)', async () => {
    const sources = await readingAs(management, (db) => listLeadSources(db));
    const reasons = await readingAs(management, (db) => listLeadLossReasons(db));
    const website = sources.find((source) => source.name === 'Website');
    const referral = sources.find((source) => source.name === 'Referral');
    const price = reasons.find((reason) => reason.name === 'Price');

    const won = await asUser(management, (db) =>
      createLead(
        db,
        managementCtx,
        parseOrThrow(leadInputSchema, { leadType: 'buyer', sourceId: website?.id }),
      ),
    );
    await asUser(management, (db) =>
      setLeadStatus(db, managementCtx, won.id, { status: 'won', lossReasonId: null, reason: null }),
    );
    const lost = await asUser(management, (db) =>
      createLead(
        db,
        managementCtx,
        parseOrThrow(leadInputSchema, { leadType: 'seller', sourceId: referral?.id }),
      ),
    );
    await asUser(management, (db) =>
      setLeadStatus(db, managementCtx, lost.id, {
        status: 'lost',
        lossReasonId: price?.id ?? null,
        reason: null,
      }),
    );

    const stats = await readingAs(management, (db) => leadStatistics(db, {}));
    assert.equal(stats.total, 2);
    assert.equal(stats.won, 1);
    assert.equal(stats.lost, 1);
    assert.equal(stats.byLossReason[0]?.reason, 'Price');
    assert.ok(stats.bySource.some((row) => row.source === 'Website' && row.won === 1));
  });

  it('narrows to one person or one property, for the profile pages (spec 99, 100)', async () => {
    const person = await aPerson(ayden, aydenCtx, { firstName: 'Nandi' });
    const property = await aProperty(ayden, aydenCtx);
    await asUser(ayden, (db) =>
      createLead(
        db,
        aydenCtx,
        parseOrThrow(leadInputSchema, {
          leadType: 'buyer',
          personId: person.id,
          propertyId: property.id,
        }),
      ),
    );
    // A second lead belonging to nobody in particular must not appear on either
    // profile.
    await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'seller' })),
    );

    const byPerson = await readingAs(ayden, (db) => listLeads(db, { personId: person.id }));
    const byProperty = await readingAs(ayden, (db) => listLeads(db, { propertyId: property.id }));

    assert.equal(byPerson.total, 1);
    assert.equal(byProperty.total, 1);
    assert.equal(byPerson.rows[0]?.leadType, 'buyer');
    assert.equal(byPerson.rows[0]?.id, byProperty.rows[0]?.id);
    assert.equal((await readingAs(ayden, (db) => listLeads(db, {}))).total, 2);
  });

  it('archives a lead rather than deleting it', async () => {
    const lead = await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    await asUser(ayden, (db) => archiveLead(db, aydenCtx, lead.id, 'Duplicate enquiry'));
    assert.equal((await readingAs(ayden, (db) => listLeads(db, { archived: 'active' }))).total, 0);
    assert.equal((await readingAs(ayden, (db) => listLeads(db, { archived: 'archived' }))).total, 1);
    assert.ok(await readingAs(ayden, (db) => getLead(db, lead.id)));
  });

  it('refuses to overwrite a change made by someone else', async () => {
    const lead = await asUser(ayden, (db) =>
      createLead(db, aydenCtx, parseOrThrow(leadInputSchema, { leadType: 'buyer' })),
    );
    const loaded = await readingAs(ayden, (db) => getLead(db, lead.id));
    await asUser(ayden, (db) =>
      updateLead(
        db,
        aydenCtx,
        lead.id,
        parseOrThrow(leadInputSchema, { leadType: 'seller' }),
        loaded!.rowVersion,
      ),
    );
    const error = await rejects(
      asUser(ayden, (db) =>
        updateLead(
          db,
          aydenCtx,
          lead.id,
          parseOrThrow(leadInputSchema, { leadType: 'investor' }),
          loaded!.rowVersion,
        ),
      ),
    );
    assert.match(error.message, /updated by another user/i);
  });
});

// =====================================================================
describe('tasks and follow-ups (spec 43, 44, 94)', () => {
  it('assigns a task to whoever set it when nobody is named', async () => {
    const task = await asUser(ayden, (db) =>
      createTask(db, aydenCtx, parseOrThrow(taskInputSchema, { title: 'Phone the seller' })),
    );
    const loaded = await readingAs(ayden, (db) => getTask(db, task.id));
    assert.equal(loaded?.assignedUserId, ayden.id);
    assert.equal(loaded?.status, 'to_do');
  });

  it('separates due today, overdue and upcoming (spec 44)', async () => {
    const now = Date.now();
    for (const [title, dueAt] of [
      ['Overdue call', new Date(now - 3 * 86_400_000)],
      ['Today', new Date(now + 60_000)],
      ['Next week', new Date(now + 7 * 86_400_000)],
    ] as const) {
      await asUser(ayden, (db) =>
        createTask(
          db,
          aydenCtx,
          parseOrThrow(taskInputSchema, { title, dueAt: dueAt.toISOString() }),
        ),
      );
    }

    const overdue = await readingAs(ayden, (db) => listTasks(db, { view: 'overdue' }));
    const upcoming = await readingAs(ayden, (db) => listTasks(db, { view: 'upcoming' }));
    assert.equal(overdue.total, 1);
    assert.equal(overdue.rows[0]?.title, 'Overdue call');
    assert.equal(upcoming.total, 2);

    const counts = await readingAs(ayden, (db) => taskCounts(db, ayden.id));
    assert.equal(counts.overdue, 1);
    assert.equal(counts.open, 3);
  });

  it('keeps one agent out of another agent\'s tasks', async () => {
    await asUser(ayden, (db) =>
      createTask(db, aydenCtx, parseOrThrow(taskInputSchema, { title: 'Ayden only' })),
    );
    assert.equal((await readingAs(ayden, (db) => listTasks(db, { view: 'all' }))).total, 1);
    assert.equal((await readingAs(johan, (db) => listTasks(db, { view: 'all' }))).total, 0);
    assert.equal((await readingAs(management, (db) => listTasks(db, { view: 'all' }))).total, 1);
  });

  it('creates the next occurrence when a recurring task is completed (spec 94)', async () => {
    const task = await asUser(ayden, (db) =>
      createTask(
        db,
        aydenCtx,
        parseOrThrow(taskInputSchema, {
          title: 'Weekly seller update',
          dueAt: '2026-09-14T09:00',
          recurrence: 'weekly',
        }),
      ),
    );
    await asUser(ayden, (db) => completeTask(db, aydenCtx, task.id));

    const open = await readingAs(ayden, (db) => listTasks(db, { view: 'all' }));
    assert.equal(open.total, 2, 'the next occurrence was created');
    const next = open.rows.find((row) => row.status === 'to_do');
    assert.equal(next?.title, 'Weekly seller update');
    assert.equal(next?.dueAt?.slice(0, 10), '2026-09-21');
  });

  it('stops repeating once the end date has passed', async () => {
    const task = await asUser(ayden, (db) =>
      createTask(
        db,
        aydenCtx,
        parseOrThrow(taskInputSchema, {
          title: 'Ends soon',
          dueAt: '2026-09-14T09:00',
          recurrence: 'weekly',
          recurrenceUntil: '2026-09-16',
        }),
      ),
    );
    await asUser(ayden, (db) => completeTask(db, aydenCtx, task.id));
    const all = await readingAs(ayden, (db) => listTasks(db, { view: 'all' }));
    assert.equal(all.total, 1);
  });

  it('refuses to record a task completed with no completion time', async () => {
    const error = await rejects(
      asUser(ayden, (db) =>
        db.query(
          `insert into tasks (assigned_user_id, title, status, created_by)
           values ($1, 'Bad', 'completed', $1)`,
          [ayden.id],
        ),
      ),
    );
    assert.match(error.message, /not allowed for this field|check constraint|violates/i);
  });

  it('sets the person\'s next follow-up when a task is created against them', async () => {
    const person = await aPerson(ayden, aydenCtx);
    await asUser(ayden, (db) =>
      createTask(
        db,
        aydenCtx,
        parseOrThrow(taskInputSchema, {
          title: 'Call back',
          personId: person.id,
          dueAt: '2026-10-01T09:00',
        }),
      ),
    );
    const row = await readingAs(ayden, (db) =>
      db.one<{ next_follow_up_at: Date | null }>(
        'select next_follow_up_at from people where id = $1',
        [person.id],
      ),
    );
    assert.ok(row.next_follow_up_at);
  });

  it('lists the records with nothing planned (spec 44)', async () => {
    const withNothing = await aPerson(ayden, aydenCtx, { firstName: 'Forgotten' });
    const withTask = await aPerson(ayden, aydenCtx, {
      firstName: 'Handled',
      contacts: [{ contactType: 'mobile', value: '083 000 1111' }],
    });
    await asUser(ayden, (db) =>
      createTask(
        db,
        aydenCtx,
        parseOrThrow(taskInputSchema, { title: 'Chase', personId: withTask.id }),
      ),
    );

    const gaps = await readingAs(ayden, (db) => listWithoutNextAction(db, { agentId: ayden.id }));
    assert.equal(gaps.people.length, 1);
    assert.equal(gaps.people[0]?.id, withNothing.id);
  });

  it('refuses to overwrite a task changed by someone else', async () => {
    const task = await asUser(ayden, (db) =>
      createTask(db, aydenCtx, parseOrThrow(taskInputSchema, { title: 'One' })),
    );
    const loaded = await readingAs(ayden, (db) => getTask(db, task.id));
    await asUser(ayden, (db) =>
      updateTask(db, aydenCtx, task.id, parseOrThrow(taskInputSchema, { title: 'Two' }), loaded!.rowVersion),
    );
    const error = await rejects(
      asUser(ayden, (db) =>
        updateTask(db, aydenCtx, task.id, parseOrThrow(taskInputSchema, { title: 'Three' }), loaded!.rowVersion),
      ),
    );
    assert.match(error.message, /updated by another user/i);
  });
});

// =====================================================================
describe('calendar (spec 45)', () => {
  it('books an appointment against a person and a property', async () => {
    const person = await aPerson(ayden, aydenCtx);
    const property = await aProperty(ayden, aydenCtx);

    await asUser(ayden, (db) =>
      createAppointment(
        db,
        aydenCtx,
        parseOrThrow(appointmentInputSchema, {
          appointmentType: 'viewing',
          title: 'Viewing at 18 Main Road',
          personId: person.id,
          propertyId: property.id,
          startsAt: '2026-09-20T14:00',
          endsAt: '2026-09-20T15:00',
          location: '18 Main Road, Wilderness',
        }),
      ),
    );

    const appointments = await readingAs(ayden, (db) => listAppointments(db, {}));
    assert.equal(appointments.length, 1);
    assert.equal(appointments[0]?.personName, 'John Smith');
    assert.equal(appointments[0]?.propertyLabel, '18 Main Road, Wilderness');
  });

  it('refuses an appointment that ends before it starts', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(appointmentInputSchema, {
          title: 'Backwards',
          startsAt: '2026-09-20T15:00',
          endsAt: '2026-09-20T14:00',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('keeps one agent out of another agent\'s diary', async () => {
    await asUser(ayden, (db) =>
      createAppointment(
        db,
        aydenCtx,
        parseOrThrow(appointmentInputSchema, { title: 'Ayden only', startsAt: '2026-09-20T14:00' }),
      ),
    );
    assert.equal((await readingAs(ayden, (db) => listAppointments(db, {}))).length, 1);
    assert.equal((await readingAs(johan, (db) => listAppointments(db, {}))).length, 0);
    assert.equal((await readingAs(management, (db) => listAppointments(db, {}))).length, 1);
  });
});

// =====================================================================
describe('viewings and feedback (spec 46)', () => {
  it('records a viewing and turns its follow-up date into a task', async () => {
    const person = await aPerson(ayden, aydenCtx);
    const property = await aProperty(ayden, aydenCtx);

    const viewing = await asUser(ayden, (db) =>
      recordViewing(db, aydenCtx, {
        propertyId: property.id,
        personId: person.id,
        leadId: null,
        appointmentId: null,
        agentId: ayden.id,
        viewedAt: null,
        notes: 'Second viewing',
      }),
    );

    await asUser(ayden, (db) =>
      saveViewingFeedback(
        db,
        aydenCtx,
        viewing.id,
        parseOrThrow(viewingFeedbackInputSchema, {
          outcome: 'offer_expected',
          interestLevel: 'very_interested',
          objections: 'Wants the garden tidied',
          nextAction: 'Send the offer to purchase',
          followUpDate: '2026-09-25',
        }),
      ),
    );

    const viewings = await readingAs(ayden, (db) => listViewings(db, { propertyId: property.id }));
    assert.equal(viewings.length, 1);
    assert.equal(viewings[0]?.feedback?.interestLevel, 'very_interested');
    assert.equal(viewings[0]?.feedback?.objections, 'Wants the garden tidied');

    const tasks = await readingAs(ayden, (db) => listTasks(db, { view: 'all' }));
    assert.equal(tasks.total, 1, 'the follow-up date became a task');
    assert.equal(tasks.rows[0]?.title, 'Send the offer to purchase');
  });

  it('hides a viewing on another agent\'s property', async () => {
    const property = await aProperty(ayden, aydenCtx);
    await asUser(ayden, (db) =>
      recordViewing(db, aydenCtx, {
        propertyId: property.id,
        personId: null,
        leadId: null,
        appointmentId: null,
        agentId: ayden.id,
        viewedAt: null,
        notes: null,
      }),
    );
    assert.equal((await readingAs(johan, (db) => listViewings(db, {}))).length, 0);
  });
});

// =====================================================================
describe('valuations (spec 47)', () => {
  it('records a valuation with its recommended asking price', async () => {
    const property = await aProperty(ayden, aydenCtx);
    const owner = await aPerson(ayden, aydenCtx, { firstName: 'Owner' });

    await asUser(ayden, (db) =>
      createValuation(
        db,
        aydenCtx,
        parseOrThrow(valuationInputSchema, {
          propertyId: property.id,
          ownerId: owner.id,
          estimatedValue: '3100000',
          recommendedAskingPrice: '2950000',
          status: 'completed',
          outcome: 'Owner wants to think about it',
          followUpDate: '2026-10-01',
        }),
      ),
    );

    const row = await readingAs(ayden, (db) =>
      db.one<{ recommended_asking_price: string; status: string }>(
        'select recommended_asking_price, status from valuations where property_id = $1',
        [property.id],
      ),
    );
    assert.equal(row.recommended_asking_price, '2950000.00');
    assert.equal(row.status, 'completed');
  });

  it('finds a valuation by its property or by its owner, for the profile pages', async () => {
    const property = await aProperty(ayden, aydenCtx);
    const owner = await aPerson(ayden, aydenCtx, { firstName: 'Olwethu' });
    await asUser(ayden, (db) =>
      createValuation(
        db,
        aydenCtx,
        parseOrThrow(valuationInputSchema, {
          propertyId: property.id,
          ownerId: owner.id,
          estimatedValue: '1850000',
        }),
      ),
    );

    const byProperty = await readingAs(ayden, (db) =>
      listValuations(db, { propertyId: property.id, status: 'all' }),
    );
    const byOwner = await readingAs(ayden, (db) =>
      listValuations(db, { ownerId: owner.id, status: 'all' }),
    );
    const someoneElse = await aPerson(ayden, aydenCtx, { firstName: 'Nobody' });
    const other = await readingAs(ayden, (db) =>
      listValuations(db, { ownerId: someoneElse.id, status: 'all' }),
    );

    assert.equal(byProperty.length, 1);
    assert.equal(byOwner.length, 1);
    assert.equal(byOwner[0]?.id, byProperty[0]?.id);
    assert.equal(other.length, 0);
  });

  it('records the outcome later without losing the earlier version', async () => {
    const property = await aProperty(ayden, aydenCtx);
    const created = await asUser(ayden, (db) =>
      createValuation(
        db,
        aydenCtx,
        parseOrThrow(valuationInputSchema, { propertyId: property.id, status: 'requested' }),
      ),
    );

    const before = await readingAs(ayden, (db) => getValuation(db, created.id));
    assert.ok(before);
    await asUser(ayden, (db) =>
      updateValuation(
        db,
        aydenCtx,
        created.id,
        parseOrThrow(valuationInputSchema, {
          propertyId: property.id,
          status: 'completed',
          estimatedValue: '2400000',
          outcome: 'Mandate signed',
        }),
        before.rowVersion,
      ),
    );

    const after = await readingAs(ayden, (db) => getValuation(db, created.id));
    assert.equal(after?.status, 'completed');
    assert.equal(after?.outcome, 'Mandate signed');

    // A second save against the stale version must be refused (spec 105).
    const refused = await rejects(
      asUser(ayden, (db) =>
        updateValuation(
          db,
          aydenCtx,
          created.id,
          parseOrThrow(valuationInputSchema, { propertyId: property.id, status: 'cancelled' }),
          before.rowVersion,
        ),
      ),
    );
    assert.match(refused.message, /updated by another user/i);
  });
});

// =====================================================================
describe('offers (spec 48)', () => {
  async function scenario() {
    const property = await aProperty(ayden, aydenCtx);
    const buyer = await aPerson(ayden, aydenCtx, { firstName: 'Bea', surname: 'Buyer' });
    const seller = await aPerson(ayden, aydenCtx, {
      firstName: 'Sam',
      surname: 'Seller',
      contacts: [{ contactType: 'mobile', value: '083 222 3333' }],
    });
    return { property, buyer, seller };
  }

  it('records an offer and moves the property to offer received', async () => {
    const { property, buyer, seller } = await scenario();
    await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          amount: '2800000',
          status: 'submitted',
          financeStatus: 'bond_applied',
          deposit: '280000',
        }),
      ),
    );

    const offers = await readingAs(ayden, (db) => listOffers(db, { propertyId: property.id }));
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.amount, '2800000.00');

    const loaded = await readingAs(ayden, (db) => getProperty(db, property.id));
    assert.equal(loaded?.salesStatus, 'offer_received');
  });

  it('keeps a counter offer as a new record pointing at the original', async () => {
    const { property, buyer, seller } = await scenario();
    const first = await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          amount: '2700000',
          status: 'submitted',
        }),
      ),
    );
    const counter = await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          amount: '2875000',
          status: 'counter_offer',
          counterOfferOf: first.id,
        }),
      ),
    );

    const offers = await readingAs(ayden, (db) => listOffers(db, { propertyId: property.id }));
    assert.equal(offers.length, 2, 'the original offer was not overwritten');
    const loadedCounter = await readingAs(ayden, (db) => getOffer(db, counter.id));
    assert.equal(loadedCounter?.counterOfferOf, first.id);
    const loadedFirst = await readingAs(ayden, (db) => getOffer(db, first.id));
    assert.equal(loadedFirst?.amount, '2700000.00', 'the first offer kept its own amount');
  });

  it('refuses a counter offer that does not say what it answers', async () => {
    const { property } = await scenario();
    const error = await rejects(
      asUser(ayden, (db) =>
        createOffer(
          db,
          aydenCtx,
          parseOrThrow(offerInputSchema, {
            propertyId: property.id,
            amount: '1',
            status: 'counter_offer',
          }),
        ),
      ),
    );
    assert.match(error.message, /counter offer answers/i);
  });

  it('stamps the acceptance date when an offer is accepted', async () => {
    const { property, buyer } = await scenario();
    const offer = await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          amount: '2800000',
          status: 'submitted',
        }),
      ),
    );
    await asUser(ayden, (db) =>
      setOfferStatus(db, aydenCtx, offer.id, {
        status: 'accepted',
        date: '2026-09-20',
        notes: null,
      }),
    );
    const loaded = await readingAs(ayden, (db) => getOffer(db, offer.id));
    assert.equal(loaded?.status, 'accepted');
    assert.equal(loaded?.acceptanceDate, '2026-09-20');
  });

  it('refuses an accepted offer with no acceptance date at database level', async () => {
    const { property } = await scenario();
    const error = await rejects(
      asUser(ayden, (db) =>
        db.query(
          `insert into offers (property_id, amount, status, created_by)
           values ($1, 1000, 'accepted', $2)`,
          [property.id, ayden.id],
        ),
      ),
    );
    assert.match(error.message, /not allowed for this field|check constraint|violates/i);
  });

  it('hides offers on another agent\'s property', async () => {
    const { property, buyer } = await scenario();
    await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          amount: '2800000',
          status: 'submitted',
        }),
      ),
    );
    assert.equal((await readingAs(johan, (db) => listOffers(db, {}))).length, 0);
    assert.equal((await readingAs(management, (db) => listOffers(db, {}))).length, 1);
  });
});

// =====================================================================
describe('transactions: concluded is not registered (spec 49)', () => {
  async function aTransaction(status = 'sale_pending', extra: Record<string, unknown> = {}) {
    const property = await aProperty(management, managementCtx);
    const buyer = await aPerson(management, managementCtx, { firstName: 'Bea', surname: 'Buyer' });
    const seller = await aPerson(management, managementCtx, {
      firstName: 'Sam',
      surname: 'Seller',
      contacts: [{ contactType: 'mobile', value: '083 222 3333' }],
    });
    const transaction = await asUser(management, (db) =>
      createTransaction(
        db,
        managementCtx,
        parseOrThrow(transactionInputSchema, {
          propertyId: property.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          transactionValue: '2800000',
          saleDate: '2026-05-01',
          expectedRegistrationDate: '2026-08-15',
          status,
          ...extra,
        }),
      ),
    );
    return { property, buyer, seller, transaction };
  }

  it('refuses to call a transaction registered without a registration date', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(transactionInputSchema, {
          propertyId: '00000000-0000-0000-0000-000000000001',
          status: 'registered',
          saleDate: '2026-05-01',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('refuses it at database level too, not only in the form', async () => {
    const property = await aProperty(management, managementCtx);
    const error = await rejects(
      asUser(management, (db) =>
        db.query(
          `insert into transactions (property_id, status, created_by)
           values ($1, 'registered', $2)`,
          [property.id, management.id],
        ),
      ),
    );
    assert.match(error.message, /not allowed for this field|check constraint|violates/i);
  });

  it('keeps a concluded sale unregistered until it is registered', async () => {
    const { transaction } = await aTransaction('sale_concluded');

    let loaded = await readingAs(management, (db) => getTransaction(db, transaction.id));
    assert.equal(loaded?.status, 'sale_concluded');
    assert.equal(loaded?.actualRegistrationDate, null);
    assert.equal(loaded?.awaitingRegistration, true, 'concluded is not registered');

    await asUser(management, (db) =>
      registerTransaction(db, managementCtx, transaction.id, {
        registrationDate: '2026-08-20',
        notes: null,
      }),
    );

    loaded = await readingAs(management, (db) => getTransaction(db, transaction.id));
    assert.equal(loaded?.status, 'registered');
    assert.equal(loaded?.actualRegistrationDate, '2026-08-20');
    assert.equal(loaded?.awaitingRegistration, false);
  });

  it('lists the deals that are concluded but not yet registered', async () => {
    await aTransaction('sale_concluded');
    const { transaction } = await aTransaction('sale_concluded');
    await asUser(management, (db) =>
      registerTransaction(db, managementCtx, transaction.id, {
        registrationDate: '2026-08-20',
        notes: null,
      }),
    );

    const awaiting = await readingAs(management, (db) =>
      listTransactions(db, { awaitingRegistration: true }),
    );
    assert.equal(awaiting.length, 1);
  });

  it('refuses a registration date before the sale date', async () => {
    const { transaction } = await aTransaction('sale_concluded');
    const error = await rejects(
      asUser(management, (db) =>
        registerTransaction(db, managementCtx, transaction.id, {
          registrationDate: '2026-04-01',
          notes: null,
        }),
      ),
    );
    assert.match(error.message, /before the sale date/i);
  });

  it('refuses to register a cancelled transaction', async () => {
    const { transaction } = await aTransaction('cancelled', {
      cancellationReason: 'Bond declined',
    });
    const error = await rejects(
      asUser(management, (db) =>
        registerTransaction(db, managementCtx, transaction.id, {
          registrationDate: '2026-08-20',
          notes: null,
        }),
      ),
    );
    assert.match(error.message, /cancelled transaction cannot be registered/i);
  });

  it('refuses a cancelled transaction with no reason', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(transactionInputSchema, {
          propertyId: '00000000-0000-0000-0000-000000000001',
          status: 'cancelled',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('moves the property statuses in step, each in its own history', async () => {
    const { property, transaction } = await aTransaction('sale_concluded');

    let loaded = await readingAs(management, (db) => getProperty(db, property.id));
    assert.equal(loaded?.propertyStatus, 'sale_concluded');
    assert.equal(loaded?.salesStatus, 'sale_concluded');
    assert.equal(loaded?.saleOutcome, 'sold_by_us');

    await asUser(management, (db) =>
      registerTransaction(db, managementCtx, transaction.id, {
        registrationDate: '2026-08-20',
        notes: null,
      }),
    );

    loaded = await readingAs(management, (db) => getProperty(db, property.id));
    assert.equal(loaded?.propertyStatus, 'sale_registered');
    assert.equal(loaded?.salesStatus, 'sale_registered');

    const history = await readingAs(management, (db) => getPropertyHistory(db, property.id));
    const registered = history.statuses.filter((entry) => entry.newValue === 'sale_registered');
    assert.equal(registered.length, 2, 'property status and sales status each recorded the move');
    assert.ok(registered.every((entry) => /transaction is now registered/i.test(entry.reason ?? '')));
  });

  it('keeps a status history for the transaction itself', async () => {
    const { transaction } = await aTransaction('sale_pending');
    const loaded = await readingAs(management, (db) => getTransaction(db, transaction.id));
    await asUser(management, (db) =>
      updateTransaction(
        db,
        managementCtx,
        transaction.id,
        parseOrThrow(transactionInputSchema, {
          propertyId: loaded!.propertyId,
          transactionValue: '2800000',
          saleDate: '2026-05-01',
          status: 'sale_concluded',
          statusChangeReason: 'All suspensive conditions met',
        }),
        loaded!.rowVersion,
      ),
    );
    const history = await readingAs(management, (db) => getTransactionHistory(db, transaction.id));
    assert.equal(history.length, 2);
    assert.equal(history[0]?.newStatus, 'sale_concluded');
    assert.equal(history[0]?.reason, 'All suspensive conditions met');
  });

  it('gives each transaction a permanent reference', async () => {
    const { transaction } = await aTransaction();
    assert.match(transaction.transactionRef, /^GRLP-T-\d{8}$/);
  });

  it('refuses shares on a deal that add up to more than the whole', async () => {
    const { transaction } = await aTransaction();
    const error = await rejects(
      asUser(management, (db) =>
        setTransactionAgents(db, managementCtx, transaction.id, [
          { agentId: ayden.id, role: 'primary', sharePercent: '60' },
          { agentId: johan.id, role: 'sharing', sharePercent: '60' },
        ]),
      ),
    );
    assert.match(error.message, /add up to 120/i);
  });

  it('lets a sharing agent see the deal they are on', async () => {
    const { transaction } = await aTransaction();
    await asUser(management, (db) =>
      setTransactionAgents(db, managementCtx, transaction.id, [
        { agentId: johan.id, role: 'sharing', sharePercent: '50' },
      ]),
    );
    assert.ok(await readingAs(johan, (db) => getTransaction(db, transaction.id)));
    assert.equal(await readingAs(ayden, (db) => getTransaction(db, transaction.id)), null);
  });
});

// =====================================================================
describe('rental applications and screening (spec 50, 51, 52)', () => {
  async function anApplication(overrides: Record<string, unknown> = {}) {
    const property = await aProperty(management, managementCtx, {
      businessArea: 'rentals',
      rentalStatus: 'available',
      monthlyRental: '14500',
    });
    const applicant = await aPerson(management, managementCtx, {
      firstName: 'Thandi',
      surname: 'Tenant',
      clientTypes: ['tenant'],
    });
    const landlord = await aPerson(management, managementCtx, {
      firstName: 'Len',
      surname: 'Landlord',
      clientTypes: ['landlord'],
      contacts: [{ contactType: 'mobile', value: '083 444 5555' }],
    });
    const application = await asUser(management, (db) =>
      createRentalApplication(
        db,
        managementCtx,
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: property.id,
          applicantId: applicant.id,
          landlordId: landlord.id,
          monthlyRental: '14500',
          deposit: '29000',
          applicationStatus: 'submitted',
          ...overrides,
        }),
      ),
    );
    return { property, applicant, landlord, application };
  }

  it('gives the application a reference and starts the whole checklist', async () => {
    const { application } = await anApplication();
    assert.match(application.applicationRef, /^GRLP-R-\d{8}$/);

    const screening = await readingAs(management, (db) => listScreening(db, application.id));
    assert.equal(screening.length, 7, 'every configured check appears, not an empty list');
    assert.ok(screening.every((item) => item.status === 'not_started'));
  });

  it('moves the property to application pending', async () => {
    const { property } = await anApplication();
    const loaded = await readingAs(management, (db) => getProperty(db, property.id));
    assert.equal(loaded?.rentalStatus, 'application_pending');
  });

  it('tracks the screening and updates the overall status', async () => {
    const { application } = await anApplication();
    const screening = await readingAs(management, (db) => listScreening(db, application.id));

    await asUser(management, (db) =>
      setScreeningItem(db, managementCtx, application.id, {
        itemId: screening[0]!.itemId,
        status: 'verified',
        notes: 'ID seen',
      }),
    );
    let loaded = await readingAs(management, (db) => getRentalApplication(db, application.id));
    assert.equal(loaded?.screeningStatus, 'in_progress');

    for (const item of screening.filter((row) => row.isRequired)) {
      await asUser(management, (db) =>
        setScreeningItem(db, managementCtx, application.id, {
          itemId: item.itemId,
          status: 'verified',
          notes: null,
        }),
      );
    }
    loaded = await readingAs(management, (db) => getRentalApplication(db, application.id));
    assert.equal(loaded?.screeningStatus, 'complete');
  });

  it('marks screening as failed when a check fails', async () => {
    const { application } = await anApplication();
    const screening = await readingAs(management, (db) => listScreening(db, application.id));
    await asUser(management, (db) =>
      setScreeningItem(db, managementCtx, application.id, {
        itemId: screening[0]!.itemId,
        status: 'failed',
        notes: 'References did not check out',
      }),
    );
    const loaded = await readingAs(management, (db) => getRentalApplication(db, application.id));
    assert.equal(loaded?.screeningStatus, 'failed');
  });

  it('refuses a rejected application with no reason', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: '00000000-0000-0000-0000-000000000001',
          applicationStatus: 'rejected',
          rejectionDate: '2026-09-20',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('records the lease in the property rental history once it is signed', async () => {
    const { property, application } = await anApplication();
    const loaded = await readingAs(management, (db) => getRentalApplication(db, application.id));

    await asUser(management, (db) =>
      updateRentalApplication(
        db,
        managementCtx,
        application.id,
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: property.id,
          applicantId: loaded!.applicantId,
          landlordId: loaded!.landlordId,
          monthlyRental: '14500',
          deposit: '29000',
          applicationStatus: 'lease_signed',
          approvalDate: '2026-09-20',
          leaseStart: '2026-10-01',
          leaseEnd: '2027-09-30',
        }),
        loaded!.rowVersion,
      ),
    );

    const history = await readingAs(management, (db) =>
      db.query<{ monthly_rental: string; lease_start: Date }>(
        'select monthly_rental, lease_start from property_rental_history where property_id = $1',
        [property.id],
      ),
    );
    assert.equal(history.length, 1);
    assert.equal(history[0]?.monthly_rental, '14500.00');

    const refreshed = await readingAs(management, (db) => getProperty(db, property.id));
    assert.equal(refreshed?.rentalStatus, 'lease_active');
  });

  it('refuses a co-applicant who is the same person as the applicant', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: '00000000-0000-0000-0000-000000000001',
          applicantId: '00000000-0000-0000-0000-000000000002',
          coApplicantId: '00000000-0000-0000-0000-000000000002',
        }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('hides rental applications from an agent without rental access to them', async () => {
    await anApplication();
    assert.equal((await readingAs(ayden, (db) => listRentalApplications(db, {}))).length, 0);
    assert.equal((await readingAs(management, (db) => listRentalApplications(db, {}))).length, 1);
  });

  it('finds leases that are about to expire', async () => {
    const { property, application } = await anApplication();
    const loaded = await readingAs(management, (db) => getRentalApplication(db, application.id));
    await asUser(management, (db) =>
      updateRentalApplication(
        db,
        managementCtx,
        application.id,
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: property.id,
          applicantId: loaded!.applicantId,
          applicationStatus: 'lease_signed',
          leaseStart: '2025-10-01',
          leaseEnd: '2026-09-30',
        }),
        loaded!.rowVersion,
      ),
    );
    await asOwner((db) =>
      db.query("update rental_applications set lease_end = current_date + 20"),
    );
    const expiring = await readingAs(management, (db) =>
      listRentalApplications(db, { expiringLease: true }),
    );
    assert.equal(expiring.length, 1);
  });
});


// =====================================================================
// An agent who saves a record must not lose sight of it. Row level security
// confines them to their own records, so a form that leaves the agent field
// on "Me" must not clear it (spec 9, spec 105).
describe('an edit never hides a record from the agent who made it', () => {
  it('keeps the agent on a valuation, an offer, an appointment and a rental application', async () => {
    const property = await aProperty(ayden, aydenCtx);
    const person = await aPerson(ayden, aydenCtx, { firstName: 'Thandi' });

    // Valuation.
    const valuation = await asUser(ayden, (db) =>
      createValuation(
        db,
        aydenCtx,
        parseOrThrow(valuationInputSchema, { propertyId: property.id, status: 'requested' }),
      ),
    );
    const valuationBefore = await readingAs(ayden, (db) => getValuation(db, valuation.id));
    await asUser(ayden, (db) =>
      updateValuation(
        db,
        aydenCtx,
        valuation.id,
        // agentId left empty, exactly as the form submits it when "Me" is chosen.
        parseOrThrow(valuationInputSchema, { propertyId: property.id, status: 'completed' }),
        valuationBefore!.rowVersion,
      ),
    );
    assert.equal(
      (await readingAs(ayden, (db) => getValuation(db, valuation.id)))?.agentId,
      ayden.id,
    );

    // Offer.
    const offer = await asUser(ayden, (db) =>
      createOffer(
        db,
        aydenCtx,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: person.id,
          amount: '2000000',
        }),
      ),
    );
    const offerBefore = await readingAs(ayden, (db) => getOffer(db, offer.id));
    await asUser(ayden, (db) =>
      updateOffer(
        db,
        aydenCtx,
        offer.id,
        parseOrThrow(offerInputSchema, {
          propertyId: property.id,
          buyerId: person.id,
          amount: '2100000',
        }),
        offerBefore!.rowVersion,
      ),
    );
    assert.equal((await readingAs(ayden, (db) => getOffer(db, offer.id)))?.agentId, ayden.id);

    // Appointment.
    const appointment = await asUser(ayden, (db) =>
      createAppointment(
        db,
        aydenCtx,
        parseOrThrow(appointmentInputSchema, {
          title: 'Show the house',
          appointmentType: 'viewing',
          startsAt: '2026-11-02T09:00',
        }),
      ),
    );
    const appointmentBefore = await readingAs(ayden, (db) => getAppointment(db, appointment.id));
    await asUser(ayden, (db) =>
      updateAppointment(
        db,
        aydenCtx,
        appointment.id,
        parseOrThrow(appointmentInputSchema, {
          title: 'Show the house again',
          appointmentType: 'viewing',
          startsAt: '2026-11-03T09:00',
        }),
        appointmentBefore!.rowVersion,
      ),
    );
    assert.equal(
      (await readingAs(ayden, (db) => getAppointment(db, appointment.id)))?.agentId,
      ayden.id,
    );

    // Rental application.
    const application = await asUser(ayden, (db) =>
      createRentalApplication(
        db,
        aydenCtx,
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: property.id,
          applicantId: person.id,
          monthlyRental: '14500',
        }),
      ),
    );
    const applicationBefore = await readingAs(ayden, (db) =>
      getRentalApplication(db, application.id),
    );
    await asUser(ayden, (db) =>
      updateRentalApplication(
        db,
        aydenCtx,
        application.id,
        parseOrThrow(rentalApplicationInputSchema, {
          propertyId: property.id,
          applicantId: person.id,
          monthlyRental: '15000',
        }),
        applicationBefore!.rowVersion,
      ),
    );
    assert.equal(
      (await readingAs(ayden, (db) => getRentalApplication(db, application.id)))?.agentId,
      ayden.id,
    );
  });

  it('still lets management leave a record unassigned', async () => {
    const property = await aProperty(management, managementCtx);
    const valuation = await asUser(management, (db) =>
      createValuation(
        db,
        managementCtx,
        parseOrThrow(valuationInputSchema, { propertyId: property.id, agentId: ayden.id }),
      ),
    );
    const before = await readingAs(management, (db) => getValuation(db, valuation.id));
    await asUser(management, (db) =>
      updateValuation(
        db,
        managementCtx,
        valuation.id,
        parseOrThrow(valuationInputSchema, { propertyId: property.id }),
        before!.rowVersion,
      ),
    );
    assert.equal(
      (await readingAs(management, (db) => getValuation(db, valuation.id)))?.agentId,
      null,
    );
  });
});
