/**
 * Pulls the Instagram archive into the site.
 *
 * Instagram's media URLs are signed CDN links that expire within days, so they
 * can never be referenced live from a page. The images have to be fetched and
 * committed. This script does that, and is idempotent: an image already on disk
 * is not downloaded again, so re-running it only picks up new posts.
 *
 *   WINDSOR_API_KEY=... npm run instagram
 *   npm run instagram -- --limit 20            # only the newest 20 posts
 *   npm run instagram -- --dry-run             # list what would be fetched
 *   npm run instagram -- --from rows.json      # a saved Windsor payload
 *   npm run instagram -- --connector instagram # the Graph-API connector
 *
 * Without a key it falls back to whatever is already in
 * content/data/instagram.json, so the download and optimise steps can be re-run
 * offline, and CI never needs the credential.
 *
 * Works against either Instagram connector. Both expose the same media set;
 * `instagram_public` is the default because it needs no Graph API app review.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'content/data/instagram.json');
const CACHE = join(ROOT, 'tools/.instagram-cache');
const OUT = join(ROOT, 'src/assets/img/instagram');

// Either Instagram connector works. `instagram_public` is the default because
// it needs no Graph API app review; `instagram` carries a few extra insight
// fields but the same media set. Override with --connector.
const CONNECTORS = {
  instagram_public: { time: 'media_timestamp', shortcode: false },
  instagram: { time: 'timestamp', shortcode: true },
};

const BASE_FIELDS = [
  'media_id',
  'media_type',
  'media_permalink',
  'media_url',
  'media_thumbnail_url',
  'media_caption',
  'media_like_count',
  'media_comments_count',
];

// Two widths: the grid thumbnail and the opened plate. Graded to the brand's
// photography direction — desaturated and slightly cool, never saturated.
const WIDTHS = [1200, 640];
const QUALITY = 82;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const DRY = flag('dry-run');
const LIMIT = Number(value('limit', 0)) || 0;
const CONNECTOR = value('connector', 'instagram_public');
const SHAPE = CONNECTORS[CONNECTOR];
if (!SHAPE) {
  console.error(`Unknown connector "${CONNECTOR}". Expected one of: ${Object.keys(CONNECTORS).join(', ')}`);
  process.exit(1);
}
const FIELDS = [SHAPE.time, ...BASE_FIELDS, ...(SHAPE.shortcode ? ['media_shortcode'] : [])];

const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Windsor returns the plan error in every field rather than as an HTTP error. */
const PLAN_ERROR = /connected more accounts than your .* plan allows/i;

async function fetchFromWindsor(key) {
  const url =
    `https://connectors.windsor.ai/${CONNECTOR}` +
    `?api_key=${encodeURIComponent(key)}` +
    `&date_preset=last_2yearsT` +
    `&fields=${FIELDS.join(',')}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Windsor responded ${res.status} ${res.statusText}`);

  const body = await res.json();
  const rows = body.data ?? body.result ?? [];

  if (!Array.isArray(rows) || !rows.length) throw new Error('Windsor returned no rows.');

  const blocked = rows.find((r) => Object.values(r).some((v) => typeof v === 'string' && PLAN_ERROR.test(v)));
  if (blocked) {
    throw new Error(
      'Windsor is refusing the read: more accounts are connected than the plan allows.\n' +
        '  Disconnect facebook_organic and instagram_public at https://onboard.windsor.ai/,\n' +
        '  keeping only the `instagram` account, then run this again.'
    );
  }

  return normalise(rows);
}

/**
 * On a VIDEO or REEL row, media_url is the MP4 itself — the still we want is
 * media_thumbnail_url. Getting this the wrong way round downloads video files
 * and hands them to sharp, which fails on every one.
 */
const stillFor = (r) =>
  /^(VIDEO|REEL)$/i.test(r.media_type ?? '') ? r.media_thumbnail_url || r.media_url : r.media_url || r.media_thumbnail_url;

