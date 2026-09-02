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
  note: { dir: 'field-notes', label: 'field note', route: '/field-notes/' },
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
      '  npm run new -- note "Field note title" [--topic Fashion]\n' +
      '  npm run new -- page "Page title"\n'
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

  // Learning modules and pages are ordered by a numeric filename prefix that
  // never appears in the URL; research entries are ordered by date.
  // Both collections order by a numeric filename prefix that never appears in
  // the URL, so a new entry lands at the end unless --order says otherwise.
  const existing = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const highest = existing.reduce((n, f) => Math.max(n, Number(/^(\d+)/.exec(f)?.[1] ?? 0)), 0);
  const order = Number(flags.order ?? highest + 1);
  const filename =
    kind.dir === 'field-notes' ? `${String(order).padStart(2, '0')}-${slug}.md` : `${slug}.md`;

  const path = join(dir, filename);
  if (existsSync(path)) {
    console.error(`Already exists: content/${kind.dir}/${filename}`);
    process.exit(1);
  }

  const topic = flags.topic ?? 'Corporate';
  const front =
    kind.dir === 'field-notes'
      ? `---\ntitle: ${JSON.stringify(title)}\nsummary: "One or two sentences stating what this note establishes. This is the text that appears in the index and in link previews, so it should stand alone."\ntopic: ${JSON.stringify(topic)}\ntopics: ${JSON.stringify([topic])}\nform: "Long read"\nduration: 6\norder: ${order}\n---\n`
      : `---\ntitle: ${JSON.stringify(title)}\nsummary: "One sentence describing this page."\norder: ${order}\n---\n`;

  const body =
    kind.dir === 'field-notes'
      ? `\nOpen with the claim this note corrects or the question it answers. No preamble.\n\nName the original publisher in the body, not only in a citation — the reporting belongs to them.\n\n## First section\n\nBody copy. Every factual assertion must be traceable to a named publisher, regulator, or research body. Where the evidence is contested, say so rather than picking a side silently.\n\n## Second section\n\nMore body copy.\n\n## What to take from this\n\nThe generalisable point, stated plainly.\n`
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
