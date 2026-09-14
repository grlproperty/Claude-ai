import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_OUTCOMES,
  type CommunicationChannel,
  type CommunicationDirection,
  type CommunicationOutcome,
} from './domain.ts';
import { optionalDateTime, optionalText, optionalUuid } from './validate.ts';

/**
 * The record of what was actually said (spec 43 to 45, 143).
 *
 * THE CRM DOES NOT SEND ANYTHING. Call, WhatsApp and Email are links that
 * open the device's own app; the person has the conversation and then writes
 * down what happened. Every row here is somebody's account of a conversation,
 * which is why nothing in this module has a notion of delivery, of being read,
 * or of a message id. There is no provider to give us one.
 *
 * A logged conversation is never deleted — there is no delete grant on the
 * table. A correction is an edit, and the edit is audited (spec 104).
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const communicationInputSchema = z
  .object({
    personId: optionalUuid,
    propertyId: optionalUuid,
    leadId: optionalUuid,
    transactionId: optionalUuid,
    rentalApplicationId: optionalUuid,

    direction: z.enum(keys(COMMUNICATION_DIRECTIONS)).default('outgoing'),
    channel: z.enum(keys(COMMUNICATION_CHANNELS)),
    subject: optionalText,
    body: optionalText,
    occurredAt: optionalDateTime,
    durationMinutes: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
      }),
    outcome: z
      .union([z.enum(keys(COMMUNICATION_OUTCOMES)), z.literal('')])
      .optional()
      .transform((value) => (value ? (value as CommunicationOutcome) : null)),
    agentId: optionalUuid,
    templateId: optionalUuid,
    isImportant: z.coerce.boolean().default(false),

    /** A follow-up to create alongside the log entry. */
    followUpAt: optionalDateTime,
    followUpTitle: optionalText,
  })
  .superRefine((input, ctx) => {
    if (
      !input.personId &&
      !input.propertyId &&
      !input.leadId &&
      !input.transactionId &&
      !input.rentalApplicationId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'Say who or what this conversation was about.',
      });
    }
    if (!input.body && !input.subject && !input.outcome) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'Write down what was said, or at least what came of it.',
      });
    }
    if (
      input.durationMinutes !== null &&
      !['call', 'meeting', 'in_person'].includes(input.channel)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinutes'],
        message: 'A length only makes sense for a call or a meeting.',
      });
    }
    if (input.followUpAt && !input.followUpTitle) {
      ctx.addIssue({
        code: 'custom',
        path: ['followUpTitle'],
        message: 'Say what the follow-up is for.',
      });
    }
  });

export type CommunicationInput = z.infer<typeof communicationInputSchema>;

export interface CommunicationSummary {
  id: string;
  personId: string | null;
  personName: string | null;
  personRef: string | null;
  propertyId: string | null;
  propertyRef: string | null;
  propertyLabel: string | null;
  leadId: string | null;
  transactionId: string | null;
  rentalApplicationId: string | null;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  durationMinutes: number | null;
  outcome: CommunicationOutcome | null;
  agentId: string | null;
  agentName: string | null;
  templateId: string | null;
  templateName: string | null;
  isImportant: boolean;
  taskId: string | null;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  attachmentCount: number;
  rowVersion: number;
}

interface CommunicationDbRow {
  id: string;
  person_id: string | null;
  person_name: string | null;
  person_ref: string | null;
  property_id: string | null;
  property_ref: string | null;
  property_label: string | null;
  lead_id: string | null;
  transaction_id: string | null;
  rental_application_id: string | null;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  subject: string | null;
  body: string | null;
  occurred_at: Date;
  duration_minutes: number | null;
  outcome: CommunicationOutcome | null;
  agent_id: string | null;
  agent_name: string | null;
  template_id: string | null;
  template_name: string | null;
  is_important: boolean;
  task_id: string | null;
  created_at: Date;
  created_by: string | null;
  created_by_name: string | null;
  attachment_count: number;
  row_version: number;
}

const COMMUNICATION_SQL = `
  select c.id, c.person_id, c.property_id, c.lead_id, c.transaction_id,
         c.rental_application_id, c.direction, c.channel, c.subject, c.body,
         c.occurred_at, c.duration_minutes, c.outcome, c.agent_id, c.template_id,
         c.is_important, c.task_id, c.created_at, c.created_by, c.row_version,
         pe.first_name || ' ' || pe.surname as person_name,
         pe.client_ref as person_ref,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         coalesce(ag.display_name, ag.full_name) as agent_name,
         coalesce(cb.display_name, cb.full_name) as created_by_name,
         t.name as template_name,
         (select count(*)::int from documents d where d.communication_id = c.id)
           as attachment_count
    from communications c
    left join people pe on pe.id = c.person_id
    left join properties pr on pr.id = c.property_id
    left join users ag on ag.id = c.agent_id
    left join users cb on cb.id = c.created_by
    left join communication_templates t on t.id = c.template_id
`;

