import { z } from 'zod';
import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import {
  optionalDate,
  optionalMoney,
  optionalMonths,
  optionalRate,
  optionalText,
} from '../validate.ts';
import { COMMISSION_BASES, keys, type CommissionBasis } from './types.ts';

// ---------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the rule a name.').max(120),
    appliesTo: z.enum(['sale', 'rental']),
    businessArea: optionalText,
    basis: z.enum(keys(COMMISSION_BASES)),
    ratePercent: optionalRate,
    fixedAmount: optionalMoney,
    months: optionalMonths,
    vatApplicable: z.boolean().default(true),
    minimumAmount: optionalMoney,
    notes: optionalText,
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    isDefault: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    const needsRate = input.basis === 'percent_of_value' || input.basis === 'percent_of_annual_rent';
    if (needsRate && !input.ratePercent) {
      ctx.addIssue({ code: 'custom', path: ['ratePercent'], message: 'Give the percentage.' });
    }
    if (input.basis === 'fixed_amount' && !input.fixedAmount) {
      ctx.addIssue({ code: 'custom', path: ['fixedAmount'], message: 'Give the amount.' });
    }
    if (input.basis === 'months_of_rent' && !input.months) {
      ctx.addIssue({ code: 'custom', path: ['months'], message: 'Give the number of months.' });
    }
    if (needsRate && input.ratePercent && Number(input.ratePercent) > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['ratePercent'],
        message: 'A commission cannot be more than the whole price.',
      });
    }
    // A rental rule cannot be a percentage of a price nobody recorded, and
    // a sale rule cannot be months of rent (spec 141: keep them apart).
    if (input.appliesTo === 'sale' && ['months_of_rent', 'percent_of_annual_rent'].includes(input.basis)) {
      ctx.addIssue({
        code: 'custom',
        path: ['basis'],
        message: 'That basis is about rent, so it belongs to a rental rule.',
      });
    }
    if (input.appliesTo === 'rental' && input.basis === 'percent_of_value') {
      ctx.addIssue({
        code: 'custom',
        path: ['basis'],
        message: 'A letting commission is worked out from the rent, not from a selling price.',
      });
    }
  });

export type RuleInput = z.infer<typeof ruleInputSchema>;

export interface CommissionRule {
  id: string;
  name: string;
  appliesTo: 'sale' | 'rental';
  businessArea: string | null;
  basis: CommissionBasis;
  ratePercent: string | null;
  fixedAmount: string | null;
  months: string | null;
  vatApplicable: boolean;
  minimumAmount: string | null;
  notes: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isDefault: boolean;
  isArchived: boolean;
  archiveReason: string | null;
  rowVersion: number;
  createdAt: string;
  createdByName: string | null;
}

interface RuleDbRow {
  id: string;
  name: string;
  applies_to: 'sale' | 'rental';
  business_area: string | null;
  basis: CommissionBasis;
  rate_percent: string | null;
  fixed_amount: string | null;
  months: string | null;
  vat_applicable: boolean;
  minimum_amount: string | null;
  notes: string | null;
  effective_from: Date | null;
  effective_to: Date | null;
  is_default: boolean;
  is_archived: boolean;
  archive_reason: string | null;
  row_version: number;
  created_at: Date;
  created_by_name: string | null;
}

const RULE_SQL = `
  select r.*, coalesce(u.display_name, u.full_name) as created_by_name
    from commission_rules r
    left join users u on u.id = r.created_by`;

function toRule(row: RuleDbRow): CommissionRule {
  return {
    id: row.id,
    name: row.name,
    appliesTo: row.applies_to,
    businessArea: row.business_area,
    basis: row.basis,
    ratePercent: row.rate_percent,
    fixedAmount: row.fixed_amount,
    months: row.months,
    vatApplicable: row.vat_applicable,
    minimumAmount: row.minimum_amount,
    notes: row.notes,
    effectiveFrom: row.effective_from?.toISOString().slice(0, 10) ?? null,
    effectiveTo: row.effective_to?.toISOString().slice(0, 10) ?? null,
    isDefault: row.is_default,
    isArchived: row.is_archived,
    archiveReason: row.archive_reason,
    rowVersion: row.row_version,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
  };
}