/** Instagram's shortcode is the last path segment of the permalink. */
const shortcodeFrom = (permalink) => (/\/(?:p|reel|tv)\/([^/?#]+)/.exec(permalink ?? '') || [])[1] ?? '';

function normalise(rows) {
  return rows
    .map((r) => ({
      id: String(r.media_id),
      shortcode: r.media_shortcode || shortcodeFrom(r.media_permalink),
      type: r.media_type ?? 'IMAGE',
      permalink: r.media_permalink ?? '',
      caption: (r.media_caption ?? '').trim(),
      timestamp: r[SHAPE.time] ?? r.media_timestamp ?? r.timestamp ?? '',
      likes: Number(r.media_like_count ?? 0) || 0,
      comments: Number(r.media_comments_count ?? 0) || 0,
      source: stillFor(r),
    }))
    .filter((p) => p.id && p.source)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

/** Read rows from a saved JSON payload instead of the API. */
async function fetchFromFile(path) {
  const body = JSON.parse(await readFile(path, 'utf8'));
  const rows = body.data ?? body.result ?? body;
  if (!Array.isArray(rows)) throw new Error(`${path} does not contain a row array.`);
  return normalise(rows);
}

async function loadExisting() {
  if (!existsSync(DATA)) return null;
  try {
    return JSON.parse(await readFile(DATA, 'utf8'));
  } catch {
    return null;
  }
}

/** Download once. The cache is gitignored; the derivatives are what ship. */
async function ensureOriginal(post) {
  const file = join(CACHE, `${post.id}.bin`);
  if (existsSync(file)) return file;
  if (!post.source) return null;

  const res = await fetch(post.source);
  if (!res.ok) {
    console.warn(`  ! ${post.id}: source returned ${res.status} (signed URL may have expired)`);
    return null;
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function derive(post, original) {
  const stem = post.shortcode ? slugify(post.shortcode) : post.id;
  const made = [];

  for (const width of WIDTHS) {
    const out = join(OUT, `${stem}-${width}.webp`);
    if (existsSync(out)) {
      made.push({ width, path: `/assets/img/instagram/${stem}-${width}.webp` });
      continue;
    }
    await sharp(original)
      .resize({ width, withoutEnlargement: true })
      .modulate({ saturation: 0.88 })
      .linear(1.02, -4)
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(out);
    made.push({ width, path: `/assets/img/instagram/${stem}-${width}.webp` });
  }

  const meta = await sharp(original).metadata();
  return { stem, sizes: made, width: meta.width ?? null, height: meta.height ?? null };
}

/** First line of the caption, trimmed to something that works as a title. */
function titleFrom(caption, fallback) {
  const first = String(caption ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (!first) return fallback;
  const clean = first.replace(/\s*#[\w]+/g, '').trim();
  return clean.length > 90 ? `${clean.slice(0, 87).trimEnd()}…` : clean || fallback;
}

async function main() {
  const key = process.env.WINDSOR_API_KEY;
  const from = value('from', '');
  let posts;

  if (from) {
    console.log(`Reading rows from ${from}…`);
    posts = await fetchFromFile(from);
    console.log(`  ${posts.length} posts`);
  } else if (key) {
    console.log(`Reading the ${CONNECTOR} connector…`);
    posts = await fetchFromWindsor(key);
    console.log(`  ${posts.length} posts returned`);
  } else {
    const existing = await loadExisting();
    if (!existing?.posts?.length) {
      console.error(
        'No WINDSOR_API_KEY set and no cached data in content/data/instagram.json.\n' +
          '\n' +
          'Get a key from https://onboard.windsor.ai/ (Settings → API), then:\n' +
          '  WINDSOR_API_KEY=... npm run instagram\n'
      );
      process.exit(1);
    }
    console.log(`No API key — reusing ${existing.posts.length} cached posts.`);
    posts = existing.posts.map((p) => ({ ...p, source: p.source ?? '' }));
  }

  if (LIMIT) posts = posts.slice(0, LIMIT);

  if (DRY) {
    for (const p of posts) console.log(`  ${p.timestamp || '—'}  ${p.type.padEnd(14)}  ${titleFrom(p.caption, p.id)}`);
    console.log(`\n${posts.length} posts (dry run — nothing written).`);
    return;
  }

  await mkdir(OUT, { recursive: true });

  const out = [];
  let fetched = 0;
  let reused = 0;

  for (const post of posts) {
    const original = await ensureOriginal(post);
    if (!original) continue;
    const before = existsSync(join(OUT, `${post.shortcode ? slugify(post.shortcode) : post.id}-1200.webp`));
    const derived = await derive(post, original);
    if (before) reused += 1;
    else fetched += 1;

    out.push({
      id: post.id,
      shortcode: post.shortcode,
      type: post.type,
      permalink: post.permalink,
      caption: post.caption,
      title: titleFrom(post.caption, `Post ${post.id}`),
      timestamp: post.timestamp,
      likes: post.likes,
      comments: post.comments,
      image: `/assets/img/instagram/${derived.stem}-1200.webp`,
      thumb: `/assets/img/instagram/${derived.stem}-640.webp`,
      width: derived.width,
      height: derived.height,
    });
  }

  await writeFile(
    DATA,
    JSON.stringify(
      {
        title: 'From Instagram',
        slug: 'instagram',
        reviewed: new Date().toISOString().slice(0, 10),
        reviewCycleDays: 90,
        summary:
          'The visual essay series as published to Instagram. Images are AI-directed editorial work by the founder — conceptual frames, not documentary photography.',
        handle: '@feralfemme.co',
        posts: out,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n${out.length} posts written to content/data/instagram.json`);
  console.log(`  ${fetched} newly optimised, ${reused} already on disk`);
  console.log('\nRun `npm run build` to publish them.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
