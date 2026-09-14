import { z } from 'zod';
import { agentToKeep, type Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from './errors.ts';
import {
  FINANCE_STATUSES,
  INTEREST_LEVELS,
  OFFER_STATUSES,
  OPEN_TRANSACTION_STATUSES,
  TRANSACTION_AGENT_ROLES,
  TRANSACTION_STATUSES,
  VALUATION_STATUSES,
  VIEWING_OUTCOMES,
  type FinanceStatus,
  type InterestLevel,
  type OfferStatus,
  type TransactionStatus,
  type ValuationStatus,
  type ViewingOutcome,
} from './domain.ts';
import {
  optionalDate,
  optionalDateTime,
  optionalMoney,
  optionalText,
  optionalUuid,
} from './validate.ts';

/**
 * Viewings, valuations, offers and transactions (spec 46 to 49).
 *
 * The rule the whole module protects is spec 49: a concluded sale is not a
 * registered one. They are separate dates and separate statuses, and the
 * database refuses to record 'registered' without a registration date, so
 * the distinction cannot be lost by a careless click.
 *
 * Offers are never overwritten either. A counter offer is a new row pointing
 * back at the one it answers, so the negotiation stays readable.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

// ---------------------------------------------------------------------------
// Viewings and feedback (spec 46)
// ---------------------------------------------------------------------------

export const viewingInputSchema = z.object({
  propertyId: z.uuid('Which property was viewed?'),
  personId: optionalUuid,
  leadId: optionalUuid,
  appointmentId: optionalUuid,
  agentId: optionalUuid,
  viewedAt: optionalDateTime,
  notes: optionalText,
});
export type ViewingInput = z.infer<typeof viewingInputSchema>;

export const viewingFeedbackInputSchema = z.object({
  outcome: z
    .union([z.enum(keys(VIEWING_OUTCOMES)), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  interestLevel: z
    .union([z.enum(keys(INTEREST_LEVELS)), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  objections: optionalText,
  nextAction: optionalText,
  followUpDate: optionalDate,
});
export type ViewingFeedbackInput = z.infer<typeof viewingFeedbackInputSchema>;

export interface ViewingSummary {
  id: string;
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;
  personId: string | null;
  personName: string | null;
  leadId: string | null;
  agentId: string | null;
  agentName: string | null;
  viewedAt: string;
  notes: string | null;
  feedback: {
    outcome: ViewingOutcome | null;
    interestLevel: InterestLevel | null;
    objections: string | null;
    nextAction: string | null;
    followUpDate: string | null;
    recordedByName: string | null;
    recordedAt: string;
  } | null;
}

const VIEWING_SQL = `
  select v.id, v.property_id, v.person_id, v.lead_id, v.agent_id, v.viewed_at, v.notes,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         pe.first_name || ' ' || pe.surname as person_name,
         coalesce(ag.display_name, ag.full_name) as agent_name,
         f.outcome, f.interest_level, f.objections, f.next_action, f.follow_up_date,
         f.recorded_at, coalesce(fu.display_name, fu.full_name) as recorded_by_name
    from viewings v
    join properties pr on pr.id = v.property_id
    left join people pe on pe.id = v.person_id
    left join users ag on ag.id = v.agent_id
    left join viewing_feedback f on f.viewing_id = v.id
    left join users fu on fu.id = f.recorded_by
`;

interface ViewingRow {
  id: string;
  property_id: string;
  property_ref: string;
  property_label: string | null;
  person_id: string | null;
  person_name: string | null;
  lead_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  viewed_at: Date;
  notes: string | null;
  outcome: ViewingOutcome | null;
  interest_level: InterestLevel | null;
  objections: string | null;
  next_action: string | null;
  follow_up_date: Date | null;
  recorded_at: Date | null;
  recorded_by_name: string | null;
}

function toViewing(row: ViewingRow): ViewingSummary {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    personId: row.person_id,
    personName: row.person_name,
    leadId: row.lead_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    viewedAt: row.viewed_at.toISOString(),
    notes: row.notes,
    feedback: row.recorded_at
      ? {
          outcome: row.outcome,
          interestLevel: row.interest_level,
          objections: row.objections,
          nextAction: row.next_action,
          followUpDate: row.follow_up_date?.toISOString().slice(0, 10) ?? null,
          recordedByName: row.recorded_by_name,
          recordedAt: row.recorded_at.toISOString(),
        }
      : null,
  };
}

export async function listViewings(
  db: Db,
  filters: {
    propertyId?: string;
    personId?: string;
    agentId?: string | null;
    from?: string;
    to?: string;
    withoutFeedback?: boolean;
    limit?: number;
  },
): Promise<ViewingSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.propertyId) where.push(`v.property_id = ${add(filters.propertyId)}`);
  if (filters.personId) where.push(`v.person_id = ${add(filters.personId)}`);
  if (filters.agentId) where.push(`v.agent_id = ${add(filters.agentId)}`);
  if (filters.from) where.push(`v.viewed_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`v.viewed_at < ${add(filters.to)}`);
  if (filters.withoutFeedback) where.push('f.viewing_id is null');

  const rows = await db.query<ViewingRow>(
    `${VIEWING_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by v.viewed_at desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toViewing);
}

export async function getViewing(db: Db, id: string): Promise<ViewingSummary | null> {
  const row = await db.maybeOne<ViewingRow>(`${VIEWING_SQL} where v.id = $1`, [id]);
  return row ? toViewing(row) : null;
}

export async function recordViewing(
  db: Db,
  ctx: Ctx,
  input: ViewingInput,
): Promise<{ id: string }> {
  const row = await db.one<{ id: string }>(
    `insert into viewings
       (property_id, person_id, lead_id, appointment_id, agent_id, viewed_at, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7,$8,$8)
     returning id`,
    [
      input.propertyId, input.personId, input.leadId, input.appointmentId,
      input.agentId ?? ctx.actor.id, input.viewedAt, input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'viewing.recorded',
    entityType: 'property',
    entityId: input.propertyId,
    context: { viewingId: row.id, personId: input.personId },
  });
  return { id: row.id };
}

/**
 * Viewing feedback, and the follow-up it implies.
 *
 * If the client named a follow-up date, a task is created for it, because a
 * date in a note nobody looks at is not a follow-up.
 */
export async function saveViewingFeedback(
  db: Db,
  ctx: Ctx,
  viewingId: string,
  input: ViewingFeedbackInput,
): Promise<void> {
  const viewing = await db.maybeOne<{
    property_id: string;
    person_id: string | null;
    lead_id: string | null;
    agent_id: string | null;
  }>('select property_id, person_id, lead_id, agent_id from viewings where id = $1', [viewingId]);
  if (!viewing) throw new NotFoundError('That viewing');

  const updated = await db.count(
    `update viewing_feedback
        set outcome=$2, interest_level=$3, objections=$4, next_action=$5, follow_up_date=$6,
            recorded_at=now(), recorded_by=$7
      where viewing_id=$1`,
    [
      viewingId, input.outcome, input.interestLevel, input.objections,
      input.nextAction, input.followUpDate, ctx.actor.id,
    ],
  );
  if (updated === 0) {
    await db.query(
      `insert into viewing_feedback
         (viewing_id, outcome, interest_level, objections, next_action, follow_up_date, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        viewingId, input.outcome, input.interestLevel, input.objections,
        input.nextAction, input.followUpDate, ctx.actor.id,
      ],
    );
  }

  if (input.followUpDate) {
    await db.query(
      `insert into tasks
         (assigned_user_id, person_id, property_id, lead_id, task_type, title, due_at,
          priority, notes, created_by, updated_by)
       values ($1,$2,$3,$4,'follow_up',$5,$6::date,'normal',$7,$1,$1)`,
      [
        viewing.agent_id ?? ctx.actor.id,
        viewing.person_id,
        viewing.property_id,
        viewing.lead_id,
        input.nextAction ?? 'Follow up after the viewing',
        input.followUpDate,
        input.objections,
      ],
    );
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'viewing.feedback_recorded',
    entityType: 'property',
    entityId: viewing.property_id,
    context: {
      viewingId,
      interestLevel: input.interestLevel,
      outcome: input.outcome,
      followUpCreated: Boolean(input.followUpDate),
    },
  });
}

// ---------------------------------------------------------------------------
// Valuations (spec 47)
// ---------------------------------------------------------------------------

export const valuationInputSchema = z.object({
  propertyId: optionalUuid,
  ownerId: optionalUuid,
  leadId: optionalUuid,
  appointmentId: optionalUuid,
  agentId: optionalUuid,
  requestDate: optionalDate,
  estimatedValue: optionalMoney,
  recommendedAskingPrice: optionalMoney,
  outcome: optionalText,
  status: z.enum(keys(VALUATION_STATUSES)).default('requested'),
  followUpDate: optionalDate,
  notes: optionalText,
});
export type ValuationInput = z.infer<typeof valuationInputSchema>;

export interface ValuationSummary {
  id: string;
  propertyId: string | null;
  propertyRef: string | null;
  propertyLabel: string | null;
  ownerId: string | null;
  ownerName: string | null;
  agentId: string | null;
  agentName: string | null;
  requestDate: string;
  estimatedValue: string | null;
  recommendedAskingPrice: string | null;
  outcome: string | null;
  status: ValuationStatus;
  followUpDate: string | null;
  notes: string | null;
  rowVersion: number;
}

const VALUATION_SQL = `
  select v.id, v.property_id, v.owner_id, v.agent_id, v.request_date, v.estimated_value,
         v.recommended_asking_price, v.outcome, v.status, v.follow_up_date, v.notes,
         v.row_version,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         pe.first_name || ' ' || pe.surname as owner_name,
         coalesce(ag.display_name, ag.full_name) as agent_name
    from valuations v
    left join properties pr on pr.id = v.property_id
    left join people pe on pe.id = v.owner_id
    left join users ag on ag.id = v.agent_id
`;

interface ValuationRow {
  id: string;
  property_id: string | null;
  property_ref: string | null;
  property_label: string | null;
  owner_id: string | null;
  owner_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  request_date: Date;
  estimated_value: string | null;
  recommended_asking_price: string | null;
  outcome: string | null;
  status: ValuationStatus;
  follow_up_date: Date | null;
  notes: string | null;
  row_version: number;
}

function toValuation(row: ValuationRow): ValuationSummary {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    agentId: row.agent_id,
    agentName: row.agent_name,
    requestDate: row.request_date.toISOString().slice(0, 10),
    estimatedValue: row.estimated_value,
    recommendedAskingPrice: row.recommended_asking_price,
    outcome: row.outcome,
    status: row.status,
    followUpDate: row.follow_up_date?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    rowVersion: row.row_version,
  };
}

export async function listValuations(
  db: Db,
  filters: {
    propertyId?: string;
    ownerId?: string;
    agentId?: string | null;
    status?: string;
    limit?: number;
  },
): Promise<ValuationSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.propertyId) where.push(`v.property_id = ${add(filters.propertyId)}`);
  if (filters.ownerId) where.push(`v.owner_id = ${add(filters.ownerId)}`);
  if (filters.agentId) where.push(`v.agent_id = ${add(filters.agentId)}`);
  if (filters.status && filters.status !== 'all') where.push(`v.status = ${add(filters.status)}`);

  const rows = await db.query<ValuationRow>(
    `${VALUATION_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by v.request_date desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toValuation);
}

export async function getValuation(db: Db, id: string): Promise<ValuationSummary | null> {
  const row = await db.maybeOne<ValuationRow>(`${VALUATION_SQL} where v.id = $1`, [id]);
  return row ? toValuation(row) : null;
}

export async function createValuation(
  db: Db,
  ctx: Ctx,
  input: ValuationInput,
): Promise<{ id: string }> {
  const row = await db.one<{ id: string }>(
    `insert into valuations
       (property_id, owner_id, lead_id, appointment_id, agent_id, request_date,
        estimated_value, recommended_asking_price, outcome, status, follow_up_date, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,coalesce($6::date, current_date),$7,$8,$9,$10,$11,$12,$13,$13)
     returning id`,
    [
      input.propertyId, input.ownerId, input.leadId, input.appointmentId,
      input.agentId ?? ctx.actor.id, input.requestDate, input.estimatedValue,
      input.recommendedAskingPrice, input.outcome, input.status, input.followUpDate,
      input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'valuation.created',
    entityType: 'valuation',
    entityId: row.id,
    context: { propertyId: input.propertyId, status: input.status },
  });
  return { id: row.id };
}

export async function updateValuation(
  db: Db,
  ctx: Ctx,
  valuationId: string,
  input: ValuationInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from valuations where id = $1',
    [valuationId],
  );
  if (!before) throw new NotFoundError('That valuation');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const agentId = agentToKeep(ctx.actor, input.agentId, before.agent_id as string | null);

  const updated = await db.query<Record<string, unknown>>(
    `update valuations set
        property_id=$2, owner_id=$3, lead_id=$4, appointment_id=$5, agent_id=$6,
        request_date=coalesce($7::date, request_date), estimated_value=$8,
        recommended_asking_price=$9, outcome=$10, status=$11, follow_up_date=$12, notes=$13,
        updated_by=$14
      where id=$1 and row_version=$15
      returning *`,
    [
      valuationId, input.propertyId, input.ownerId, input.leadId, input.appointmentId,
      agentId, input.requestDate, input.estimatedValue, input.recommendedAskingPrice,
      input.outcome, input.status, input.followUpDate, input.notes,
      ctx.actor.id, expectedVersion,
    ],
  );
  if (!updated[0]) throw new ConcurrencyError();

  const changes = diff(before, updated[0], [
    'property_id', 'owner_id', 'agent_id', 'estimated_value', 'recommended_asking_price',
    'outcome', 'status', 'follow_up_date', 'notes',
  ]);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'valuation.updated',
      entityType: 'valuation',
      entityId: valuationId,
      changes,
    });
  }
}

