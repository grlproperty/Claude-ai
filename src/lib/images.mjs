/**
 * Generated imagery: brand marks, favicons, and a social preview card per entry.
 *
 * Text is rasterised through librsvg, which finds fonts via fontconfig rather
 * than through anything sharp controls. A generated fontconfig file pointed at
 * tools/fonts/ is therefore written before the first render — without it the
 * cards silently fall back to a system sans-serif, which looks approximately
 * right in a thumbnail and is off-brand everywhere it matters.
 */
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FONT_DIR = join(ROOT, 'tools/fonts');
const FC_DIR = join(ROOT, 'tools/.fontconfig');

const C = { blush: '#F6DFE2', crimson: '#8E0B14', ink: '#12100F', white: '#FDFCFC' };

/**
 * The family names these faces actually declare, which are not the names the
 * brand calls them.
 *
 * Google serves a static instance whose name record carries the optical size
 * or the weight — "Bodoni Moda 11pt", "Cormorant Garamond Light" — and
 * fontconfig matches on that. An SVG asking for "Bodoni Moda" therefore
 * matched nothing and fell back to whatever else was installed, which is why
 * every social card this build has produced had its headline set in Jost
 * rather than in the didone that is the brand's whole visual signature.
 *
 * Each entry lists the real name first and the brand name after it, so a
 * system that does have the properly-named family still resolves.
 * scripts/fetch-ttf.mjs prints what it downloaded; check these against it.
 */
const FACE = {
  display: 'Bodoni Moda 11pt Medium, Bodoni Moda 11pt, Bodoni Moda, serif',
  editorial: 'Cormorant Garamond Light, Cormorant Garamond, serif',
  ui: 'Jost, sans-serif',
  mono: 'Space Mono, monospace',
};

/**
 * Weight is carried by the family name, not by font-weight.
 *
 * The medium cut declares itself as the family "Bodoni Moda 11pt Medium" with
 * the subfamily "Regular", so fontconfig registers it at regular weight and a
 * request for 500 matches no Bodoni at all — it matched Jost Medium instead,
 * which is the actual mechanism behind every mis-set card. Asking for the
 * medium family at normal weight is the only combination that resolves.
 */
const WEIGHT_IN_FAMILY = 'normal';

let fontsReady = false;

async function ensureFontConfig() {
  if (fontsReady) return existsSync(FONT_DIR);
  fontsReady = true;

  if (!existsSync(FONT_DIR)) {
    console.warn(
      '  ! tools/fonts/ is missing — social cards will render in a fallback face.\n' +
        '    Run `node scripts/fetch-ttf.mjs` to restore them.'
    );
    return false;
  }

  await mkdir(join(FC_DIR, 'cache'), { recursive: true });
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>${join(FC_DIR, 'cache')}</cachedir>
</fontconfig>
`;
  const file = join(FC_DIR, 'fonts.conf');
  await writeFile(file, conf);
  process.env.FONTCONFIG_FILE = file;
  return true;
}

const slugOf = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const xml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Greedy wrap using per-character width ratios measured for Bodoni Moda at
 * medium. Approximate by design: the card has generous margins, and an
 * exact text metric would mean shipping a font parser to save a few pixels.
 */
function wrap(text, fontSize, maxWidth, maxLines = 4) {
  const narrow = new Set('ijltfrI.,;:!\'"()[]|`'.split(''));
  const wide = new Set('MWmw@'.split(''));
  const widthOf = (s) =>
    [...s].reduce((w, ch) => {
      if (narrow.has(ch)) return w + fontSize * 0.3;
      if (wide.has(ch)) return w + fontSize * 0.88;
      if (ch === ' ') return w + fontSize * 0.26;
      return w + fontSize * 0.55;
    }, 0);

  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Anything that did not fit is elided rather than overflowing the card.
  const used = lines.join(' ').split(/\s+/).length;
  const total = String(text).split(/\s+/).length;
  if (used < total && lines.length) lines[lines.length - 1] += '…';

  return lines;
}

