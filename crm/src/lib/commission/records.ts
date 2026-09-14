import { z } from 'zod';
import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import {
  optionalMoney,
  optionalMonths,
  optionalRate,
  optionalText,
  optionalUuid,
} from '../validate.ts';
import {
  COMMISSION_BASES,
  keys,
  type CommissionBasis,
  type CommissionStatus,
  type SplitRole,
} from './types.ts';

// ---------------------------------------------------------------------
// The commission on a deal
// ---------------------------------------------------------------------

export const commissionInputSchema = z
  .object({
    transactionId: optionalUuid,
    rentalId: optionalUuid,
    ruleId: optionalUuid,
    basis: z.enum(keys(COMMISSION_BASES)),
    ratePercent: optionalRate,
    fixedAmount: optionalMoney,
    months: optionalMonths,
    baseAmount: optionalMoney,
    vatApplicable: z.boolean().default(true),
    /** Left blank, the rule's own figure stands. */
    overrideExclVat: optionalMoney,
    overrideReason: optionalText,
    notes: optionalText,
  })
  .superRefine((input, ctx) => {
    if (Boolean(input.transactionId) === Boolean(input.rentalId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['transactionId'],
        message: 'A commission belongs to one sale or one lease, not to both and not to neither.',
      });
    }
    if (!input.baseAmount) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseAmount'],
        message: 'Give the figure the commission is worked out from.',
      });
    }
    if (input.overrideExclVat && !input.overrideReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['overrideReason'],
        message: 'Changing the calculated figure needs a reason, which is kept on the record.',
      });
    }
  });

export type CommissionInput = z.infer<typeof commissionInputSchema>;

export interface CommissionSplit {
  id: string;
  agentId: string | null;
  agentName: string | null;
  partyName: string | null;
  role: SplitRole;
  sharePercent: string;
  amount: string;
  notes: string | null;
}