// ---------------------------------------------------------------------------
// Offers (spec 48)
// ---------------------------------------------------------------------------

export const offerInputSchema = z.object({
  propertyId: z.uuid('Which property is the offer on?'),
  buyerId: optionalUuid,
  sellerId: optionalUuid,
  agentId: optionalUuid,
  leadId: optionalUuid,
  transactionId: optionalUuid,
  amount: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const cleaned = String(value).replace(/[\s,R]/g, '');
      if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
      return cleaned;
    })
    .refine((value) => !Number.isNaN(value), {
      message: 'Enter the offer amount, for example 2750000.',
    }) as unknown as z.ZodType<string>,
  offerDate: optionalDate,
  conditions: optionalText,
  financeStatus: z.enum(keys(FINANCE_STATUSES)).default('not_applicable'),
  deposit: optionalMoney,
  expiresAt: optionalDate,
  status: z.enum(keys(OFFER_STATUSES)).default('submitted'),
  counterOfferOf: optionalUuid,
  notes: optionalText,
});
export type OfferInput = z.infer<typeof offerInputSchema>;

export interface OfferSummary {
  id: string;
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;
  buyerId: string | null;
  buyerName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  agentId: string | null;
  agentName: string | null;
  transactionId: string | null;
  transactionRef: string | null;
  amount: string;
  offerDate: string;
  conditions: string | null;
  financeStatus: FinanceStatus;
  deposit: string | null;
  expiresAt: string | null;
  status: OfferStatus;
  counterOfferOf: string | null;
  acceptanceDate: string | null;
  rejectionDate: string | null;
  notes: string | null;
  rowVersion: number;
}