function ogSvg({ title, eyebrow, site, kicker }) {
  const W = 1200;
  const H = 630;
  const size = title.length > 68 ? 58 : title.length > 40 ? 68 : 80;
  const lines = wrap(title, size, W - 220, 4);
  const blockTop = 302 - ((lines.length - 1) * size * 1.14) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.blush}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${C.crimson}"/>
  <rect x="90" y="128" width="56" height="2" fill="${C.crimson}"/>
  <text x="168" y="136" font-family="${FACE.ui}" font-size="19" font-weight="500"
        letter-spacing="4.2" fill="${C.crimson}">${xml(eyebrow.toUpperCase())}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="90" y="${blockTop + i * size * 1.14}" font-family="${FACE.display}" font-size="${size}" font-weight="${WEIGHT_IN_FAMILY}" fill="${C.ink}">${xml(l)}</text>`
    )
    .join('\n  ')}
  <rect x="90" y="${H - 132}" width="${W - 180}" height="1" fill="${C.ink}" opacity="0.16"/>
  <!-- One run in two colours rather than two runs at measured offsets. The
       second x was tuned against the face that was actually rendering, which
       was the wrong one; now that the didone resolves, a hard offset would
       have to be re-measured every time the wordmark or its tracking moved. -->
  <text x="90" y="${H - 76}" font-family="${FACE.display}" font-size="34" font-weight="${WEIGHT_IN_FAMILY}"
        letter-spacing="9" fill="${C.crimson}">FERAL<tspan dx="20" fill="${C.ink}">FEMME.</tspan></text>
  <text x="${W - 90}" y="${H - 76}" text-anchor="end" font-family="${FACE.ui}" font-size="17"
        font-weight="300" letter-spacing="3.4" fill="${C.ink}" opacity="0.62">${xml(kicker.toUpperCase())}</text>
</svg>`;
}

/** The mark used for favicons and app icons: the FF monogram in its circle. */
function markSvg({ size = 512, background = C.blush } = {}) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <circle cx="${c}" cy="${c}" r="${size * 0.375}" fill="none" stroke="${C.crimson}" stroke-width="${size * 0.014}"/>
  <text x="${c}" y="${c + size * 0.115}" text-anchor="middle" font-family="${FACE.display}"
        font-size="${size * 0.32}" font-weight="${WEIGHT_IN_FAMILY}" letter-spacing="${size * 0.02}" fill="${C.crimson}">FF</text>
