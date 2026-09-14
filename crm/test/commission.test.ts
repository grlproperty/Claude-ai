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
import { createProperty } from '../src/lib/properties/mutations.ts';
import { propertyInputSchema } from '../src/lib/properties/types.ts';
import {
  createTransaction,
  registerTransaction,
  setTransactionAgents,
  transactionInputSchema,
} from '../src/lib/sales.ts';
import {
  COMMISSION_STATUSES,
  mayMoveTo,
} from '../src/lib/commission/types.ts';
import {
  archiveRule,
  createRule,
  defaultRuleFor,
  getRule,
  listRules,
  ruleInputSchema,
  updateRule,
} from '../src/lib/commission/rules.ts';
import {
  commissionFor,
  commissionHistory,
  commissionInputSchema,
  getCommission,
  listCommissions,
  listDeductions,
  listSplits,
} from '../src/lib/commission/records.ts';
import { createCommission, dealBasis } from '../src/lib/commission/create.ts';
import {
  addDeduction,
  deductionInputSchema,
  removeDeduction,
  removeSplit,
  setSplit,
  splitInputSchema,
  updateCommission,
} from '../src/lib/commission/edit.ts';
import {
  approveCommission,
  cancelCommission,
  invoiceCommission,
  markCommissionPaid,
  rejectCommission,
  submitCommission,
} from '../src/lib/commission/workflow.ts';
import {
  commissionSummary,
  earningsByAgent,
  statementFor,
} from '../src/lib/commission/reports.ts';
import { setSetting } from '../src/lib/settings.ts';
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
  management = await createTestUser({ role: 'MANAGEMENT', fullName: 'Ayden Grobler' });
  accounts = await createTestUser({ role: 'ACCOUNTS', fullName: 'Thandi Bookkeeper' });
  agent = await createTestUser({ role: 'AGENT', fullName: 'Nadia Agent' });
  otherAgent = await createTestUser({ role: 'AGENT', fullName: 'Pieter Agent' });
  managementCtx = await ctxFor(management);
  accountsCtx = await ctxFor(accounts);
  agentCtx = await ctxFor(agent);
});

after(shutdown);

async function aProperty(overrides: Record<string, unknown> = {}) {
  return asUser(management, (db) =>
    createProperty(
      db,
      managementCtx,
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
        primaryAgentId: agent.id,
        ...overrides,
      }),
    ),
  );
}

/** A concluded sale, deliberately NOT registered (spec 49). */
async function aConcludedSale(value = '2950000') {
  const property = await aProperty();
  const transaction = await asUser(management, (db) =>
    createTransaction(
      db,
      managementCtx,
      parseOrThrow(transactionInputSchema, {
        propertyId: property.id,
        transactionValue: value,
        saleDate: '2026-05-01',
        expectedRegistrationDate: '2026-08-15',
        status: 'sale_concluded',
      }),
    ),
  );
  await asUser(management, (db) =>
    setTransactionAgents(db, managementCtx, transaction.id, [
      { agentId: agent.id, role: 'primary', sharePercent: null },
    ]),
  );
  return { property, transaction };
}

async function register(transactionId: string) {
  await asUser(management, (db) =>
    registerTransaction(db, managementCtx, transactionId, {
      registrationDate: '2026-08-20',
      notes: null,
    }),
  );
}

async function aCommission(transactionId: string, overrides: Record<string, unknown> = {}) {
  // The base amount comes from the deal, exactly as the form does, so a
  // test never quietly works a commission out from the wrong price.
  const basis = await readingAs(management, (db) => dealBasis(db, { transactionId }));
  assert.ok(basis, 'the deal should be readable');

  return asUser(management, (db) =>
    createCommission(
      db,
      managementCtx,
      parseOrThrow(commissionInputSchema, {
        transactionId,
        basis: 'percent_of_value',
        ratePercent: '5',
        baseAmount: basis.baseAmount,
        vatApplicable: true,
        ...overrides,
      }),
    ),
  );
}

/** Walks a commission to approved, which every later step needs. */
async function approved(transactionId: string) {
  const created = await aCommission(transactionId);

  const draft = await current(created.id);
  await asUser(management, (db) =>
    submitCommission(db, managementCtx, created.id, draft.rowVersion),
  );

  const submitted = await current(created.id);
  await asUser(management, (db) =>
    approveCommission(
      db,
      managementCtx,
      created.id,
      submitted.rowVersion,
      'Checked against the mandate.',
    ),
  );
  return created;
}

async function current(id: string) {
  const record = await readingAs(management, (db) => getCommission(db, id));
  assert.ok(record, 'the commission should be readable');
  return record;
}