const OFFER_SQL = `
  select o.id, o.property_id, o.buyer_id, o.seller_id, o.agent_id, o.transaction_id,
         o.amount, o.offer_date, o.conditions, o.finance_status, o.deposit, o.expires_at,
         o.status, o.counter_offer_of, o.acceptance_date, o.rejection_date, o.notes,
         o.row_version,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         b.first_name || ' ' || b.surname as buyer_name,
         s.first_name || ' ' || s.surname as seller_name,
         coalesce(ag.display_name, ag.full_name) as agent_name,
         tr.transaction_ref
    from offers o
    join properties pr on pr.id = o.property_id
    left join people b on b.id = o.buyer_id
    left join people s on s.id = o.seller_id
    left join users ag on ag.id = o.agent_id
    left join transactions tr on tr.id = o.transaction_id
`;

interface OfferRow {
  id: string;
  property_id: string;
  property_ref: string;
  property_label: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  transaction_id: string | null;
  transaction_ref: string | null;
  amount: string;
  offer_date: Date;
  conditions: string | null;
  finance_status: FinanceStatus;
  deposit: string | null;
  expires_at: Date | null;
  status: OfferStatus;
  counter_offer_of: string | null;
  acceptance_date: Date | null;
  rejection_date: Date | null;
  notes: string | null;
  row_version: number;
}

