/**
 * Drops everything the application owns and re-applies every migration.
 *
 * For local development only. It refuses to run against anything that does
 * not look like a development or test database, because there is no undo:
 * this removes real client records, audit history and documents.
 */
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools, ownerPool } from '../src/lib/db.ts';
import { runMigrations } from '../src/lib/migrate.ts';

const url = process.env.DATABASE_ADMIN_URL ?? '';
const database = url.split('/').pop()?.split('?')[0] ?? '';
const looksLocal = /^(127\.0\.0\.1|localhost)/.test(new URL(url).hostname);
const looksDisposable = /(_dev|_test|_local)$|^grlp_crm$/.test(database);

if (!looksLocal || !looksDisposable) {
  console.error(
    `Refusing to reset "${database}". This script only runs against a local ` +
      'development or test database.',
  );
  await closePools();
  process.exit(1);
}

if (process.stdin.isTTY && !process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This deletes everything in "${database}", including audit history. Type the ` +
      'database name to continue: ',
  );
  rl.close();
  if (answer.trim() !== database) {
    console.error('Not confirmed. Nothing was changed.');
    await closePools();
    process.exit(1);
  }
}

try {
  const pool = ownerPool();
  // The app role's grants live on these schemas, so they go too and are
  // rebuilt by the migrations exactly as a fresh install would have them.
  await pool.query('drop schema if exists app cascade');
  await pool.query('drop schema public cascade');
  await pool.query('create schema public');
  await pool.query('grant usage on schema public to grlp_app');

  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  const ran = await runMigrations({ dir, log: (line) => process.stdout.write(`${line}\n`) });
  process.stdout.write(`reset "${database}" and applied ${ran} migration(s)\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await closePools();
  process.exit(1);
}
await closePools();
