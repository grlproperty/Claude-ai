/**
 * Generated imagery: brand marks, favicons, and a social preview card per entry.
 *
 * Text is rasterised through librsvg, which finds fonts via fontconfig rather
 * than through anything sharp controls. A generated fontconfig file pointed at
 * tools/fonts/ is therefore written before the first render — without it the
 * cards silently fall back to a system sans-serif, which looks approximately
 * right in a thumbnail and is off-brand everywhere it matters.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FONT_DIR = join(ROOT, 'tools/fonts');
const FC_DIR = join(ROOT, 'tools/.fontconfig');

const C = { blush: '#F6DFE2', crimson: '#8E0B14', ink: '#12100F', white: '#FDFCFC' };

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
  <text x="168" y="136" font-family="Jost" font-size="19" font-weight="500"
        letter-spacing="4.2" fill="${C.crimson}">${xml(eyebrow.toUpperCase())}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="90" y="${blockTop + i * size * 1.14}" font-family="Bodoni Moda" font-size="${size}" font-weight="500" fill="${C.ink}">${xml(l)}</text>`
    )
    .join('\n  ')}
  <rect x="90" y="${H - 132}" width="${W - 180}" height="1" fill="${C.ink}" opacity="0.16"/>
  <text x="90" y="${H - 76}" font-family="Bodoni Moda" font-size="34" font-weight="500"
        letter-spacing="9" fill="${C.crimson}">FERAL</text>
  <text x="248" y="${H - 76}" font-family="Bodoni Moda" font-size="34" font-weight="500"
        letter-spacing="9" fill="${C.ink}">FEMME.</text>
  <text x="${W - 90}" y="${H - 76}" text-anchor="end" font-family="Jost" font-size="17"
        font-weight="300" letter-spacing="3.4" fill="${C.ink}" opacity="0.62">${xml(kicker.toUpperCase())}</text>
</svg>`;
}

/** The mark used for favicons and app icons: the FF monogram in its circle. */
function markSvg({ size = 512, background = C.blush } = {}) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <circle cx="${c}" cy="${c}" r="${size * 0.375}" fill="none" stroke="${C.crimson}" stroke-width="${size * 0.014}"/>
  <text x="${c}" y="${c + size * 0.115}" text-anchor="middle" font-family="Bodoni Moda"
        font-size="${size * 0.32}" font-weight="500" letter-spacing="${size * 0.02}" fill="${C.crimson}">FF</text>
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