function toOffer(row: OfferRow): OfferSummary {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    agentId: row.agent_id,
    agentName: row.agent_name,
    transactionId: row.transaction_id,
    transactionRef: row.transaction_ref,
    amount: row.amount,
    offerDate: row.offer_date.toISOString().slice(0, 10),
    conditions: row.conditions,
    financeStatus: row.finance_status,
    deposit: row.deposit,
    expiresAt: row.expires_at?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    counterOfferOf: row.counter_offer_of,
    acceptanceDate: row.acceptance_date?.toISOString().slice(0, 10) ?? null,
    rejectionDate: row.rejection_date?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    rowVersion: row.row_version,
  };
}

export async function listOffers(
  db: Db,
  filters: {
    propertyId?: string;
    buyerId?: string;
    agentId?: string | null;
    status?: string;
    transactionId?: string;
    limit?: number;
  },
): Promise<OfferSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.propertyId) where.push(`o.property_id = ${add(filters.propertyId)}`);
  if (filters.buyerId) where.push(`o.buyer_id = ${add(filters.buyerId)}`);
  if (filters.agentId) where.push(`o.agent_id = ${add(filters.agentId)}`);
  if (filters.status && filters.status !== 'all') where.push(`o.status = ${add(filters.status)}`);
  if (filters.transactionId) where.push(`o.transaction_id = ${add(filters.transactionId)}`);

  const rows = await db.query<OfferRow>(
    `${OFFER_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by o.offer_date desc, o.created_at desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toOffer);
}

export async function getOffer(db: Db, id: string): Promise<OfferSummary | null> {
  const row = await db.maybeOne<OfferRow>(`${OFFER_SQL} where o.id = $1`, [id]);
  return row ? toOffer(row) : null;
}

export async function createOffer(db: Db, ctx: Ctx, input: OfferInput): Promise<{ id: string }> {
  requireStatusDates(input);

  const row = await db.one<{ id: string }>(
    `insert into offers
       (property_id, buyer_id, seller_id, agent_id, lead_id, transaction_id, amount,
        offer_date, conditions, finance_status, deposit, expires_at, status,
        counter_offer_of, acceptance_date, rejection_date, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::date, current_date),$9,$10,$11,$12,$13,$14,
             case when $13 = 'accepted' then coalesce($8::date, current_date) end,
             case when $13 = 'rejected' then coalesce($8::date, current_date) end,
             $15,$16,$16)
     returning id`,
    [
      input.propertyId, input.buyerId, input.sellerId, input.agentId ?? ctx.actor.id,
      input.leadId, input.transactionId, input.amount, input.offerDate, input.conditions,
      input.financeStatus, input.deposit, input.expiresAt, input.status,
      input.counterOfferOf, input.notes, ctx.actor.id,
    ],
  );

  // An offer on a property moves the sales pipeline along with it.
  await db.query(
    `update properties set sales_status = 'offer_received', updated_by = $2
      where id = $1 and sales_status in ('prospect','active','on_market','viewing')`,
    [input.propertyId, ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'offer.created',
    entityType: 'offer',
    entityId: row.id,
    context: {
      propertyId: input.propertyId,
      amount: input.amount,
      status: input.status,
      counterOfferOf: input.counterOfferOf,
    },
  });
  return { id: row.id };
}

function requireStatusDates(input: OfferInput): void {
  if (input.status === 'counter_offer' && !input.counterOfferOf) {
    throw new ValidationError(
      { counterOfferOf: ['Say which offer this is a counter to, so the history stays readable.'] },
      'Say which offer this counter offer answers.',
    );
  }
}

/**
 * Changes an offer's status.
 *
 * Accepting or rejecting stamps the date the database insists on, and
 * accepting an offer never edits the earlier ones: they keep their own
 * status and their own history (spec 48).
 */
export async function setOfferStatus(
  db: Db,
  ctx: Ctx,
  offerId: string,
  input: { status: OfferStatus; date: string | null; notes: string | null },
): Promise<void> {
  const before = await db.maybeOne<{ status: string; property_id: string; amount: string }>(
    'select status, property_id, amount from offers where id = $1',
    [offerId],
  );
  if (!before) throw new NotFoundError('That offer');

  await db.query(
    `update offers set status = $2,
            acceptance_date = case when $2 = 'accepted'
                                   then coalesce($3::date, current_date) else acceptance_date end,
            rejection_date = case when $2 = 'rejected'
                                  then coalesce($3::date, current_date) else rejection_date end,
            notes = coalesce($4, notes),
            updated_by = $5
      where id = $1`,
    [offerId, input.status, input.date, input.notes, ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'offer.status_changed',
    entityType: 'offer',
    entityId: offerId,
    changes: { status: { from: before.status, to: input.status } },
    context: { propertyId: before.property_id, amount: before.amount },
  });
}

export async function updateOffer(
  db: Db,
  ctx: Ctx,
  offerId: string,
  input: OfferInput,
  expectedVersion: number,
): Promise<void> {
  requireStatusDates(input);
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from offers where id = $1',
    [offerId],
  );
  if (!before) throw new NotFoundError('That offer');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const agentId = agentToKeep(ctx.actor, input.agentId, before.agent_id as string | null);

  const updated = await db.query<Record<string, unknown>>(
    `update offers set
        buyer_id=$2, seller_id=$3, agent_id=$4, lead_id=$5, transaction_id=$6, amount=$7,
        offer_date=coalesce($8::date, offer_date), conditions=$9, finance_status=$10,
        deposit=$11, expires_at=$12, status=$13, counter_offer_of=$14, notes=$15,
        acceptance_date = case when $13 = 'accepted'
                               then coalesce(acceptance_date, current_date) else null end,
        rejection_date = case when $13 = 'rejected'
                              then coalesce(rejection_date, current_date) else null end,
        updated_by=$16
      where id=$1 and row_version=$17
      returning *`,
    [
      offerId, input.buyerId, input.sellerId, agentId, input.leadId, input.transactionId,
      input.amount, input.offerDate, input.conditions, input.financeStatus, input.deposit,
      input.expiresAt, input.status, input.counterOfferOf, input.notes,
      ctx.actor.id, expectedVersion,
    ],
  );
  if (!updated[0]) throw new ConcurrencyError();

  const changes = diff(before, updated[0], [
    'buyer_id', 'seller_id', 'agent_id', 'amount', 'offer_date', 'conditions',
    'finance_status', 'deposit', 'expires_at', 'status', 'notes',
  ]);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'offer.updated',
      entityType: 'offer',
      entityId: offerId,
      changes,
    });
  }
}

// ---------------------------------------------------------------------------
// Transactions (spec 49)
// ---------------------------------------------------------------------------

export const transactionInputSchema = z
  .object({
    propertyId: z.uuid('Which property is being sold?'),
    buyerId: optionalUuid,
    sellerId: optionalUuid,
    offerId: optionalUuid,
    leadId: optionalUuid,
    transactionValue: optionalMoney,
    saleDate: optionalDate,
    expectedRegistrationDate: optionalDate,
    actualRegistrationDate: optionalDate,
    conditions: optionalText,
    financeStatus: z.enum(keys(FINANCE_STATUSES)).default('not_applicable'),
    legalStatus: optionalText,
    conveyancer: optionalText,
    status: z.enum(keys(TRANSACTION_STATUSES)).default('draft'),
    cancellationReason: optionalText,
    notes: optionalText,
    statusChangeReason: optionalText,
  })
  .superRefine((input, ctx) => {
    // The rule spec 49 exists for, checked before it ever reaches SQL so the
    // message names the actual problem.
    if (input.status === 'registered' && !input.actualRegistrationDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['actualRegistrationDate'],
        message:
          'A transaction is only registered once it has a registration date. Concluded is not registered.',
      });
    }
    if (
      input.actualRegistrationDate &&
      input.saleDate &&
      input.actualRegistrationDate < input.saleDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['actualRegistrationDate'],
        message: 'Registration cannot be before the sale date.',
      });
    }
    if (['cancelled', 'failed'].includes(input.status) && !input.cancellationReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['cancellationReason'],
        message: 'Say why the transaction did not go through.',
      });
    }
  });
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export interface TransactionSummary {
  id: string;
  transactionRef: string;
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;
  buyerId: string | null;
  buyerName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  transactionValue: string | null;
  saleDate: string | null;
  expectedRegistrationDate: string | null;
  actualRegistrationDate: string | null;
  status: TransactionStatus;
  financeStatus: FinanceStatus;
  legalStatus: string | null;
  conveyancer: string | null;
  conditions: string | null;
  cancellationReason: string | null;
  notes: string | null;
  agents: { agentId: string; agentName: string; role: string; sharePercent: string | null }[];
  rowVersion: number;
  /** True once the deal is concluded but registration has not happened yet. */
  awaitingRegistration: boolean;
}

const TRANSACTION_SQL = `
  select t.id, t.transaction_ref, t.property_id, t.buyer_id, t.seller_id,
         t.transaction_value, t.sale_date, t.expected_registration_date,
         t.actual_registration_date, t.status, t.finance_status, t.legal_status,
         t.conveyancer, t.conditions, t.cancellation_reason, t.notes, t.row_version,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         b.first_name || ' ' || b.surname as buyer_name,
         s.first_name || ' ' || s.surname as seller_name,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'agentId', ta.agent_id,
                     'agentName', coalesce(u.display_name, u.full_name),
                     'role', ta.role,
                     'sharePercent', ta.share_percent) order by ta.role)
              from transaction_agents ta join users u on u.id = ta.agent_id
             where ta.transaction_id = t.id),
           '[]'::jsonb) as agents
    from transactions t
    join properties pr on pr.id = t.property_id
    left join people b on b.id = t.buyer_id
    left join people s on s.id = t.seller_id
