/**
 * FERAL FEMME — static build.
 *
 * Reads content/ (Markdown entries plus JSON datasets), renders every route to
 * dist/ as plain HTML, and generates the feed, sitemap, search index, and
 * social preview images. No network access, no runtime, no database: the
 * output is a directory of files that any static host will serve.
 */
import { readFile, writeFile, mkdir, readdir, rm, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

import { renderMarkdown, readingTime, excerpt, isoDate, slugify, esc, stripMarkdown } from './lib/util.mjs';
import { renderHome } from './pages/home.mjs';
import { renderResearchIndex, renderEntry } from './pages/research.mjs';
import { renderLearnIndex, renderModule } from './pages/learn.mjs';
import { renderRegulation, renderMethods, renderCertifications, renderGlossary } from './pages/datasets.mjs';
import { renderSupport, renderLicensing, renderDispatch } from './pages/support.mjs';
import { renderPage, renderNotFound, renderArchiveIndex } from './pages/simple.mjs';
import { buildOgImages, buildBrandAssets } from './lib/images.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const DIST = join(ROOT, 'dist');
const ASSETS = join(ROOT, 'src/assets');
const PUBLIC = join(ROOT, 'public');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

/** Write an HTML document at a clean URL: /a/b/ becomes dist/a/b/index.html */
async function writePage(path, html) {
  const rel = path === '/' ? 'index.html' : join(path.replace(/^\/|\/$/g, ''), 'index.html');
  const out = join(DIST, rel);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  return rel;
}

async function writeFileAt(path, contents) {
  const out = join(DIST, path.replace(/^\//, ''));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, contents);
}

/**
 * Load a Markdown collection. Numeric filename prefixes order a collection
 * without appearing in its URLs, so `03-safety-without-animals.md` sorts third
 * and publishes at /learn/safety-without-animals/.
 */
async function loadCollection(dir, base) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = data.slug || slugify(basename(file, '.md').replace(/^\d+[-_]/, ''));
    const headings = [];
    const html = renderMarkdown(content, { headings });

    entries.push({
      ...data,
      slug,
      url: `${base}${slug}/`,
      body: content,
      html,
      headings,
      readingTime: data.duration ?? readingTime(content),
      summary: data.summary || excerpt(content, 180),
      text: stripMarkdown(content),
    });
  }

  entries.sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    return new Date(b.date ?? 0) - new Date(a.date ?? 0);
  });

  return entries;
}

// -------------------------------------------------------------------- feeds

