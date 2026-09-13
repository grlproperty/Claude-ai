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

export async function migrateTestDatabase(): Promise<void> {
  if (migrated) return;
  await runMigrations({ dir: migrationsDir });
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
]);

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
