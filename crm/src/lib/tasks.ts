import { z } from 'zod';
import { agentToKeep, type Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';
import { notify } from './notifications.ts';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  TASK_STATUSES,
  TASK_TYPES,
  type AppointmentStatus,
  type AppointmentType,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
  type TaskType,
} from './domain.ts';
import { optionalDate, optionalDateTime, optionalText, optionalUuid, requiredText } from './validate.ts';

/**
 * Tasks, follow-ups and the calendar (spec 43, 44, 45, 94).
 *
 * The point of this module is the question at the top of spec 116: what does
 * the agent need to do next? Everything here exists to answer it — due
 * today, overdue, upcoming, and the records with no next action at all.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const taskInputSchema = z.object({
  assignedUserId: optionalUuid,
  personId: optionalUuid,
  propertyId: optionalUuid,
  leadId: optionalUuid,
  transactionId: optionalUuid,
  taskType: z.enum(keys(TASK_TYPES)).default('follow_up'),
  title: requiredText('A short description of the task', 200),
  dueAt: optionalDateTime,
  priority: z.enum(keys(TASK_PRIORITIES)).default('normal'),
  status: z.enum(keys(TASK_STATUSES)).default('to_do'),
  notes: optionalText,
  recurrence: z.enum(keys(TASK_RECURRENCES)).default('none'),
  recurrenceUntil: optionalDate,
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const appointmentInputSchema = z
  .object({
    appointmentType: z.enum(keys(APPOINTMENT_TYPES)).default('viewing'),
    title: requiredText('A short description of the appointment', 200),
    agentId: optionalUuid,
    personId: optionalUuid,
    propertyId: optionalUuid,
    leadId: optionalUuid,
    startsAt: z.string().min(1, 'When does the appointment start?'),
    endsAt: optionalDateTime,
    location: optionalText,
    status: z.enum(keys(APPOINTMENT_STATUSES)).default('scheduled'),
    notes: optionalText,
  })
  .superRefine((input, ctx) => {
    if (input.endsAt && new Date(input.endsAt) < new Date(input.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The appointment cannot end before it starts.',
      });
    }
  });
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export interface TaskSummary {
  id: string;
  title: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  recurrence: TaskRecurrence;
  notes: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  personId: string | null;
  personName: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  leadId: string | null;
  personMobile: string | null;
  personEmail: string | null;
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
  rowVersion: number;
}

const TASK_COLUMNS = `
  t.id, t.title, t.task_type, t.status, t.priority, t.due_at, t.recurrence, t.notes,
  t.assigned_user_id, t.person_id, t.property_id, t.lead_id,
  t.completed_at, t.created_at, t.row_version,
  coalesce(au.display_name, au.full_name) as assigned_user_name,
  coalesce(cu.display_name, cu.full_name) as completed_by_name,
  pe.first_name || ' ' || pe.surname as person_name,
  nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active
       and c.contact_type in ('mobile','whatsapp','alternative_mobile')
     order by c.is_primary desc limit 1) as person_mobile,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active and c.contact_type = 'email'
     order by c.is_primary desc limit 1) as person_email
  from tasks t
  left join users au on au.id = t.assigned_user_id
  left join users cu on cu.id = t.completed_by
  left join people pe on pe.id = t.person_id
  left join properties pr on pr.id = t.property_id
`;

interface TaskRow {
  id: string;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: Date | null;
  recurrence: TaskRecurrence;
  notes: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  person_id: string | null;
  person_name: string | null;
  property_id: string | null;
  property_label: string | null;
  lead_id: string | null;
  person_mobile: string | null;
  person_email: string | null;
  completed_at: Date | null;
  completed_by_name: string | null;
  created_at: Date;
  row_version: number;
}

function toTask(row: TaskRow): TaskSummary {
  return {
    id: row.id,
    title: row.title,
    taskType: row.task_type,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at?.toISOString() ?? null,
    recurrence: row.recurrence,
    notes: row.notes,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    personId: row.person_id,
    personName: row.person_name,
    propertyId: row.property_id,
    propertyLabel: row.property_label,
    leadId: row.lead_id,
    personMobile: row.person_mobile,
    personEmail: row.person_email,
    completedAt: row.completed_at?.toISOString() ?? null,
    completedByName: row.completed_by_name,
    createdAt: row.created_at.toISOString(),
    rowVersion: row.row_version,
  };
}

/** The four views that make follow-up management easy (spec 44). */
export type TaskView = 'due_today' | 'overdue' | 'upcoming' | 'open' | 'completed' | 'all';

