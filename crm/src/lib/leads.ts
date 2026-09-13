import { z } from 'zod';
import { agentToKeep, type Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from './errors.ts';
import {
  BUSINESS_AREAS,
  LEAD_STATUSES,
  LEAD_TYPES,
  OPEN_LEAD_STATUSES,
  type BusinessArea,
  type LeadStatus,
  type LeadType,
} from './domain.ts';
import {
  optionalDateTime,
  optionalMoney,
  optionalText,
  optionalUuid,
} from './validate.ts';

/**
 * Leads (spec 39 to 42).
 *
 * A lead is linked to a person wherever possible, so an enquiry becomes part
 * of that person's one master record rather than starting a second one. Its
 * status moves through a recorded history, and a lost lead has to say why —
 * the database refuses one without a reason.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const leadInputSchema = z
  .object({
    personId: optionalUuid,
    propertyId: optionalUuid,
    businessArea: z.enum(keys(BUSINESS_AREAS)).default('sales'),
    leadType: z.enum(keys(LEAD_TYPES)),
    status: z.enum(keys(LEAD_STATUSES)).default('new'),
    sourceId: optionalUuid,
    lossReasonId: optionalUuid,
    enquirySummary: optionalText,
    requirements: optionalText,
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    preferredAreas: optionalText,
    primaryAgentId: optionalUuid,
    secondaryAgentId: optionalUuid,
    nextFollowUpAt: optionalDateTime,
    notes: optionalText,
    statusChangeReason: optionalText,
    tagIds: z.array(z.uuid()).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.status === 'lost' && !input.lossReasonId) {
      ctx.addIssue({
        code: 'custom',
        path: ['lossReasonId'],
        message: 'Choose why this lead was lost. It is what makes the report useful.',
      });
    }
    if (
      input.budgetMin &&
      input.budgetMax &&
      Number(input.budgetMax) < Number(input.budgetMin)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['budgetMax'],
        message: 'The top of the budget cannot be below the bottom.',
      });
    }
  });

export type LeadInput = z.infer<typeof leadInputSchema>;

export interface LeadSummary {
  id: string;
  personId: string | null;
  personName: string | null;
  personRef: string | null;
  personMobile: string | null;
  personEmail: string | null;
  propertyId: string | null;
  propertyRef: string | null;
  propertyAddress: string | null;
  businessArea: BusinessArea;
  leadType: LeadType;
  status: LeadStatus;
  sourceName: string | null;
  lossReasonName: string | null;
  primaryAgentId: string | null;
  primaryAgentName: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  isArchived: boolean;
  tags: { id: string; name: string; colour: string }[];
}

export interface LeadDetail extends LeadSummary {
  sourceId: string | null;
  lossReasonId: string | null;
  secondaryAgentId: string | null;
  secondaryAgentName: string | null;
  enquirySummary: string | null;
  requirements: string | null;
  preferredAreas: string | null;
  notes: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdByName: string | null;
  updatedAt: string;
  updatedByName: string | null;
  rowVersion: number;
  statusHistory: {
    oldStatus: string | null;
    newStatus: string;
    reason: string | null;
    changedAt: string;
    changedByName: string | null;
  }[];
}

const SUMMARY_COLUMNS = `
  l.id, l.person_id, l.property_id, l.business_area, l.lead_type, l.status,
  l.primary_agent_id, l.budget_min, l.budget_max, l.next_follow_up_at,
  l.created_at, l.is_archived,
  coalesce(agent.display_name, agent.full_name) as primary_agent_name,
  pe.first_name || ' ' || pe.surname as person_name,
  pe.client_ref as person_ref,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active
       and c.contact_type in ('mobile','whatsapp','alternative_mobile')
     order by c.is_primary desc limit 1) as person_mobile,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active and c.contact_type = 'email'
     order by c.is_primary desc limit 1) as person_email,
  pr.property_ref,
  nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_address,
  src.name as source_name,
  loss.name as loss_reason_name,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'colour', t.colour)
              order by t.sort_order)
       from record_tags rt join tags t on t.id = rt.tag_id
      where rt.entity_type = 'lead' and rt.entity_id = l.id),
    '[]'::jsonb
  ) as tags
`;

const SUMMARY_JOINS = `
  from leads l
  left join users agent on agent.id = l.primary_agent_id
  left join people pe on pe.id = l.person_id
  left join properties pr on pr.id = l.property_id
  left join lead_sources src on src.id = l.source_id
  left join lead_loss_reasons loss on loss.id = l.loss_reason_id
`;

interface SummaryRow {
  id: string;
  person_id: string | null;
  person_name: string | null;
  person_ref: string | null;
  person_mobile: string | null;
  person_email: string | null;
  property_id: string | null;
  property_ref: string | null;
  property_address: string | null;
  business_area: BusinessArea;
  lead_type: LeadType;
  status: LeadStatus;
  source_name: string | null;
  loss_reason_name: string | null;
  primary_agent_id: string | null;
  primary_agent_name: string | null;
  budget_min: string | null;
  budget_max: string | null;
  next_follow_up_at: Date | null;
  created_at: Date;
  is_archived: boolean;
  tags: { id: string; name: string; colour: string }[];
}

function toSummary(row: SummaryRow): LeadSummary {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    personRef: row.person_ref,
    personMobile: row.person_mobile,
    personEmail: row.person_email,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyAddress: row.property_address,
    businessArea: row.business_area,
    leadType: row.lead_type,
    status: row.status,
    sourceName: row.source_name,
    lossReasonName: row.loss_reason_name,
    primaryAgentId: row.primary_agent_id,
    primaryAgentName: row.primary_agent_name,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    nextFollowUpAt: row.next_follow_up_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    isArchived: row.is_archived,
    tags: row.tags ?? [],
  };
}

export interface LeadFilters {
  query?: string;
  personId?: string;
  propertyId?: string;
  businessArea?: string;
  leadType?: string;
  status?: string;
  openOnly?: boolean;
  sourceId?: string;
  agentId?: string | null;
  tagId?: string;
  from?: string;
  to?: string;
  followUp?: 'overdue' | 'today' | 'none' | 'all';
  archived?: 'active' | 'archived' | 'all';
  sort?: 'recent' | 'follow_up' | 'status';
  page?: number;
  pageSize?: number;
}

export async function listLeads(
  db: Db,
  filters: LeadFilters,
): Promise<{ rows: LeadSummary[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  switch (filters.archived ?? 'active') {
    case 'active':
      where.push('not l.is_archived');
      break;
    case 'archived':
      where.push('l.is_archived');
      break;
    default:
      break;
  }

  if (filters.openOnly) {
    where.push(`l.status = any(${add(OPEN_LEAD_STATUSES)})`);
  }
  if (filters.businessArea && filters.businessArea !== 'all') {
    const value = add(filters.businessArea);
    where.push(
      `(l.business_area = ${value} or (l.business_area = 'sales_rentals' and ${value} in ('sales','rentals')))`,
    );
  }
  if (filters.leadType && filters.leadType !== 'all') {
    where.push(`l.lead_type = ${add(filters.leadType)}`);
  }
  if (filters.status && filters.status !== 'all') {
    where.push(`l.status = ${add(filters.status)}`);
  }
  if (filters.personId) where.push(`l.person_id = ${add(filters.personId)}`);
  if (filters.propertyId) where.push(`l.property_id = ${add(filters.propertyId)}`);
  if (filters.sourceId) where.push(`l.source_id = ${add(filters.sourceId)}`);
  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(l.primary_agent_id = ${value} or l.secondary_agent_id = ${value})`);
  }
  if (filters.tagId) {
    where.push(
      `exists (select 1 from record_tags rt where rt.entity_type = 'lead' and rt.entity_id = l.id and rt.tag_id = ${add(filters.tagId)})`,
    );
  }
  if (filters.from) where.push(`l.created_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`l.created_at < (${add(filters.to)}::date + 1)`);

  switch (filters.followUp ?? 'all') {
    case 'overdue':
      where.push('l.next_follow_up_at is not null and l.next_follow_up_at < now()');
      break;
    case 'today':
      where.push("l.next_follow_up_at::date = (now() at time zone 'Africa/Johannesburg')::date");
      break;
    case 'none':
      where.push('l.next_follow_up_at is null');
      break;
    default:
      break;
  }

  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(coalesce(pe.first_name || ' ' || pe.surname, '')) like ${like}
      or lower(coalesce(pe.client_ref, '')) like ${like}
      or lower(coalesce(pr.property_ref, '')) like ${like}
      or lower(coalesce(pr.street_address, '')) like ${like}
      or lower(coalesce(l.enquiry_summary, '')) like ${like}
      or lower(coalesce(l.requirements, '')) like ${like}
    )`);
  }

  const whereSql = where.length > 0 ? where.join(' and ') : 'true';
  const orderBy =
    filters.sort === 'follow_up'
      ? 'l.next_follow_up_at asc nulls last'
      : filters.sort === 'status'
        ? 'l.status, l.created_at desc'
        : 'l.created_at desc';

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n ${SUMMARY_JOINS} where ${whereSql}`,
    params,
  );
  const rows = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS} ${SUMMARY_JOINS}
      where ${whereSql}
      order by ${orderBy}
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toSummary), total: totalRow.n, page, pageSize };
}

export async function getLead(db: Db, id: string): Promise<LeadDetail | null> {
  const row = await db.maybeOne<
    SummaryRow & {
      source_id: string | null;
      loss_reason_id: string | null;
      secondary_agent_id: string | null;
      secondary_agent_name: string | null;
      enquiry_summary: string | null;
      requirements: string | null;
      preferred_areas: string | null;
      notes: string | null;
      won_at: Date | null;
      lost_at: Date | null;
      created_by_name: string | null;
      updated_at: Date;
      updated_by_name: string | null;
      row_version: number;
    }
  >(
    `select ${SUMMARY_COLUMNS},
            l.source_id, l.loss_reason_id, l.secondary_agent_id,
            coalesce(second.display_name, second.full_name) as secondary_agent_name,
            l.enquiry_summary, l.requirements, l.preferred_areas, l.notes,
            l.won_at, l.lost_at,
            coalesce(cb.display_name, cb.full_name) as created_by_name,
            l.updated_at, coalesce(ub.display_name, ub.full_name) as updated_by_name,
            l.row_version
       ${SUMMARY_JOINS}
       left join users second on second.id = l.secondary_agent_id
       left join users cb on cb.id = l.created_by
       left join users ub on ub.id = l.updated_by
      where l.id = $1`,
    [id],
  );
  if (!row) return null;

  const history = await db.query<{
    old_status: string | null;
    new_status: string;
    reason: string | null;
    changed_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.old_status, h.new_status, h.reason, h.changed_at,
            coalesce(u.display_name, u.full_name) as changed_by_name
       from lead_status_history h
       left join users u on u.id = h.changed_by
      where h.lead_id = $1 order by h.changed_at desc`,
    [id],
  );

  return {
    ...toSummary(row),
    sourceId: row.source_id,
    lossReasonId: row.loss_reason_id,
    secondaryAgentId: row.secondary_agent_id,
    secondaryAgentName: row.secondary_agent_name,
    enquirySummary: row.enquiry_summary,
    requirements: row.requirements,
    preferredAreas: row.preferred_areas,
    notes: row.notes,
    wonAt: row.won_at?.toISOString() ?? null,
    lostAt: row.lost_at?.toISOString() ?? null,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at.toISOString(),
    updatedByName: row.updated_by_name,
    rowVersion: row.row_version,
    statusHistory: history.map((entry) => ({
      oldStatus: entry.old_status,
      newStatus: entry.new_status,
      reason: entry.reason,
      changedAt: entry.changed_at.toISOString(),
      changedByName: entry.changed_by_name,
    })),
  };
}

const AUDITED = [
  'person_id', 'property_id', 'business_area', 'lead_type', 'status', 'source_id',
  'loss_reason_id', 'budget_min', 'budget_max', 'primary_agent_id', 'secondary_agent_id',
  'next_follow_up_at', 'requirements', 'preferred_areas', 'notes', 'is_archived',
] as const;

export async function createLead(
  db: Db,
  ctx: Ctx,
  input: LeadInput,
): Promise<{ id: string }> {
  const primaryAgentId = agentToKeep(ctx.actor, input.primaryAgentId);

  const lead = await db.one<{ id: string }>(
    `insert into leads
       (person_id, property_id, business_area, lead_type, status, source_id, loss_reason_id,
        enquiry_summary, requirements, budget_min, budget_max, preferred_areas,
        primary_agent_id, secondary_agent_id, next_follow_up_at, notes,
        won_at, lost_at, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             case when $5 = 'won' then now() end,
             case when $5 = 'lost' then now() end,
             $17,$17)
     returning id`,
    [
      input.personId, input.propertyId, input.businessArea, input.leadType, input.status,
      input.sourceId, input.lossReasonId, input.enquirySummary, input.requirements,
      input.budgetMin, input.budgetMax, input.preferredAreas,
      primaryAgentId, input.secondaryAgentId, input.nextFollowUpAt, input.notes,
      ctx.actor.id,
    ],
  );

  await db.query(
    `insert into lead_status_history (lead_id, old_status, new_status, reason, changed_by)
     values ($1, null, $2, 'Created', $3)`,
    [lead.id, input.status, ctx.actor.id],
  );
  await replaceTags(db, ctx, lead.id, input.tagIds);

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'lead.created',
    entityType: 'lead',
    entityId: lead.id,
    context: {
      leadType: input.leadType,
      status: input.status,
      businessArea: input.businessArea,
      personId: input.personId,
    },
  });

  return { id: lead.id };
}

export async function updateLead(
  db: Db,
  ctx: Ctx,
  leadId: string,
  input: LeadInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from leads where id = $1',
    [leadId],
  );
  if (!before) throw new NotFoundError('That lead');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const primaryAgentId = agentToKeep(
    ctx.actor,
    input.primaryAgentId,
    before.primary_agent_id as string | null,
  );

  const updated = await db.query<Record<string, unknown>>(
    `update leads set
        person_id=$2, property_id=$3, business_area=$4, lead_type=$5, status=$6,
        source_id=$7, loss_reason_id=$8, enquiry_summary=$9, requirements=$10,
        budget_min=$11, budget_max=$12, preferred_areas=$13,
        primary_agent_id=$14, secondary_agent_id=$15, next_follow_up_at=$16, notes=$17,
        won_at = case when $6 = 'won' then coalesce(won_at, now()) else null end,
        lost_at = case when $6 = 'lost' then coalesce(lost_at, now()) else null end,
        updated_by=$18
      where id=$1 and row_version=$19
      returning *`,
    [
      leadId, input.personId, input.propertyId, input.businessArea, input.leadType, input.status,
      input.sourceId, input.lossReasonId, input.enquirySummary, input.requirements,
      input.budgetMin, input.budgetMax, input.preferredAreas,
      primaryAgentId, input.secondaryAgentId, input.nextFollowUpAt, input.notes,
      ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  if (before.status !== after.status) {
    await db.query(
      `insert into lead_status_history (lead_id, old_status, new_status, reason, changed_by)
       values ($1,$2,$3,$4,$5)`,
      [leadId, before.status, after.status, input.statusChangeReason, ctx.actor.id],
    );
  }
  await replaceTags(db, ctx, leadId, input.tagIds);

  const changes = diff(before, after, AUDITED);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'lead.updated',
      entityType: 'lead',
      entityId: leadId,
      changes,
      context: input.statusChangeReason ? { reason: input.statusChangeReason } : null,
    });
  }
}

/** A quick status change from a list, without opening the whole form. */
export async function setLeadStatus(
  db: Db,
  ctx: Ctx,
  leadId: string,
  input: { status: LeadStatus; lossReasonId: string | null; reason: string | null },
): Promise<void> {
  const before = await db.maybeOne<{ status: string }>('select status from leads where id = $1', [
    leadId,
  ]);
  if (!before) throw new NotFoundError('That lead');
  if (input.status === 'lost' && !input.lossReasonId) {
    throw new ValidationError(
      { lossReasonId: ['Choose why this lead was lost.'] },
      'Choose why this lead was lost.',
    );
  }

  await db.query(
    `update leads set status = $2,
            loss_reason_id = case when $2 = 'lost' then $3::uuid else loss_reason_id end,
            won_at = case when $2 = 'won' then coalesce(won_at, now()) else null end,
            lost_at = case when $2 = 'lost' then coalesce(lost_at, now()) else null end,
            updated_by = $4
      where id = $1`,
    [leadId, input.status, input.lossReasonId, ctx.actor.id],
  );
  if (before.status !== input.status) {
    await db.query(
      `insert into lead_status_history (lead_id, old_status, new_status, reason, changed_by)
       values ($1,$2,$3,$4,$5)`,
      [leadId, before.status, input.status, input.reason, ctx.actor.id],
    );
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'lead.status_changed',
      entityType: 'lead',
      entityId: leadId,
      changes: { status: { from: before.status, to: input.status } },
      context: { reason: input.reason },
    });
  }
}

