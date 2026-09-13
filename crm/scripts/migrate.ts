import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools } from '../src/lib/db.ts';
import { runMigrations } from '../src/lib/migrate.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

try {
  const ran = await runMigrations({ dir, log: (line) => process.stdout.write(`${line}\n`) });
  process.stdout.write(ran === 0 ? 'database is up to date\n' : `${ran} migration(s) applied\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await closePools();
  process.exit(1);
}
await closePools();