export interface CommissionDeduction {
  id: string;
  label: string;
  amount: string;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface CommissionRecord {
  id: string;
  commissionRef: string;
  transactionId: string | null;
  transactionRef: string | null;
  transactionStatus: string | null;
  registeredOn: string | null;
  rentalId: string | null;
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;

  ruleId: string | null;
  ruleName: string | null;
  basis: CommissionBasis;
  ratePercent: string | null;
  fixedAmount: string | null;
  months: string | null;

  baseAmount: string;
  calculatedExclVat: string;
  grossExclVat: string;
  isOverridden: boolean;
  overrideReason: string | null;
  vatApplicable: boolean;
  vatRate: string;
  vatAmount: string;
  grossInclVat: string;
  deductionsTotal: string;
  netExclVat: string;

  status: CommissionStatus;
  submittedByName: string | null;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  paidOn: string | null;
  paymentReference: string | null;
  markedPaidByName: string | null;
  markedPaidAt: string | null;
  cancellationReason: string | null;
  notes: string | null;

  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  rowVersion: number;
}

interface CommissionDbRow {
  id: string;
  commission_ref: string;
  transaction_id: string | null;
  transaction_ref: string | null;
  transaction_status: string | null;
  registered_on: Date | null;
  rental_id: string | null;
  property_id: string;
  property_ref: string;
  property_label: string | null;
  rule_id: string | null;
  rule_name: string | null;
  basis: CommissionBasis;
  rate_percent: string | null;
  fixed_amount: string | null;
  months: string | null;
  base_amount: string;
  calculated_excl_vat: string;
  gross_excl_vat: string;
  is_overridden: boolean;
  override_reason: string | null;
  vat_applicable: boolean;
  vat_rate: string;
  vat_amount: string;
  gross_incl_vat: string;
  deductions_total: string;
  net_excl_vat: string;
  status: CommissionStatus;
  submitted_by_name: string | null;
  submitted_at: Date | null;
  approved_by_name: string | null;
  approved_at: Date | null;
  approval_note: string | null;
  rejected_by_name: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  paid_on: Date | null;
  payment_reference: string | null;
  marked_paid_by_name: string | null;
  marked_paid_at: Date | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
  created_by_name: string | null;
  row_version: number;
}

const COMMISSION_SQL = `
  select c.*,
         t.transaction_ref,
         t.status as transaction_status,
         t.actual_registration_date as registered_on,
         p.property_ref,
         nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
           as property_label,
         coalesce(sb.display_name, sb.full_name) as submitted_by_name,
         coalesce(ab.display_name, ab.full_name) as approved_by_name,
         coalesce(rb.display_name, rb.full_name) as rejected_by_name,
         coalesce(pb.display_name, pb.full_name) as marked_paid_by_name,
         coalesce(cb.display_name, cb.full_name) as created_by_name
    from commissions c
    join properties p on p.id = c.property_id
    left join transactions t on t.id = c.transaction_id
    left join users sb on sb.id = c.submitted_by
    left join users ab on ab.id = c.approved_by
    left join users rb on rb.id = c.rejected_by
    left join users pb on pb.id = c.marked_paid_by
    left join users cb on cb.id = c.created_by`;

/** A date column as the plain 'YYYY-MM-DD' the forms and the screen use. */
export const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;

function toCommission(row: CommissionDbRow): CommissionRecord {
  return {
    id: row.id,
    commissionRef: row.commission_ref,
    transactionId: row.transaction_id,
    transactionRef: row.transaction_ref,
    transactionStatus: row.transaction_status,
    registeredOn: day(row.registered_on),
    rentalId: row.rental_id,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    basis: row.basis,
    ratePercent: row.rate_percent,
    fixedAmount: row.fixed_amount,
    months: row.months,
    baseAmount: row.base_amount,
    calculatedExclVat: row.calculated_excl_vat,
    grossExclVat: row.gross_excl_vat,
    isOverridden: row.is_overridden,
    overrideReason: row.override_reason,
    vatApplicable: row.vat_applicable,
    vatRate: row.vat_rate,
    vatAmount: row.vat_amount,
    grossInclVat: row.gross_incl_vat,
    deductionsTotal: row.deductions_total,
    netExclVat: row.net_excl_vat,
    status: row.status,
    submittedByName: row.submitted_by_name,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvalNote: row.approval_note,
    rejectedByName: row.rejected_by_name,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason,
    invoiceNumber: row.invoice_number,
    invoiceDate: day(row.invoice_date),
    paidOn: day(row.paid_on),
    paymentReference: row.payment_reference,
    markedPaidByName: row.marked_paid_by_name,
    markedPaidAt: row.marked_paid_at?.toISOString() ?? null,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    createdById: row.created_by,
    createdByName: row.created_by_name,
    rowVersion: row.row_version,
  };
}

export interface CommissionListFilters {
  status?: string;
  agentId?: string;
  propertyId?: string;
  from?: string;
  to?: string;
  search?: string;
  /** Only those whose transfer has not registered, which is what is at risk. */
  unregisteredOnly?: boolean;
  limit?: number;
}

export async function listCommissions(
  db: Db,
  filters: CommissionListFilters = {},
): Promise<CommissionRecord[]> {
  const rows = await db.query<CommissionDbRow>(
    `${COMMISSION_SQL}
      where ($1::text is null or c.status = $1)
        and ($2::uuid is null or exists (
              select 1 from commission_splits s
               where s.commission_id = c.id and s.agent_id = $2))
        and ($3::uuid is null or c.property_id = $3)
        and ($4::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) >= $4)
        and ($5::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) <= $5)
        and ($6::text is null
             or c.commission_ref ilike '%' || $6 || '%'
             or t.transaction_ref ilike '%' || $6 || '%'
             or p.property_ref ilike '%' || $6 || '%'
             or p.street_address ilike '%' || $6 || '%')
        and (not $7::boolean
             or (c.transaction_id is not null and coalesce(t.status, '') <> 'registered'))
      order by c.created_at desc
      limit $8`,
    [
      filters.status ?? null,
      filters.agentId ?? null,
      filters.propertyId ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.search ?? null,
      filters.unregisteredOnly ?? false,
      Math.min(filters.limit ?? 100, 500),
    ],
  );
  return rows.map(toCommission);
}

export async function getCommission(db: Db, id: string): Promise<CommissionRecord | null> {
  const row = await db.maybeOne<CommissionDbRow>(`${COMMISSION_SQL} where c.id = $1`, [id]);
  return row ? toCommission(row) : null;
}

export async function commissionFor(
  db: Db,
  deal: { transactionId?: string; rentalId?: string },
): Promise<CommissionRecord | null> {
  const column = deal.transactionId ? 'transaction_id' : 'rental_id';
  const id = deal.transactionId ?? deal.rentalId;
  if (!id) return null;
  const row = await db.maybeOne<CommissionDbRow>(`${COMMISSION_SQL} where c.${column} = $1`, [id]);
  return row ? toCommission(row) : null;
}

export async function listSplits(db: Db, commissionId: string): Promise<CommissionSplit[]> {
  const rows = await db.query<{
    id: string;
    agent_id: string | null;
    agent_name: string | null;
    party_name: string | null;
    role: SplitRole;
    share_percent: string;
    amount: string;
    notes: string | null;
  }>(
    `select s.id, s.agent_id, coalesce(u.display_name, u.full_name) as agent_name,
            s.party_name, s.role, s.share_percent, s.amount, s.notes
       from commission_splits s
       left join users u on u.id = s.agent_id
      where s.commission_id = $1
      order by case s.role when 'primary' then 1 when 'sharing' then 2
                           when 'referral' then 3 when 'introducer' then 4 else 5 end,
               s.share_percent desc`,
    [commissionId],
  );
  return rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    partyName: row.party_name,
    role: row.role,
    sharePercent: row.share_percent,
    amount: row.amount,
    notes: row.notes,
  }));
}

