/**
 * Generates an Instagram carousel for a published entry, using the post system
 * defined in the FERAL FEMME brand kit: a title slide, a numbered sequence of
 * content slides drawn from the entry's own section headings, a pull quote, and
 * the closing reflection card.
 *
 * Output is 1080 × 1350 PNG (Instagram portrait), written to social/<slug>/.
 *
 *   npm run social                 → every research entry and learning module
 *   npm run social -- <slug>       → one entry
 *
 * Slides are composed as SVG and rasterised through the same fontconfig setup
 * the social cards use, so the typography matches the site exactly.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import sharp from 'sharp';

import { stripMarkdown, slugify, decodeEntities } from '../src/lib/util.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'social');
const FONT_DIR = join(ROOT, 'tools/fonts');
const FC_DIR = join(ROOT, 'tools/.fontconfig');

const W = 1080;
const H = 1350;
const M = 96; // margin — the brand rules ask for generous white space

// Average glyph width as a fraction of font size, measured per family.
// Montserrat is a wide geometric sans; Cormorant is a narrow old-style serif.
const RATIO = { serif: 0.47, sans: 0.6 };

const C = { blush: '#EFD8D8', crimson: '#9B0000', ink: '#0A0A0A', white: '#FDFCFC', pale: '#F7EBEB' };

// ------------------------------------------------------------------ fonts

async function ensureFontConfig() {
  if (!existsSync(FONT_DIR)) {
    console.warn('  ! tools/fonts/ missing — run `node scripts/fetch-ttf.mjs` first.');
    return;
  }
  await mkdir(join(FC_DIR, 'cache'), { recursive: true });
  const file = join(FC_DIR, 'fonts.conf');
  await writeFile(
    file,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${FONT_DIR}</dir>\n  <cachedir>${join(
      FC_DIR,
      'cache'
    )}</cachedir>\n</fontconfig>\n`
  );
  process.env.FONTCONFIG_FILE = file;
}

// ------------------------------------------------------------------ layout

const xml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Greedy wrap with per-character width ratios; see src/lib/images.mjs. */
function wrap(text, fontSize, maxWidth, maxLines = 99, ratio = RATIO.serif) {
  const narrow = new Set("ijltfrI.,;:!'\"()[]|`".split(''));
  const wide = new Set('MWmw@'.split(''));
  const widthOf = (s) =>
    [...s].reduce((w, ch) => {
      if (narrow.has(ch)) return w + fontSize * (ratio - 0.22);
      if (wide.has(ch)) return w + fontSize * (ratio + 0.32);
      if (ch === ' ') return w + fontSize * 0.26;
      return w + fontSize * ratio;
    }, 0);

  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

const text = (s, { x, y, size, family = 'Cormorant Garamond', weight = 600, fill = C.ink, spacing = 0, anchor = 'start', opacity = 1 }) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}"` +
  ` letter-spacing="${spacing}" text-anchor="${anchor}"${opacity !== 1 ? ` opacity="${opacity}"` : ''}>${xml(s)}</text>`;

const block = (lines, { x, y, size, lineHeight = 1.16, ...rest }) =>
  lines.map((l, i) => text(l, { x, y: y + i * size * lineHeight, size, ...rest })).join('\n  ');

/** The wordmark lockup that closes every slide. */
const footer = (kicker) =>
  `<rect x="${M}" y="${H - 168}" width="${W - M * 2}" height="1" fill="${C.ink}" opacity="0.16"/>
  ${text('FERAL', { x: M, y: H - 104, size: 40, spacing: 7, fill: C.crimson })}
  ${text('FEMME.', { x: M + 158, y: H - 104, size: 33, spacing: 8, fill: C.ink })}
  ${kicker ? text(kicker.toUpperCase(), { x: W - M, y: H - 104, size: 17, family: 'Montserrat', weight: 300, spacing: 3.4, anchor: 'end', opacity: 0.55 }) : ''}`;

/** Drawn rather than typeset: the brand TTFs carry no arrow glyph. */
const arrow = (x, y, w = 34, fill = C.ink, opacity = 0.6) =>
  `<g opacity="${opacity}"><path d="M${x} ${y} H${x + w}" stroke="${fill}" stroke-width="2"/>` +
  `<path d="M${x + w - 9} ${y - 6} L${x + w} ${y} L${x + w - 9} ${y + 6}" fill="none" stroke="${fill}" stroke-width="2"/></g>`;