export interface TaskFilters {
  view?: TaskView;
  assignedUserId?: string | null;
  taskType?: string;
  priority?: string;
  personId?: string;
  propertyId?: string;
  leadId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export async function listTasks(
  db: Db,
  filters: TaskFilters,
): Promise<{ rows: TaskSummary[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const openStatuses = ['to_do', 'in_progress'];
  switch (filters.view ?? 'open') {
    case 'due_today':
      where.push(`t.status = any(${add(openStatuses)})`);
      where.push("t.due_at::date = (now() at time zone 'Africa/Johannesburg')::date");
      break;
    case 'overdue':
      where.push(`t.status = any(${add(openStatuses)})`);
      where.push('t.due_at is not null and t.due_at < now()');
      break;
    case 'upcoming':
      where.push(`t.status = any(${add(openStatuses)})`);
      where.push('t.due_at is not null and t.due_at > now()');
      break;
    case 'open':
      where.push(`t.status = any(${add(openStatuses)})`);
      break;
    case 'completed':
      where.push("t.status = 'completed'");
      break;
    default:
      break;
  }

  if (filters.assignedUserId) where.push(`t.assigned_user_id = ${add(filters.assignedUserId)}`);
  if (filters.taskType && filters.taskType !== 'all') {
    where.push(`t.task_type = ${add(filters.taskType)}`);
  }
  if (filters.priority && filters.priority !== 'all') {
    where.push(`t.priority = ${add(filters.priority)}`);
  }
  if (filters.personId) where.push(`t.person_id = ${add(filters.personId)}`);
  if (filters.propertyId) where.push(`t.property_id = ${add(filters.propertyId)}`);
  if (filters.leadId) where.push(`t.lead_id = ${add(filters.leadId)}`);
  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(lower(t.title) like ${like} or lower(coalesce(t.notes,'')) like ${like})`);
  }

  const whereSql = where.length > 0 ? where.join(' and ') : 'true';
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 50));

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n from tasks t where ${whereSql}`,
    params,
  );
  const rows = await db.query<TaskRow>(
    `select ${TASK_COLUMNS}
      where ${whereSql}
      order by
        case t.status when 'in_progress' then 0 when 'to_do' then 1 else 2 end,
        t.due_at asc nulls last,
        case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toTask), total: totalRow.n, page, pageSize };
}

export async function getTask(db: Db, id: string): Promise<TaskSummary | null> {
  const row = await db.maybeOne<TaskRow>(`select ${TASK_COLUMNS} where t.id = $1`, [id]);
  return row ? toTask(row) : null;
}

/** How many are due today, overdue and upcoming, for the dashboard counters. */
export async function taskCounts(
  db: Db,
  assignedUserId?: string | null,
): Promise<{ dueToday: number; overdue: number; upcoming: number; open: number }> {
  const params: unknown[] = [];
  let scope = '';
  if (assignedUserId) {
    params.push(assignedUserId);
    scope = 'and t.assigned_user_id = $1';
  }
  return db.one<{ dueToday: number; overdue: number; upcoming: number; open: number }>(
    `select
       count(*) filter (
         where t.due_at::date = (now() at time zone 'Africa/Johannesburg')::date
       )::int as "dueToday",
       count(*) filter (where t.due_at is not null and t.due_at < now())::int as overdue,
       count(*) filter (where t.due_at is not null and t.due_at > now())::int as upcoming,
       count(*)::int as open
     from tasks t
     where t.status in ('to_do','in_progress') ${scope}`,
    params,
  );
}

const TASK_AUDITED = [
  'assigned_user_id', 'task_type', 'title', 'due_at', 'priority', 'status',
  'notes', 'recurrence', 'recurrence_until',
] as const;

export async function createTask(db: Db, ctx: Ctx, input: TaskInput): Promise<{ id: string }> {
  // A task with nobody on it is nobody's job, so it falls to whoever set it.
  const assignedUserId = input.assignedUserId ?? ctx.actor.id;

  const row = await db.one<{ id: string }>(
    `insert into tasks
       (assigned_user_id, person_id, property_id, lead_id, transaction_id, task_type, title,
        due_at, priority, status, notes, recurrence, recurrence_until,
        completed_at, completed_by, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             case when $10 = 'completed' then now() end,
             case when $10 = 'completed' then $14::uuid end,
             $14,$14)
     returning id`,
    [
      assignedUserId, input.personId, input.propertyId, input.leadId, input.transactionId,
      input.taskType, input.title, input.dueAt, input.priority, input.status, input.notes,
      input.recurrence, input.recurrenceUntil, ctx.actor.id,
    ],
  );

  // A task given to somebody else is the one thing worth telling them.
  // In-app only: the CRM sends no email and no message (spec 6, 90).
  if (assignedUserId !== ctx.actor.id) {
    await notify(db, {
      userId: assignedUserId,
      kind: 'task_assigned',
      title: input.title,
      body: input.dueAt ? `Due ${input.dueAt.slice(0, 10)}.` : 'No due date set.',
      href: `/tasks?view=open`,
      entityType: 'task',
      entityId: row.id,
    });
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'task.created',
    entityType: 'task',
    entityId: row.id,
    entityLabel: input.title,
    context: {
      assignedUserId,
      dueAt: input.dueAt,
      personId: input.personId,
      propertyId: input.propertyId,
      leadId: input.leadId,
    },
  });

  // A follow-up set against a person is also that person's next action.
  if (input.personId && input.dueAt) {
    await db.query(
      `update people set next_follow_up_at = least(coalesce(next_follow_up_at, $2::timestamptz), $2::timestamptz)
        where id = $1`,
      [input.personId, input.dueAt],
    );
  }
  if (input.leadId && input.dueAt) {
    await db.query(
      `update leads set next_follow_up_at = least(coalesce(next_follow_up_at, $2::timestamptz), $2::timestamptz)
        where id = $1`,
      [input.leadId, input.dueAt],
    );
  }

  return { id: row.id };
}

export async function updateTask(
  db: Db,
  ctx: Ctx,
  taskId: string,
  input: TaskInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from tasks where id = $1',
    [taskId],
  );
  if (!before) throw new NotFoundError('That task');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const updated = await db.query<Record<string, unknown>>(
    `update tasks set
        assigned_user_id=$2, person_id=$3, property_id=$4, lead_id=$5, transaction_id=$6,
        task_type=$7, title=$8, due_at=$9, priority=$10, status=$11, notes=$12,
        recurrence=$13, recurrence_until=$14,
        completed_at = case when $11 = 'completed' then coalesce(completed_at, now()) else null end,
        completed_by = case when $11 = 'completed' then coalesce(completed_by, $15::uuid) else null end,
        updated_by=$15
      where id=$1 and row_version=$16
      returning *`,
    [
      taskId, input.assignedUserId, input.personId, input.propertyId, input.leadId,
      input.transactionId, input.taskType, input.title, input.dueAt, input.priority,
      input.status, input.notes, input.recurrence, input.recurrenceUntil,
      ctx.actor.id, expectedVersion,
    ],
  );
  if (!updated[0]) throw new ConcurrencyError();

  const changes = diff(before, updated[0], TASK_AUDITED);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'task.updated',
      entityType: 'task',
      entityId: taskId,
      entityLabel: input.title,
      changes,
    });
  }
}

/** Ticking a task off from a list. A recurring task creates its next instance. */
export async function completeTask(db: Db, ctx: Ctx, taskId: string): Promise<void> {
  const row = await db.maybeOne<{ title: string; status: string; recurrence: string }>(
    'select title, status, recurrence from tasks where id = $1',
    [taskId],
  );
  if (!row) throw new NotFoundError('That task');
  if (row.status === 'completed') return;

  await db.query(
    `update tasks set status = 'completed', completed_at = now(), completed_by = $2, updated_by = $2
      where id = $1`,
    [taskId, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'task.completed',
    entityType: 'task',
    entityId: taskId,
    entityLabel: row.title,
    context: row.recurrence === 'none' ? null : { repeats: row.recurrence },
  });
}

export async function cancelTask(
  db: Db,
  ctx: Ctx,
  taskId: string,
  reason: string | null,
): Promise<void> {
  const affected = await db.count(
    `update tasks set status = 'cancelled', updated_by = $2
      where id = $1 and status <> 'completed'`,
    [taskId, ctx.actor.id],
  );
  if (affected === 0) throw new NotFoundError('That task');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'task.cancelled',
    entityType: 'task',
    entityId: taskId,
    context: { reason },
  });
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface AppointmentSummary {
  id: string;
  appointmentType: AppointmentType;
  title: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  agentId: string | null;
  agentName: string | null;
  personId: string | null;
  personName: string | null;
  personMobile: string | null;
  personEmail: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  leadId: string | null;
  rowVersion: number;
}

const APPOINTMENT_COLUMNS = `
  a.id, a.appointment_type, a.title, a.status, a.starts_at, a.ends_at, a.location, a.notes,
  a.agent_id, a.person_id, a.property_id, a.lead_id, a.row_version,
  coalesce(ag.display_name, ag.full_name) as agent_name,
  pe.first_name || ' ' || pe.surname as person_name,
  nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active
       and c.contact_type in ('mobile','whatsapp','alternative_mobile')
     order by c.is_primary desc limit 1) as person_mobile,
  (select c.value from person_contacts c
     where c.person_id = pe.id and c.is_active and c.contact_type = 'email'
     order by c.is_primary desc limit 1) as person_email
  from appointments a
  left join users ag on ag.id = a.agent_id
  left join people pe on pe.id = a.person_id
  left join properties pr on pr.id = a.property_id
`;

interface AppointmentRow {
  id: string;
  appointment_type: AppointmentType;
  title: string;
  status: AppointmentStatus;
  starts_at: Date;
  ends_at: Date | null;
  location: string | null;
  notes: string | null;
  agent_id: string | null;
  agent_name: string | null;
  person_id: string | null;
  person_name: string | null;
  person_mobile: string | null;
  person_email: string | null;
  property_id: string | null;
  property_label: string | null;
  lead_id: string | null;
  row_version: number;
}

function toAppointment(row: AppointmentRow): AppointmentSummary {
  return {
    id: row.id,
    appointmentType: row.appointment_type,
    title: row.title,
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
    location: row.location,
    notes: row.notes,
    agentId: row.agent_id,
    agentName: row.agent_name,
    personId: row.person_id,
    personName: row.person_name,
    personMobile: row.person_mobile,
    personEmail: row.person_email,
    propertyId: row.property_id,
    propertyLabel: row.property_label,
    leadId: row.lead_id,
    rowVersion: row.row_version,
  };
}

export async function listAppointments(
  db: Db,
  filters: {
    from?: string;
    to?: string;
    agentId?: string | null;
    appointmentType?: string;
    status?: string;
    personId?: string;
    propertyId?: string;
    leadId?: string;
    limit?: number;
  },
): Promise<AppointmentSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.from) where.push(`a.starts_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`a.starts_at < ${add(filters.to)}`);
  if (filters.agentId) where.push(`a.agent_id = ${add(filters.agentId)}`);
  if (filters.appointmentType && filters.appointmentType !== 'all') {
    where.push(`a.appointment_type = ${add(filters.appointmentType)}`);
  }
  if (filters.status && filters.status !== 'all') where.push(`a.status = ${add(filters.status)}`);
  if (filters.personId) where.push(`a.person_id = ${add(filters.personId)}`);
  if (filters.propertyId) where.push(`a.property_id = ${add(filters.propertyId)}`);
  if (filters.leadId) where.push(`a.lead_id = ${add(filters.leadId)}`);

