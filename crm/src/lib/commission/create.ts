import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getNumberSetting } from '../settings.ts';
import * as money from '../money.ts';
import { calculate } from './calculator.ts';
import { getRule } from './rules.ts';
import { commissionFor, note } from './records.ts';
import type { CommissionInput } from './records.ts';
import type { SplitRole } from './types.ts';

// ---------------------------------------------------------------------
// Opening a commission
// ---------------------------------------------------------------------

/** What a deal offers as a starting point, before anybody types anything. */
export interface DealBasis {
  kind: 'sale' | 'rental';
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;
  businessArea: string | null;
  baseAmount: string | null;
  /** For a sale: whether the transfer has registered yet (spec 49). */
  isRegistered: boolean;
  statusLabel: string;
  agents: { agentId: string; agentName: string; role: SplitRole; sharePercent: string | null }[];
}

export async function dealBasis(
  db: Db,
  deal: { transactionId?: string; rentalId?: string },
): Promise<DealBasis | null> {
  if (deal.transactionId) {
    const row = await db.maybeOne<{
      property_id: string;
      property_ref: string;
      property_label: string | null;
      business_area: string | null;
      transaction_value: string | null;
      status: string;
    }>(
      `select t.property_id, p.property_ref, p.business_area, t.transaction_value, t.status,
              nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
                as property_label
         from transactions t join properties p on p.id = t.property_id
        where t.id = $1`,
      [deal.transactionId],
    );
    if (!row) return null;

    const agents = await db.query<{ agent_id: string; agent_name: string; role: string; share_percent: string | null }>(
      `select ta.agent_id, coalesce(u.display_name, u.full_name) as agent_name,
              ta.role, ta.share_percent
         from transaction_agents ta
         join users u on u.id = ta.agent_id
        where ta.transaction_id = $1
        order by case ta.role when 'primary' then 1 when 'sharing' then 2 else 3 end`,
      [deal.transactionId],
    );

    return {
      kind: 'sale',
      propertyId: row.property_id,
      propertyRef: row.property_ref,
      propertyLabel: row.property_label,
      businessArea: row.business_area,
      baseAmount: row.transaction_value,
      isRegistered: row.status === 'registered',
      statusLabel: row.status,
      agents: agents.map((agent) => ({
        agentId: agent.agent_id,
        agentName: agent.agent_name,
        role: agent.role === 'primary' ? 'primary' : agent.role === 'sharing' ? 'sharing' : 'referral',
        sharePercent: agent.share_percent,
      })),
    };
  }

  if (deal.rentalId) {
    const row = await db.maybeOne<{
      property_id: string;
      property_ref: string;
      property_label: string | null;
      business_area: string | null;
      monthly_rental: string | null;
      agent_id: string | null;
      agent_name: string | null;
    }>(
      `select h.property_id, p.property_ref, p.business_area, h.monthly_rental,
              h.agent_id, coalesce(u.display_name, u.full_name) as agent_name,
              nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
                as property_label
         from property_rental_history h
         join properties p on p.id = h.property_id
         left join users u on u.id = h.agent_id
        where h.id = $1`,
      [deal.rentalId],
    );
    if (!row) return null;

    return {
      kind: 'rental',
      propertyId: row.property_id,
      propertyRef: row.property_ref,
      propertyLabel: row.property_label,
      businessArea: row.business_area,
      baseAmount: row.monthly_rental,
      // A lease is not registered anywhere, so nothing is being waited on.
      isRegistered: true,
      statusLabel: 'lease',
      agents:
        row.agent_id && row.agent_name
          ? [{ agentId: row.agent_id, agentName: row.agent_name, role: 'primary', sharePercent: null }]
          : [],
    };
  }

  return null;
}

/**
 * Opening the commission on a deal.
 *
 * It starts as a draft, with the office's rule applied, the agents already
 * on the deal carried across, and the office's own share suggested. Nothing
 * about it claims to be approved, invoiced or paid.
 */