const eyebrow = (label, y = 200, fill = C.crimson) =>
  `<rect x="${M}" y="${y - 8}" width="56" height="2" fill="${fill}"/>
  ${text(label.toUpperCase(), { x: M + 78, y, size: 19, family: 'Montserrat', weight: 500, spacing: 4.2, fill })}`;

const svg = (background, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${background}"/>
  ${inner}
</svg>`;

// ------------------------------------------------------------------ slides

function titleSlide(entry, total) {
  const lines = wrap(entry.title, 92, W - M * 2, 6);
  return svg(
    C.blush,
    `<rect x="0" y="0" width="${W}" height="12" fill="${C.crimson}"/>
  ${eyebrow(entry.topic ?? 'Educational module')}
  ${block(lines, { x: M, y: 420, size: 92 })}
  ${text('Swipe to read', { x: M, y: H - 260, size: 26, family: 'Montserrat', weight: 300, spacing: 2, opacity: 0.6 })}
  ${arrow(M + 208, H - 269)}
  ${footer(`1 / ${total}`)}`
  );
}

/** A numbered section slide: heading plus the opening of that section. */
function sectionSlide(section, index, total) {
  const heading = wrap(section.heading, 62, W - M * 2, 4);
  const body = wrap(section.body, 32, W - M * 2, 14, RATIO.sans);
  const bodyTop = 400 + heading.length * 62 * 1.16;
  return svg(
    C.white,
    `${eyebrow(String(index).padStart(2, '0'))}
  ${block(heading, { x: M, y: 340, size: 62 })}
  ${block(body, { x: M, y: bodyTop, size: 32, lineHeight: 1.62, family: 'Montserrat', weight: 300, fill: C.ink, opacity: 0.78 })}
  ${footer(`${index} / ${total}`)}`
  );
}

/** The statistic-highlight template, reversed out of crimson. */
function figureSlide(figure, caption, index, total) {
  const cap = wrap(caption, 30, W - M * 2, 4, RATIO.sans);
  return svg(
    C.crimson,
    `${text(figure, { x: W / 2, y: 620, size: 210, fill: C.white, anchor: 'middle' })}
  ${block(cap, { x: W / 2, y: 740, size: 30, lineHeight: 1.55, family: 'Montserrat', weight: 300, fill: C.white, anchor: 'middle', opacity: 0.85 })}
  <rect x="${M}" y="${H - 168}" width="${W - M * 2}" height="1" fill="${C.white}" opacity="0.3"/>
  ${text('FERAL', { x: M, y: H - 104, size: 40, spacing: 7, fill: C.white })}
  ${text('FEMME.', { x: M + 158, y: H - 104, size: 33, spacing: 8, fill: C.white, opacity: 0.75 })}
  ${text(`${index} / ${total}`, { x: W - M, y: H - 104, size: 17, family: 'Montserrat', weight: 300, spacing: 3.4, fill: C.white, anchor: 'end', opacity: 0.6 })}`
  );
}

/** The pull-quote template. */
function quoteSlide(quote, index, total) {
  const lines = wrap(quote, 52, W - M * 2 - 40, 9);
  return svg(
    C.pale,
    `${text('“', { x: M, y: 320, size: 160, fill: C.crimson })}
  ${block(lines, { x: M + 40, y: 460, size: 52, lineHeight: 1.34 })}
  ${footer(`${index} / ${total}`)}`
  );
}

/** The closing reflection card. */
function closingSlide(entry, total) {
  return svg(
    C.crimson,
    `${text('Knowledge', { x: W / 2, y: 560, size: 96, fill: C.white, anchor: 'middle' })}
  ${text('Creates Change', { x: W / 2, y: 672, size: 96, fill: C.white, anchor: 'middle' })}
  <rect x="${W / 2 - 60}" y="740" width="120" height="2" fill="${C.white}" opacity="0.5"/>
  ${text('Read the full entry, with sources', { x: W / 2, y: 830, size: 30, family: 'Montserrat', weight: 300, fill: C.white, anchor: 'middle', opacity: 0.85 })}
  ${text('feral-femme.co', { x: W / 2, y: 890, size: 30, family: 'Montserrat', weight: 500, fill: C.white, anchor: 'middle' })}
  <rect x="${M}" y="${H - 168}" width="${W - M * 2}" height="1" fill="${C.white}" opacity="0.3"/>
  ${text('FERAL', { x: W / 2 - 100, y: H - 104, size: 40, spacing: 7, fill: C.white, anchor: 'middle' })}
  ${text('FEMME.', { x: W / 2 + 80, y: H - 104, size: 33, spacing: 8, fill: C.white, anchor: 'middle', opacity: 0.75 })}`
  );
}

// ------------------------------------------------------------------ source

/** Splits an entry into its h2 sections, keeping the first paragraph of each. */
function sections(markdown) {
  const out = [];
  const parts = markdown.split(/^##\s+(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const heading = decodeEntities(stripMarkdown(parts[i]));
    if (/^sources$/i.test(heading)) continue;
    const paragraph = parts[i + 1]
      .split(/\n\s*\n/)
      .map((s) => stripMarkdown(s))
      .find((s) => s.length > 80);
    if (paragraph) out.push({ heading, body: paragraph });
  }
  return out;
}

/** The first blockquote, or the longest short sentence, as a pull quote. */
function pullQuote(markdown, fallback) {
  const quoted = /^>\s+(.+)$/m.exec(markdown);
  if (quoted) return stripMarkdown(quoted[1]);
  const sentences = stripMarkdown(markdown)
    .split(/(?<=\.)\s+/)
    .filter((s) => s.length > 70 && s.length < 190);
  return sentences[0] ?? fallback;
}

async function loadEntries() {
  const entries = [];
  for (const [dir, kind] of [
    ['research', 'Research'],
    ['guides', 'Module'],
  ]) {
    const full = join(CONTENT, dir);
    if (!existsSync(full)) continue;
    for (const file of (await readdir(full)).filter((f) => f.endsWith('.md'))) {
      const { data, content } = matter(await readFile(join(full, file), 'utf8'));
      entries.push({
        ...data,
        kind,
        slug: data.slug || slugify(basename(file, '.md').replace(/^\d+[-_]/, '')),
        markdown: content,
      });
    }
  }
  return entries;
}

// -------------------------------------------------------------------- main

async function main() {
  await ensureFontConfig();

  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const all = await loadEntries();
  const entries = wanted.length ? all.filter((e) => wanted.includes(e.slug)) : all;

  if (!entries.length) {
    console.error(
      wanted.length
        ? `No entry matching: ${wanted.join(', ')}\nAvailable: ${all.map((e) => e.slug).join(', ')}`
        : 'No entries found.'
    );
    process.exit(1);
  }

  for (const entry of entries) {
    const secs = sections(entry.markdown).slice(0, 4);
    const quote = pullQuote(entry.markdown, entry.summary);

    // title + sections + quote + closing
    const total = 1 + secs.length + 1 + 1;
    const slides = [
      titleSlide(entry, total),
      ...secs.map((s, i) => sectionSlide(s, i + 2, total)),
      quoteSlide(quote, total - 1, total),
      closingSlide(entry, total),
    ];

    const dir = join(OUT, entry.slug);
    await mkdir(dir, { recursive: true });

    for (const [i, slide] of slides.entries()) {
      await sharp(Buffer.from(slide))
        .png({ compressionLevel: 9 })
        .toFile(join(dir, `${String(i + 1).padStart(2, '0')}.png`));
    }

    // A caption ready to paste, with the hashtags the brand actually uses.
    await writeFile(
      join(dir, 'caption.txt'),
      `${entry.title}\n\n${entry.summary}\n\n` +
        `Full entry with sources: feral-femme.co/${entry.kind === 'Module' ? 'learn' : 'research'}/${entry.slug}/\n\n` +
        `#FeralFemme #CrueltyFree #AnimalTesting #EthicalBeauty #CosmeticsRegulation #EducateExposeEmpower\n`
    );

    console.log(`  ${entry.slug} — ${slides.length} slides`);
  }

  console.log(`Social kit written to social/ (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
