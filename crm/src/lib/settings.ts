import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { recordAudit } from './audit.ts';

/**
 * Configurable business values (spec 103).
 *
 * Anything the office might reasonably want to change — a price, a threshold,
 * how long a check stays current — lives in the settings table rather than in
 * code, so changing it does not need a deployment.
 */

export interface SettingRow {
  key: string;
  value: unknown;
  category: string;
  label: string;
  description: string | null;
  isSensitive: boolean;
  updatedAt: string;
  updatedByName: string | null;
}

export async function listSettings(db: Db, category?: string): Promise<SettingRow[]> {
  const rows = await db.query<{
    key: string;
    value: unknown;
    category: string;
    label: string;
    description: string | null;
    is_sensitive: boolean;
    updated_at: Date;
    updated_by_name: string | null;
  }>(
    `select s.key, s.value, s.category, s.label, s.description, s.is_sensitive,
            s.updated_at, coalesce(u.display_name, u.full_name) as updated_by_name
       from settings s
       left join users u on u.id = s.updated_by
      where ($1::text is null or s.category = $1)
      order by s.category, s.label`,
    [category ?? null],
  );
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    category: row.category,
    label: row.label,
    description: row.description,
    isSensitive: row.is_sensitive,
    updatedAt: row.updated_at.toISOString(),
    updatedByName: row.updated_by_name,
  }));
}

/**
 * Reads one setting, falling back when it is missing or unreadable.
 *
 * A setting the reader is not allowed to see comes back as no row at all
 * under row level security, so the fallback matters: callers must not be able
 * to tell a hidden setting from an absent one.
 */
export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.maybeOne<{ value: unknown }>('select value from settings where key = $1', [
    key,
  ]);
  if (!row || row.value === null || row.value === undefined) return fallback;
  return row.value as T;
}

export async function getNumberSetting(
  db: Db,
  key: string,
  fallback: number,
): Promise<number> {
  const value = await getSetting<unknown>(db, key, fallback);
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function setSetting(
  db: Db,
  ctx: Ctx,
  key: string,
  value: unknown,
): Promise<void> {
  const before = await db.maybeOne<{ value: unknown; is_sensitive: boolean }>(
    'select value, is_sensitive from settings where key = $1',
    [key],
  );

  await db.query(
    `update settings set value = $2::jsonb, updated_at = now(), updated_by = $3 where key = $1`,
    [key, JSON.stringify(value), ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'setting.changed',
    entityType: 'setting',
    entityId: key,
    // A sensitive setting's value is never written to the audit log (spec 15).
    changes: before?.is_sensitive
      ? { value: { from: '[hidden]', to: '[hidden]' } }
      : { value: { from: before?.value ?? null, to: value } },
  });
}