  const rows = await db.query<AppointmentRow>(
    `select ${APPOINTMENT_COLUMNS}
      where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by a.starts_at
      limit ${add(filters.limit ?? 500)}`,
    params,
  );
  return rows.map(toAppointment);
}

export async function getAppointment(db: Db, id: string): Promise<AppointmentSummary | null> {
  const row = await db.maybeOne<AppointmentRow>(`select ${APPOINTMENT_COLUMNS} where a.id = $1`, [
    id,
  ]);
  return row ? toAppointment(row) : null;
}

export async function createAppointment(
  db: Db,
  ctx: Ctx,
  input: AppointmentInput,
): Promise<{ id: string }> {
  const agentId = input.agentId ?? ctx.actor.id;
  const row = await db.one<{ id: string }>(
    `insert into appointments
       (appointment_type, title, agent_id, person_id, property_id, lead_id,
        starts_at, ends_at, location, status, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     returning id`,
    [
      input.appointmentType, input.title, agentId, input.personId, input.propertyId,
      input.leadId, input.startsAt, input.endsAt, input.location, input.status,
      input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'appointment.created',
    entityType: 'appointment',
    entityId: row.id,
    entityLabel: input.title,
    context: { appointmentType: input.appointmentType, startsAt: input.startsAt, agentId },
  });
  return { id: row.id };
}