function buildFeed(site, entries) {
  const items = entries
    .slice(0, 30)
    .map((e) => {
      const url = new URL(e.url, site.url).href;
      return `    <item>
      <title>${esc(e.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${new Date(e.date ?? Date.now()).toUTCString()}</pubDate>
      <description>${esc(e.summary)}</description>
      ${e.topic ? `<category>${esc(e.topic)}</category>` : ''}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.name)} — ${esc(site.descriptor)}</title>
    <link>${esc(site.url)}</link>
    <atom:link href="${esc(new URL('/feed.xml', site.url).href)}" rel="self" type="application/rss+xml"/>
    <description>${esc(site.description)}</description>
    <language>en-GB</language>
    <copyright>© ${site.established}–${new Date().getUTCFullYear()} ${esc(site.name)}</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function buildSitemap(site, routes) {
  const urls = routes
    .map(
      (r) => `  <url>
    <loc>${esc(new URL(r.path, site.url).href)}</loc>
    ${r.lastmod ? `<lastmod>${esc(isoDate(r.lastmod))}</lastmod>` : ''}
    <changefreq>${r.changefreq ?? 'monthly'}</changefreq>
    <priority>${r.priority ?? '0.6'}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// -------------------------------------------------------------------- build

async function main() {
  const started = Date.now();

  const site = await readJson(join(CONTENT, 'site.json'));
  const regulation = await readJson(join(CONTENT, 'data/regulation.json'));
  const methods = await readJson(join(CONTENT, 'data/methods.json'));
  const certifications = await readJson(join(CONTENT, 'data/certifications.json'));
  const glossary = await readJson(join(CONTENT, 'data/glossary.json'));

  const research = await loadCollection(join(CONTENT, 'research'), '/research/');
  const guides = await loadCollection(join(CONTENT, 'guides'), '/learn/');
  const pages = await loadCollection(join(CONTENT, 'pages'), '/');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // Static assets, then generated brand marks and social previews.
  // `raw-*` originals stay out of the published output: they are the inputs to
  // the image pipeline, not files any visitor should download.
  await cp(ASSETS, join(DIST, 'assets'), {
    recursive: true,
    filter: (src) => !basename(src).startsWith('raw-'),
  });
  if (existsSync(PUBLIC)) await cp(PUBLIC, DIST, { recursive: true });
  await buildBrandAssets({ dist: DIST, site });

  const routes = [];
  const track = (path, opts = {}) => routes.push({ path, ...opts });

  // ---- core routes
  await writePage('/', renderHome({ site, research, guides, regulation, methods }));
  track('/', { priority: '1.0', changefreq: 'weekly' });

  await writePage('/research/', renderResearchIndex({ site, entries: research }));
  track('/research/', { priority: '0.9', changefreq: 'weekly' });

  for (const entry of research) {
    await writePage(entry.url, renderEntry({ site, entry, all: research, glossary }));
    track(entry.url, { lastmod: entry.updated ?? entry.date, priority: '0.8' });
  }

  await writePage('/learn/', renderLearnIndex({ site, modules: guides }));
  track('/learn/', { priority: '0.9' });

  for (const [i, mod] of guides.entries()) {
    const prev = guides[i - 1] ?? null;
    const next = guides[i + 1] ?? null;
    await writePage(mod.url, renderModule({ site, module: mod, prev, next, all: guides, glossary }));
    track(mod.url, { lastmod: mod.updated ?? mod.date, priority: '0.8' });
  }

  // ---- datasets
  await writePage('/regulation/', renderRegulation({ site, data: regulation }));
  track('/regulation/', { priority: '0.9', changefreq: 'weekly' });

  await writePage('/methods/', renderMethods({ site, data: methods }));
  track('/methods/', { priority: '0.8' });

  await writePage('/certifications/', renderCertifications({ site, data: certifications }));
  track('/certifications/', { priority: '0.8' });

  await writePage('/glossary/', renderGlossary({ site, data: glossary }));
  track('/glossary/', { priority: '0.7' });

  // ---- revenue and audience
  await writePage('/support/', renderSupport({ site }));
  track('/support/', { priority: '0.9' });

  await writePage('/licensing/', renderLicensing({ site }));
  track('/licensing/', { priority: '0.8' });

  await writePage('/dispatch/', renderDispatch({ site }));
  track('/dispatch/', { priority: '0.7' });

  await writePage('/archive/', renderArchiveIndex({ site, research, guides, pages }));
  track('/archive/', { priority: '0.5' });

  // ---- markdown pages
  for (const page of pages) {
    await writePage(page.url, renderPage({ site, page }));
    track(page.url, { priority: '0.5' });
  }

  await writePage('/404', renderNotFound({ site }));
  // 404 is served by the host on error, so it is deliberately not in the sitemap.

  // ---- generated files
  await writeFileAt('/feed.xml', buildFeed(site, research));
  await writeFileAt('/sitemap.xml', buildSitemap(site, routes));
  await writeFileAt(
    '/robots.txt',
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site.url).href}\n`
  );

  await writeFileAt(
    '/site.webmanifest',
    JSON.stringify(
      {
        name: site.name,
        short_name: site.name,
        description: site.description,
        start_url: '/',
        display: 'standalone',
        background_color: site.brand.colours.blush,
        theme_color: site.brand.colours.blush,
        icons: [
          { src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      2
    )
  );

  // Client-side search index — small enough to ship whole, so search needs no server.
  const index = [
    ...research.map((e) => ({ t: e.title, u: e.url, s: e.summary, k: 'Research', c: e.topic ?? '', b: e.text.slice(0, 1200) })),
    ...guides.map((e) => ({ t: e.title, u: e.url, s: e.summary, k: 'Learn', c: 'Module', b: e.text.slice(0, 1200) })),
    ...pages.map((e) => ({ t: e.title, u: e.url, s: e.summary, k: 'Page', c: '', b: e.text.slice(0, 600) })),
    ...glossary.terms.map((t) => ({ t: t.term, u: `/glossary/#${slugify(t.term)}`, s: t.definition, k: 'Glossary', c: t.category, b: t.definition })),
    ...regulation.jurisdictions.map((j) => ({ t: j.name, u: `/regulation/#${j.id}`, s: j.headline, k: 'Regulation', c: j.region, b: j.headline })),
  ];
  await writeFileAt('/search-index.json', JSON.stringify(index));

  // The Netlify/CloudFront-style redirect file is harmless elsewhere.
  await writeFileAt('/_redirects', '/rss.xml  /feed.xml  301\n/feed  /feed.xml  301\n');

  await buildOgImages({ dist: DIST, site, entries: [...research, ...guides] });

  const files = await countFiles(DIST);
  console.log(
    `Built ${routes.length} routes · ${files} files · ${((Date.now() - started) / 1000).toFixed(2)}s → dist/`
  );
}

async function countFiles(dir) {
  let n = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory()) n += await countFiles(join(dir, item.name));
    else n += 1;
  }
  return n;
}

main().catch((err) => {
  console.error('\nBuild failed:', err);
  process.exit(1);
});