// =====================================================================
describe("the office's rules (spec 61, 103, 104)", () => {
  it('ships a default sale rule and a default letting rule', async () => {
    const rules = await readingAs(management, (db) => listRules(db));
    const sale = rules.find((rule) => rule.appliesTo === 'sale' && rule.isDefault);
    const rental = rules.find((rule) => rule.appliesTo === 'rental' && rule.isDefault);

    assert.ok(sale, 'a default sale rule should be seeded');
    assert.equal(sale.basis, 'percent_of_value');
    assert.ok(rental, 'a default letting rule should be seeded');
    assert.equal(rental.basis, 'months_of_rent');
  });

  it('refuses a letting rule worked out from a selling price', async () => {
    assert.throws(() =>
      parseOrThrow(ruleInputSchema, {
        name: 'Wrong',
        appliesTo: 'rental',
        basis: 'percent_of_value',
        ratePercent: '5',
      }),
    );
  });

  it('refuses a sale rule worked out from months of rent', async () => {
    assert.throws(() =>
      parseOrThrow(ruleInputSchema, {
        name: 'Wrong',
        appliesTo: 'sale',
        basis: 'months_of_rent',
        months: '1',
      }),
    );
  });

  it('refuses a commission larger than the whole price', async () => {
    assert.throws(() =>
      parseOrThrow(ruleInputSchema, {
        name: 'Absurd',
        appliesTo: 'sale',
        basis: 'percent_of_value',
        ratePercent: '150',
      }),
    );
  });

  it('keeps only one default per part of the business', async () => {
    const created = await asUser(management, (db) =>
      createRule(
        db,
        managementCtx,
        parseOrThrow(ruleInputSchema, {
          name: 'Coastal sale rate',
          appliesTo: 'sale',
          basis: 'percent_of_value',
          ratePercent: '6',
          isDefault: true,
        }),
      ),
    );
    const rules = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    const defaults = rules.filter((rule) => rule.isDefault);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0]?.id, created.id);
  });

  it('archives a rule with a reason rather than deleting it', async () => {
    const rules = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    const rule = rules[0];
    assert.ok(rule);

    await asUser(management, (db) =>
      archiveRule(db, managementCtx, rule.id, 'Superseded by the 2027 rate card.'),
    );

    const live = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    assert.equal(live.find((entry) => entry.id === rule.id), undefined);

    const withArchived = await readingAs(management, (db) =>
      listRules(db, { appliesTo: 'sale', includeArchived: true }),
    );
    const archived = withArchived.find((entry) => entry.id === rule.id);
    assert.ok(archived, 'the rule is still readable after being archived');
    assert.equal(archived.isArchived, true);
    assert.equal(archived.archiveReason, 'Superseded by the 2027 rate card.');
  });

  it('refuses to archive without a reason', async () => {
    const rules = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    const rule = rules[0];
    assert.ok(rule);
    await rejects(asUser(management, (db) => archiveRule(db, managementCtx, rule.id, '   ')));
  });

  it('will not let an agent write a rule, even though they can read one', async () => {
    const rules = await readingAs(agent, (db) => listRules(db));
    assert.ok(rules.length > 0, 'an agent can read the office terms');

    await rejects(
      asUser(agent, (db) =>
        createRule(
          db,
          agentCtx,
          parseOrThrow(ruleInputSchema, {
            name: 'My own rate',
            appliesTo: 'sale',
            basis: 'percent_of_value',
            ratePercent: '9',
          }),
        ),
      ),
    );
  });

  it('prefers the rule written for the part of the business', async () => {
    await asUser(management, (db) =>
      createRule(
        db,
        managementCtx,
        parseOrThrow(ruleInputSchema, {
          name: 'Rentals-side sale rate',
          appliesTo: 'sale',
          businessArea: 'rentals',
          basis: 'percent_of_value',
          ratePercent: '3',
        }),
      ),
    );
    const chosen = await readingAs(management, (db) => defaultRuleFor(db, 'sale', 'rentals'));
    assert.equal(chosen?.name, 'Rentals-side sale rate');

    const general = await readingAs(management, (db) => defaultRuleFor(db, 'sale', 'sales'));
    assert.equal(general?.name, 'Standard sale commission');
  });

  it('bumps the version so two people cannot overwrite each other', async () => {
    const rules = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    const rule = rules[0];
    assert.ok(rule);

    await asUser(management, (db) =>
      updateRule(
        db,
        managementCtx,
        rule.id,
        parseOrThrow(ruleInputSchema, {
          name: rule.name,
          appliesTo: 'sale',
          basis: 'percent_of_value',
          ratePercent: '5.5',
        }),
        rule.rowVersion,
      ),
    );

    const stale = rejects(
      asUser(management, (db) =>
        updateRule(
          db,
          managementCtx,
          rule.id,
          parseOrThrow(ruleInputSchema, {
            name: rule.name,
            appliesTo: 'sale',
            basis: 'percent_of_value',
            ratePercent: '7',
          }),
          rule.rowVersion,
        ),
      ),
    );
    assert.match((await stale).message, /updated by another user/i);

    const after = await readingAs(management, (db) => getRule(db, rule.id));
    assert.equal(after?.ratePercent, '5.5000');
  });
});

