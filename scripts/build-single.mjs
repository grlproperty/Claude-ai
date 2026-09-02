/**
 * Builds the whole site as one HTML file.
 *
 * A static site is normally a directory: /field-notes/ is a folder with a page
 * in it, and that is what a web address means. Some hosting cannot be given a
 * directory — a file manager that will not upload an archive, or a limit that
 * refuses anything large — and for those, this packs all 142 pages, the
 * stylesheet, the fonts, the scripts and the images into a single file that
 * can be uploaded like any other.
 *
 * Each page is kept in a <template> and swapped into <main> by a hash router,
 * so every internal link becomes #/field-notes/ and still works. The scripts
 * are re-applied after each swap through window.FF, which is why site.js and
 * filter.js separate their global bindings from their content ones.
 *
 * What it costs: search engines index one URL rather than 142, and the
 * per-page titles, descriptions and structured data that the normal build
 * emits are no longer on separate addresses to be found. This is a fallback
 * for getting a site live, not the way to publish it.
 *
 *   npm run single   →   dist-single/index.html
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'dist-single');

/**
 * Fonts carry this design, but they are also the heaviest thing in front of
 * the first paint. The four the hero itself sets go in the document; the rest
 * are attached once the page is up, and swap in under font-display: swap.
 */
const CRITICAL_FACES = [
  'bodoni-moda-500-normal-latin.woff2',
  'cormorant-garamond-500-normal-latin.woff2',
  'jost-300-normal-latin.woff2',
  'jost-500-normal-latin.woff2',
];

const DEFERRED_FACES = [
  'bodoni-moda-400-normal-latin.woff2',
  'cormorant-garamond-400-normal-latin.woff2',
  'cormorant-garamond-600-normal-latin.woff2',
  'jost-400-normal-latin.woff2',
];

const FACES = CRITICAL_FACES.concat(DEFERRED_FACES);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const between = (s, open, close) => {
  const a = s.indexOf(open);
  if (a === -1) return null;
  const start = s.indexOf('>', a) + 1;
  const end = s.lastIndexOf(close);
  return end === -1 ? null : s.slice(start, end);
};

/** Collapse the whitespace a template literal leaves behind, without touching text. */
const squeeze = (html) =>
  html
    .replace(/\n\s*\n/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

async function main() {
  const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));

  const routes = [];
  for (const file of files) {
    const rel = relative(DIST, file).replace(/\\/g, '/');
    if (rel === '404.html') continue;
    const path = '/' + rel.replace(/index\.html$/, '');
    const html = await readFile(file, 'utf8');
    const main = between(html, '<main', '</main>');
    if (!main) continue;
    const title = (/<title>([^<]*)<\/title>/.exec(html) || [, ''])[1];
    routes.push({ path, title, html: squeeze(main) });
  }

  const known = new Set(routes.map((r) => r.path));
  const shell = await readFile(join(DIST, 'index.html'), 'utf8');
  const notFound = squeeze(between(await readFile(join(DIST, '404.html'), 'utf8'), '<main', '</main>') ?? '');

  // ---- assets --------------------------------------------------------------

  const b64 = async (p, mime) => `data:${mime};base64,${(await readFile(p)).toString('base64')}`;

  const fontCss = await readFile(join(DIST, 'assets/css/fonts.css'), 'utf8');
  const facesFor = async (list) => {
    let out = fontCss
      .split('@font-face')
      .filter((b) => list.some((f) => b.includes(f)))
      .map((b) => '@font-face' + b)
      .join('');
    for (const f of list) {
      out = out.replace(`url('../fonts/${f}')`, `url('${await b64(join(DIST, 'assets/fonts', f), 'font/woff2')}')`);
    }
    return out;
  };
  const criticalFonts = await facesFor(CRITICAL_FACES);
  const deferredFonts = await facesFor(DEFERRED_FACES);

  const css = await readFile(join(DIST, 'assets/css/site.css'), 'utf8');
  const js = [];
  for (const f of ['site.js', 'filter.js', 'cage.js']) js.push(await readFile(join(DIST, 'assets/js', f), 'utf8'));

  // Images are re-encoded down: at a data URI every byte is paid for on the
  // first load whether the image is ever scrolled to or not.
  const images = new Map();
  for (const f of await readdir(join(DIST, 'assets/img/instagram'))) {
    if (!f.endsWith('-640.webp')) continue;
    const src = join(DIST, 'assets/img/instagram', f);
    const hero = f.startsWith('dyfhuz6o8e3');
    const buf = await sharp(src)
      .resize({ width: hero ? 760 : 300 })
      .webp({ quality: hero ? 74 : 58, effort: 6 })
      .toBuffer();
    images.set('/assets/img/instagram/' + f, `data:image/webp;base64,${buf.toString('base64')}`);
    images.set('/assets/img/instagram/' + f.replace('-640', '-1200'), `data:image/webp;base64,${buf.toString('base64')}`);
  }

  const inlineImages = (html) =>
    html
      .replace(/srcset="[^"]*"/g, '')
      .replace(/sizes="[^"]*"/g, '')
      .replace(/src="(\/assets\/img\/[^"]+)"/g, (m, p) => (images.has(p) ? `src="${images.get(p)}"` : m));

  /**
   * Internal links become routes. Anything internal that is not a page — the
   * feed, the manifest — has no address here at all, so it keeps its words and
   * stops being a link rather than becoming a dead one.
   */
  const rewrite = (html) =>
    html.replace(
      /<a\b([^>]*?)href="(\/[^"]*)"([^>]*?)>([\s\S]*?)<\/a>/g,
      (m, pre, href, post, text) =>
        known.has(href)
          ? `<a${pre}href="#${href}"${post}>${text}</a>`
          : // Both tags are replaced together. Swapping only the opening one
            // leaves a stray </a> for the parser to guess at.
            `<span class="was-link">${text}</span>`
    );

  // ---- assemble ------------------------------------------------------------

  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${routes.find((r) => r.path === '/').title}</title>
