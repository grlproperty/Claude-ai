/**
 * Downloads TrueType copies of the two brand typefaces into tools/fonts/.
 *
 * These are never served to visitors — the site ships woff2 from
 * src/assets/fonts/. They exist so that the build can rasterise text into the
 * social preview images, which happens through librsvg and therefore needs
 * fonts installed where fontconfig can find them.
 *
 * Committed so the build stays hermetic. Re-run only if the font stack changes:
 *   node scripts/fetch-ttf.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tools/fonts');

// A legacy User-Agent makes the Google Fonts API serve TrueType rather than woff2.
const UA = 'Mozilla/4.0';

const WANTED = [
  { family: 'Bodoni Moda', weight: 500, file: 'BodoniModa-Medium.ttf' },
  { family: 'Bodoni Moda', weight: 400, file: 'BodoniModa-Regular.ttf' },
  { family: 'Cormorant Garamond', weight: 600, file: 'CormorantGaramond-SemiBold.ttf' },
  { family: 'Jost', weight: 500, file: 'Jost-Medium.ttf' },
  { family: 'Jost', weight: 300, file: 'Jost-Light.ttf' },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const { family, weight, file } of WANTED) {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}`,
        { headers: { 'User-Agent': UA } }
      )
    ).text();

    const url = /url\((https:\/\/[^)]+\.ttf)\)/.exec(css)?.[1];
    if (!url) throw new Error(`No TrueType URL returned for ${family} ${weight}`);

    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    await writeFile(resolve(OUT, file), Buffer.from(await res.arrayBuffer()));
    console.log(`  ${file}`);
  }

  console.log(`Build fonts written to tools/fonts/`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
