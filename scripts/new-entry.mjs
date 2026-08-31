/**
 * Scaffolds a new entry with the front matter the build expects and the
 * editorial furniture the standards require — a sources section, a review date,
 * and a topic that matches an existing one so the archive filters stay tidy.
 *
 *   npm run new -- research "The Title Goes Here" [--topic Regulation]
 *   npm run new -- guide    "Module Title"        [--order 6]
 *   npm run new -- page     "Page Title"
 */
import { writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugify } from '../src/lib/util.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');

const KINDS = {
  research: { dir: 'research', label: 'research entry', route: '/research/' },
  guide: { dir: 'guides', label: 'learning module', route: '/learn/' },
  page: { dir: 'pages', label: 'page', route: '/' },
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

const usage = () => {
  console.error(
    'Usage:\n' +
      '  npm run new -- research "Entry title" [--topic Regulation]\n' +
      '  npm run new -- guide    "Module title" [--order 6]\n' +
      '  npm run new -- page     "Page title"\n'
  );
  process.exit(1);
};

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [kindName, title] = positional;

  if (!kindName || !title) usage();
  const kind = KINDS[kindName];
  if (!kind) {
    console.error(`Unknown kind "${kindName}". Expected one of: ${Object.keys(KINDS).join(', ')}`);
    process.exit(1);
  }

  const dir = join(CONTENT, kind.dir);
  await mkdir(dir, { recursive: true });

  const slug = slugify(flags.slug ?? title);
  const today = new Date().toISOString().slice(0, 10);

  // Learning modules and pages are ordered by a numeric filename prefix that
  // never appears in the URL; research entries are ordered by date.
  let filename = `${slug}.md`;
  let order = null;
  if (kind.dir !== 'research') {
    const existing = (await readdir(dir)).filter((f) => f.endsWith('.md'));
    const highest = existing.reduce((n, f) => Math.max(n, Number(/^(\d+)/.exec(f)?.[1] ?? 0)), 0);
    order = Number(flags.order ?? highest + 1);
    if (kind.dir === 'guides') filename = `${String(order).padStart(2, '0')}-${slug}.md`;
  }

  const path = join(dir, filename);
  if (existsSync(path)) {
    console.error(`Already exists: content/${kind.dir}/${filename}`);
    process.exit(1);
  }

  const front =
    kind.dir === 'research'
      ? `---\ntitle: ${title}\nsummary: One or two sentences stating what this entry establishes. This is the text that appears in the archive and in link previews, so it should stand alone.\ntopic: ${flags.topic ?? 'Regulation'}\ndate: ${today}\nupdated: ${today}\n---\n`
      : kind.dir === 'guides'
        ? `---\ntitle: ${title}\nsummary: What this module gives the reader, in one sentence.\norder: ${order}\nduration: 8\noutcomes:\n  - First thing the reader will be able to do\n  - Second thing the reader will be able to do\n---\n`
        : `---\ntitle: ${title}\nsummary: One sentence describing this page.\norder: ${order}\n---\n`;

  const body =
    kind.dir === 'research'
      ? `\nOpen with the claim this entry corrects or the question it answers. No preamble.\n\n## First section\n\nBody copy. Every factual assertion here must be traceable to something in the Sources list below. Where the evidence is contested, say so rather than picking a side silently.\n\n## Second section\n\nMore body copy.\n\n## What to take from this\n\nThe generalisable point, stated plainly.\n\n## Sources\n\n1. Instrument or study, with full citation. https://example.org/primary-source\n2. Second source.\n`
      : kind.dir === 'guides'
        ? `\nOpen by saying what this module establishes and what it assumes from the previous one.\n\n## First section\n\nBody copy.\n\n## Second section\n\nBody copy.\n\n## Check yourself\n\nA question the reader should be able to answer without looking back.\n\nA second question.\n`
        : `\nBody copy.\n\n## First section\n\nMore body copy.\n`;

  await writeFile(path, front + body);

  console.log(
    `Created content/${kind.dir}/${filename}\n` +
      `  ${kind.label} — will publish at ${kind.route}${slug}/\n` +
      `  Run \`npm run build\` to generate it, then \`npm run check\` to verify.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
