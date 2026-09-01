/**
 * FERAL FEMME — static build.
 *
 * Reads content/ (Markdown field notes plus JSON datasets), renders every route
 * to dist/ as plain HTML, and generates the feed, sitemap, search index, and
 * social preview images. No network access, no runtime, no database: the
 * output is a directory of files that any static host will serve.
 */
import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

import { renderMarkdown, readingTime, excerpt, isoDate, slugify, esc, stripMarkdown } from './lib/util.mjs';
import { renderHome } from './pages/home.mjs';
import { renderIndustries } from './pages/industries.mjs';
import { renderFieldNotesIndex, renderFieldNote } from './pages/field-notes.mjs';
import {
  renderToolsIndex,
  renderCertifications,
  renderGreenwashing,
  renderMaterials,
  renderRecord,
  renderAct,
  renderLibrary,
  renderArchive,
  renderSources,
} from './pages/decoders.mjs';
import { renderDonate, renderBriefing } from './pages/donate.mjs';
import { renderPage, renderNotFound } from './pages/simple.mjs';
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
}

async function writeFileAt(path, contents) {
  const out = join(DIST, path.replace(/^\//, ''));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, contents);
}

/**
 * Load a Markdown collection. Numeric filename prefixes order a collection
 * without appearing in its URLs.
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
      ${e.date ? `<pubDate>${new Date(e.date).toUTCString()}</pubDate>` : ''}
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
    <language>en</language>
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
  const data = {
    industries: await readJson(join(CONTENT, 'data/industries.json')),
    certifications: await readJson(join(CONTENT, 'data/certifications.json')),
    greenwashing: await readJson(join(CONTENT, 'data/greenwashing.json')),
    materials: await readJson(join(CONTENT, 'data/materials.json')),
    record: await readJson(join(CONTENT, 'data/record.json')),
    act: await readJson(join(CONTENT, 'data/act.json')),
    library: await readJson(join(CONTENT, 'data/library.json')),
    archive: await readJson(join(CONTENT, 'data/archive.json')),
    sources: await readJson(join(CONTENT, 'data/sources.json')),
    // Written by `npm run instagram`. Absent until the first pull, and the
    // whole feed simply does not render rather than the build failing.
    instagram: existsSync(join(CONTENT, 'data/instagram.json'))
      ? await readJson(join(CONTENT, 'data/instagram.json'))
      : null,
  };

  const notes = await loadCollection(join(CONTENT, 'field-notes'), '/field-notes/');
  const pages = await loadCollection(join(CONTENT, 'pages'), '/');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await cp(ASSETS, join(DIST, 'assets'), { recursive: true });
  if (existsSync(PUBLIC)) await cp(PUBLIC, DIST, { recursive: true });
  await buildBrandAssets({ dist: DIST, site });

  const routes = [];
  const track = (path, opts = {}) => routes.push({ path, ...opts });

  // ---- core
  await writePage('/', renderHome({ site, notes, data }));
  track('/', { priority: '1.0', changefreq: 'weekly' });

  await writePage('/industries/', renderIndustries({ site, data: data.industries, notes }));
  track('/industries/', { priority: '0.9' });

  await writePage('/field-notes/', renderFieldNotesIndex({ site, entries: notes }));
  track('/field-notes/', { priority: '0.9', changefreq: 'weekly' });

  for (const [i, note] of notes.entries()) {
    const prev = notes[i - 1] ?? null;
    const next = notes[i + 1] ?? null;
    await writePage(note.url, renderFieldNote({ site, entry: note, all: notes, prev, next }));
    track(note.url, { priority: '0.8' });
  }

  // ---- tools and reference
  await writePage('/tools/', renderToolsIndex({ site, data }));
  track('/tools/', { priority: '0.9' });

  const tools = [
    ['/tools/certifications/', renderCertifications, data.certifications],
    ['/tools/greenwashing/', renderGreenwashing, data.greenwashing],
    ['/tools/materials/', renderMaterials, data.materials],
    ['/tools/record/', renderRecord, data.record],
    ['/tools/act/', renderAct, data.act],
  ];
  for (const [path, render, dataset] of tools) {
    await writePage(path, render({ site, data: dataset }));
    track(path, { priority: '0.8', lastmod: dataset.reviewed });
  }

  await writePage('/library/', renderLibrary({ site, data: data.library }));
  track('/library/', { priority: '0.8' });

  await writePage('/archive/', renderArchive({ site, data: data.archive, instagram: data.instagram }));
  track('/archive/', { priority: '0.8' });

  await writePage('/sources/', renderSources({ site, data: data.sources }));
  track('/sources/', { priority: '0.6' });

  // ---- funding and audience
  await writePage('/donate/', renderDonate({ site }));
  track('/donate/', { priority: '0.9' });

  await writePage('/briefing/', renderBriefing({ site }));
  track('/briefing/', { priority: '0.7' });

  // ---- markdown pages
  for (const page of pages) {
    await writePage(page.url, renderPage({ site, page }));
    track(page.url, { priority: '0.5' });
  }

  await writePage('/404', renderNotFound({ site }));

  // ---- generated files
  await writeFileAt('/feed.xml', buildFeed(site, notes));
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

  // Client-side search index, small enough to ship whole.
  const index = [
    ...notes.map((e) => ({ t: e.title, u: e.url, s: e.summary, k: 'Field note', c: e.topic ?? '', b: e.text.slice(0, 1200) })),
    ...pages.map((e) => ({ t: e.title, u: e.url, s: e.summary, k: 'Page', c: '', b: e.text.slice(0, 600) })),
    ...data.certifications.schemes.map((x) => ({ t: x.name, u: `/tools/certifications/#${slugify(x.name)}`, s: x.verifies, k: 'Certification', c: x.cat, b: x.verifies })),
    ...data.greenwashing.terms.map((x) => ({ t: x.term, u: `/tools/greenwashing/#${slugify(x.term)}`, s: x.actual, k: 'Greenwashing', c: x.cat, b: x.actual })),
    ...data.materials.materials.map((x) => ({ t: x.name, u: `/tools/materials/#${slugify(x.name)}`, s: x.what, k: 'Material', c: x.cat, b: x.what })),
    ...data.industries.industries.map((x) => ({ t: x.name, u: `/industries/#${slugify(x.name)}`, s: x.resource.title, k: 'Industry', c: '', b: x.resource.body })),
  ];
  await writeFileAt('/search-index.json', JSON.stringify(index));

  await writeFileAt('/_redirects', '/rss.xml  /feed.xml  301\n/feed  /feed.xml  301\n/research/  /field-notes/  301\n');

  await buildOgImages({ dist: DIST, site, entries: notes });

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
