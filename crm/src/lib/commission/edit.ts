import { z } from 'zod';
import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import { optionalText, optionalUuid } from '../validate.ts';
import * as money from '../money.ts';
import { calculate } from './calculator.ts';
import { getRule } from './rules.ts';
import {
  getCommission,
  listDeductions,
  listSplits,
  note,
  type CommissionInput,
  type CommissionRecord,
} from './records.ts';
import { SPLIT_ROLES, keys } from './types.ts';

// ---------------------------------------------------------------------
// Changing one
// ---------------------------------------------------------------------

/** A commission that has been approved is closed to editing of its figures. */
function guardEditable(record: CommissionRecord): void {
  if (['approved', 'invoiced', 'paid'].includes(record.status)) {
    throw new ValidationError(
      { status: ['This commission has been approved, so its figures are settled.'] },
      `${record.commissionRef} has been approved. Send it back first if a figure is wrong.`,
    );
  }
  if (record.status === 'cancelled') {
    throw new ValidationError(
      { status: ['This commission was cancelled.'] },
      `${record.commissionRef} was cancelled and is kept for the record only.`,
    );
  }
}

export async function updateCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  input: CommissionInput,
  expectedVersion: number,
): Promise<void> {
  const before = await getCommission(db, id);
  if (!before) throw new NotFoundError('That commission');
  if (before.rowVersion !== expectedVersion) throw new ConcurrencyError();
  guardEditable(before);

  const deductions = await listDeductions(db, id);
  const rule = input.ruleId ? await getRule(db, input.ruleId) : null;
  const baseAmount = input.baseAmount ?? before.baseAmount;

  const calculation = calculate({
    basis: input.basis,
    ratePercent: input.ratePercent,
    fixedAmount: input.fixedAmount,
    months: input.months,
    baseAmount,
    vatApplicable: input.vatApplicable,
    vatRate: before.vatRate,
    minimumAmount: rule?.minimumAmount ?? null,
    deductions: deductions.map((deduction) => deduction.amount),
    overrideExclVat: input.overrideExclVat,
  });

  const updated = await db.count(
    `update commissions set
        rule_id=$2, rule_name=$3, basis=$4, rate_percent=$5, fixed_amount=$6, months=$7,
        base_amount=$8, calculated_excl_vat=$9, gross_excl_vat=$10,
        is_overridden=$11, override_reason=$12,
        vat_applicable=$13, vat_amount=$14, gross_incl_vat=$15,
        deductions_total=$16, net_excl_vat=$17, notes=$18, updated_by=$19
      where id=$1 and row_version=$20`,
    [
      id, input.ruleId, rule?.name ?? before.ruleName, input.basis, input.ratePercent,
      input.fixedAmount, input.months, money.normalise(baseAmount),
      calculation.calculatedExclVat, calculation.grossExclVat,
      calculation.isOverridden, calculation.isOverridden ? input.overrideReason : null,
      input.vatApplicable, calculation.vatAmount, calculation.grossInclVat,
      calculation.deductionsTotal, calculation.netExclVat, input.notes,
      ctx.actor.id, expectedVersion,
    ],
  );
  if (updated === 0) throw new ConcurrencyError();

  await reapportion(db, id, calculation.netExclVat);

  if (calculation.isOverridden && !before.isOverridden) {
    await note(db, ctx, id, 'overridden', {
      detail: {
        from: calculation.calculatedExclVat,
        to: calculation.grossExclVat,
      },
      reason: input.overrideReason,
    });
  } else if (before.grossExclVat !== calculation.grossExclVat) {
    await note(db, ctx, id, 'recalculated', {
      detail: { from: before.grossExclVat, to: calculation.grossExclVat },
    });
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.updated',
    entityType: 'commission',
    entityId: id,
    context: {
      commissionRef: before.commissionRef,
      grossExclVat: calculation.grossExclVat,
      overridden: calculation.isOverridden,
    },
  });
}

/** Keeps each share's amount in step with the figure being shared out. */
async function reapportion(
  db: Db,
  commissionId: string,
  netExclVat: string,
): Promise<void> {
  const splits = await listSplits(db, commissionId);
  if (splits.length === 0) return;

  const amounts = money.apportion(netExclVat, splits.map((split) => split.sharePercent));
  for (const [index, split] of splits.entries()) {
    await db.query('update commission_splits set amount = $2 where id = $1', [
      split.id,
      amounts[index] ?? '0.00',
    ]);
  }
}

export const splitInputSchema = z.object({
  agentId: optionalUuid,
  partyName: optionalText,
  role: z.enum(keys(SPLIT_ROLES)),
  sharePercent: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^\d+(\.\d{1,3})?$/.test(value), 'Give a percentage, for example 12.5.')
    .refine((value) => Number(value) <= 100, 'A share cannot be more than the whole.'),
  notes: optionalText,
});

export type SplitInput = z.infer<typeof splitInputSchema>;

/**
 * Adding or changing somebody's share.
 *
 * The database refuses a set of shares adding up to more than the whole,
 * so an over-allocation is rejected rather than quietly reducing somebody
 * else (spec 78).
 */