</svg>`;
}

export async function buildBrandAssets({ dist }) {
  await ensureFontConfig();
  const dir = join(dist, 'assets/brand');
  await mkdir(dir, { recursive: true });

  // The favicon ships as SVG so it stays crisp at every size and weighs nothing.
  await writeFile(join(dir, 'favicon.svg'), markSvg({ size: 64 }));

  const png = (size, name, background) =>
    sharp(Buffer.from(markSvg({ size, background })))
      .png({ compressionLevel: 9 })
      .toFile(join(dir, name));

  await Promise.all([
    png(192, 'icon-192.png', C.blush),
    png(512, 'icon-512.png', C.blush),
    png(180, 'apple-touch-icon.png', C.blush),
  ]);
}

export async function buildOgImages({ dist, site, entries }) {
  const ok = await ensureFontConfig();
  const dir = join(dist, 'assets/og');
  await mkdir(dir, { recursive: true });

  const render = async (name, svg) => {
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(join(dir, `${name}.png`));
  };

  await render(
    'default',
    ogSvg({
      title: site.tagline,
      eyebrow: site.descriptor,
      site,
      kicker: `Est. ${site.established}`,
    })
  );

  for (const entry of entries) {
    await render(
      entry.slug,
      ogSvg({
        title: entry.title,
        eyebrow: entry.topic ?? 'Learning module',
        site,
        kicker: entry.readingTime ? `${entry.readingTime} min read` : site.tagline,
      })
    );
  }

  console.log(`  Social cards: ${entries.length + 1}${ok ? '' : ' (fallback face)'}`);
}

/**
 * The hero photograph, taken from content/images/ rather than from the
 * Instagram pull.
 *
 * The pulled frames carry a burnt-in FERAL FEMME wordmark, which is right on a
 * feed and wrong directly under a page already headed FERAL FEMME. So the hero
 * can be overridden with a clean original: put a file named hero.jpg, .jpeg,
 * .png or .webp in content/images/ and it wins. Remove it and the pulled frame
 * comes back, so there is nothing to undo.
 *
 * Resized and encoded, and nothing else. The pull desaturates and lifts what
 * it fetches, to bring a feed of images shot on different days into one
 * palette; a hero chosen by hand has already been graded by the person who
 * chose it, and putting it through that a second time flattens it.
 */
export async function buildHeroImage({ dist, dir }) {
  if (!existsSync(dir)) return null;
  const named = (await readdir(dir)).filter((f) => /^hero\.(jpe?g|png|webp)$/i.test(f));
  if (!named.length) return null;

  const src = join(dir, named[0]);
  const meta = await sharp(src).metadata();
  const out = join(dist, 'assets/img');
  await mkdir(out, { recursive: true });

  // A cut-out — a figure on a transparent ground — is a different object from a
  // photograph, and the page has to treat it as one: a cut-out put behind the
  // plate's frame is a silhouette floating in a bordered box with the page's own
  // blush showing around it, which reads as a mistake rather than a crop.
  //
  // `metadata().hasAlpha` only says the file has a channel; a PNG exported from
  // most tools has one whether or not anything in it is actually transparent.
  // `stats().isOpaque` reads the pixels, which is the question being asked.
  let cutout = false;
  if (meta.hasAlpha) {
    try {
      cutout = !(await sharp(src).stats()).isOpaque;
    } catch {
      cutout = false;
    }
  }

  for (const width of [640, 1200]) {
    await sharp(src)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 86, effort: 5, alphaQuality: 100 })
      .toFile(join(out, `hero-${width}.webp`));
  }

  console.log(
    `  Hero image: ${named[0]} (${meta.width}x${meta.height})${cutout ? ' — cut-out, shown unframed' : ''}`
  );
  return {
    thumb: '/assets/img/hero-640.webp',
    image: '/assets/img/hero-1200.webp',
    width: meta.width ?? null,
    height: meta.height ?? null,
    cutout,
  };
}

/**
 * Product covers: the first page of each PDF, shown on its card in the shop.
 *
 * A cover is the one piece of a document a buyer can see before paying, so it
 * does the work the description cannot — it shows the thing is made, and made
 * to a standard. Sources live in content/images/covers/, named for the product
 * slug; anything without a file there simply renders without a cover, which is
 * what the two documents whose PDFs are not in this repository do.
 *
 * Emitted at two widths for the same reason every other image here is: the
 * card is about 340px wide on a phone and 500 on a desktop, and a retina
 * screen wants twice that.
 */
/**
 * A typeset jacket for a document whose PDF is not in this repository.
 *
 * Covers are the first page of the real PDF, which is the only version worth
 * showing — a buyer who has seen it has seen the thing. Two of the six volumes
 * were written before the source files were kept here, so they had no cover at
 * all, and the shelf drew them as a hatched placeholder. On a front page whose
 * job is to sell them, a hatched box beside five real covers reads as a product
 * that does not exist, and it was sitting under the most expensive one.
 *
 * This is not a mock-up of the missing page. It is the same jacket the printed
 * volumes carry, set from the product's own data — so it is true, and it is
 * replaced automatically the moment a real cover file appears in
 * content/images/covers/.
 */
function jacketSvg({ product, site, index }) {
  const W = 840;
  const H = 1187;
  const M = 84;
  const title = product.name.replace(/^The\s+/i, '');
  const size = title.length > 26 ? 62 : title.length > 18 ? 72 : 84;
  const lines = wrap(title, size, W - M * 2, 3);
  const blurb = wrap(product.summary ?? '', 21, W - M * 2 - 40, 4);
  const serial = String(index + 1).padStart(2, '0');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.blush}"/>
  <text x="${M}" y="112" font-family="${FACE.mono}" font-size="15" letter-spacing="2.4"
        fill="${C.ink}" opacity="0.72">${xml(`${site.name.toUpperCase()} · PAID WORK ${serial}`)}</text>
  <text x="${W - M}" y="112" text-anchor="end" font-family="${FACE.mono}" font-size="15"
        letter-spacing="2.4" fill="${C.ink}" opacity="0.72">EDITION ${xml(String(site.established))}.1</text>

  <text x="${M}" y="392" font-family="${FACE.display}" font-size="92" font-weight="${WEIGHT_IN_FAMILY}"
        letter-spacing="2" fill="${C.crimson}">FERAL</text>
  <text x="${M}" y="462" font-family="${FACE.display}" font-size="62" font-weight="${WEIGHT_IN_FAMILY}"
        letter-spacing="1" fill="${C.ink}">FEMME.</text>

  ${lines
    .map(
      (l, i) =>
        `<text x="${M}" y="${628 + i * size * 1.1}" font-family="${FACE.display}" font-size="${size}" font-weight="${WEIGHT_IN_FAMILY}" fill="${C.ink}">${xml(l)}</text>`
    )
    .join('\n  ')}

  ${blurb
    .map(
      (l, i) =>
        `<text x="${M}" y="${628 + lines.length * size * 1.1 + 46 + i * 32}" font-family="${FACE.ui}" font-size="21" font-weight="300" fill="${C.ink}" opacity="0.82">${xml(l)}</text>`
    )
    .join('\n  ')}

  <rect x="${M}" y="${H - 128}" width="${W - M * 2}" height="1" fill="${C.crimson}" opacity="0.34"/>
  <text x="${M}" y="${H - 88}" font-family="${FACE.mono}" font-size="15" letter-spacing="2.4"
        fill="${C.ink}" opacity="0.72">${xml(String(site.url).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toUpperCase())}</text>
  <text x="${W - M}" y="${H - 88}" text-anchor="end" font-family="${FACE.mono}" font-size="15"
        letter-spacing="2.4" fill="${C.ink}" opacity="0.72">${xml(
          `${product.pages} PAGES · ${String(product.for ?? '').toUpperCase()}`
        )}</text>
</svg>`;
}