// =====================================================================
describe('opening a commission on a deal (spec 62, 78)', () => {
  it('reads the deal rather than asking for the price again', async () => {
    const { property, transaction } = await aConcludedSale();
    const basis = await readingAs(management, (db) =>
      dealBasis(db, { transactionId: transaction.id }),
    );

    assert.ok(basis);
    assert.equal(basis.kind, 'sale');
    assert.equal(basis.propertyId, property.id);
    assert.equal(basis.baseAmount, '2950000.00');
    // Concluded is not registered, and the basis says so plainly (spec 49).
    assert.equal(basis.isRegistered, false);
    assert.equal(basis.agents.length, 1);
    assert.equal(basis.agents[0]?.agentName, 'Nadia Agent');
  });

  it('works the commission out and gives it a reference', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    assert.match(created.commissionRef, /^GRLP-M-\d{6}$/);

    const record = await current(created.id);
    assert.equal(record.status, 'draft');
    assert.equal(record.baseAmount, '2950000.00');
    assert.equal(record.calculatedExclVat, '147500.00');
    assert.equal(record.grossExclVat, '147500.00');
    assert.equal(record.vatAmount, '22125.00');
    assert.equal(record.grossInclVat, '169625.00');
    assert.equal(record.netExclVat, '147500.00');
    assert.equal(record.isOverridden, false);
  });

  it('carries the agents already on the deal across, with the office share', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const splits = await readingAs(management, (db) => listSplits(db, created.id));

    const agentSplit = splits.find((split) => split.agentId === agent.id);
    const office = splits.find((split) => split.role === 'office');

    assert.ok(agentSplit, 'the agent on the deal has a share without being re-typed');
    assert.ok(office, 'the office keeps a share of its own');
    assert.equal(Number(agentSplit.sharePercent), 50);
    assert.equal(Number(office.sharePercent), 50);
    assert.equal(agentSplit.amount, '73750.00');
    assert.equal(office.amount, '73750.00');

    // Nothing lost to rounding: the shares add back up to what was shared.
    const total = splits.reduce((sum, split) => Number(split.amount) + sum, 0);
    assert.equal(total.toFixed(2), '147500.00');
  });

  it('refuses a second commission on the same deal', async () => {
    const { transaction } = await aConcludedSale();
    await aCommission(transaction.id);
    const error = await rejects(aCommission(transaction.id));
    assert.match(error.message, /already/i);
  });

  it('refuses a commission that belongs to no deal, or to two', async () => {
    assert.throws(() =>
      parseOrThrow(commissionInputSchema, {
        basis: 'percent_of_value',
        ratePercent: '5',
        baseAmount: '1000000',
      }),
    );
  });

  it('records opening it in a history nobody can alter', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const history = await readingAs(management, (db) => commissionHistory(db, created.id));
    assert.equal(history.length, 1);
    assert.equal(history[0]?.event, 'opened');
    assert.equal(history[0]?.changedByName, 'Ayden Grobler');

    const blocked = await rejects(
      asOwner((db) =>
        db.query('update commission_history set reason = $1 where commission_id = $2', [
          'tampered',
          created.id,
        ]),
      ),
    );
    assert.match(blocked.message, /append|cannot be changed|only be added/i);
  });

  it('has no column anywhere that could claim a payment was confirmed', async () => {
    const columns = await asOwner((db) =>
      db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'commissions'`,
      ),
    );
    const names = columns.map((column) => column.column_name);

    // Nothing here can be fed by an integration that does not exist.
    for (const forbidden of [
      'payment_confirmed',
      'bank_reference',
      'auto_approved',
      'payment_status',
      'gateway_response',
      'verified_by_bank',
    ]) {
      assert.equal(names.includes(forbidden), false, `${forbidden} must not exist`);
    }
    // And the columns that do exist name a person for each claim.
    for (const required of ['approved_by', 'marked_paid_by', 'submitted_by']) {
      assert.ok(names.includes(required), `${required} should exist`);
    }
  });
});

// =====================================================================
describe('sharing it out (spec 78)', () => {
  it('refuses shares adding up to more than the whole, at the database', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const error = await rejects(
      asUser(management, (db) =>
        setSplit(
          db,
          managementCtx,
          created.id,
          parseOrThrow(splitInputSchema, {
            agentId: otherAgent.id,
            role: 'sharing',
            sharePercent: '60',
          }),
        ),
      ),
    );
    assert.match(error.message, /more than the whole|not allowed/i);
  });

  it('shares a deal between two agents and the office, to the cent', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    // Make room, then give the second agent a share.
    await asUser(management, (db) =>
      setSplit(
        db,
        managementCtx,
        created.id,
        parseOrThrow(splitInputSchema, { agentId: agent.id, role: 'primary', sharePercent: '25' }),
      ),
    );
    await asUser(management, (db) =>
      setSplit(
        db,
        managementCtx,
        created.id,
        parseOrThrow(splitInputSchema, {
          agentId: otherAgent.id,
          role: 'sharing',
          sharePercent: '25',
        }),
      ),
    );

    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    const total = splits.reduce((sum, split) => Number(split.amount) + sum, 0);
    assert.equal(total.toFixed(2), '147500.00');
    assert.equal(splits.find((split) => split.agentId === agent.id)?.amount, '36875.00');
    assert.equal(splits.find((split) => split.agentId === otherAgent.id)?.amount, '36875.00');
  });

  it('records a referral to somebody who does not use the CRM', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    await asUser(management, (db) =>
      setSplit(
        db,
        managementCtx,
        created.id,
        parseOrThrow(splitInputSchema, { agentId: agent.id, role: 'primary', sharePercent: '40' }),
      ),
    );
    await asUser(management, (db) =>
      setSplit(
        db,
        managementCtx,
        created.id,
        parseOrThrow(splitInputSchema, {
          partyName: 'Knysna Referral Partner',
          role: 'referral',
          sharePercent: '10',
        }),
      ),
    );

    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    const referral = splits.find((split) => split.role === 'referral');
    assert.ok(referral);
    assert.equal(referral.partyName, 'Knysna Referral Partner');
    assert.equal(referral.agentId, null);
    assert.equal(referral.amount, '14750.00');
  });

  it("refuses to give the office's own share to an agent", async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const error = await rejects(
      asUser(management, (db) =>
        setSplit(
          db,
          managementCtx,
          created.id,
          parseOrThrow(splitInputSchema, {
            agentId: agent.id,
            role: 'office',
            sharePercent: '10',
          }),
        ),
      ),
    );
    assert.match(error.message, /not an agent's share/i);
  });

  it('keeps a removed share in the history even after it is gone', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    const agentSplit = splits.find((split) => split.agentId === agent.id);
    assert.ok(agentSplit);

    await asUser(management, (db) =>
      removeSplit(db, managementCtx, created.id, agentSplit.id),
    );

    const after = await readingAs(management, (db) => listSplits(db, created.id));
    assert.equal(after.find((split) => split.agentId === agent.id), undefined);

    const history = await readingAs(management, (db) => commissionHistory(db, created.id));
    assert.ok(
      history.some((entry) => entry.event === 'split_changed' && entry.detail?.['removed']),
      'the removal is on the record (spec 104)',
    );
  });
});

// =====================================================================
describe('overrides and deductions (spec 63, 115)', () => {
  it('keeps what the rule works out beside what was claimed', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const record = await current(created.id);

    await asUser(management, (db) =>
      updateCommission(
        db,
        managementCtx,
        created.id,
        parseOrThrow(commissionInputSchema, {
          transactionId: transaction.id,
          basis: 'percent_of_value',
          ratePercent: '5',
          baseAmount: '2950000',
          vatApplicable: true,
          overrideExclVat: '130000',
          overrideReason: 'Reduced by agreement to close the gap on the offer.',
        }),
        record.rowVersion,
      ),
    );

    const after = await current(created.id);
    assert.equal(after.calculatedExclVat, '147500.00', 'the rule figure is not erased');
    assert.equal(after.grossExclVat, '130000.00');
    assert.equal(after.isOverridden, true);
    assert.match(after.overrideReason ?? '', /by agreement/i);

    const history = await readingAs(management, (db) => commissionHistory(db, created.id));
    assert.ok(history.some((entry) => entry.event === 'overridden'));
  });

  it('refuses an override with no reason', async () => {
    assert.throws(() =>
      parseOrThrow(commissionInputSchema, {
        transactionId: '11111111-1111-4111-8111-111111111111',
        basis: 'percent_of_value',
        ratePercent: '5',
        baseAmount: '2950000',
        overrideExclVat: '1',
      }),
    );
  });

  it('takes a deduction off what is shared out, and re-shares it', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    await asUser(management, (db) =>
      addDeduction(
        db,
        managementCtx,
        created.id,
        parseOrThrow(deductionInputSchema, {
          label: 'Referral fee to Knysna partner',
          amount: '14750',
        }),
      ),
    );

    const after = await current(created.id);
    assert.equal(after.deductionsTotal, '14750.00');
    assert.equal(after.netExclVat, '132750.00');
    // VAT still belongs to SARS on the whole commission.
    assert.equal(after.vatAmount, '22125.00');

    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    assert.equal(splits.find((split) => split.agentId === agent.id)?.amount, '66375.00');

    const deductions = await readingAs(management, (db) => listDeductions(db, created.id));
    assert.equal(deductions.length, 1);
    assert.equal(deductions[0]?.createdByName, 'Ayden Grobler');
  });

  it('refuses a deduction larger than the whole commission', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const error = await rejects(
      asUser(management, (db) =>
        addDeduction(
          db,
          managementCtx,
          created.id,
          parseOrThrow(deductionInputSchema, { label: 'Nonsense', amount: '500000' }),
        ),
      ),
    );
    assert.match(error.message, /more than the whole/i);
  });

  it('puts the figures back when a deduction is removed', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    await asUser(management, (db) =>
      addDeduction(
        db,
        managementCtx,
        created.id,
        parseOrThrow(deductionInputSchema, { label: 'Bond originator', amount: '5000' }),
      ),
    );
    const deductions = await readingAs(management, (db) => listDeductions(db, created.id));
    const deduction = deductions[0];
    assert.ok(deduction);

    await asUser(management, (db) =>
      removeDeduction(db, managementCtx, created.id, deduction.id),
    );

    const after = await current(created.id);
    assert.equal(after.deductionsTotal, '0.00');
    assert.equal(after.netExclVat, '147500.00');

    const history = await readingAs(management, (db) => commissionHistory(db, created.id));
    assert.equal(
      history.filter((entry) => entry.event === 'deduction_changed').length,
      2,
      'both the adding and the removing are on the record',
    );
  });
});

// =====================================================================
describe('approval belongs to a person (spec 65, 115)', () => {
  it('will not send a commission for approval whose shares do not add up', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    const office = splits.find((split) => split.role === 'office');
    assert.ok(office);
    await asUser(management, (db) => removeSplit(db, managementCtx, created.id, office.id));

    const record = await current(created.id);
    const error = await rejects(
      asUser(management, (db) => submitCommission(db, managementCtx, created.id, record.rowVersion)),
    );
    assert.match(error.message, /do not add up|100/i);
  });

  it('records who approved it and when', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    const record = await current(created.id);

    assert.equal(record.status, 'approved');
    assert.equal(record.approvedByName, 'Ayden Grobler');
    assert.ok(record.approvedAt, 'an approval carries the moment it happened');
    assert.match(record.approvalNote ?? '', /mandate/i);
  });

  it('refuses approval from somebody without the permission', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const record = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, record.rowVersion),
    );
    const submitted = await current(created.id);

    // Accounts may work a commission out but not approve it.
    const error = await rejects(
      asUser(accounts, (db) =>
        approveCommission(db, accountsCtx, created.id, submitted.rowVersion, 'Looks fine'),
      ),
    );
    assert.match(error.message, /permission/i);

    const after = await current(created.id);
    assert.equal(after.status, 'submitted');
    assert.equal(after.approvedByName, null);
  });

  it('cannot be forged by writing the status straight to the table', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    // Even as the schema owner, with row level security out of the way, the
    // constraint refuses an approval with nobody's name on it (spec 115).
    const error = await rejects(
      asOwner((db) =>
        db.query("update commissions set status = 'approved' where id = $1", [created.id]),
      ),
    );
    assert.match(error.message, /commissions_approved_needs_a_person/);
  });

  it('sends it back with a reason, and clears the approval', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);

    await asUser(management, (db) =>
      rejectCommission(
        db,
        managementCtx,
        created.id,
        submitted.rowVersion,
        'The mandate says 4.5%, not 5%.',
      ),
    );

    const after = await current(created.id);
    assert.equal(after.status, 'rejected');
    assert.equal(after.rejectedByName, 'Ayden Grobler');
    assert.match(after.rejectionReason ?? '', /4\.5/);
    assert.equal(after.approvedByName, null);
  });

  it('refuses to send it back without saying what is wrong', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);

    await rejects(
      asUser(management, (db) =>
        rejectCommission(db, managementCtx, created.id, submitted.rowVersion, '  '),
      ),
    );
  });

  it('closes the figures to editing once it has been approved', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    const record = await current(created.id);

    const error = await rejects(
      asUser(management, (db) =>
        updateCommission(
          db,
          managementCtx,
          created.id,
          parseOrThrow(commissionInputSchema, {
            transactionId: transaction.id,
            basis: 'percent_of_value',
            ratePercent: '9',
            baseAmount: '2950000',
            vatApplicable: true,
          }),
          record.rowVersion,
        ),
      ),
    );
    assert.match(error.message, /approved/i);
  });

  it('can require a second pair of eyes when the office asks for it', async () => {
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'commission.require_separate_approver', true),
    );

    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);

    const error = await rejects(
      asUser(management, (db) =>
        approveCommission(db, managementCtx, created.id, submitted.rowVersion, null),
      ),
    );
    assert.match(error.message, /second pair of eyes|other than/i);
  });

  it('refuses two people approving the same commission at once', async () => {
    const secondApprover = await createTestUser({ role: 'MANAGEMENT' });
    const secondCtx = await ctxFor(secondApprover);

    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);

    await asUser(management, (db) =>
      approveCommission(db, managementCtx, created.id, submitted.rowVersion, 'First'),
    );

    const stale = await rejects(
      asUser(secondApprover, (db) =>
        approveCommission(db, secondCtx, created.id, submitted.rowVersion, 'Second'),
      ),
    );
    assert.match(stale.message, /updated by another user|not available/i);
  });
});

// =====================================================================
describe('nothing is earned until registration (spec 49)', () => {
  it('refuses to invoice against a sale that has not registered', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    const record = await current(created.id);
    assert.equal(record.transactionStatus, 'sale_concluded');

    const error = await rejects(
      asUser(management, (db) =>
        invoiceCommission(db, managementCtx, created.id, record.rowVersion, {
          invoiceNumber: 'INV-2026-0001',
          invoiceDate: '2026-06-01',
        }),
      ),
    );
    assert.match(error.message, /has not registered/i);

    const after = await current(created.id);
    assert.equal(after.status, 'approved');
    assert.equal(after.invoiceNumber, null);
  });

  it('refuses to record a payment against a sale that has not registered', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    const record = await current(created.id);

    const error = await rejects(
      asUser(management, (db) =>
        markCommissionPaid(db, managementCtx, created.id, record.rowVersion, {
          paidOn: '2026-06-05',
          paymentReference: 'EFT 88231',
          invoiceNumber: 'INV-2026-0001',
        }),
      ),
    );
    assert.match(error.message, /has not registered/i);
  });

  it('refuses it at the database too, not only in the form', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);

    // The trigger applies however the row is written, including as owner.
    const error = await rejects(
      asOwner((db) =>
        db.query(
          `update commissions
              set status = 'invoiced', invoice_number = 'INV-FORGED', invoice_date = current_date
            where id = $1`,
          [created.id],
        ),
      ),
    );
    assert.match(error.message, /before the transfer is registered/i);
  });

  it('lets it through once the transfer has actually registered', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    await register(transaction.id);

    const record = await current(created.id);
    await asUser(management, (db) =>
      invoiceCommission(db, managementCtx, created.id, record.rowVersion, {
        invoiceNumber: 'INV-2026-0001',
        invoiceDate: '2026-08-21',
      }),
    );

    const after = await current(created.id);
    assert.equal(after.status, 'invoiced');
    assert.equal(after.invoiceNumber, 'INV-2026-0001');
    assert.equal(after.registeredOn, '2026-08-20');
  });

  it('does not hold a letting commission back, because a lease registers nowhere', async () => {
    const property = await aProperty({ businessArea: 'rentals' });
    const rental = await asOwner((db) =>
      db.one<{ id: string }>(
        `insert into property_rental_history
           (property_id, lease_start, lease_end, monthly_rental, agent_id)
         values ($1, '2026-09-01', '2027-08-31', 18500, $2) returning id`,
        [property.id, agent.id],
      ),
    );

    const created = await asUser(management, (db) =>
      createCommission(
        db,
        managementCtx,
        parseOrThrow(commissionInputSchema, {
          rentalId: rental.id,
          basis: 'months_of_rent',
          months: '1',
          baseAmount: '18500',
          vatApplicable: true,
        }),
      ),
    );

    const record = await current(created.id);
    assert.equal(record.grossExclVat, '18500.00');
    assert.equal(record.transactionId, null);

    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);
    await asUser(management, (db) =>
      approveCommission(db, managementCtx, created.id, submitted.rowVersion, 'Standard letting'),
    );
    const forInvoice = await current(created.id);
    await asUser(management, (db) =>
      invoiceCommission(db, managementCtx, created.id, forInvoice.rowVersion, {
        invoiceNumber: 'INV-L-0001',
        invoiceDate: '2026-09-01',
      }),
    );

    assert.equal((await current(created.id)).status, 'invoiced');
  });

  it('can be allowed deliberately, and only deliberately', async () => {
    await asUser(management, (db) =>
      setSetting(db, managementCtx, 'commission.allow_before_registration', true),
    );

    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    const record = await current(created.id);

    await asUser(management, (db) =>
      invoiceCommission(db, managementCtx, created.id, record.rowVersion, {
        invoiceNumber: 'INV-EARLY-0001',
        invoiceDate: '2026-06-01',
      }),
    );
    assert.equal((await current(created.id)).status, 'invoiced');
  });
});

// =====================================================================
describe('recorded as paid, never confirmed (spec 115)', () => {
  it('names the person who recorded the payment', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    await register(transaction.id);

    const record = await current(created.id);
    await asUser(management, (db) =>
      invoiceCommission(db, managementCtx, created.id, record.rowVersion, {
        invoiceNumber: 'INV-2026-0002',
        invoiceDate: '2026-08-21',
      }),
    );
    const invoiced = await current(created.id);
    await asUser(management, (db) =>
      markCommissionPaid(db, managementCtx, created.id, invoiced.rowVersion, {
        paidOn: '2026-08-29',
        paymentReference: 'EFT 88231',
      }),
    );

    const after = await current(created.id);
    assert.equal(after.status, 'paid');
    assert.equal(after.markedPaidByName, 'Ayden Grobler');
    assert.equal(after.paidOn, '2026-08-29');
    assert.equal(after.paymentReference, 'EFT 88231');
    // The label a person reads never claims the CRM established anything.
    assert.equal(COMMISSION_STATUSES.paid, 'Recorded as paid');

    const history = await readingAs(management, (db) => commissionHistory(db, created.id));
    const paid = history.find((entry) => entry.event === 'paid');
    assert.ok(paid);
    assert.match(paid.reason ?? '', /connected to no bank/i);
  });

  it('cannot be recorded as paid with nobody recording it', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    await register(transaction.id);

    const error = await rejects(
      asOwner((db) =>
        db.query(
          `update commissions
              set status = 'paid', invoice_number = 'INV-X', paid_on = current_date
            where id = $1`,
          [created.id],
        ),
      ),
    );
    assert.match(error.message, /commissions_paid_needs_a_person/);
  });

  it('cannot skip approval on the way to being paid', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    await register(transaction.id);

    const error = await rejects(
      asOwner((db) =>
        db.query(
          `update commissions
              set status = 'paid', invoice_number = 'INV-X', paid_on = current_date,
                  marked_paid_by = $2, marked_paid_at = now()
            where id = $1`,
          [created.id, management.id],
        ),
      ),
    );
    assert.match(error.message, /commissions_payment_needs_approval/);
  });

  it('will not record a payment against no invoice', async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    await register(transaction.id);
    const record = await current(created.id);

    const error = await rejects(
      asUser(management, (db) =>
        markCommissionPaid(db, managementCtx, created.id, record.rowVersion, {
          paidOn: '2026-08-29',
          paymentReference: null,
        }),
      ),
    );
    assert.match(error.message, /invoice number/i);
  });

  it('is the end of the road: a paid commission cannot move again', async () => {
    assert.equal(mayMoveTo('paid', 'draft'), false);
    assert.equal(mayMoveTo('paid', 'cancelled'), false);
    assert.equal(mayMoveTo('approved', 'draft'), false);
    assert.equal(mayMoveTo('draft', 'approved'), false);
    assert.equal(mayMoveTo('submitted', 'approved'), true);
  });

  it('cancels with a reason, and keeps the record', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const record = await current(created.id);

    await asUser(management, (db) =>
      cancelCommission(
        db,
        managementCtx,
        created.id,
        record.rowVersion,
        'The sale fell through on the bond.',
      ),
    );

    const after = await current(created.id);
    assert.equal(after.status, 'cancelled');
    assert.match(after.cancellationReason ?? '', /bond/i);
    assert.equal(after.grossExclVat, '147500.00', 'the figures are kept, not erased');
  });
});

// =====================================================================
describe('who may see what (spec 9, 102)', () => {
  it('lets an agent see the commission on their own deal', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const seen = await readingAs(agent, (db) => getCommission(db, created.id));
    assert.ok(seen, 'the agent on the deal can see it');
    assert.equal(seen.commissionRef, created.commissionRef);

    const splits = await readingAs(agent, (db) => listSplits(db, created.id));
    assert.ok(splits.some((split) => split.agentId === agent.id));
  });

  it("keeps another agent's commission out of reach entirely", async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const hidden = await readingAs(otherAgent, (db) => getCommission(db, created.id));
    assert.equal(hidden, null, 'row level security removes it, not the interface');

    const list = await readingAs(otherAgent, (db) => listCommissions(db));
    assert.equal(list.length, 0);
  });

  it('will not let an agent approve their own commission', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const draft = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, draft.rowVersion),
    );
    const submitted = await current(created.id);

    const error = await rejects(
      asUser(agent, (db) =>
        approveCommission(db, agentCtx, created.id, submitted.rowVersion, 'Mine, approved'),
      ),
    );
    assert.match(error.message, /permission/i);
  });

  it('will not let an agent change their own share', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    // No COMMISSION_EDIT, so the policy refuses the write even though the
    // agent can read the record.
    await rejects(
      asUser(agent, (db) =>
        setSplit(
          db,
          agentCtx,
          created.id,
          parseOrThrow(splitInputSchema, {
            agentId: agent.id,
            role: 'primary',
            sharePercent: '90',
          }),
        ),
      ),
    );

    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    assert.equal(Number(splits.find((split) => split.agentId === agent.id)?.sharePercent), 50);
  });

  it('lets accounts work a commission out without being able to approve it', async () => {
    const { transaction } = await aConcludedSale();
    const created = await asUser(accounts, (db) =>
      createCommission(
        db,
        accountsCtx,
        parseOrThrow(commissionInputSchema, {
          transactionId: transaction.id,
          basis: 'percent_of_value',
          ratePercent: '5',
          baseAmount: '2950000',
          vatApplicable: true,
        }),
      ),
    );
    assert.ok(created.commissionRef);

    const record = await current(created.id);
    await asUser(accounts, (db) =>
      submitCommission(db, accountsCtx, created.id, record.rowVersion),
    );
    assert.equal((await current(created.id)).status, 'submitted');
  });
});

// =====================================================================
describe('what the office wants to know (spec 66, 95)', () => {
  it('keeps worked out, awaiting registration, due and paid apart', async () => {
    // One draft.
    const first = await aConcludedSale();
    await aCommission(first.transaction.id);

    // One approved, on a sale that has not registered.
    const second = await aConcludedSale('4000000');
    const secondCommission = await approved(second.transaction.id);
    void secondCommission;

    // One approved, registered, and recorded as paid.
    const third = await aConcludedSale('1500000');
    const thirdCommission = await approved(third.transaction.id);
    await register(third.transaction.id);
    const forInvoice = await current(thirdCommission.id);
    await asUser(management, (db) =>
      invoiceCommission(db, managementCtx, thirdCommission.id, forInvoice.rowVersion, {
        invoiceNumber: 'INV-3',
        invoiceDate: '2026-08-21',
      }),
    );
    const invoiced = await current(thirdCommission.id);
    await asUser(management, (db) =>
      markCommissionPaid(db, managementCtx, thirdCommission.id, invoiced.rowVersion, {
        paidOn: '2026-08-25',
        paymentReference: 'EFT 1',
      }),
    );

    const summary = await readingAs(management, (db) => commissionSummary(db));

    assert.equal(summary.pipelineCount, 1);
    assert.equal(summary.pipelineExclVat, '147500.00');
    assert.equal(summary.awaitingRegistrationCount, 1);
    assert.equal(summary.awaitingRegistrationExclVat, '200000.00');
    assert.equal(summary.recordedPaidCount, 1);
    assert.equal(summary.recordedPaidExclVat, '75000.00');
    // Nothing is both awaiting registration and due.
    assert.equal(summary.dueCount, 0);
  });

  it('counts what is waiting for somebody to approve it', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);
    const record = await current(created.id);
    await asUser(management, (db) =>
      submitCommission(db, managementCtx, created.id, record.rowVersion),
    );

    const summary = await readingAs(management, (db) => commissionSummary(db));
    assert.equal(summary.waitingForApproval, 1);
  });

  it("adds up each agent's share in the same three buckets", async () => {
    const { transaction } = await aConcludedSale();
    const created = await approved(transaction.id);
    void created;

    const earnings = await readingAs(management, (db) => earningsByAgent(db));
    const line = earnings.find((entry) => entry.agentId === agent.id);
    assert.ok(line);
    assert.equal(line.agentName, 'Nadia Agent');
    assert.equal(line.approved, '73750.00');
    assert.equal(line.recordedPaid, '0.00');
    assert.equal(line.pipeline, '0.00');

    const office = earnings.find((entry) => entry.agentId === null);
    assert.ok(office, "the office's own share is a line of its own");
    assert.equal(office.approved, '73750.00');
  });

  it("gives an agent their own statement, and only their own", async () => {
    const { transaction } = await aConcludedSale();
    await approved(transaction.id);

    const own = await readingAs(agent, (db) => statementFor(db, agent.id));
    assert.equal(own.lines.length, 1);
    assert.equal(own.lines[0]?.amount, '73750.00');
    assert.equal(own.lines[0]?.status, 'approved');
    // Approved is not paid, and the statement keeps them apart.
    assert.equal(own.totals.approved, '73750.00');
    assert.equal(own.totals.recordedPaid, '0.00');

    const someoneElse = await readingAs(otherAgent, (db) => statementFor(db, agent.id));
    assert.equal(
      someoneElse.lines.length,
      0,
      "row level security keeps another agent's statement empty",
    );
  });

  it('lists what is approved but still waiting on the deeds office', async () => {
    const { transaction } = await aConcludedSale();
    await approved(transaction.id);

    const atRisk = await readingAs(management, (db) =>
      listCommissions(db, { unregisteredOnly: true }),
    );
    assert.equal(atRisk.length, 1);
    assert.equal(atRisk[0]?.transactionStatus, 'sale_concluded');
  });

  it('finds a commission by its reference, the property or the transaction', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const byRef = await readingAs(management, (db) =>
      listCommissions(db, { search: created.commissionRef }),
    );
    assert.equal(byRef.length, 1);

    const byStreet = await readingAs(management, (db) =>
      listCommissions(db, { search: 'Main Road' }),
    );
    assert.equal(byStreet.length, 1);

    const nothing = await readingAs(management, (db) =>
      listCommissions(db, { search: 'Sandton' }),
    );
    assert.equal(nothing.length, 0);
  });

  it('finds the commission on a deal from the deal itself', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const found = await readingAs(management, (db) =>
      commissionFor(db, { transactionId: transaction.id }),
    );
    assert.equal(found?.id, created.id);
  });
});

// =====================================================================
describe("the office's own share (spec 78)", () => {
  it('is edited rather than added a second time', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    // Cut the office back to make room for a sharing agent, which must
    // change the existing row rather than adding a second one.
    await asUser(management, (db) =>
      setSplit(
        db,
        managementCtx,
        created.id,
        parseOrThrow(splitInputSchema, { role: 'office', sharePercent: '40' }),
      ),
    );

    const splits = await readingAs(management, (db) => listSplits(db, created.id));
    const office = splits.filter((split) => split.role === 'office');
    assert.equal(office.length, 1, 'one office share, not two');
    assert.equal(Number(office[0]?.sharePercent), 40);
    assert.equal(office[0]?.amount, '59000.00');
    assert.equal(office[0]?.partyName, 'Garden Route Lifestyle Property');
  });

  it('refuses a second office share at the database as well', async () => {
    const { transaction } = await aConcludedSale();
    const created = await aCommission(transaction.id);

    const error = await rejects(
      asOwner((db) =>
        db.query(
          `insert into commission_splits (commission_id, party_name, role, share_percent)
           values ($1, 'The office again', 'office', 0)`,
          [created.id],
        ),
      ),
    );
    assert.match(error.message, /commission_splits_one_office_idx|already exists/i);
  });
});

// =====================================================================
describe('a rate can be written the way a mandate writes it', () => {
  it('accepts four decimal places, which money does not', async () => {
    // 4.5625% is a real mandate term. A two-place money rule would have
    // silently refused it.
    const rule = parseOrThrow(ruleInputSchema, {
      name: 'Negotiated rate',
      appliesTo: 'sale',
      basis: 'percent_of_value',
      ratePercent: '4.5625',
    });
    assert.equal(rule.ratePercent, '4.5625');

    const commission = parseOrThrow(commissionInputSchema, {
      transactionId: '11111111-1111-4111-8111-111111111111',
      basis: 'percent_of_value',
      ratePercent: '4.5625',
      baseAmount: '1875000',
    });
    assert.equal(commission.ratePercent, '4.5625');
  });

  it('accepts a rate that came back from the database as 5.0000', async () => {
    const { transaction } = await aConcludedSale();
    const rules = await readingAs(management, (db) => listRules(db, { appliesTo: 'sale' }));
    const rule = rules.find((entry) => entry.isDefault);
    assert.ok(rule);
    assert.equal(rule.ratePercent, '5.0000', 'numeric(8,4) comes back padded');

    // Exactly what the form posts back after the rule fills it in.
    const created = await asUser(management, (db) =>
      createCommission(
        db,
        managementCtx,
        parseOrThrow(commissionInputSchema, {
          transactionId: transaction.id,
          ruleId: rule.id,
          basis: 'percent_of_value',
          ratePercent: rule.ratePercent,
          baseAmount: '2950000.00',
          vatApplicable: true,
        }),
      ),
    );
    const record = await current(created.id);
    assert.equal(record.grossExclVat, '147500.00');
  });

  it('and half a month of rent, which money would also have refused', async () => {
    const rule = parseOrThrow(ruleInputSchema, {
      name: 'Half a month',
      appliesTo: 'rental',
      basis: 'months_of_rent',
      months: '0.500',
    });
    assert.equal(rule.months, '0.500');
  });
});