export async function setSplit(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  input: SplitInput,
): Promise<void> {
  const record = await getCommission(db, commissionId);
  if (!record) throw new NotFoundError('That commission');
  guardEditable(record);

  if (input.role === 'office' && input.agentId) {
    throw new ValidationError(
      { agentId: ["The office's own share is not an agent's share."] },
      "The office's own share is not an agent's share. Record the agent's share separately.",
    );
  }
  if (input.role !== 'office' && !input.agentId && !input.partyName) {
    throw new ValidationError(
      { partyName: ['Name whoever this share is for, even if they do not use the CRM.'] },
      'Name whoever this share is for.',
    );
  }

  // An agent has at most one share, and so does the office, so setting
  // either edits the row that is already there rather than adding a second
  // one that would quietly double it.
  const existing = input.agentId
    ? await db.maybeOne<{ id: string }>(
        'select id from commission_splits where commission_id = $1 and agent_id = $2',
        [commissionId, input.agentId],
      )
    : input.role === 'office'
      ? await db.maybeOne<{ id: string }>(
          "select id from commission_splits where commission_id = $1 and role = 'office'",
          [commissionId],
        )
      : null;

  if (existing) {
    // A blank name on an edit leaves whoever is already recorded in place,
    // because a share always has somebody against it.
    await db.query(
      `update commission_splits
          set role = $2, share_percent = $3, notes = $4,
              party_name = coalesce($5, party_name)
        where id = $1`,
      [existing.id, input.role, input.sharePercent, input.notes, input.partyName],
    );
  } else {
    await db.query(
      `insert into commission_splits
         (commission_id, agent_id, party_name, role, share_percent, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        commissionId,
        input.agentId,
        input.agentId ? input.partyName : (input.partyName ?? 'Garden Route Lifestyle Property'),
        input.role,
        input.sharePercent,
        input.notes,
        ctx.actor.id,
      ],
    );
  }

  await reapportion(db, commissionId, record.netExclVat);
  await note(db, ctx, commissionId, 'split_changed', {
    detail: {
      role: input.role,
      who: input.partyName ?? input.agentId,
      sharePercent: input.sharePercent,
    },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.split_changed',
    entityType: 'commission',
    entityId: commissionId,
    context: { commissionRef: record.commissionRef, role: input.role, share: input.sharePercent },
  });
}

export async function removeSplit(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  splitId: string,
): Promise<void> {
  const record = await getCommission(db, commissionId);
  if (!record) throw new NotFoundError('That commission');
  guardEditable(record);

  const removed = await db.query<{ role: string; party_name: string | null; share_percent: string }>(
    `delete from commission_splits where id = $1 and commission_id = $2
     returning role, party_name, share_percent`,
    [splitId, commissionId],
  );
  const gone = removed[0];
  if (!gone) throw new NotFoundError('That share');

  await reapportion(db, commissionId, record.netExclVat);
  // The share is gone from the calculation but not from the record of what
  // happened (spec 104).
  await note(db, ctx, commissionId, 'split_changed', {
    detail: { removed: gone.party_name ?? gone.role, sharePercent: gone.share_percent },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.split_removed',
    entityType: 'commission',
    entityId: commissionId,
    context: { commissionRef: record.commissionRef, share: gone.share_percent },
  });
}

export const deductionInputSchema = z.object({
  label: z.string().trim().min(2, 'Say what the deduction is for.').max(120),
  amount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Give an amount.'),
  note: optionalText,
});

export type DeductionInput = z.infer<typeof deductionInputSchema>;

export async function addDeduction(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  input: DeductionInput,
): Promise<void> {
  const record = await getCommission(db, commissionId);
  if (!record) throw new NotFoundError('That commission');
  guardEditable(record);

  if (money.compare(input.amount, record.grossExclVat) > 0) {
    throw new ValidationError(
      { amount: [`That is more than the whole commission of ${record.grossExclVat}.`] },
      `A deduction of ${money.normalise(input.amount)} is more than the whole commission of ${record.grossExclVat}.`,
    );
  }

  await db.query(
    `insert into commission_deductions (commission_id, label, amount, note, created_by)
     values ($1,$2,$3,$4,$5)`,
    [commissionId, input.label, input.amount, input.note, ctx.actor.id],
  );

  await refreshTotals(db, ctx, commissionId);
  await note(db, ctx, commissionId, 'deduction_changed', {
    detail: { added: input.label, amount: money.normalise(input.amount) },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.deduction_added',
    entityType: 'commission',
    entityId: commissionId,
    context: { commissionRef: record.commissionRef, label: input.label, amount: input.amount },
  });
}

export async function removeDeduction(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  deductionId: string,
): Promise<void> {
  const record = await getCommission(db, commissionId);
  if (!record) throw new NotFoundError('That commission');
  guardEditable(record);

  const removed = await db.query<{ label: string; amount: string }>(
    `delete from commission_deductions where id = $1 and commission_id = $2
     returning label, amount`,
    [deductionId, commissionId],
  );
  const gone = removed[0];
  if (!gone) throw new NotFoundError('That deduction');

  await refreshTotals(db, ctx, commissionId);
  await note(db, ctx, commissionId, 'deduction_changed', {
    detail: { removed: gone.label, amount: gone.amount },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.deduction_removed',
    entityType: 'commission',
    entityId: commissionId,
    context: { commissionRef: record.commissionRef, label: gone.label },
  });
}

/** Re-totals the deductions and what is left to share out. */
async function refreshTotals(db: Db, ctx: Ctx, commissionId: string): Promise<void> {
  const record = await getCommission(db, commissionId);
  if (!record) throw new NotFoundError('That commission');
  const deductions = await listDeductions(db, commissionId);
  const total = money.sum(deductions.map((deduction) => deduction.amount));
  const net = money.subtractToZero(record.grossExclVat, total);

  await db.query(
    'update commissions set deductions_total = $2, net_excl_vat = $3, updated_by = $4 where id = $1',
    [commissionId, total, net, ctx.actor.id],
  );
  await reapportion(db, commissionId, net);
}