export async function archiveLead(
  db: Db,
  ctx: Ctx,
  leadId: string,
  reason: string | null,
): Promise<void> {
  const found = await db.count(
    `update leads set is_archived = true, archived_at = now(), archived_by = $2, updated_by = $2
      where id = $1 and not is_archived`,
    [leadId, ctx.actor.id],
  );
  if (found === 0) throw new NotFoundError('That lead');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'lead.archived',
    entityType: 'lead',
    entityId: leadId,
    context: { reason },
  });
}

async function replaceTags(db: Db, ctx: Ctx, leadId: string, tagIds: string[]): Promise<void> {
  await db.query(
    `delete from record_tags
      where entity_type = 'lead' and entity_id = $1 and tag_id <> all($2::uuid[])`,
    [leadId, tagIds],
  );
  if (tagIds.length > 0) {
    await db.query(
      `insert into record_tags (tag_id, entity_type, entity_id, added_by)
       select unnest($2::uuid[]), 'lead', $1, $3 on conflict do nothing`,
      [leadId, tagIds, ctx.actor.id],
    );
  }
}

export async function listLeadSources(
  db: Db,
): Promise<{ id: string; name: string }[]> {
  return db.query<{ id: string; name: string }>(
    'select id, name from lead_sources where is_active order by sort_order, name',
  );
}

