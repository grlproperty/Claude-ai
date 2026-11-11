/**
 * Builds the eight PDFs — four free, four sold — from the site's own datasets.
 *
 *   node products/build.mjs            all eight
 *   node products/build.mjs claims     only those whose slug contains "claims"
 *
 *   free  →  public/downloads/feral-femme-<slug>.pdf   (committed, served)
 *   paid  →  products/dist/<slug>.pdf                  (gitignored, emailed)
 *   all   →  content/images/covers/the-<slug>.jpg      (the first page, for the shop)
 *
 * What is in each product is in catalogue.mjs; what the pieces look like is in
 * parts.mjs and style.mjs; what had to be written is in written.mjs and
 * copy.json. This file is only the machinery.
 *
 * Rendered through headless Chromium rather than drawn with a PDF library, so
 * the pages use the site's own typefaces and tokens. Four things here are less
 * obvious than they look:
 *
 * 1. Fonts are embedded as data URIs, because a file:// page cannot fetch a
 *    file:// font.
 *
 * 2. Page numbers are counted, not searched for. Every section starts on a new
 *    page, so a section rendered alone has exactly as many pages as it will
 *    have in the book. The front matter and each section are rendered once on
 *    their own, the counts are added up into the contents, and the total is
 *    checked against the finished body. If they ever disagree the build stops,
 *    because a contents page that is out by one is worse than none.
 *
 * 3. The cover is a separate render, placed in front afterwards. Chromium
 *    reserves the running-footer strip on every page of a render, which stops
 *    a full-bleed cover reaching the foot of the paper, and a cover should not
 *    carry a folio anyway. That is also why the numbers in the contents match
 *    the printed footers rather than the PDF's own page index.
 *
 * 4. Every page of every product says "not legal advice" in its footer, and
 *    the notice has the first page after the contents to itself. Neither is
 *    optional and neither is configurable per product.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { CSS } from './style.mjs';
import { CATALOGUE } from './catalogue.mjs';
import { EDITION } from './written.mjs';
import { esc, typo, sectionHtml, noticeBox, intro } from './parts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAID_OUT = join(ROOT, 'products', 'dist');
const FREE_OUT = join(ROOT, 'public', 'downloads');
const COVERS = join(ROOT, 'content', 'images', 'covers');
const FONTS = join(ROOT, 'dist', 'assets', 'fonts');

/** The date written into the files, so a rebuild of an unchanged edition is the same file. */
const ISSUED = new Date('2026-11-10T00:00:00Z');

const FACES = [
  ['Bodoni Moda', 500, 'normal', 'bodoni-moda-500-normal-latin.woff2'],
  ['Bodoni Moda', 600, 'normal', 'bodoni-moda-600-normal-latin.woff2'],
  ['Cormorant Garamond', 400, 'normal', 'cormorant-garamond-400-normal-latin.woff2'],
  ['Cormorant Garamond', 600, 'normal', 'cormorant-garamond-600-normal-latin.woff2'],
  ['Cormorant Garamond', 400, 'italic', 'cormorant-garamond-400-italic-latin.woff2'],
  ['Jost', 300, 'normal', 'jost-300-normal-latin.woff2'],
  ['Jost', 400, 'normal', 'jost-400-normal-latin.woff2'],
  ['Jost', 500, 'normal', 'jost-500-normal-latin.woff2'],
  ['Space Mono', 400, 'normal', 'space-mono-400-normal-latin.woff2'],
  ['Space Mono', 700, 'normal', 'space-mono-700-normal-latin.woff2'],
];

async function fontCss() {
  const out = [];
  for (const [family, weight, style, file] of FACES) {
    const buf = await readFile(join(FONTS, file));
    out.push(
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
        `font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')}`
    );
  }
  return out.join('\n');
}

let FONT_CSS = '';