<meta name="description" content="${(/<meta name="description" content="([^"]*)"/.exec(shell) || [, ''])[1]}">
<style>${criticalFonts}\n${css}
/* Links to addresses that do not exist inside a single file keep their words
   without pretending to be clickable. */
.was-link{color:inherit;text-decoration:none;border:0;cursor:default}
</style>`;

  const body = between(shell, '<body', '</body>');
  const mainStart = body.indexOf('<main');
  const mainOpenEnd = body.indexOf('>', mainStart) + 1;
  const mainEnd = body.lastIndexOf('</main>');
  // The shell still carries the <script src> tags the normal build emits, and
  // in one file there is nothing at those addresses to fetch.
  const stripScripts = (html) => html.replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');

  const home = routes.find((r) => r.path === '/');

  const shellBody =
    stripScripts(rewrite(inlineImages(body.slice(0, mainOpenEnd)))) +
    rewrite(inlineImages(home.html)) +
    stripScripts(rewrite(inlineImages(body.slice(mainEnd))));

  // Pages are held as inert text, not as <template>. A template's contents are
  // still parsed into a document fragment while the page loads, and building
  // 141 of those before anything can be shown is most of what made the
  // single-file version slow to open. A script of type text/html is never
  // looked at until the router reads it.
  const views = routes
    .map(
      (r) =>
        `<script type="text/html" data-route="${r.path}" data-title="${r.title.replace(
          /"/g,
          '&quot;'
        )}">${rewrite(inlineImages(r.html)).replace(/<\/script/gi, '<\\/script')}</script>`
    )
    .join('\n');

  const router = `
(function () {
  'use strict';
  var main = document.getElementById('main');
  var miss = ${JSON.stringify(rewrite(notFound))};
  var views = {};

  function render(path) {
    var t = views[path];
    main.innerHTML = t ? t.textContent.replace(/<\\\/script/gi, '</script') : miss;
    document.title = t ? t.getAttribute('data-title') : 'Page not found';
    var nav = document.getElementById('nav');
    if (nav) nav.setAttribute('data-open', 'false');
    if (window.FF) {
      if (FF.initContent) FF.initContent();
      if (FF.initFilters) FF.initFilters();
      if (FF.initCage) FF.initCage();
    }
  }

  function current() {
    var h = location.hash;
    // Only #/ is a route. #main and #industries are anchors within the page
    // that is already showing, and re-rendering on those would throw away the
    // reader's position every time they used the skip link.
    return h.indexOf('#/') === 0 ? h.slice(1) : null;
  }

  // Rendered by the document itself, so the first pass has nothing to do.
  var showing = (location.hash.indexOf('#/') === 0 ? location.hash.slice(1) : '/') === '/' ? '/' : null;
  function apply(scroll) {
    var path = current() || '/';
    if (path !== showing) {
      showing = path;
      render(path);
      if (scroll) window.scrollTo(0, 0);
    } else if (location.hash && location.hash.indexOf('#/') !== 0) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.addEventListener('hashchange', function () { apply(true); });

  // The scripts sit ahead of the page data so the cage and the opening
  // sequence can start while the rest of the document is still arriving. That
  // means the views are not in the DOM yet at this point, so collecting them
  // waits for the parser to finish.
  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('script[data-route]'), function (t) {
      views[t.getAttribute('data-route')] = t;
    });
    apply(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

  // Fonts the hero does not need are attached after the page is up, so their
  // bytes never sit in front of the first paint.
  const lateFonts = `
(function () {
  function add() {
    var s = document.createElement('style');
    s.textContent = ${JSON.stringify(deferredFonts)};
    document.head.appendChild(s);
  }
  if ('requestIdleCallback' in window) requestIdleCallback(add, { timeout: 2000 });
  else setTimeout(add, 400);
})();`;

  await mkdir(OUT, { recursive: true });
  const doc = `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${shellBody}\n<script>${js.join(
    '\n;\n'
  )}\n${router}\n${lateFonts}\n</script>\n${views}\n</body>\n</html>\n`;
  await writeFile(join(OUT, 'index.html'), doc);

  console.log(`Packed ${routes.length} pages into one file`);
  console.log(`  ${(doc.length / 1024 / 1024).toFixed(2)} MB  →  dist-single/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