export async function listLeadLossReasons(
  db: Db,
): Promise<{ id: string; name: string }[]> {
  return db.query<{ id: string; name: string }>(
    'select id, name from lead_loss_reasons where is_active order by sort_order, name',
  );
}

/** Conversion and loss reporting (spec 109). */
export async function leadStatistics(
  db: Db,
  filters: { agentId?: string | null; from?: string; to?: string } = {},
): Promise<{
  byStatus: { status: string; count: number }[];
  bySource: { source: string; count: number; won: number }[];
  byLossReason: { reason: string; count: number }[];
  total: number;
  won: number;
  lost: number;
}> {
  const where: string[] = ['not l.is_archived'];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(l.primary_agent_id = ${value} or l.secondary_agent_id = ${value})`);
  }
  if (filters.from) where.push(`l.created_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`l.created_at < (${add(filters.to)}::date + 1)`);
  const whereSql = where.join(' and ');

  const [byStatus, bySource, byLossReason, totals] = await Promise.all([
    db.query<{ status: string; count: number }>(
      `select l.status, count(*)::int as count from leads l where ${whereSql}
        group by l.status order by count desc`,
      params,
    ),
    db.query<{ source: string; count: number; won: number }>(
      `select coalesce(s.name, 'Not recorded') as source, count(*)::int as count,
              count(*) filter (where l.status = 'won')::int as won
         from leads l left join lead_sources s on s.id = l.source_id
        where ${whereSql} group by s.name order by count desc`,
      params,
    ),
    db.query<{ reason: string; count: number }>(
      `select coalesce(r.name, 'Not recorded') as reason, count(*)::int as count
         from leads l left join lead_loss_reasons r on r.id = l.loss_reason_id
        where ${whereSql} and l.status = 'lost' group by r.name order by count desc`,
      params,
    ),
    db.one<{ total: number; won: number; lost: number }>(
      `select count(*)::int as total,
              count(*) filter (where l.status = 'won')::int as won,
              count(*) filter (where l.status = 'lost')::int as lost
         from leads l where ${whereSql}`,
      params,
    ),
  ]);

  return {
    byStatus,
    bySource,
    byLossReason,
    total: totals.total,
    won: totals.won,
    lost: totals.lost,
  };
}