`;

interface TransactionRow {
  id: string;
  transaction_ref: string;
  property_id: string;
  property_ref: string;
  property_label: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  transaction_value: string | null;
  sale_date: Date | null;
  expected_registration_date: Date | null;
  actual_registration_date: Date | null;
  status: TransactionStatus;
  finance_status: FinanceStatus;
  legal_status: string | null;
  conveyancer: string | null;
  conditions: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  agents: { agentId: string; agentName: string; role: string; sharePercent: string | null }[];
  row_version: number;
}

function toTransaction(row: TransactionRow): TransactionSummary {
  return {
    id: row.id,
    transactionRef: row.transaction_ref,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    transactionValue: row.transaction_value,
    saleDate: row.sale_date?.toISOString().slice(0, 10) ?? null,
    expectedRegistrationDate: row.expected_registration_date?.toISOString().slice(0, 10) ?? null,
    actualRegistrationDate: row.actual_registration_date?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    financeStatus: row.finance_status,
    legalStatus: row.legal_status,
    conveyancer: row.conveyancer,
    conditions: row.conditions,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    agents: row.agents ?? [],
    rowVersion: row.row_version,
    awaitingRegistration:
      ['sale_concluded', 'awaiting_registration'].includes(row.status) &&
      row.actual_registration_date === null,
  };
}

export async function listTransactions(
  db: Db,
  filters: {
    propertyId?: string;
    personId?: string;
    agentId?: string | null;
    status?: string;
    openOnly?: boolean;
    awaitingRegistration?: boolean;
    from?: string;
    to?: string;
    limit?: number;
  },
): Promise<TransactionSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.propertyId) where.push(`t.property_id = ${add(filters.propertyId)}`);
  if (filters.personId) {
    const value = add(filters.personId);
    where.push(`(t.buyer_id = ${value} or t.seller_id = ${value})`);
  }
  if (filters.agentId) {
    where.push(
      `exists (select 1 from transaction_agents ta where ta.transaction_id = t.id and ta.agent_id = ${add(filters.agentId)})`,
    );
  }
  if (filters.status && filters.status !== 'all') where.push(`t.status = ${add(filters.status)}`);
  if (filters.openOnly) where.push(`t.status = any(${add(OPEN_TRANSACTION_STATUSES)})`);
  if (filters.awaitingRegistration) {
    where.push(
      "t.status in ('sale_concluded','awaiting_registration') and t.actual_registration_date is null",
    );
  }
  if (filters.from) where.push(`t.sale_date >= ${add(filters.from)}`);
  if (filters.to) where.push(`t.sale_date <= ${add(filters.to)}`);

  const rows = await db.query<TransactionRow>(
    `${TRANSACTION_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by t.sale_date desc nulls last, t.created_at desc
      limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toTransaction);
}

