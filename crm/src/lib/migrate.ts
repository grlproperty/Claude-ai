import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerPool } from './db.ts';

/**
 * Applies every file in db/migrations in filename order, each in its own
 * transaction, as the schema owner. Applied files are recorded with a
 * checksum so an already-applied migration cannot be edited unnoticed.
 */
export async function runMigrations(options: { dir: string; log?: (line: string) => void } ): Promise<number> {
  const log = options.log ?? (() => {});
  const pool = ownerPool();

  await pool.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const existing = await pool.query<{ filename: string; checksum: string }>(
    'select filename, checksum from schema_migrations',
  );
  const applied = new Map(existing.rows.map((row) => [row.filename, row.checksum]));

  const files = (await readdir(options.dir)).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;

  for (const filename of files) {
    const sql = await readFile(join(options.dir, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `${filename} has already been applied but its contents have changed. ` +
            'Add a new migration instead of editing an applied one.',
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename, checksum) values ($1, $2)', [
        filename,
        checksum,
      ]);
      await client.query('commit');
      log(`applied ${filename}`);
      ran += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(`${filename} failed: ${(error as Error).message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  return ran;
}
