/**
 * Copies ONE business, with the engine, into a new folder so it can live in
 * its own private repository:  node engine/export-business.mjs <business> <destination>
 * Runtime data (the data/ directory) is never copied.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AIOS_ROOT, listTenants } from './tenant.mjs';

const [id, dest] = process.argv.slice(2);
if (!listTenants().includes(id) || !dest) { console.error(`Usage: node engine/export-business.mjs <${listTenants().join('|')}> <destination>`); process.exit(1); }
const out = resolve(dest);
if (existsSync(out) && readdirSync(out).length) { console.error(`${out} is not empty — nothing copied`); process.exit(1); }
mkdirSync(out, { recursive: true });
for (const f of ['engine', 'package.json', 'package-lock.json', '.gitignore']) if (existsSync(join(AIOS_ROOT, f))) cpSync(join(AIOS_ROOT, f), join(out, f), { recursive: true });
cpSync(join(AIOS_ROOT, id), join(out, id), { recursive: true, filter: (src) => !src.startsWith(join(AIOS_ROOT, id, 'data')) });
console.log(`Exported ${id} to ${out}\nNext: cd ${out} && npm install && node --no-warnings engine/cli.mjs ${id} status\nIf this business declares a mount in tenant.json, update its path for the new location.`);
