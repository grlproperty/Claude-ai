/**
 * Derives web-ready campaign imagery from the raw exports in src/assets/img/.
 *
 * Sources are named `raw-*.png` and are the originals recovered from the brand
 * kit. Derivatives are WebP at two widths, colour-graded to the brand's stated
 * photography direction: desaturated and cool-toned, never saturated.
 *
 * Runs automatically before every build (npm run build), and skips any
 * derivative already newer than its source, so repeat builds cost nothing.
 */
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'src/assets/img');

const WIDTHS = [1200, 640];
const QUALITY = 82;

/** Matches the brand kit's photography direction: desaturated, cool base grade. */
const grade = (pipeline) => pipeline.modulate({ saturation: 0.86 }).linear(1.03, -6);

async function newer(a, b) {
  if (!existsSync(b)) return true;
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  return sa.mtimeMs > sb.mtimeMs;
}

async function main() {
  if (!existsSync(DIR)) {
    console.log('Images: nothing to process.');
    return;
  }

  const sources = (await readdir(DIR)).filter((f) => f.startsWith('raw-') && /\.(png|jpe?g)$/i.test(f));
  let written = 0;
  let skipped = 0;

  for (const file of sources) {
    const src = join(DIR, file);
    const stem = file.replace(/^raw-/, '').replace(/\.[^.]+$/, '');

    for (const width of WIDTHS) {
      const out = join(DIR, `${stem}-${width}.webp`);
      if (!(await newer(src, out))) {
        skipped += 1;
        continue;
      }
      await grade(sharp(src).resize({ width, withoutEnlargement: true }))
        .webp({ quality: QUALITY, effort: 5 })
        .toFile(out);
      written += 1;
    }
  }

  // A small blurred placeholder for the hero, inlined by nothing yet but cheap
  // to keep in step with its source.
  const hero = join(DIR, 'raw-editorial-portrait.png');
  if (existsSync(hero)) {
    const out = join(DIR, 'editorial-portrait-blur.webp');
    if (await newer(hero, out)) {
      await sharp(hero).resize({ width: 24 }).blur(2).webp({ quality: 60 }).toFile(out);
      written += 1;
    }
  }

  console.log(`Images: ${written} written, ${skipped} up to date.`);
}

main().catch((err) => {
  console.error('Image processing failed:', err.message);
  process.exit(1);
});
