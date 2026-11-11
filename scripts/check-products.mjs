/**
 * Checks that everything on the shop page can actually be delivered.
 *
 * The four sold documents are paid for through a PayPal link (or an email
 * enquiry until the link exists) and sent by hand. The four free ones are
 * served straight off this site. Either way the failure is silent and entirely
 * on this side: a button for a document that is not where it should be, or a
 * page count on the card that the file does not match.
 *
 * Three things are checked for each of the eight:
 *
 *   1. Is the file there?
 *   2. Does its real page count match the number on the shop page?
 *   3. Does it still say what it is? Every file carries "not legal advice" in
 *      its document properties, written by the build. A file without it was
 *      not made by this build and should not be going out under this name.
 *
 * The page count matters on this site in particular. A publication that audits
 * other people's claims cannot be loose with its own, and it is the one number
 * a buyer can check the moment the file opens.
 *
 * The sold files live in products/dist, which is gitignored — paid documents
 * do not belong in the repository. If they are emailed from somewhere else,
 * point the check at that folder instead:
 *
 *     npm run products:check -- --shelf ~/path/to/the/documents
 *
 * Deliberately NOT part of `npm run check` and not in CI: a clean checkout has
 * no products/dist, so a CI run would fail every time, which is how a check
 * gets ignored. Run it after `npm run products`, and before sending anything.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { PDFDocument } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argShelf = (() => {
  const i = process.argv.indexOf('--shelf');
  return i > -1 ? process.argv[i + 1] : process.env.FF_PRODUCT_SHELF;
})();
const SHELF = argShelf ? resolve(argShelf.replace(/^~/, homedir())) : join(ROOT, 'products/dist');

const slugOf = (name) =>
  name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const site = JSON.parse(await readFile(join(ROOT, 'content/site.json'), 'utf8'));
const shop = site.shop ?? {};

const items = [
  ...(shop.free ?? []).map((p) => ({
    name: p.name,
    label: 'free',
    advertised: p.pages,
    bytes: p.bytes,
    file: join(ROOT, 'public', p.file),
  })),
  ...(shop.products ?? []).map((p) => ({
    name: p.name,
    label: `$${p.price}`,
    advertised: p.pages,
    file: join(SHELF, `${slugOf(p.name)}.pdf`),
  })),
];

const rows = [];
for (const it of items) {
  let buf;
  try {
    buf = await readFile(it.file);
  } catch {
    rows.push({ ...it, state: 'MISSING' });
    continue;
  }
  try {
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    const actual = doc.getPageCount();
    const subject = doc.getSubject() ?? '';
    const state =
      actual !== it.advertised
        ? 'PAGE COUNT'
        : it.bytes !== undefined && it.bytes !== buf.length
          ? 'FILE SIZE'
          : !/not legal advice/i.test(subject)
            ? 'NO NOTICE'
            : 'ok';
    rows.push({ ...it, actual, size: buf.length, state });
  } catch {
    rows.push({ ...it, state: 'UNREADABLE' });
  }
}

const bad = rows.filter((r) => r.state !== 'ok');

for (const r of rows) {
  const pages =
    r.actual === undefined
      ? `advertised ${r.advertised}`
      : r.actual === r.advertised
        ? `${r.actual} pages`
        : `advertised ${r.advertised}, file has ${r.actual}`;
  console.log(`${r.state === 'ok' ? '  ' : '->'} ${r.name.padEnd(32)} ${r.label.padEnd(6)} ${pages.padEnd(32)} ${r.state}`);
}

console.log('');
if (!bad.length) {
  console.log(`All ${rows.length} are where they should be, match the shop page, and carry the notice.`);
} else {
  console.log(`${bad.length} of ${rows.length} cannot go out as advertised:\n`);
  for (const r of bad) {
    if (r.state === 'MISSING') console.log(`  ${r.name}: ${r.file} is not there.`);
    if (r.state === 'PAGE COUNT') console.log(`  ${r.name} is listed as ${r.advertised} pages; the file has ${r.actual}.`);
    if (r.state === 'FILE SIZE') console.log(`  ${r.name} is listed as ${r.bytes} bytes; the file is ${r.size}.`);
    if (r.state === 'NO NOTICE') console.log(`  ${r.name} does not carry the "not legal advice" notice in its properties.`);
    if (r.state === 'UNREADABLE') console.log(`  ${r.name} has a file that will not open.`);
  }
  console.log('\nRun `npm run products` to rebuild all eight and bring the shop page into line.');
}

process.exit(bad.length ? 1 : 0);
