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
   * Internal links become routes.
   *
   * Three cases, and the order matters:
   *
   * 1. A page. /field-notes/ becomes #/field-notes/. An in-page fragment is
   *    matched on its path alone — /industries/#beauty routes to the page and
   *    drops the anchor, because the address bar's fragment is what the router
   *    reads and it cannot hold two. Getting the reader to the right page
   *    beats not linking at all.
   * 2. A file shipped next to this one — the feed, the manifest. Those really
   *    are at that address on the server, so they stay ordinary links.
   * 3. Anything else stops being a link.
   *
   * Case 3 used to replace the anchor with a bare <span class="was-link">,
   * which threw away whatever the anchor was wearing. The ten industry cards
   * on the home page are <a class="plate tilt reveal">, and .plate is the
   * positioned box their absolute 01-10 numeral hangs off; stripped of the
   * class, every numeral escaped to the enclosing <section> and all ten
   * stacked in one corner on top of the heading. So the attributes come
   * across, and was-link is appended to the class rather than replacing it.
   */
  const COMPANION_FILE = /\.(xml|webmanifest|txt|json)$/;

  const rewrite = (html) =>
    html.replace(
      /<a\b([^>]*?)href="(\/[^"]*)"([^>]*?)>([\s\S]*?)<\/a>/g,
      (m, pre, href, post, text) => {
        const path = href.split('#')[0];
        if (known.has(href)) return `<a${pre}href="#${href}"${post}>${text}</a>`;
        if (known.has(path)) return `<a${pre}href="#${path}"${post}>${text}</a>`;
        if (COMPANION_FILE.test(path)) return m;

        // Both tags are replaced together. Swapping only the opening one
        // leaves a stray </a> for the parser to guess at.
        const attrs = (pre + post).replace(/\s(?:target|rel|download)="[^"]*"/g, '');
        const kept = /class="([^"]*)"/.test(attrs)
          ? attrs.replace(/class="([^"]*)"/, (_, c) => `class="${c} was-link"`)
          : `${attrs} class="was-link"`;
        return `<span${kept}>${text}</span>`;
      }
    );

  // ---- assemble ------------------------------------------------------------

  /**
   * The curtain has to be able to paint before its own stylesheet exists.
   *
   * A browser cannot start on <body> until <head> is parsed, and the head here
   * carries a quarter of a megabyte of fonts and CSS — on a slow line that is
   * over a second in which nothing at all is on screen, which is precisely the
   * second the curtain is for. So the rules it needs are pulled out and put in
   * front, and everything else moves into the body behind it.
   */
  const curtainRules = [
    (/:root\s*\{[^}]*\}/.exec(css) || [''])[0],
    ...(css.match(/\.curtain[^{]*\{[^}]*\}/g) ?? []),
    ...(css.match(/@keyframes curtain-[a-z]+\s*\{[\s\S]*?\n\}/g) ?? []),
  ].join('\n');

  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${routes.find((r) => r.path === '/').title}</title>
<meta name="description" content="${(/<meta name="description" content="([^"]*)"/.exec(shell) || [, ''])[1]}">
<style>${curtainRules}</style>`;

  const mainStyles = `<style>${criticalFonts}\n${css}
/* Links to addresses that do not exist inside a single file keep their words
   without pretending to be clickable. */