export async function updateAppointment(
  db: Db,
  ctx: Ctx,
  appointmentId: string,
  input: AppointmentInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from appointments where id = $1',
    [appointmentId],
  );
  if (!before) throw new NotFoundError('That appointment');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const agentId = agentToKeep(ctx.actor, input.agentId, before.agent_id as string | null);

  const updated = await db.query<Record<string, unknown>>(
    `update appointments set
        appointment_type=$2, title=$3, agent_id=$4, person_id=$5, property_id=$6, lead_id=$7,
        starts_at=$8, ends_at=$9, location=$10, status=$11, notes=$12, updated_by=$13
      where id=$1 and row_version=$14
      returning *`,
    [
      appointmentId, input.appointmentType, input.title, agentId, input.personId,
      input.propertyId, input.leadId, input.startsAt, input.endsAt, input.location,
      input.status, input.notes, ctx.actor.id, expectedVersion,
    ],
  );
  if (!updated[0]) throw new ConcurrencyError();

  const changes = diff(before, updated[0], [
    'appointment_type', 'title', 'agent_id', 'starts_at', 'ends_at', 'location', 'status', 'notes',
  ]);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'appointment.updated',
      entityType: 'appointment',
      entityId: appointmentId,
      entityLabel: input.title,
      changes,
    });
  }
}

