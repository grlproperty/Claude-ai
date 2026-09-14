import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';

/**
 * Notifications inside the CRM (spec 90).
 *
 * These are in-app only. THE CRM SENDS NOTHING: no email, no SMS, no push,
 * no WhatsApp. A notification is a row somebody sees the next time they
 * open the CRM, and nothing here ever claims a message left the building
 * (spec 6, 115, 143).
 */

export const NOTIFICATION_KINDS = {
  task_due: 'A task is due',
  task_assigned: 'A task was given to you',
  lead_assigned: 'A lead was given to you',
  record_assigned: 'A record was assigned to you',
  mandate_expiring: 'A mandate is expiring',
  fica_expiring: 'A FICA file needs refreshing',
  commission_waiting: 'A commission is waiting for approval',
  commission_decided: 'A commission you worked out was decided',
  import_finished: 'An import finished',
  mention: 'Somebody noted you',
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Tells somebody something.
 *
 * Writing a notification must never be the reason an action fails — the
 * work itself has already been done and committed logic should not be
 * undone by a failed courtesy — so problems are swallowed and logged.
 */
export async function notify(
  db: Db,
  input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body?: string | null;
    href?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<void> {
  try {
    // Through app.notify rather than a direct insert: the policy on the
    // table keeps each person's notifications to themselves, which is right
    // for reading and would stop one user telling another anything. The
    // function is the one narrow way across that line.
    await db.query(
      'select app.notify($1,$2,$3,$4,$5,$6,$7)',
      [
        input.userId,
        input.kind,
        input.title,
        input.body ?? null,
        input.href ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    );
  } catch (error) {
    console.error('[notifications] could not write', (error as Error).message);
  }
}

/** Everybody who should hear about something, without telling them twice. */
export async function notifyMany(
  db: Db,
  userIds: readonly string[],
  input: Omit<Parameters<typeof notify>[1], 'userId'>,
): Promise<void> {
  for (const userId of new Set(userIds.filter(Boolean))) {
    await notify(db, { ...input, userId });
  }
}

/** Everybody who may approve commission, for the one notification that needs it. */
export async function usersWithPermission(db: Db, permission: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `select distinct u.id
       from users u
       join user_roles ur on ur.user_id = u.id
       join role_permissions rp on rp.role_id = ur.role_id
       join permissions p on p.id = rp.permission_id
      where u.status = 'active' and p.code = $1`,
    [permission],
  );
  return rows.map((row) => row.id);
}

export async function listNotifications(
  db: Db,
  actorId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const rows = await db.query<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    entity_type: string | null;
    entity_id: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `select id, kind, title, body, href, entity_type, entity_id, read_at, created_at
       from notifications
      where user_id = $1 and (not $2::boolean or read_at is null)
      order by read_at nulls first, created_at desc
      limit $3`,
    [actorId, options.unreadOnly ?? false, Math.min(options.limit ?? 50, 200)],
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function unreadCount(db: Db, actorId: string): Promise<number> {
  const row = await db.one<{ count: number }>(
    'select count(*)::int as count from notifications where user_id = $1 and read_at is null',
    [actorId],
  );
  return Number(row.count);
}

export async function markRead(db: Db, ctx: Ctx, id: string): Promise<void> {
  await db.query(
    'update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null',
    [id, ctx.actor.id],
  );
}

export async function markAllRead(db: Db, ctx: Ctx): Promise<number> {
  return db.count(
    'update notifications set read_at = now() where user_id = $1 and read_at is null',
    [ctx.actor.id],
  );
}