export async function listRules(
  db: Db,
  options: { appliesTo?: 'sale' | 'rental'; includeArchived?: boolean } = {},
): Promise<CommissionRule[]> {
  const rows = await db.query<RuleDbRow>(
    `${RULE_SQL}
      where ($1::text is null or r.applies_to = $1)
        and ($2::boolean or not r.is_archived)
      order by r.is_archived, r.applies_to, r.is_default desc, r.name`,
    [options.appliesTo ?? null, options.includeArchived ?? false],
  );
  return rows.map(toRule);
}

export async function getRule(db: Db, id: string): Promise<CommissionRule | null> {
  const row = await db.maybeOne<RuleDbRow>(`${RULE_SQL} where r.id = $1`, [id]);
  return row ? toRule(row) : null;
}

export async function createRule(db: Db, ctx: Ctx, input: RuleInput): Promise<{ id: string }> {
  if (input.isDefault) await clearDefault(db, input.appliesTo, input.businessArea);

  const row = await db.one<{ id: string }>(
    `insert into commission_rules
       (name, applies_to, business_area, basis, rate_percent, fixed_amount, months,
        vat_applicable, minimum_amount, notes, effective_from, effective_to, is_default,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     returning id`,
    [
      input.name, input.appliesTo, input.businessArea, input.basis, input.ratePercent,
      input.fixedAmount, input.months, input.vatApplicable, input.minimumAmount, input.notes,
      input.effectiveFrom, input.effectiveTo, input.isDefault, ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission_rule.created',
    entityType: 'commission_rule',
    entityId: row.id,
    context: { name: input.name, basis: input.basis, appliesTo: input.appliesTo },
  });
  return row;
}

export async function updateRule(
  db: Db,
  ctx: Ctx,
  id: string,
  input: RuleInput,
  expectedVersion: number,
): Promise<void> {
  if (input.isDefault) await clearDefault(db, input.appliesTo, input.businessArea, id);

  const updated = await db.count(
    `update commission_rules set
        name=$2, applies_to=$3, business_area=$4, basis=$5, rate_percent=$6, fixed_amount=$7,
        months=$8, vat_applicable=$9, minimum_amount=$10, notes=$11, effective_from=$12,
        effective_to=$13, is_default=$14, updated_by=$15
      where id=$1 and row_version=$16`,
    [
      id, input.name, input.appliesTo, input.businessArea, input.basis, input.ratePercent,
      input.fixedAmount, input.months, input.vatApplicable, input.minimumAmount, input.notes,
      input.effectiveFrom, input.effectiveTo, input.isDefault, ctx.actor.id, expectedVersion,
    ],
  );
  if (updated === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission_rule.updated',
    entityType: 'commission_rule',
    entityId: id,
    context: { name: input.name },
  });
}

/**
 * Archiving a rule.
 *
 * The rule stops being offered, but every commission worked out from it
 * keeps its own snapshot, so no past figure changes (spec 104).
 */
export async function archiveRule(db: Db, ctx: Ctx, id: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new ValidationError({ archiveReason: ['Say why this rule is being retired.'] });
  }
  const updated = await db.count(
    `update commission_rules
        set is_archived = true, archive_reason = $2, is_default = false, updated_by = $3
      where id = $1 and not is_archived`,
    [id, reason.trim(), ctx.actor.id],
  );
  if (updated === 0) throw new NotFoundError('That rule');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission_rule.archived',
    entityType: 'commission_rule',
    entityId: id,
    context: { reason: reason.trim() },
  });
}

async function clearDefault(
  db: Db,
  appliesTo: string,
  businessArea: string | null,
  except?: string,
): Promise<void> {
  await db.query(
    `update commission_rules set is_default = false
      where applies_to = $1
        and coalesce(business_area, '*') = coalesce($2, '*')
        and is_default
        and not is_archived
        and ($3::uuid is null or id <> $3)`,
    [appliesTo, businessArea, except ?? null],
  );
}

/** The rule the office would reach for, given what the deal is. */
export async function defaultRuleFor(
  db: Db,
  appliesTo: 'sale' | 'rental',
  businessArea: string | null,
): Promise<CommissionRule | null> {
  const row = await db.maybeOne<RuleDbRow>(
    `${RULE_SQL}
      where not r.is_archived
        and r.applies_to = $1
        and (r.business_area is null or r.business_area = $2)
        and (r.effective_from is null or r.effective_from <= current_date)
        and (r.effective_to is null or r.effective_to >= current_date)
      order by (r.business_area = $2) desc nulls last, r.is_default desc, r.created_at
      limit 1`,
    [appliesTo, businessArea],
  );
  return row ? toRule(row) : null;
}