function toSummary(row: CommunicationDbRow): CommunicationSummary {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    personRef: row.person_ref,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    leadId: row.lead_id,
    transactionId: row.transaction_id,
    rentalApplicationId: row.rental_application_id,
    direction: row.direction,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurred_at.toISOString(),
    durationMinutes: row.duration_minutes,
    outcome: row.outcome,
    agentId: row.agent_id,
    agentName: row.agent_name,
    templateId: row.template_id,
    templateName: row.template_name,
    isImportant: row.is_important,
    taskId: row.task_id,
    createdAt: row.created_at.toISOString(),
    createdById: row.created_by,
    createdByName: row.created_by_name,
    attachmentCount: row.attachment_count,
    rowVersion: row.row_version,
  };
}

export interface CommunicationFilters {
  personId?: string;
  propertyId?: string;
  leadId?: string;
  transactionId?: string;
  agentId?: string | null;
  channel?: string;
  direction?: string;
  importantOnly?: boolean;
  query?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listCommunications(
  db: Db,
  filters: CommunicationFilters,
): Promise<{ rows: CommunicationSummary[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.personId) where.push(`c.person_id = ${add(filters.personId)}`);
  if (filters.propertyId) where.push(`c.property_id = ${add(filters.propertyId)}`);
  if (filters.leadId) where.push(`c.lead_id = ${add(filters.leadId)}`);
  if (filters.transactionId) where.push(`c.transaction_id = ${add(filters.transactionId)}`);
  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(c.agent_id = ${value} or c.created_by = ${value})`);
  }
  if (filters.channel && filters.channel !== 'all') {
    where.push(`c.channel = ${add(filters.channel)}`);
  }
  if (filters.direction && filters.direction !== 'all') {
    where.push(`c.direction = ${add(filters.direction)}`);
  }
  if (filters.importantOnly) where.push('c.is_important');
  if (filters.from) where.push(`c.occurred_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`c.occurred_at < (${add(filters.to)}::date + 1)`);

  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(coalesce(c.subject, '')) like ${like}
      or lower(coalesce(c.body, '')) like ${like}
      or lower(coalesce(pe.first_name || ' ' || pe.surname, '')) like ${like}
      or lower(coalesce(pe.client_ref, '')) like ${like}
      or lower(coalesce(pr.property_ref, '')) like ${like}
    )`);
  }

  const whereSql = where.length > 0 ? where.join(' and ') : 'true';
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 25));

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n
       from communications c
       left join people pe on pe.id = c.person_id
       left join properties pr on pr.id = c.property_id
      where ${whereSql}`,
    params,
  );

  const rows = await db.query<CommunicationDbRow>(
    `${COMMUNICATION_SQL} where ${whereSql}
      order by c.occurred_at desc, c.created_at desc
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toSummary), total: totalRow.n, page, pageSize };
}

export async function getCommunication(
  db: Db,
  id: string,
): Promise<CommunicationSummary | null> {
  const row = await db.maybeOne<CommunicationDbRow>(`${COMMUNICATION_SQL} where c.id = $1`, [id]);
  return row ? toSummary(row) : null;
}

const AUDITED = [
  'person_id', 'property_id', 'lead_id', 'transaction_id', 'direction', 'channel',
  'subject', 'body', 'occurred_at', 'duration_minutes', 'outcome', 'agent_id',
  'is_important',
] as const;

export async function logCommunication(
  db: Db,
  ctx: Ctx,
  input: CommunicationInput,
): Promise<{ id: string; taskId: string | null }> {
  // Deliberately NOT agentToKeep. That helper may leave a record unassigned
  // for Management, which is right for owning a client or a property but wrong
  // here: somebody had this conversation. A conversation with no one attached
  // to it is not a record of anything, so it falls back to whoever logged it.
  const agentId = input.agentId ?? ctx.actor.id;

  const row = await db.one<{ id: string }>(
    `insert into communications
       (person_id, property_id, lead_id, transaction_id, rental_application_id,
        direction, channel, subject, body, occurred_at, duration_minutes, outcome,
        agent_id, template_id, is_important, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::timestamptz, now()),$11,$12,
             $13,$14,$15,$16,$16)
     returning id`,
    [
      input.personId, input.propertyId, input.leadId, input.transactionId,
      input.rentalApplicationId, input.direction, input.channel, input.subject,
      input.body, input.occurredAt, input.durationMinutes, input.outcome,
      agentId, input.templateId, input.isImportant, ctx.actor.id,
    ],
  );

  // A template being used says nothing about delivery; it is recorded because
  // knowing which wording went out is useful.
  if (input.templateId) {
    await db.query(
      'update communication_templates set times_used = times_used + 1, last_used_at = now() where id = $1',
      [input.templateId],
    );
  }

  // The follow-up, if one was asked for. A date in a note nobody looks at is
  // not a follow-up (spec 45).
  let taskId: string | null = null;
  if (input.followUpAt && input.followUpTitle) {
    const task = await db.one<{ id: string }>(
      `insert into tasks
         (assigned_user_id, person_id, property_id, lead_id, transaction_id,
          task_type, title, due_at, priority, status, notes, created_by, updated_by)
       values ($1,$2,$3,$4,$5,'follow_up',$6,$7,'normal','to_do',$8,$1,$1)
       returning id`,
      [
        agentId ?? ctx.actor.id,
        input.personId,
        input.propertyId,
        input.leadId,
        input.transactionId,
        input.followUpTitle,
        input.followUpAt,
        `From the conversation logged on ${new Date(input.occurredAt ?? Date.now())
          .toISOString()
          .slice(0, 10)}.`,
      ],
    );
    taskId = task.id;
    await db.query('update communications set task_id = $2 where id = $1', [row.id, taskId]);
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'communication.logged',
    entityType: 'communication',
    entityId: row.id,
    context: {
      channel: input.channel,
      direction: input.direction,
      personId: input.personId,
      propertyId: input.propertyId,
      outcome: input.outcome,
      followUp: taskId,
    },
  });

  return { id: row.id, taskId };
}

/**
 * Correcting a logged conversation.
 *
 * Not deletion: the row stays and the change is audited. The person's first
 * and last contact dates are then rebuilt from the log, because a corrected
 * date has to be able to move them back as well as forward.
 */
export async function updateCommunication(
  db: Db,
  ctx: Ctx,
  id: string,
  input: CommunicationInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from communications where id = $1',
    [id],
  );
  if (!before) throw new NotFoundError('That conversation');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  // Same rule as logging: the conversation stays attached to somebody.
  const agentId =
    input.agentId ?? (before.agent_id as string | null) ?? ctx.actor.id;

  const updated = await db.query<Record<string, unknown>>(
    `update communications set
        person_id=$2, property_id=$3, lead_id=$4, transaction_id=$5,
        rental_application_id=$6, direction=$7, channel=$8, subject=$9, body=$10,
        occurred_at=coalesce($11::timestamptz, occurred_at), duration_minutes=$12,
        outcome=$13, agent_id=$14, is_important=$15, updated_by=$16
      where id=$1 and row_version=$17
      returning *`,
    [
      id, input.personId, input.propertyId, input.leadId, input.transactionId,
      input.rentalApplicationId, input.direction, input.channel, input.subject,
      input.body, input.occurredAt, input.durationMinutes, input.outcome,
      agentId, input.isImportant, ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  // Rebuild the derived dates for whoever is affected, old person and new.
  for (const personId of new Set(
    [before.person_id, after.person_id].filter((value): value is string => Boolean(value)),
  )) {
    await db.query('select app.recompute_person_contact_dates($1)', [personId]);
  }

  const changes = diff(before, after, AUDITED);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'communication.corrected',
      entityType: 'communication',
      entityId: id,
      changes,
    });
  }
}

/** Counts by channel for a dashboard, over a window. */
export async function communicationStatistics(
  db: Db,
  filters: { agentId?: string | null; from?: string; to?: string } = {},
): Promise<{
  byChannel: { channel: string; count: number }[];
  byDirection: { direction: string; count: number }[];
  total: number;
  peopleContacted: number;
  withoutAnyContact: number;
}> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(c.agent_id = ${value} or c.created_by = ${value})`);
  }
  if (filters.from) where.push(`c.occurred_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`c.occurred_at < (${add(filters.to)}::date + 1)`);
  const whereSql = where.length > 0 ? where.join(' and ') : 'true';

  const [byChannel, byDirection, totals, gaps] = await Promise.all([
    db.query<{ channel: string; count: number }>(
      `select c.channel, count(*)::int as count from communications c
        where ${whereSql} group by c.channel order by count desc`,
      params,
    ),
    db.query<{ direction: string; count: number }>(
      `select c.direction, count(*)::int as count from communications c
        where ${whereSql} group by c.direction order by count desc`,
      params,
    ),
    db.one<{ total: number; people: number }>(
      `select count(*)::int as total, count(distinct c.person_id)::int as people
         from communications c where ${whereSql}`,
      params,
    ),
    db.one<{ n: number }>(
      `select count(*)::int as n from people p
        where p.merged_into_id is null and not p.is_archived
          and p.last_contact_at is null`,
    ),
  ]);

  return {
    byChannel,
    byDirection,
    total: totals.total,
    peopleContacted: totals.people,
    withoutAnyContact: gaps.n,
  };
}

// ---------------------------------------------------------------------------
// The timeline (spec 99, 100)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  byName: string | null;
  href: string | null;
}

/**
 * One person's or one property's history in order.
 *
 * Assembled from what actually happened rather than from a separate "activity"
 * table, so it cannot drift out of step with the records it describes. Each
 * part is only included when the reader may see that kind of thing.
 */
export async function timelineFor(
  db: Db,
  scope: { personId?: string; propertyId?: string },
  permissions: ReadonlySet<string>,
  limit = 60,
): Promise<TimelineEntry[]> {
  const column = scope.personId ? 'person_id' : 'property_id';
  const id = scope.personId ?? scope.propertyId;
  if (!id) return [];

  const parts: string[] = [];
  const params: unknown[] = [id];

  if (permissions.has('COMMUNICATION_VIEW')) {
    parts.push(`
      select c.occurred_at as at, 'communication' as kind,
             c.channel || ' — ' || c.direction as title,
             coalesce(nullif(c.subject, ''), left(coalesce(c.body, ''), 160)) as detail,
             coalesce(u.display_name, u.full_name) as by_name,
             null::text as href
        from communications c
        left join users u on u.id = coalesce(c.agent_id, c.created_by)
       where c.${column} = $1
    `);
  }

  if (permissions.has('LEADS_VIEW')) {
    parts.push(`
      select h.changed_at as at, 'lead' as kind,
             'Lead moved to ' || h.new_status as title,
             h.reason as detail,
             coalesce(u.display_name, u.full_name) as by_name,
             '/leads/' || l.id as href
        from lead_status_history h
        join leads l on l.id = h.lead_id
        left join users u on u.id = h.changed_by
       where l.${column} = $1
    `);
  }

  if (permissions.has('SALES_VIEW')) {
    parts.push(`
      select v.viewed_at as at, 'viewing' as kind,
             'Viewing' as title,
             f.objections as detail,
             coalesce(u.display_name, u.full_name) as by_name,
             '/properties/' || v.property_id as href
        from viewings v
        left join viewing_feedback f on f.viewing_id = v.id
        left join users u on u.id = v.agent_id
       where v.${column} = $1
    `);
    // A person is a transaction's buyer or its seller; there is no person_id
    // on transactions, which is the whole point of keeping the two sides
    // distinct. A property has one.
    const transactionWhere = scope.personId
      ? '(t.buyer_id = $1 or t.seller_id = $1)'
      : 't.property_id = $1';
    parts.push(`
      select h.changed_at as at, 'transaction' as kind,
             'Transaction moved to ' || h.new_status as title,
             h.reason as detail,
             coalesce(u.display_name, u.full_name) as by_name,
             '/sales/transactions/' || t.id as href
        from transaction_status_history h
        join transactions t on t.id = h.transaction_id
        left join users u on u.id = h.changed_by
       where ${transactionWhere}
    `);
  }

  if (permissions.has('COMPLIANCE_VIEW') && scope.personId) {
    parts.push(`
      select h.changed_at as at, 'permission' as kind,
             'Permission for ' || h.channel || ' set to ' || h.new_status as title,
             h.reason as detail,
             coalesce(u.display_name, u.full_name) as by_name,
             null::text as href
        from contact_permission_history h
        left join users u on u.id = h.changed_by
       where h.person_id = $1
    `);
  }

  if (parts.length === 0) return [];

  const rows = await db.query<{
    at: Date;
    kind: string;
    title: string;
    detail: string | null;
    by_name: string | null;
    href: string | null;
  }>(
    `${parts.join(' union all ')} order by at desc limit ${Math.min(200, limit)}`,
    params,
  );

  return rows.map((row) => ({
    at: row.at.toISOString(),
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    byName: row.by_name,
    href: row.href,
  }));
}
