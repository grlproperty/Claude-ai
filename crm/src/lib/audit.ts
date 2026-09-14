import type { Db } from './db.ts';
import type { CurrentUser, RequestMeta } from './session.ts';

/**
 * Audit logging (spec 103) and sensitive-access logging (spec 15, 103).
 *
 * Two separate streams on purpose:
 *   audit_logs            -- what changed, with before and after values
 *   sensitive_access_logs -- what was looked at, never the value looked at
 *
 * Neither ever receives an identity number, a FICA document's contents or a
 * password. redactChanges() enforces that for the fields we know about.
 */

const NEVER_LOG = new Set([
  'id_number', 'identity_number', 'sa_id_number', 'passport_number',
  'password', 'password_hash', 'token', 'token_hash', 'id_number_hash',
  'source_of_funds_detail', 'bank_account_number',
]);

export type FieldChange = { from: unknown; to: unknown };

/** Replaces the value of any sensitive field with a marker before it is stored. */
export function redactChanges(
  changes: Record<string, FieldChange>,
): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {};
  for (const [field, change] of Object.entries(changes)) {
    out[field] = NEVER_LOG.has(field)
      ? { from: change.from == null ? null : '[redacted]', to: change.to == null ? null : '[redacted]' }
      : change;
  }
  return out;
}

/** Only the fields that actually changed, so the log stays readable. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    const same =
      from instanceof Date && to instanceof Date
        ? from.getTime() === to.getTime()
        : JSON.stringify(from) === JSON.stringify(to);
    if (!same) changes[field] = { from, to };
  }
  return changes;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  changes?: Record<string, FieldChange> | null;
  context?: Record<string, unknown> | null;
}

export async function recordAudit(
  db: Db,
  actor: Pick<CurrentUser, 'id' | 'email'> | null,
  meta: RequestMeta,
  entry: AuditEntry,
): Promise<void> {
  await db.query(
    `insert into audit_logs
       (actor_id, actor_email, action, entity_type, entity_id, entity_label,
        changes, context, ip_address, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      actor?.id ?? null,
      actor?.email ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      entry.changes ? JSON.stringify(redactChanges(entry.changes)) : null,
      entry.context ? JSON.stringify(entry.context) : null,
      meta.ip,
      meta.userAgent,
    ],
  );
}

export interface SensitiveAccessEntry {
  /** What was viewed, e.g. 'ID viewed', 'FICA document opened'. Never a value. */
  accessType: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  reason?: string | null;
}

export async function recordSensitiveAccess(
  db: Db,
  actor: Pick<CurrentUser, 'id' | 'email'>,
  meta: RequestMeta,
  entry: SensitiveAccessEntry,
): Promise<void> {
  await db.query(
    `insert into sensitive_access_logs
       (actor_id, actor_email, access_type, entity_type, entity_id, entity_label,
        reason, ip_address, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      actor.id,
      actor.email,
      entry.accessType,
      entry.entityType,
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      entry.reason ?? null,
      meta.ip,
      meta.userAgent,
    ],
  );
}