/**
 * Fills the gaps left by buildCovers. Only products with no cover file get one,
 * so a real cover always wins and nothing has to be deleted to adopt it.
 */
export async function buildProductJackets({ dist, site, covers }) {
  const products = site.shop?.products ?? [];
  const missing = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !covers[slugOf(p.name)]);
  if (!missing.length) return covers;

  const ok = await ensureFontConfig();
  const out = join(dist, 'assets/img/covers');
  await mkdir(out, { recursive: true });

  for (const { p, i } of missing) {
    const slug = slugOf(p.name);
    const svg = Buffer.from(jacketSvg({ product: p, site, index: i }));
    for (const width of [420, 840]) {
      await sharp(svg)
        .resize({ width })
        .webp({ quality: 82, effort: 6 })
        .toFile(join(out, `${slug}-${width}.webp`));
    }
    covers[slug] = {
      thumb: `/assets/img/covers/${slug}-420.webp`,
      image: `/assets/img/covers/${slug}-840.webp`,
      width: 840,
      height: 1187,
      generated: true,
    };
  }

  console.log(
    `  Jackets: ${missing.length} typeset for volumes with no cover file${ok ? '' : ' (fallback face)'}`
  );
  return covers;
}

export async function buildCovers({ dist, dir }) {
  if (!existsSync(dir)) return {};
  const out = join(dist, 'assets/img/covers');
  await mkdir(out, { recursive: true });

  const covers = {};
  for (const file of (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
    const slug = file.replace(/\.[^.]+$/, '');
    const meta = await sharp(join(dir, file)).metadata();
    for (const width of [420, 840]) {
      await sharp(join(dir, file))
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78, effort: 6 })
        .toFile(join(out, `${slug}-${width}.webp`));
    }
    covers[slug] = {
      thumb: `/assets/img/covers/${slug}-420.webp`,
      image: `/assets/img/covers/${slug}-840.webp`,
      width: meta.width ?? null,
      height: meta.height ?? null,
    };
  }
  const n = Object.keys(covers).length;
  if (n) console.log(`  Product covers: ${n}`);
  return covers;
}