export async function getTransaction(db: Db, id: string): Promise<TransactionSummary | null> {
  const row = await db.maybeOne<TransactionRow>(`${TRANSACTION_SQL} where t.id = $1`, [id]);
  return row ? toTransaction(row) : null;
}

export async function createTransaction(
  db: Db,
  ctx: Ctx,
  input: TransactionInput,
): Promise<{ id: string; transactionRef: string }> {
  const row = await db.one<{ id: string; transaction_ref: string }>(
    `insert into transactions
       (property_id, buyer_id, seller_id, offer_id, lead_id, transaction_value,
        sale_date, expected_registration_date, actual_registration_date, conditions,
        finance_status, legal_status, conveyancer, status, cancellation_reason, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     returning id, transaction_ref`,
    [
      input.propertyId, input.buyerId, input.sellerId, input.offerId, input.leadId,
      input.transactionValue, input.saleDate, input.expectedRegistrationDate,
      input.actualRegistrationDate, input.conditions, input.financeStatus,
      input.legalStatus, input.conveyancer, input.status, input.cancellationReason,
      input.notes, ctx.actor.id,
    ],
  );

  // The agent creating the deal is on it unless somebody says otherwise.
  await db.query(
    `insert into transaction_agents (transaction_id, agent_id, role, share_percent, added_by)
     values ($1,$2,'primary',100,$2) on conflict do nothing`,
    [row.id, ctx.actor.id],
  );

  await db.query(
    `insert into transaction_status_history (transaction_id, old_status, new_status, reason, changed_by)
     values ($1, null, $2, 'Created', $3)`,
    [row.id, input.status, ctx.actor.id],
  );

  if (input.offerId) {
    await db.query('update offers set transaction_id = $2 where id = $1', [input.offerId, row.id]);
  }
  await syncPropertyFromTransaction(db, ctx, input.propertyId, input.status);

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'transaction.created',
    entityType: 'transaction',
    entityId: row.id,
    entityLabel: row.transaction_ref,
    context: {
      propertyId: input.propertyId,
      status: input.status,
      transactionValue: input.transactionValue,
    },
  });

  return { id: row.id, transactionRef: row.transaction_ref };
}

