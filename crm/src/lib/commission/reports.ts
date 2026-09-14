import type { Db } from '../db.ts';
import * as money from '../money.ts';
import { day } from './records.ts';
import type { CommissionStatus, SplitRole } from './types.ts';

// ---------------------------------------------------------------------
// What the office wants to know (spec 66, 95)
// ---------------------------------------------------------------------

export interface CommissionSummary {
  /** Worked out but not yet approved. Not income. */
  pipelineExclVat: string;
  pipelineCount: number;
  /** Approved, on deals whose transfer has not registered. Still not income. */
  awaitingRegistrationExclVat: string;
  awaitingRegistrationCount: number;
  /** Approved and registered, but not yet recorded as paid. */
  dueExclVat: string;
  dueCount: number;
  /** Recorded as paid by a person. */
  recordedPaidExclVat: string;
  recordedPaidCount: number;
  waitingForApproval: number;
}

/**
 * The four figures kept deliberately apart.
 *
 * Adding them into one "commission earned" number is the error this whole
 * module exists to prevent: money worked out, money approved, money due on
 * a registered transfer and money somebody has recorded as received are
 * four different things (spec 49, 141).
 */
export async function commissionSummary(db: Db): Promise<CommissionSummary> {
  const row = await db.one<{
    pipeline: string | null;
    pipeline_count: number;
    awaiting: string | null;
    awaiting_count: number;
    due: string | null;
    due_count: number;
    paid: string | null;
    paid_count: number;
    waiting: number;
  }>(
    `select
       sum(case when c.status in ('draft','submitted','rejected')
                then c.gross_excl_vat end) as pipeline,
       count(*) filter (where c.status in ('draft','submitted','rejected')) as pipeline_count,
       sum(case when c.status = 'approved' and c.transaction_id is not null
                     and coalesce(t.status, '') <> 'registered'
                then c.gross_excl_vat end) as awaiting,
       count(*) filter (where c.status = 'approved' and c.transaction_id is not null
                          and coalesce(t.status, '') <> 'registered') as awaiting_count,
       sum(case when c.status in ('approved','invoiced')
                     and (c.transaction_id is null or coalesce(t.status, '') = 'registered')
                then c.gross_excl_vat end) as due,
       count(*) filter (where c.status in ('approved','invoiced')
                          and (c.transaction_id is null
                               or coalesce(t.status, '') = 'registered')) as due_count,
       sum(case when c.status = 'paid' then c.gross_excl_vat end) as paid,
       count(*) filter (where c.status = 'paid') as paid_count,
       count(*) filter (where c.status = 'submitted') as waiting
     from commissions c
     left join transactions t on t.id = c.transaction_id`,
  );

  return {
    pipelineExclVat: money.normalise(row.pipeline ?? '0'),
    pipelineCount: Number(row.pipeline_count),
    awaitingRegistrationExclVat: money.normalise(row.awaiting ?? '0'),
    awaitingRegistrationCount: Number(row.awaiting_count),
    dueExclVat: money.normalise(row.due ?? '0'),
    dueCount: Number(row.due_count),
    recordedPaidExclVat: money.normalise(row.paid ?? '0'),
    recordedPaidCount: Number(row.paid_count),
    waitingForApproval: Number(row.waiting),
  };
}

export interface AgentEarnings {
  agentId: string | null;
  agentName: string;
  /** Shares on commissions still being worked out or waiting for approval. */
  pipeline: string;
  /** Shares approved but not yet recorded as paid. */
  approved: string;
  /** Shares on commissions somebody has recorded as paid. */
  recordedPaid: string;
  deals: number;
}

/**
 * What each agent's share comes to, kept in the same three buckets.
 *
 * An agent without DATA_VIEW_ALL sees only their own line, because row
 * level security removes everybody else's splits before this query runs.
 */
export async function earningsByAgent(
  db: Db,
  options: { from?: string; to?: string } = {},
): Promise<AgentEarnings[]> {
  const rows = await db.query<{
    agent_id: string | null;
    agent_name: string | null;
    party_name: string | null;
    pipeline: string | null;
    approved: string | null;
    paid: string | null;
    deals: number;
  }>(
    `select s.agent_id,
            coalesce(u.display_name, u.full_name) as agent_name,
            min(s.party_name) as party_name,
            sum(case when c.status in ('draft','submitted','rejected') then s.amount end) as pipeline,
            sum(case when c.status in ('approved','invoiced') then s.amount end) as approved,
            sum(case when c.status = 'paid' then s.amount end) as paid,
            count(distinct c.id) as deals
       from commission_splits s
       join commissions c on c.id = s.commission_id
       left join users u on u.id = s.agent_id
      where c.status <> 'cancelled'
        and ($1::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) >= $1)
        and ($2::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) <= $2)
      group by s.agent_id, coalesce(u.display_name, u.full_name)
      order by sum(case when c.status = 'paid' then s.amount end) desc nulls last,
               coalesce(u.display_name, u.full_name) nulls last`,
    [options.from ?? null, options.to ?? null],
  );

  return rows.map((row) => ({
    agentId: row.agent_id,
    agentName: row.agent_name ?? row.party_name ?? 'The office',
    pipeline: money.normalise(row.pipeline ?? '0'),
    approved: money.normalise(row.approved ?? '0'),
    recordedPaid: money.normalise(row.paid ?? '0'),
    deals: Number(row.deals),
  }));
}

/** One agent's own statement, which is what an agent actually asks for. */
export async function statementFor(
  db: Db,
  agentId: string,
  options: { from?: string; to?: string } = {},
): Promise<{
  lines: {
    commissionId: string;
    commissionRef: string;
    propertyRef: string;
    propertyLabel: string | null;
    transactionRef: string | null;
    status: CommissionStatus;
    registered: boolean;
    role: SplitRole;
    sharePercent: string;
    amount: string;
    paidOn: string | null;
  }[];
  totals: { pipeline: string; approved: string; recordedPaid: string };
}> {
  const rows = await db.query<{
    commission_id: string;
    commission_ref: string;
    property_ref: string;
    property_label: string | null;
    transaction_ref: string | null;
    status: CommissionStatus;
    transaction_status: string | null;
    role: SplitRole;
    share_percent: string;
    amount: string;
    paid_on: Date | null;
  }>(
    `select c.id as commission_id, c.commission_ref, p.property_ref,
            nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
              as property_label,
            t.transaction_ref, c.status, t.status as transaction_status,
            s.role, s.share_percent, s.amount, c.paid_on
       from commission_splits s
       join commissions c on c.id = s.commission_id
       join properties p on p.id = c.property_id
       left join transactions t on t.id = c.transaction_id
      where s.agent_id = $1
        and c.status <> 'cancelled'
        and ($2::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) >= $2)
        and ($3::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) <= $3)
      order by c.created_at desc`,
    [agentId, options.from ?? null, options.to ?? null],
  );

  const lines = rows.map((row) => ({
    commissionId: row.commission_id,
    commissionRef: row.commission_ref,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    transactionRef: row.transaction_ref,
    status: row.status,
    registered: row.transaction_status === 'registered' || row.transaction_status === null,
    role: row.role,
    sharePercent: row.share_percent,
    amount: row.amount,
    paidOn: day(row.paid_on),
  }));

  const bucket = (statuses: CommissionStatus[]) =>
    money.sum(
      lines.filter((line) => statuses.includes(line.status)).map((line) => line.amount),
    );

  return {
    lines,
    totals: {
      pipeline: bucket(['draft', 'submitted', 'rejected']),
      approved: bucket(['approved', 'invoiced']),
      recordedPaid: bucket(['paid']),
    },
  };
}
