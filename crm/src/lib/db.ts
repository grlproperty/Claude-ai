import pg from 'pg';
import { env } from './env.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';

const { Pool } = pg;

/**
 * Numeric and bigint columns arrive as strings by default so that precision
 * is never quietly lost. Money is handled as a decimal string end to end and
 * only converted where it is formatted or calculated, in money.ts.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Exactly one row, or a friendly not-found error. */
  one<T = Row>(text: string, params?: readonly unknown[], what?: string): Promise<T>;
  /** One row or null. */
  maybeOne<T = Row>(text: string, params?: readonly unknown[]): Promise<T | null>;
  /** Rows affected by a write. */
  count(text: string, params?: readonly unknown[]): Promise<number>;
}

let appPool: pg.Pool | null = null;
let adminPool: pg.Pool | null = null;

function makePool(connectionString: string, application_name: string): pg.Pool {
  const pool = new Pool({
    connectionString,
    application_name,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Set at connection time rather than in a 'connect' handler, so a
    // runaway query cannot slip through before the setting is applied.
    options: '-c statement_timeout=30s -c idle_in_transaction_session_timeout=60s',
  });
  pool.on('error', (err) => {
    console.error('[db] idle client error', err.message);
  });
  return pool;
}

/** The application pool. This role has neither SUPERUSER nor BYPASSRLS. */
export function pool(): pg.Pool {
  appPool ??= makePool(env.databaseUrl(), 'grlp-crm');
  return appPool;
}

/** The owner pool. Migrations only; never used to serve a request. */
export function ownerPool(): pg.Pool {
  adminPool ??= makePool(env.adminDatabaseUrl(), 'grlp-crm-migrate');
  return adminPool;
}

export async function closePools(): Promise<void> {
  await appPool?.end();
  await adminPool?.end();
  appPool = null;
  adminPool = null;
}

function wrap(client: pg.PoolClient): Db {
  return {
    async query<T = Row>(text: string, params: readonly unknown[] = []): Promise<T[]> {
      const result = await client.query(text, params as unknown[]);
      return result.rows as T[];
    },
    async one<T = Row>(
      text: string,
      params: readonly unknown[] = [],
      what = 'That record',
    ): Promise<T> {
      const result = await client.query(text, params as unknown[]);
      const first = result.rows[0] as T | undefined;
      if (first === undefined) throw new NotFoundError(what);
      return first;
    },
    async maybeOne<T = Row>(text: string, params: readonly unknown[] = []): Promise<T | null> {
      const result = await client.query(text, params as unknown[]);
      return (result.rows[0] as T | undefined) ?? null;
    },
    async count(text: string, params: readonly unknown[] = []): Promise<number> {
      const result = await client.query(text, params as unknown[]);
      return result.rowCount ?? 0;
    },
  };
}

/**
 * Runs work in a single transaction with the row level security context set
 * to the given user. Every policy in the schema reads app.user_id, so this
 * is what makes the database enforce authorisation rather than the UI.
 *
 * Pass null only for genuinely pre-authentication work (sign in, accepting
 * an invitation, first-run setup), which reaches the database through
 * SECURITY DEFINER functions instead of table access.
 */
export async function withUser<T>(
  userId: string | null,
  work: (db: Db) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', ['app.user_id', userId ?? '']);
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* the connection is already gone; the transaction is discarded anyway */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Read-only variant. The transaction is declared read only so a stray write fails loudly. */
export async function readAsUser<T>(
  userId: string | null,
  work: (db: Db) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin read only');
    await client.query('select set_config($1, $2, true)', ['app.user_id', userId ?? '']);
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Transaction as the schema owner. Migrations and maintenance only. */
export async function withOwner<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const client = await ownerPool().connect();
  try {
    await client.query('begin');
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Optimistic concurrency (spec 105). An update guarded by the row version
 * the user actually loaded either applies or reports that someone else got
 * there first; it never silently overwrites.
 */
export async function updateGuarded(
  db: Db,
  sql: string,
  params: readonly unknown[],
): Promise<void> {
  const affected = await db.count(sql, params);
  if (affected === 0) throw new ConcurrencyError();
}