export async function updateTransaction(
  db: Db,
  ctx: Ctx,
  transactionId: string,
  input: TransactionInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<
    Record<string, unknown> & { row_version: number; transaction_ref: string }
  >('select * from transactions where id = $1', [transactionId]);
  if (!before) throw new NotFoundError('That transaction');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const updated = await db.query<Record<string, unknown>>(
    `update transactions set
        buyer_id=$2, seller_id=$3, offer_id=$4, lead_id=$5, transaction_value=$6,
        sale_date=$7, expected_registration_date=$8, actual_registration_date=$9,
        conditions=$10, finance_status=$11, legal_status=$12, conveyancer=$13,
        status=$14, cancellation_reason=$15, notes=$16, updated_by=$17
      where id=$1 and row_version=$18
      returning *`,
    [
      transactionId, input.buyerId, input.sellerId, input.offerId, input.leadId,
      input.transactionValue, input.saleDate, input.expectedRegistrationDate,
      input.actualRegistrationDate, input.conditions, input.financeStatus,
      input.legalStatus, input.conveyancer, input.status, input.cancellationReason,
      input.notes, ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  if (before.status !== after.status) {
    await db.query(
      `insert into transaction_status_history
         (transaction_id, old_status, new_status, reason, changed_by)
       values ($1,$2,$3,$4,$5)`,
      [transactionId, before.status, after.status, input.statusChangeReason, ctx.actor.id],
    );
    await syncPropertyFromTransaction(
      db,
      ctx,
      before.property_id as string,
      after.status as TransactionStatus,
    );
  }

  const changes = diff(before, after, [
    'buyer_id', 'seller_id', 'transaction_value', 'sale_date', 'expected_registration_date',
    'actual_registration_date', 'conditions', 'finance_status', 'legal_status',
    'conveyancer', 'status', 'cancellation_reason', 'notes',
  ]);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'transaction.updated',
      entityType: 'transaction',
      entityId: transactionId,
      entityLabel: before.transaction_ref,
      changes,
      context: input.statusChangeReason ? { reason: input.statusChangeReason } : null,
    });
  }
}

/**
 * Registration, as its own act (spec 49).
 *
 * Separate from concluding the sale, because that is how it works: the deal
 * is done months before the deeds office transfers it.
 */
export async function registerTransaction(
  db: Db,
  ctx: Ctx,
  transactionId: string,
  input: { registrationDate: string; notes: string | null },
): Promise<void> {
  const before = await db.maybeOne<{
    transaction_ref: string;
    status: string;
    sale_date: Date | null;
    property_id: string;
  }>('select transaction_ref, status, sale_date, property_id from transactions where id = $1', [
    transactionId,
  ]);
  if (!before) throw new NotFoundError('That transaction');

  if (['cancelled', 'failed'].includes(before.status)) {
    throw new ValidationError(
      { _form: ['A cancelled transaction cannot be registered.'] },
      'A cancelled transaction cannot be registered.',
    );
  }
  if (before.sale_date && input.registrationDate < before.sale_date.toISOString().slice(0, 10)) {
    throw new ValidationError(
      { registrationDate: ['Registration cannot be before the sale date.'] },
      'Registration cannot be before the sale date.',
    );
  }

  await db.query(
    `update transactions
        set status = 'registered', actual_registration_date = $2::date,
            notes = coalesce($3, notes), updated_by = $4
      where id = $1`,
    [transactionId, input.registrationDate, input.notes, ctx.actor.id],
  );
  await db.query(
    `insert into transaction_status_history
       (transaction_id, old_status, new_status, reason, changed_by)
     values ($1,$2,'registered','Registered at the deeds office',$3)`,
    [transactionId, before.status, ctx.actor.id],
  );
  await syncPropertyFromTransaction(db, ctx, before.property_id, 'registered');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'transaction.registered',
    entityType: 'transaction',
    entityId: transactionId,
    entityLabel: before.transaction_ref,
    context: { registrationDate: input.registrationDate, previousStatus: before.status },
  });
}

