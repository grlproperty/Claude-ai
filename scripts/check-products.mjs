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
 * Only two of the six are built in this repository; the rest are authored
 * elsewhere and delivered by hand from wherever they are kept. So the shelf is
 * an argument rather than a fixed path — point it at the folder the files are
 * actually emailed from and the check means something:
 *
 *     npm run products:check -- --shelf ~/path/to/the/documents
 *
 * With no argument it looks in products/dist, which holds only what this
 * repository builds. Anything absent there is reported as not on this shelf
 * rather than as a fault, because absence here proves nothing.
 *
 * Deliberately NOT part of `npm run check` and not in CI. products/dist is
 * gitignored — paid documents do not belong in the repository — so a clean
 * checkout has none of them and a CI run would fail every time, which is how a
 * check gets ignored.
 */
import { readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argShelf = (() => {
  const i = process.argv.indexOf('--shelf');
  return i > -1 ? process.argv[i + 1] : process.env.FF_PRODUCT_SHELF;
})();
const SHELF = argShelf ? resolve(argShelf.replace(/^~/, homedir())) : join(ROOT, 'products/dist');
// Absence only means something when the shelf is meant to hold everything.
const COMPLETE = Boolean(argShelf);

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
    rows.push({
      ...row,
      state: !p.buy ? 'not on sale' : COMPLETE ? 'MISSING' : 'not on this shelf',
    });
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

const bad = rows.filter((r) => ['MISSING', 'PAGE COUNT', 'UNREADABLE'].includes(r.state));
const elsewhere = rows.filter((r) => r.state === 'not on this shelf');

for (const r of rows) {
  const mark = ['MISSING', 'PAGE COUNT', 'UNREADABLE'].includes(r.state) ? '->' : '  ';
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
  const checked = rows.length - elsewhere.length;
  console.log(
    `${checked} of ${rows.length} products checked here are deliverable and match their advertised length.`
  );
  if (elsewhere.length) {
    console.log(
      `\n${elsewhere.length} are authored elsewhere and were not on this shelf. That is expected:\n` +
        `they are delivered by hand from wherever they are kept. To check those too, point\n` +
        `the shelf at that folder:\n\n  npm run products:check -- --shelf <folder>`
    );
  }
} else {
  console.log(`${bad.length} of ${rows.length} cannot be delivered as advertised:\n`);
  for (const r of bad) {
    if (r.state === 'MISSING')
      console.log(`  ${r.name} takes payment, but ${r.file} is not there.`);
    if (r.state === 'PAGE COUNT')
      console.log(`  ${r.name} is sold as ${r.advertised} pages; the file has ${r.actual}.`);
    if (r.state === 'UNREADABLE') console.log(`  ${r.name} has a file that will not open.`);
  }
  console.log('\nPut the file on this shelf, or take the buy link down until it is there.');
}

process.exit(bad.length ? 1 : 0);