const page = (title, body, extraCss = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${FONT_CSS}</style><style>${CSS}${extraCss}</style></head>
<body>${body}</body></html>`;

// ----------------------------------------------------------------- the parts

const TIER = { free: 'Free edition', paid: 'Premium edition' };
const LICENCE_LABEL = { free: 'Free to share, unaltered', personal: 'Personal licence', organisation: 'Single-organisation licence' };

function coverHtml(prod, pages) {
  return `<div class="cover cover--${prod.tier}">
  <div class="cover__top">
    <p class="wordmark"><span class="c">Feral</span> Femme<span class="c">.</span></p>
    <p class="cover__tier">${esc(TIER[prod.tier])} · No. ${esc(prod.num)}</p>
  </div>
  <p class="cover__num" aria-hidden="true">${esc(prod.num)}</p>
  <div class="cover__body">
    <h1>${typo(prod.title)}</h1>
    <p class="sub">${typo(prod.sub)}</p>
  </div>
  <p class="cover__stamp">${esc(prod.stamp)}${pages ? ` · ${pages} pages` : ''}</p>
  <div class="foot"><span>${esc(prod.kind)}</span><span>${esc(EDITION)}</span><span>${esc(LICENCE_LABEL[prod.licence])}</span></div>
  <p class="fine">An educational reference. Not legal advice, and not a certification of anything.</p>
</div>`;
}

/** Contents, then the notice. Free products are short enough for both to share a page. */
function frontHtml(prod, secs, starts) {
  const toc = `<ul class="toc">${secs
    .map(
      (s, i) =>
        `<li><span class="n">${esc(s.label)}</span><span class="t">${typo(s.title)}</span><span class="p">${
          starts ? starts[i] : ''
        }</span></li>`
    )
    .join('')}</ul>`;
  const notice = noticeBox(prod.notice);
  const head = `<div class="sec-head"><p class="sec-num">Contents</p><h2>${typo(prod.title)}</h2></div>`;

  if (prod.tier === 'free') {
    return `<div class="section">${head}${intro(prod.tocIntro)}${toc}<div class="front-notice">${notice}</div></div>`;
  }
  return (
    `<div class="section">${head}${intro(prod.tocIntro)}${toc}</div>` +
    sectionHtml({
      label: 'Read this first',
      title: 'What this document is, and is not',
      html: `${intro('This page is here, rather than at the back, because it applies to every page that follows.')}${notice}`,
    })
  );
}

/** The other seven, on the last page. For a free product, the four that are sold. */
function alsoHtml(prod) {
  const others = CATALOGUE.filter((c) => c !== prod && (prod.tier === 'paid' || c.tier === 'paid'));
  return `<div class="also">
  <h3>${prod.tier === 'free' ? 'When you want to put it to work' : 'The rest of the shelf'} · feral-femme.co/shop</h3>
  <table class="cmp">${others
    .map(
      (c) =>
        `<tr><td class="k">${typo(c.title)}</td><td class="o${c.tier === 'paid' ? ' o--a' : ''}">${
          c.tier === 'paid' ? 'Premium' : 'Free'
        }</td><td>${typo(c.line)}</td></tr>`
    )
    .join('')}</table>
</div>`;
}

const footer = (title) =>
  `<div style="width:100%;padding:0 16mm;font:300 6.6pt Helvetica,Arial,sans-serif;color:#8d7f81;` +
  `display:flex;justify-content:space-between;letter-spacing:.09em;text-transform:uppercase">` +
  `<span>Feral Femme &middot; ${esc(title)}</span>` +
  `<span>Educational reference &middot; not legal advice</span>` +
  `<span class="pageNumber"></span></div>`;

// ---------------------------------------------------------------- the engine

async function main() {
  FONT_CSS = await fontCss();
  await mkdir(PAID_OUT, { recursive: true });
  await mkdir(FREE_OUT, { recursive: true });
  await mkdir(COVERS, { recursive: true });

  const j = async (f) => JSON.parse(await readFile(join(ROOT, f), 'utf8'));
  const data = {
    gw: await j('content/data/greenwashing.json'),
    certs: await j('content/data/certifications.json'),
    mats: await j('content/data/materials.json'),
    ings: await j('content/data/ingredients.json'),
    sources: await j('content/data/sources.json'),
    regs: await j('content/data/regulators.json'),
    copy: await j('products/copy.json'),
  };

  // Every flagged term needs its test, or the claim register prints an entry
  // with the one line a buyer paid for missing.
  const untested = data.gw.terms.filter((t) => !data.copy.tests[t.term]).map((t) => t.term);
  if (untested.length) throw new Error(`copy.json has no test for: ${untested.join(', ')}`);

  // Chromium is not bundled with playwright-core. PLAYWRIGHT_BROWSERS_PATH is
  // the variable Playwright itself uses, so an environment that already has a
  // browser needs no extra configuration here.
  const bin =
    process.env.FF_CHROMIUM ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined);
  const browser = await chromium.launch(bin ? { executablePath: bin } : {});
  const shots = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });

  const pdfOf = async (html, { title = '', bleed = false, book = false } = {}) => {
    const pg = await browser.newPage();
    await pg.setContent(html, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const buf = await pg.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: !bleed,
      headerTemplate: '<div></div>',
      footerTemplate: bleed ? '<div></div>' : footer(title),
      margin: bleed
        ? { top: '0', bottom: '0', left: '0', right: '0' }
        : { top: '19mm', bottom: '20mm', left: '16mm', right: '16mm' },
      // Bookmarks, so a forty-page workbook can be navigated from the sidebar.
      outline: book,
      tagged: book,
    });
    await pg.close();
    return buf;
  };
  const pagesOf = async (html, opts) => (await PDFDocument.load(await pdfOf(html, opts))).getPageCount();

  const only = process.argv[2];
  const wanted = CATALOGUE.filter((c) => !only || c.slug.includes(only));
  const manifest = [];

  for (const prod of wanted) {
    const secs = prod.make(data);
    secs[secs.length - 1].html += alsoHtml(prod);
    const one = (inner) => page(prod.title, inner);

    // Count the front matter and each section on their own.
    const counts = await Promise.all([
      pagesOf(one(frontHtml(prod, secs, null)), { title: prod.title }),
      ...secs.map((s) => pagesOf(one(sectionHtml(s)), { title: prod.title })),
    ]);
    const [front, ...each] = counts;
    const starts = [];
    each.reduce((at, n) => (starts.push(at), at + n), front + 1);
    const expected = counts.reduce((a, b) => a + b, 0);

    const bodyBuf = await pdfOf(one(frontHtml(prod, secs, starts) + secs.map((s) => sectionHtml(s)).join('')), {
      title: prod.title,
      book: true,
    });
    const book = await PDFDocument.load(bodyBuf);
    if (book.getPageCount() !== expected) {
      throw new Error(
        `${prod.title}: the sections add up to ${expected} pages but the body is ${book.getPageCount()}. ` +
          `The contents would be wrong; not writing the file.`
      );
    }

    const total = expected + 1;
    const coverDoc = page(prod.title, coverHtml(prod, total), '\n@page { size: A4; margin: 0; }');
    const cover = await PDFDocument.load(await pdfOf(coverDoc, { bleed: true }));
    if (cover.getPageCount() !== 1) throw new Error(`${prod.title}: the cover runs to ${cover.getPageCount()} pages`);

    const [front0] = await book.copyPages(cover, [0]);
    book.insertPage(0, front0);
    book.setTitle(`${prod.title} — FERAL FEMME`);
    book.setAuthor('FERAL FEMME');
    book.setSubject(`${prod.sub} An educational reference; not legal advice.`);
    book.setKeywords(['FERAL FEMME', ...prod.keywords]);
    book.setCreator('FERAL FEMME · feral-femme.co');
    book.setProducer('FERAL FEMME');
    book.setCreationDate(ISSUED);
    book.setModificationDate(ISSUED);
    book.setLanguage('en');

    const bytes = await book.save();
    const file =
      prod.tier === 'free' ? join(FREE_OUT, `feral-femme-${prod.slug}.pdf`) : join(PAID_OUT, `${prod.slug}.pdf`);
    await writeFile(file, bytes);

    // The shop shows the first page of the real document, not a mock-up of it.
    const shot = await shots.newPage();
    await shot.setContent(coverDoc, { waitUntil: 'load' });
    await shot.evaluate(() => document.fonts.ready);
    const png = await shot.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 794, height: 1123 } });
    await shot.close();
    await sharp(png)
      .resize({ width: 1200 })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(join(COVERS, `the-${prod.slug}.jpg`));

    manifest.push({
      name: prod.title,
      slug: prod.slug,
      tier: prod.tier,
      pages: total,
      bytes: bytes.length,
      sections: secs.map((s, i) => ({ label: s.label, title: s.title, page: starts[i], pages: each[i] })),
    });
    console.log(
      `  ${prod.num}  ${prod.title.padEnd(32)} ${String(total).padStart(3)} pages  ${(bytes.length / 1024).toFixed(0).padStart(5)} KB  ${prod.tier}`
    );
  }

  await browser.close();

  if (!only) {
    await writeFile(join(ROOT, 'products', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await syncSite(manifest);
  }
}

/**
 * Writes the real page counts and file sizes into site.json.
 *
 * The shop page prints both, and a publication that audits other people's
 * claims cannot be loose with its own: the page count is the one number a
 * buyer can check the moment the file opens. So it is not typed in by hand.
 */
async function syncSite(manifest) {
  const file = join(ROOT, 'content', 'site.json');
  const text = await readFile(file, 'utf8');
  const site = JSON.parse(text);
  let changed = 0;
  for (const m of manifest) {
    const paid = site.shop.products.find((x) => x.name === m.name);
    const free = site.shop.free.find((x) => x.name === m.name);
    if (paid && paid.pages !== m.pages) (paid.pages = m.pages), changed++;
    if (free && (free.pages !== m.pages || free.bytes !== m.bytes)) (free.pages = m.pages), (free.bytes = m.bytes), changed++;
  }
  if (changed) {
    await writeFile(file, JSON.stringify(site, null, 2) + '\n');
    console.log(`  site.json: ${changed} entr${changed === 1 ? 'y' : 'ies'} updated to match the files`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