export async function listDeductions(
  db: Db,
  commissionId: string,
): Promise<CommissionDeduction[]> {
  const rows = await db.query<{
    id: string;
    label: string;
    amount: string;
    note: string | null;
    created_at: Date;
    created_by_name: string | null;
  }>(
    `select d.id, d.label, d.amount, d.note, d.created_at,
            coalesce(u.display_name, u.full_name) as created_by_name
       from commission_deductions d
       left join users u on u.id = d.created_by
      where d.commission_id = $1
      order by d.created_at`,
    [commissionId],
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    amount: row.amount,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
  }));
}

export interface CommissionHistoryEntry {
  event: string;
  oldStatus: string | null;
  newStatus: string | null;
  detail: Record<string, unknown> | null;
  reason: string | null;
  changedAt: string;
  changedByName: string | null;
}

export async function commissionHistory(
  db: Db,
  commissionId: string,
): Promise<CommissionHistoryEntry[]> {
  const rows = await db.query<{
    event: string;
    old_status: string | null;
    new_status: string | null;
    detail: Record<string, unknown> | null;
    reason: string | null;
    changed_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.event, h.old_status, h.new_status, h.detail, h.reason, h.changed_at,
            coalesce(u.display_name, u.full_name) as changed_by_name
       from commission_history h
       left join users u on u.id = h.changed_by
      where h.commission_id = $1
      order by h.changed_at desc, h.id desc`,
    [commissionId],
  );
  return rows.map((row) => ({
    event: row.event,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    detail: row.detail,
    reason: row.reason,
    changedAt: row.changed_at.toISOString(),
    changedByName: row.changed_by_name,
  }));
}

/**
 * One line in the record of what has happened to a commission.
 *
 * The history table refuses updates and deletes, so anything written here
 * is permanent (spec 104). Figures and names only: nothing sensitive
 * belongs in it (spec 15).
 */
export async function note(
  db: Db,
  ctx: Ctx,
  commissionId: string,
  event: string,
  fields: {
    oldStatus?: string | null;
    newStatus?: string | null;
    detail?: Record<string, unknown> | null;
    reason?: string | null;
  } = {},
): Promise<void> {
  await db.query(
    `insert into commission_history
       (commission_id, event, old_status, new_status, detail, reason, changed_by)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [
      commissionId,
      event,
      fields.oldStatus ?? null,
      fields.newStatus ?? null,
      fields.detail ? JSON.stringify(fields.detail) : null,
      fields.reason ?? null,
      ctx.actor.id,
    ],
  );
}