export async function createCommission(
  db: Db,
  ctx: Ctx,
  input: CommissionInput,
): Promise<{ id: string; commissionRef: string }> {
  const basis = await dealBasis(db, {
    transactionId: input.transactionId ?? undefined,
    rentalId: input.rentalId ?? undefined,
  });
  if (!basis) throw new NotFoundError('That deal');

  const existing = await commissionFor(db, {
    transactionId: input.transactionId ?? undefined,
    rentalId: input.rentalId ?? undefined,
  });
  if (existing) {
    throw new ValidationError(
      { transactionId: [`${existing.commissionRef} already covers this deal.`] },
      'This deal already has a commission.',
    );
  }

  const rule = input.ruleId ? await getRule(db, input.ruleId) : null;
  const vatRate = await getNumberSetting(db, 'commission.vat_rate', 15);
  const baseAmount = input.baseAmount ?? basis.baseAmount ?? '0';

  const calculation = calculate({
    basis: input.basis,
    ratePercent: input.ratePercent ?? rule?.ratePercent ?? null,
    fixedAmount: input.fixedAmount ?? rule?.fixedAmount ?? null,
    months: input.months ?? rule?.months ?? null,
    baseAmount,
    vatApplicable: input.vatApplicable,
    vatRate,
    minimumAmount: rule?.minimumAmount ?? null,
    overrideExclVat: input.overrideExclVat,
  });

  const row = await db.one<{ id: string; commission_ref: string }>(
    `insert into commissions
       (transaction_id, rental_id, property_id, rule_id, rule_name, basis,
        rate_percent, fixed_amount, months, base_amount,
        calculated_excl_vat, gross_excl_vat, is_overridden, override_reason,
        vat_applicable, vat_rate, vat_amount, gross_incl_vat,
        deductions_total, net_excl_vat, status, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
             0, $19, 'draft', $20, $21, $21)
     returning id, commission_ref`,
    [
      input.transactionId, input.rentalId, basis.propertyId, input.ruleId, rule?.name ?? null,
      input.basis,
      input.ratePercent ?? rule?.ratePercent ?? null,
      input.fixedAmount ?? rule?.fixedAmount ?? null,
      input.months ?? rule?.months ?? null,
      money.normalise(baseAmount),
      calculation.calculatedExclVat, calculation.grossExclVat,
      calculation.isOverridden, calculation.isOverridden ? input.overrideReason : null,
      input.vatApplicable, vatRate, calculation.vatAmount, calculation.grossInclVat,
      calculation.netExclVat, input.notes, ctx.actor.id,
    ],
  );

  await seedSplits(db, ctx, row.id, basis, calculation.netExclVat);

  await note(db, ctx, row.id, 'opened', {
    newStatus: 'draft',
    detail: {
      basis: input.basis,
      baseAmount: money.normalise(baseAmount),
      grossExclVat: calculation.grossExclVat,
      rule: rule?.name ?? null,
    },
  });

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.opened',
    entityType: 'commission',
    entityId: row.id,
    context: {
      commissionRef: row.commission_ref,
      transactionId: input.transactionId,
      rentalId: input.rentalId,
      grossExclVat: calculation.grossExclVat,
    },
  });

  return { id: row.id, commissionRef: row.commission_ref };
}

/**
 * The shares a new commission starts with.
 *
 * Whoever is already on the deal is carried across, because re-typing them
 * is how a sharing agent gets left off. The office's suggested share takes
 * whatever the agents do not, so the shares add up from the first moment.
 */
async function seedSplits(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  basis: DealBasis,
  netExclVat: string,
): Promise<void> {
  const officeSuggestion = await getNumberSetting(db, 'commission.office_share_percent', 50);

  const named = basis.agents.filter((agent) => agent.sharePercent !== null);
  const unnamed = basis.agents.filter((agent) => agent.sharePercent === null);
  const claimed = named.reduce((total, agent) => total + Number(agent.sharePercent ?? 0), 0);

  // What is left for the agents after the office's share, spread evenly
  // between those the deal did not give an explicit share.
  const forAgents = Math.max(0, 100 - officeSuggestion - claimed);
  const each = unnamed.length > 0 ? forAgents / unnamed.length : 0;

  const rows: { agentId: string | null; role: SplitRole; percent: string }[] = [
    ...named.map((agent) => ({
      agentId: agent.agentId,
      role: agent.role,
      percent: String(agent.sharePercent),
    })),
    ...unnamed.map((agent) => ({
      agentId: agent.agentId,
      role: agent.role,
      percent: each.toFixed(3),
    })),
  ];

  const officeShare = Math.max(
    0,
    100 - rows.reduce((total, row) => total + Number(row.percent), 0),
  );
  if (officeShare > 0) {
    rows.push({ agentId: null, role: 'office', percent: officeShare.toFixed(3) });
  }

  if (rows.length === 0) return;

  const amounts = money.apportion(netExclVat, rows.map((row) => row.percent));

  for (const [index, row] of rows.entries()) {
    await db.query(
      `insert into commission_splits
         (commission_id, agent_id, party_name, role, share_percent, amount, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        commissionId,
        row.agentId,
        row.agentId ? null : 'Garden Route Lifestyle Property',
        row.role,
        row.percent,
        amounts[index] ?? '0.00',
        ctx.actor.id,
      ],
    );
  }
}