export async function setAppointmentStatus(
  db: Db,
  ctx: Ctx,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<void> {
  const affected = await db.count(
    'update appointments set status = $2, updated_by = $3 where id = $1',
    [appointmentId, status, ctx.actor.id],
  );
  if (affected === 0) throw new NotFoundError('That appointment');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'appointment.status_changed',
    entityType: 'appointment',
    entityId: appointmentId,
    context: { status },
  });
}

/**
 * Records with nothing planned (spec 44).
 *
 * The list nobody wants to look at and everybody needs: clients and live
 * leads with no next action set and no open task against them.
 */
export async function listWithoutNextAction(
  db: Db,
  options: { agentId?: string | null; limit?: number } = {},
): Promise<{
  people: { id: string; clientRef: string; name: string; lastContactAt: string | null }[];
  leads: { id: string; personName: string | null; leadType: string; createdAt: string }[];
}> {
  const params: unknown[] = [];
  let personScope = '';
  let leadScope = '';
  if (options.agentId) {
    params.push(options.agentId);
    personScope = 'and (p.primary_agent_id = $1 or p.secondary_agent_id = $1)';
    leadScope = 'and (l.primary_agent_id = $1 or l.secondary_agent_id = $1)';
  }
  const limit = options.limit ?? 25;

  const [people, leads] = await Promise.all([
    db.query<{ id: string; client_ref: string; name: string; last_contact_at: Date | null }>(
      `select p.id, p.client_ref, p.first_name || ' ' || p.surname as name, p.last_contact_at
         from people p
        where not p.is_archived and p.merged_into_id is null
          and p.next_follow_up_at is null
          and not exists (
            select 1 from tasks t
             where t.person_id = p.id and t.status in ('to_do','in_progress'))
          ${personScope}
        order by p.last_contact_at asc nulls first
        limit ${limit}`,
      params,
    ),
    db.query<{ id: string; person_name: string | null; lead_type: string; created_at: Date }>(
      `select l.id, pe.first_name || ' ' || pe.surname as person_name, l.lead_type, l.created_at
         from leads l
         left join people pe on pe.id = l.person_id
        where not l.is_archived
          and l.status not in ('won','lost','archived')
          and l.next_follow_up_at is null
          and not exists (
            select 1 from tasks t
             where t.lead_id = l.id and t.status in ('to_do','in_progress'))
          ${leadScope}
        order by l.created_at asc
        limit ${limit}`,
      params,
    ),
  ]);

  return {
    people: people.map((row) => ({
      id: row.id,
      clientRef: row.client_ref,
      name: row.name,
      lastContactAt: row.last_contact_at?.toISOString() ?? null,
    })),
    leads: leads.map((row) => ({
      id: row.id,
      personName: row.person_name,
      leadType: row.lead_type,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
