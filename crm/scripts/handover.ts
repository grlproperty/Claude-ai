/**
 * Builds the single-file handover document.
 *
 * One HTML file, self-contained: no network, no CDN, no external font. The
 * 42 screenshots are the ones the smoke test just took, embedded as WebP
 * data URIs, so the document can only be built from a run that actually
 * happened.
 *
 *   npm run build && npm start &
 *   npm run smoke -- http://127.0.0.1:3100
 *   npm run handover
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = process.env.SMOKE_SHOTS ?? join(root, 'smoke-shots');
const docDir = join(root, 'docs', 'handover');
const outPath = process.argv[2] ?? join(root, 'GRLP-CRM-handover.html');
const workDir = join(root, '.handover-webp');

type Group = { group: string; blurb: string; shots: [string, string, string][] };

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main(): Promise<void> {
  const body = await readFile(join(docDir, 'body.html'), 'utf8');
  const manifest: Group[] = JSON.parse(await readFile(join(docDir, 'screenshots.json'), 'utf8'));

  const onDisk = new Set((await readdir(shotsDir)).filter((name) => name.endsWith('.png')));
  await mkdir(workDir, { recursive: true });

  let gallery = '';
  let placed = 0;

  for (const group of manifest) {
    gallery +=
      `\n  <div class="group-head">\n    <h3>${escape(group.group)}</h3>` +
      `\n    <p>${escape(group.blurb)}</p>\n  </div>\n  <div class="shots">`;

    for (const [file, title, caption] of group.shots) {
      if (!onDisk.has(file)) {
        throw new Error(
          `${file} is in the manifest but not in ${shotsDir}. Run the smoke test first: ` +
            'the document is only ever built from screenshots of a run that happened.',
        );
      }

      // Resized and re-encoded so one file stays a file somebody can email.
      const webp = join(workDir, file.replace(/\.png$/, '.webp'));
      await sharp(join(shotsDir, file))
        .resize({ width: 1000, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(webp);

      const data = (await readFile(webp)).toString('base64');
      placed += 1;
      gallery +=
        `\n    <figure>` +
        `\n      <img src="data:image/webp;base64,${data}" alt="${escape(title)}` +
        ` — screenshot of the running CRM" decoding="async">` +
        `\n      <figcaption><strong>${escape(title)}</strong>` +
        `<span>${escape(caption)}</span></figcaption>` +
        `\n    </figure>`;
    }
    gallery += '\n  </div>';
  }

  if (placed !== onDisk.size) {
    throw new Error(
      `${onDisk.size} screenshots were taken but ${placed} are in the document. ` +
        'Every screenshot the smoke test takes has to be accounted for, or the document ' +
        'is quietly showing a selection.',
    );
  }

  const inner = body.replace('  <!--GALLERY-->', gallery);
  const split = inner.indexOf('<header class="masthead">');
  if (split < 0) throw new Error('body.html has no masthead to split on.');

  const html = `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Handover for the Garden Route Lifestyle Property internal CRM: what was built, how to run it, what it refuses to claim, and ${placed} screenshots of it running.">
<meta name="color-scheme" content="light">
${inner.slice(0, split)}</head>
<body>
${inner.slice(split)}
</body>
</html>
`;

  await writeFile(outPath, html);
  process.stdout.write(
    `${outPath}\n${placed} screenshots embedded, ` +
      `${(html.length / 1024 / 1024).toFixed(2)} MB, no external references\n`,
  );
}

await main();