.was-link{text-decoration:none;cursor:default}
</style>`;

  const body = between(shell, '<body', '</body>');
  const mainStart = body.indexOf('<main');
  const mainOpenEnd = body.indexOf('>', mainStart) + 1;
  const mainEnd = body.lastIndexOf('</main>');
  // The shell still carries the <script src> tags the normal build emits, and
  // in one file there is nothing at those addresses to fetch.
  const stripScripts = (html) => html.replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');

  const home = routes.find((r) => r.path === '/');

  const beforeMain = body.slice(0, mainOpenEnd);
  const curtainEnd = beforeMain.indexOf('</script>') + '</script>'.length;
  const curtain = beforeMain.slice(0, curtainEnd);
  const restOfShell = beforeMain.slice(curtainEnd);

  const shellBody =
    curtain +
    mainStyles +
    stripScripts(rewrite(inlineImages(restOfShell))) +
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

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint(path) {
    var t = views[path];
    main.innerHTML = t ? t.textContent.replace(/<\\\/script/gi, '</script') : miss;
    document.title = t ? t.getAttribute('data-title') : 'Page not found';
    // The masthead sits outside <main>, so it survives the swap — including
    // the mobile menu's open state. Closing the panel without also resetting
    // the button leaves it reading "Close" over a shut menu, and telling a
    // screen reader it is expanded.
    var nav = document.getElementById('nav');
    if (nav) nav.setAttribute('data-open', 'false');
    var toggle = document.querySelector('.nav-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Menu';
    }
    if (window.FF) {
      if (FF.initContent) FF.initContent();
      if (FF.initFilters) FF.initFilters();
      if (FF.initCage) FF.initCage();
      // The currency selector is inside <main>, so a swap replaces it with a
      // fresh, unpopulated one — and the reader's chosen currency has to be
      // read back out of storage and reapplied to the new prices.
      if (FF.initCurrency) FF.initCurrency();
    }
  }

  /**
   * Pages cross-fade rather than cutting. Without it a swap is a hard jump
   * with no sense of having gone anywhere — the one place the single-file
   * build feels unlike the site it is standing in for. The outgoing page is
   * given a moment to leave, then the new one is painted and scrolled to the
   * top before it is shown, so the reader never sees the middle of it.
   */
  function render(path, animate) {
    if (reduced || !animate) {
      paint(path);
      main.style.opacity = '';
      main.style.transform = '';
      return;
    }
    main.style.transition = 'opacity .16s ease, transform .16s ease';
    main.style.opacity = '0';
    main.style.transform = 'translateY(6px)';
    setTimeout(function () {
      paint(path);
      window.scrollTo(0, 0);
      requestAnimationFrame(function () {
        main.style.transition = 'opacity .34s cubic-bezier(.2,.8,.3,1), transform .34s cubic-bezier(.2,.8,.3,1)';
        main.style.opacity = '1';
        main.style.transform = 'none';
      });
    }, 160);
  }

  /**
   * Every route ends in a slash, and an address arriving from outside often
   * does not — a link in a bio, a pasted URL, something typed from memory.
   * Matching those strictly is how a working page becomes a 404 for a reader
   * who did nothing wrong, so the near misses are resolved rather than
   * rejected. Only the exact key is used to look the view up.
   */
  function resolve(path) {
    if (!path) return '/';
    var q = path.indexOf('?');
    if (q > -1) path = path.slice(0, q);
    if (path.charAt(0) !== '/') path = '/' + path;
    if (views[path]) return path;
    if (path.charAt(path.length - 1) !== '/' && views[path + '/']) return path + '/';
    if (path.length > 1 && path.charAt(path.length - 1) === '/' && views[path.slice(0, -1)])
      return path.slice(0, -1);
    var low = path.toLowerCase();
    if (views[low]) return low;
    if (views[low + '/']) return low + '/';
    return path;
  }

  function current() {
    var h = location.hash;
    // Only #/ is a route. #main and #industries are anchors within the page
    // that is already showing, and re-rendering on those would throw away the
    // reader's position every time they used the skip link.
    if (h.indexOf('#/') === 0) return resolve(h.slice(1));

    // No route in the fragment. If the server handed us a path anyway — an
    // .htaccess that sends every address here, or a host that serves this file
    // for anything it cannot find — that path is what the reader asked for.
    var p = location.pathname;
    if (p && p !== '/' && p !== '/index.html') {
      var hit = resolve(p);
      if (views[hit]) return hit;
    }
    return null;
  }

  // Rendered by the document itself, so the first pass has nothing to do.
  var showing = '/';
  function apply(scroll) {
    var path = current() || '/';
    if (path !== showing) {
      showing = path;
      render(path, scroll);
      // The animated path scrolls to the top itself, once the new page is in
      // place — doing it here would scroll the outgoing one.
      if (scroll && reduced) window.scrollTo(0, 0);
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

  // A path-shaped arrival gets the fragment it should have had, so that going
  // back, sharing, or reloading all land on the same page as the first visit.
  if (location.hash.indexOf('#/') !== 0 && location.pathname !== '/' && location.pathname !== '/index.html') {
    var landed = location.pathname;
    document.addEventListener('DOMContentLoaded', function () {
      if (views[resolve(landed)]) history.replaceState(null, '', '#' + resolve(landed));
    });
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

  // The footer links /feed.xml and the newsletter automation reads it, so the
  // feed has to exist on the server even when the pages do not. robots.txt and
  // the server config are the same kind of thing: small files that are not
  // routes and cannot be packed into the document.
  //
  // No sitemap.xml. A sitemap lists addresses a crawler can fetch, and in this
  // build every page lives behind a #/ fragment of one address — a fragment is
  // not a separate URL to a crawler, so a sitemap here would list one entry
  // 142 times over. Publishing dist/ instead is what earns a real sitemap.
  const COMPANIONS = ['feed.xml', 'rss.xml', 'site.webmanifest'];
  const copied = [];
  for (const name of COMPANIONS) {
    const from = join(DIST, name);
    if (!existsSync(from)) continue;
    await writeFile(join(OUT, name), await readFile(from));
    copied.push(name);
  }

  // dist/robots.txt points at a sitemap this build does not produce, and a
  // Sitemap: line for a file that 404s is worse than no line at all.
  await writeFile(join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  copied.push('robots.txt');

  // dist/404.html loads /assets/css/site.css, which does not exist next to a
  // single-file deploy — it would arrive unstyled. This one carries its own.
  await writeFile(
    join(OUT, '404.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found — FERAL FEMME</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #100c0d; color: #fdfcfc; text-align: center; padding: 2rem;
         font: 400 1rem/1.6 Jost, "Helvetica Neue", Arial, sans-serif; }
  h1 { font-size: clamp(2rem, 7vw, 3.4rem); font-weight: 500; letter-spacing: .04em;
       margin: 0 0 .6rem; }
  p { color: rgba(253,252,252,.68); max-width: 46ch; margin: 0 auto 2rem; }
  a { display: inline-block; min-height: 24px; padding: .85rem 1.6rem;
      border: 1px solid #b80f1d; color: #fdfcfc; text-decoration: none;
      letter-spacing: .16em; text-transform: uppercase; font-size: .7rem; }
  a:hover, a:focus-visible { background: #b80f1d; }
</style>
</head>
<body>
  <main>
    <h1>Page not found</h1>
    <p>That address does not exist here. Everything FERAL FEMME publishes is reachable from the front page.</p>
    <a href="/">Back to the front page</a>
  </main>
</body>
</html>
`
  );
  copied.push('404.html');
  // The shared .htaccess plus the one rule only this build needs. In the
  // normal build /find-us/ is a real directory; here it is nothing at all, so
  // without this an address someone typed, pasted or put in a bio dies at the
  // server before the router ever sees it. Anything that is not a real file
  // is handed to index.html, and the router reads the path off location.
  const shared = join(ROOT, 'public', '.htaccess');
  if (existsSync(shared)) {
    const spa = `

# --- single-file build only -------------------------------------------------
#
# Every page lives inside index.html. A request for /find-us/ is not a file on
# disk, so it has to be handed to the document that can render it; the router
# then reads location.pathname and shows the right page. Real files — the feed,
# robots.txt, the manifest — are matched first and served as themselves.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ /index.html [L]
</IfModule>
`;
    await writeFile(join(OUT, '.htaccess'), (await readFile(shared, 'utf8')) + spa);
    copied.push('.htaccess');
  }

  console.log(`Packed ${routes.length} pages into one file`);
  console.log(`  ${(doc.length / 1024 / 1024).toFixed(2)} MB  →  dist-single/index.html`);
  if (copied.length) console.log(`  alongside it: ${copied.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
