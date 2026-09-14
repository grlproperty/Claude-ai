/**
 * Test harness.
 *
 * Tests run against a real PostgreSQL database as the real application role,
 * so every row level security policy, grant, constraint and trigger is
 * exercised exactly as it will be in production. Nothing is mocked.
 *
 * This module must be imported before anything that touches the database,
 * because it points the connection at the test database.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_ADMIN_URL ?? '';
process.env.SESSION_SECRET ??= 'test-session-secret-not-used-in-production';
process.env.IDENTITY_PEPPER ??= 'test-identity-pepper-not-used-in-production';
process.env.ALLOWED_EMAIL_DOMAINS ??= 'grproperty.co.za';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools, withOwner, withUser, readAsUser, type Db } from '../../src/lib/db.ts';
import { runMigrations } from '../../src/lib/migrate.ts';
import { hashPassword } from '../../src/lib/password.ts';
import type { Permission, RoleCode } from '../../src/lib/permissions.ts';
import type { Ctx } from '../../src/lib/actor.ts';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'db',
  'migrations',
);

let migrated = false;

/**
 * The migration-seeded contents of the tables a TRUNCATE ... CASCADE would
 * empty anyway, captured once while they are still intact.
 */
const seedSnapshot = new Map<string, unknown[]>();

export async function migrateTestDatabase(): Promise<void> {
  if (migrated) return;
  await runMigrations({ dir: migrationsDir });
  await withOwner(async (db) => {
    for (const name of RESCUE_FROM_CASCADE) {
      // Captured as jsonb text rather than as parsed rows: a jsonb column read
      // back as a JS array would be re-sent by pg as a Postgres array literal,
      // which is not valid JSON. Going out and back through jsonb keeps every
      // column's type exactly as the migration wrote it.
      const rows = await db.query<{ row: unknown }>(
        `select to_jsonb(t) as row from public."${name}" t`,
      );
      seedSnapshot.set(name, rows.map((entry) => entry.row));
    }
  });
  migrated = true;
}

/**
 * Reference data seeded by migrations is kept; everything else is cleared.
 * These tables are part of the schema's own configuration, not test data, and
 * clearing them would leave the database in a state production never reaches.
 */
const KEEP = new Set([
  'schema_migrations',
  'roles',
  'permissions',
  'role_permissions',
  'merge_child_tables',
  'tags',
  'lead_sources',
  'lead_loss_reasons',
  'screening_checklist_items',
  // Configurable business values are schema, not test data. Clearing them
  // would leave the database in a state production never reaches, and the
  // compliance preflight reads its thresholds from here.
  'settings',
  // Seeded by migration 010 and editable configuration, not test data.
  'communication_templates',
  // Seeded by migration 011: what the office asks for, not test data.
  'fica_checklist_items',
]);

/** Kept tables that a CASCADE would empty anyway, because they reference users. */
const RESCUE_FROM_CASCADE = ['settings', 'tags', 'communication_templates'];

export async function resetData(): Promise<void> {
  await migrateTestDatabase();
  await withOwner(async (db) => {
    const tables = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    );
    const targets = tables
      .map((t) => t.tablename)
      .filter((name) => !KEEP.has(name))
      .map((name) => `public."${name}"`);

    if (targets.length > 0) {
      await db.query(`truncate table ${targets.join(', ')} restart identity cascade`);
    }

    // TRUNCATE ... CASCADE reaches every table holding a foreign key into one
    // being truncated, so a kept table that records who last touched a row is
    // emptied along with users regardless of being in KEEP. Put the
    // migration-seeded configuration back from the snapshot taken while it
    // was still intact, or it silently vanishes after the first test.
    for (const [name, rows] of seedSnapshot) {
      if (rows.length === 0) continue;
      await db.query(`delete from public."${name}"`);
      for (const row of rows) {
        // Whoever last touched it went with the users, so that comes back as
        // null rather than as a dangling id.
        const clean = { ...(row as Record<string, unknown>) };
        if ('updated_by' in clean) clean.updated_by = null;
        if ('created_by' in clean) clean.created_by = null;
        await db.query(
          `insert into public."${name}"
           select * from jsonb_populate_record(null::public."${name}", $1::jsonb)`,
          [JSON.stringify(clean)],
        );
      }
    }

    // Standalone sequences -- the GRLP reference counters -- are not owned by
    // a column, so TRUNCATE ... RESTART IDENTITY does not touch them.
    const sequences = await db.query<{ sequencename: string }>(
      `select sequencename from pg_sequences where schemaname = 'public'`,
    );
    for (const sequence of sequences) {
      await db.query(`alter sequence public."${sequence.sequencename}" restart with 1`);
    }
  });
}

export interface TestUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  password: string;
}

let userCounter = 0;

/**
 * Creates an active user with one role, using the owner connection so that
 * setting up a scenario never depends on the permissions being tested.
 */
export async function createTestUser(options: {
  role: RoleCode;
  email?: string;
  fullName?: string;
  status?: 'active' | 'invited' | 'suspended' | 'disabled';
  password?: string;
}): Promise<TestUser> {
  userCounter += 1;
  const email = options.email ?? `test.user${userCounter}@grproperty.co.za`;
  const fullName = options.fullName ?? `Test User ${userCounter}`;
  const password = options.password ?? 'correct horse battery staple';
  const passwordHash = await hashPassword(password);

  const id = await withOwner(async (db) => {
    const row = await db.one<{ id: string }>(
      `insert into users (email, full_name, status, password_hash, password_set_at)
       values ($1, $2, $3, $4, now())
       returning id`,
      [email, fullName, options.status ?? 'active', passwordHash],
    );
    await db.query(
      'insert into user_roles (user_id, role_id) select $1, id from roles where code = $2',
      [row.id, options.role],
    );
    return row.id;
  });

  return { id, email, fullName, role: options.role, password };
}

/** Runs work in a write transaction with row level security set to this user. */
export function asUser<T>(user: TestUser | string, work: (db: Db) => Promise<T>): Promise<T> {
  return withUser(typeof user === 'string' ? user : user.id, work);
}

/** Runs work in a read-only transaction with row level security set to this user. */
export function readingAs<T>(user: TestUser | string, work: (db: Db) => Promise<T>): Promise<T> {
  return readAsUser(typeof user === 'string' ? user : user.id, work);
}

/** Setup helper that needs no policy to succeed. */
export { withOwner as asOwner };

export async function shutdown(): Promise<void> {
  await closePools();
}

/** Asserts that a promise rejects, and returns the error for inspection. */
export async function rejects(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the operation to be refused, but it succeeded.');
}

/**
 * The actor context a data module expects, with the permissions actually
 * held by that user read back from the database rather than assumed.
 */
export async function ctxFor(user: TestUser | string): Promise<Ctx> {
  const id = typeof user === 'string' ? user : user.id;
  const row = await withOwner((db) =>
    db.one<{ email: string; codes: string[] }>(
      `select u.email,
              coalesce((select array_agg(distinct p.code)
                          from user_roles ur
                          join role_permissions rp on rp.role_id = ur.role_id
                          join permissions p on p.id = rp.permission_id
                         where ur.user_id = u.id), '{}'::text[]) as codes
         from users u where u.id = $1`,
      [id],
    ),
  );
  return {
    actor: { id, email: row.email, permissions: new Set(row.codes as Permission[]) },
    meta: { ip: '198.51.100.10', userAgent: 'test' },
  };
}
