/**
 * Checks that everything on sale can actually be delivered.
 *
 * Every product in the shop takes payment through a PayPal link, and delivery
 * is manual: the notification arrives, the file goes out by hand. So the
 * failure mode is silent and entirely on this side — a live buy button for a
 * document that is not where it should be, found out only once somebody has
 * already paid.
 *
 * Two things are checked, because a file that exists is not the same as a file
 * that matches what was advertised:
 *
 *   1. Is the deliverable there?
 *   2. Does its real page count match the number on the shop page?
 *
 * The second one matters on this site in particular. A publication that audits
 * other people's claims cannot be loose with its own, and the page count is the
 * one number a buyer can check the moment the file opens.
 *
 * This is deliberately NOT part of `npm run check` and not in CI. products/dist
 * is gitignored — paid documents do not belong in the repository — so a clean
 * checkout has none of them and a CI run would fail every time and teach
 * everyone to ignore it. Run it before promoting anything:
 *
 *     npm run products:check
 */
import { readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELF = join(ROOT, 'products/dist');

const slugOf = (name) =>
  name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const site = JSON.parse(await readFile(join(ROOT, 'content/site.json'), 'utf8'));
const products = site.shop?.products ?? [];

const rows = [];
for (const p of products) {
  const file = join(SHELF, `${slugOf(p.name)}.pdf`);
  const row = { name: p.name, price: p.price, advertised: p.pages, file };

  try {
    await access(file);
  } catch {
    rows.push({ ...row, state: p.buy ? 'MISSING' : 'missing (not on sale)' });
    continue;
  }

  try {
    const { stdout } = await run('pdfinfo', [file]);
    const actual = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    rows.push({
      ...row,
      actual,
      state: actual === p.pages ? 'ok' : 'PAGE COUNT',
    });
  } catch {
    rows.push({ ...row, state: 'UNREADABLE' });
  }
}

const bad = rows.filter((r) => r.state === r.state.toUpperCase() && r.state !== 'OK');

for (const r of rows) {
  const mark = r.state === 'ok' ? '  ' : '->';
  const pages =
    r.actual === undefined
      ? `advertised ${r.advertised}`
      : r.actual === r.advertised
        ? `${r.actual} pages`
        : `advertised ${r.advertised}, file has ${r.actual}`;
  console.log(`${mark} ${r.name.padEnd(32)} $${String(r.price).padEnd(5)} ${pages.padEnd(34)} ${r.state}`);
}

console.log('');
if (!bad.length) {
  console.log(`All ${rows.length} products are deliverable and match their advertised length.`);
} else {
  console.log(`${bad.length} of ${rows.length} cannot be delivered as advertised:\n`);
  for (const r of bad) {
    if (r.state === 'MISSING')
      console.log(`  ${r.name} takes payment, but products/dist/${slugOf(r.name)}.pdf is not here.`);
    if (r.state === 'PAGE COUNT')
      console.log(`  ${r.name} is sold as ${r.advertised} pages; the file has ${r.actual}.`);
    if (r.state === 'UNREADABLE') console.log(`  ${r.name} has a file that will not open.`);
  }
  console.log(
    '\nA missing file is not proof the document does not exist — products/dist is\n' +
      'gitignored, so anything built elsewhere is invisible here. Put the file on\n' +
      'this shelf, or take the buy link down until it is.'
  );
}

process.exit(bad.length ? 1 : 0);
