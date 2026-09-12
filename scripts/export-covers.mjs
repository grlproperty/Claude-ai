/**
 * Exports every paid product's cover as a standalone PNG, for shop listings,
 * social posts and press use.
 *
 * Two kinds of cover exist and they are produced differently. Four products
 * ship a real cover file, which is resampled. The other two have their jacket
 * generated from type, and those are vector — so they are re-rasterised at the
 * export size rather than scaled up from the 840px build output, which would
 * soften every letter edge.
 *
 * Writes to export/covers/.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { jacketSvg } from '../src/lib/images.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'export/covers');
const WIDTH = 1200;

const site = JSON.parse(await readFile(join(ROOT, 'content/site.json'), 'utf8'));
const products = site.shop?.products ?? [];
const slugOf = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await mkdir(OUT, { recursive: true });

for (const [i, p] of products.entries()) {
  const slug = slugOf(p.name);
  const src = join(ROOT, 'content/images/covers', `${slug}.jpg`);
  const dest = join(OUT, `${slug}.png`);

  if (existsSync(src)) {
    const meta = await sharp(src).metadata();
    await sharp(src)
      .resize({ width: WIDTH, kernel: 'lanczos3', withoutEnlargement: false })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    console.log(`  ${slug}.png  from cover file (${meta.width}x${meta.height})`);
  } else {
    // vector: rasterise at the export size, don't upscale the build output
    const svg = Buffer.from(jacketSvg({ product: p, site, index: i }));
    await sharp(svg, { density: Math.round(72 * (WIDTH / 840)) })
      .resize({ width: WIDTH })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    console.log(`  ${slug}.png  typeset jacket, rasterised at ${WIDTH}px`);
  }
}

console.log(`\n${products.length} covers → export/covers/`);