/**
 * Keeps the property's own statuses in step with its transaction.
 *
 * The property's status and the transaction's status stay separate columns;
 * this only moves the property when the deal genuinely changes what the
 * property is (spec 25, 26, 141).
 */
async function syncPropertyFromTransaction(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  status: TransactionStatus,
): Promise<void> {
  const mapping: Partial<
    Record<TransactionStatus, { property: string; sales: string; outcome?: string }>
  > = {
    offer_accepted: { property: 'sale_pending', sales: 'sale_pending' },
    sale_pending: { property: 'sale_pending', sales: 'sale_pending' },
    suspensive_conditions: { property: 'sale_pending', sales: 'sale_pending' },
    sale_concluded: { property: 'sale_concluded', sales: 'sale_concluded', outcome: 'sold_by_us' },
    awaiting_registration: {
      property: 'sale_concluded',
      sales: 'sale_concluded',
      outcome: 'sold_by_us',
    },
    registered: { property: 'sale_registered', sales: 'sale_registered', outcome: 'sold_by_us' },
    cancelled: { property: 'sale_cancelled', sales: 'sale_cancelled', outcome: 'sale_cancelled' },
    failed: { property: 'sale_cancelled', sales: 'sale_cancelled', outcome: 'sale_cancelled' },
  };
  const target = mapping[status];
  if (!target) return;

  const before = await db.maybeOne<{
    property_status: string;
    sales_status: string;
    sale_outcome: string;
  }>('select property_status, sales_status, sale_outcome from properties where id = $1', [
    propertyId,
  ]);
  if (!before) return;

  await db.query(
    `update properties
        set property_status = $2, sales_status = $3,
            sale_outcome = coalesce($4, sale_outcome), updated_by = $5
      where id = $1`,
    [propertyId, target.property, target.sales, target.outcome ?? null, ctx.actor.id],
  );

  for (const [kind, oldValue, newValue] of [
    ['property', before.property_status, target.property],
    ['sales', before.sales_status, target.sales],
    ['sale_outcome', before.sale_outcome, target.outcome ?? before.sale_outcome],
  ] as const) {
    if (oldValue === newValue) continue;
    await db.query(
      `insert into property_status_history
         (property_id, status_kind, old_value, new_value, reason, changed_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [propertyId, kind, oldValue, newValue, `Transaction is now ${status}`, ctx.actor.id],
    );
  }
}

export async function setTransactionAgents(
  db: Db,
  ctx: Ctx,
  transactionId: string,
  agents: { agentId: string; role: string; sharePercent: string | null }[],
): Promise<void> {
  const total = agents.reduce((sum, agent) => sum + Number(agent.sharePercent ?? 0), 0);
  if (agents.some((agent) => agent.sharePercent) && total > 100.001) {
    throw new ValidationError(
      {
        _form: [
          `The shares add up to ${total.toFixed(2)}%. A deal cannot be shared more than once over.`,
        ],
      },
      `The shares add up to ${total.toFixed(2)}%.`,
    );
  }

  const keep = agents.map((agent) => agent.agentId);
  await db.query(
    'delete from transaction_agents where transaction_id = $1 and agent_id <> all($2::uuid[])',
    [transactionId, keep],
  );
  for (const agent of agents) {
    await db.query(
      `insert into transaction_agents (transaction_id, agent_id, role, share_percent, added_by)
       values ($1,$2,$3,$4,$5)
       on conflict (transaction_id, agent_id) do update
         set role = excluded.role, share_percent = excluded.share_percent`,
      [transactionId, agent.agentId, agent.role, agent.sharePercent, ctx.actor.id],
    );
  }
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'transaction.agents_set',
    entityType: 'transaction',
    entityId: transactionId,
    context: { agents },
  });
}

export async function getTransactionHistory(
  db: Db,
  transactionId: string,
): Promise<
  { oldStatus: string | null; newStatus: string; reason: string | null; changedAt: string; changedByName: string | null }[]
> {
  const rows = await db.query<{
    old_status: string | null;
    new_status: string;
    reason: string | null;
    changed_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.old_status, h.new_status, h.reason, h.changed_at,
            coalesce(u.display_name, u.full_name) as changed_by_name
       from transaction_status_history h
       left join users u on u.id = h.changed_by
      where h.transaction_id = $1 order by h.changed_at desc`,
    [transactionId],
  );
  return rows.map((row) => ({
    oldStatus: row.old_status,
    newStatus: row.new_status,
    reason: row.reason,
    changedAt: row.changed_at.toISOString(),
    changedByName: row.changed_by_name,
  }));
}

export const TRANSACTION_AGENT_ROLE_KEYS = keys(TRANSACTION_AGENT_ROLES);
