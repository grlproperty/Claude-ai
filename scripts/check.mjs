/**
 * Build verification. Runs against dist/ after a build and fails the process on
 * anything that would ship broken:
 *
 *   - internal links pointing at routes that were never generated
 *   - images referenced but not built, or missing alt attributes
 *   - pages missing a title, description, canonical, or h1
 *   - brand colour pairs falling below WCAG AA contrast
 *   - datasets past their declared review cycle (warning, not failure)
 *
 * The accessibility page makes public promises; this is what holds them.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'content');

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ------------------------------------------------------------------ colour

const srgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Flatten `colour at alpha` over an opaque background, as the browser does. */
const over = (hex, alpha, bgHex) => {
  const fg = srgb(hex);
  const bg = srgb(bgHex);
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
};

const BLUSH = '#EFD8D8';
const INK = '#0A0A0A';
const WHITE = '#FDFCFC';
const CRIMSON = '#9B0000';

/**
 * Reads the alpha the stylesheet actually declares for a token, so this check
 * tests what ships rather than a copy of it that can drift.
 */
function alphaOf(css, token) {
  const m = new RegExp(`--${token}:\\s*rgba\\([^)]*?,\\s*([\\d.]+)\\s*\\)`).exec(css);
  if (m) return Number(m[1]);
  fail(`contrast: token --${token} not found in site.css`);
  return null;
}

async function checkContrast() {
  const css = await readFile(join(ROOT, 'src/assets/css/site.css'), 'utf8');

  // Every foreground/background combination the design uses for text.
  // 4.5:1 throughout: none of these are large enough to qualify for 3:1.
  const pairs = [
    ['body text on blush', srgb(INK), srgb(BLUSH)],
    ['body text on white', srgb(INK), srgb(WHITE)],
    ['crimson link on blush', srgb(CRIMSON), srgb(BLUSH)],
    ['crimson link on white', srgb(CRIMSON), srgb(WHITE)],
    ['crimson link on pale blush', srgb(CRIMSON), srgb('#F7EBEB')],
    ['white on crimson button', srgb(WHITE), srgb(CRIMSON)],
    ['label on dark (blush)', srgb(BLUSH), srgb(INK)],
  ];

  // Token-driven pairs: the ink levels appear on all three light grounds, and
  // the light levels only ever appear on Pure Black.
  for (const token of ['ink-secondary', 'ink-muted', 'ink-faint']) {
    const a = alphaOf(css, token);
    if (a === null) continue;
    for (const [groundName, ground] of [
      ['blush', BLUSH],
      ['white', WHITE],
      ['pale blush', '#F7EBEB'],
    ]) {
      pairs.push([`--${token} on ${groundName}`, over(INK, a, ground), srgb(ground)]);
    }
  }

  for (const token of ['on-dark', 'on-dark-dim']) {
    const a = alphaOf(css, token);
    if (a === null) continue;
    pairs.push([`--${token} on ink`, over(WHITE, a, INK), srgb(INK)]);
  }

  // Light-on-dark greys are declared inline rather than as tokens. Text and
  // borders are held to different thresholds, so they are matched separately:
  // `color:` alone is text, `border-color:` is a UI boundary.
  for (const m of css.matchAll(/(?:^|[;{\s])color:\s*rgba\(253,\s*252,\s*252,\s*([\d.]+)\)/g)) {
    pairs.push([`light text at ${m[1]} on ink`, over(WHITE, Number(m[1]), INK), srgb(INK)]);
  }

  for (const [name, fg, bg] of pairs) {
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) {
      fail(`contrast: ${name} is ${ratio.toFixed(2)}:1, below the 4.5:1 required`);
    }
  }

  // WCAG 1.4.11: the visible boundary of a control needs 3:1, not 4.5:1.
  for (const m of css.matchAll(/border-color:\s*rgba\(253,\s*252,\s*252,\s*([\d.]+)\)/g)) {
    const ratio = contrast(over(WHITE, Number(m[1]), INK), srgb(INK));
    if (ratio < 3) {
      fail(`contrast: light border at ${m[1]} on ink is ${ratio.toFixed(2)}:1, below the 3:1 required`);
    }
  }
}

// -------------------------------------------------------------------- html

async function walk(dir, out = []) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

function attrOf(tag, name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

async function checkHtml(files) {
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const routes = new Set(
    htmlFiles.map((f) => {
      const rel = f.slice(DIST.length).replace(/\\/g, '/');
      return rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    })
  );

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const page = file.slice(DIST.length).replace(/index\.html$/, '') || '/';

    if (!/<title>[^<]{5,}<\/title>/.test(html)) fail(`${page}: missing or empty <title>`);
    if (!/<meta name="description" content="[^"]{20,}"/.test(html)) fail(`${page}: missing description`);
    if (!/<link rel="canonical"/.test(html)) fail(`${page}: missing canonical link`);
    if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${page}: expected exactly one <h1>`);
    if (!/<main id="main">/.test(html)) fail(`${page}: missing main landmark`);
    if (/<html lang="/.test(html) === false) fail(`${page}: missing lang attribute`);

    // Internal links must resolve to a generated route or a generated file.
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
      const href = m[1];
      if (href.startsWith('/assets/')) {
        if (!existsSync(join(DIST, href.slice(1)))) fail(`${page}: asset not found — ${href}`);
        continue;
      }
      const normalised = href.endsWith('/') ? href : `${href}/`;
      const asFile = existsSync(join(DIST, href.slice(1)));
      if (!routes.has(normalised) && !routes.has(href) && !asFile) {
        fail(`${page}: dead internal link — ${href}`);
      }
    }

    // Every image needs a src that exists and an alt attribute (possibly empty
    // for decorative images, which is a deliberate choice, not an omission).
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const src = attrOf(tag, 'src');
      if (src && src.startsWith('/') && !existsSync(join(DIST, src.slice(1)))) {
        fail(`${page}: image not found — ${src}`);
      }
      if (!/\balt\s*=/.test(tag)) fail(`${page}: <img> without alt — ${src ?? tag.slice(0, 60)}`);
    }
  }

  return htmlFiles.length;
}

// ---------------------------------------------------------------- datasets

async function checkDatasets() {
  const dir = join(CONTENT, 'data');
  if (!existsSync(dir)) return;

  for (const file of await readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(await readFile(join(dir, file), 'utf8'));
    if (!data.reviewed) {
      warn(`${file}: no \`reviewed\` date — the review stamp cannot be generated`);
      continue;
    }
    const age = Math.floor((Date.now() - new Date(data.reviewed).getTime()) / 86400000);
    const cycle = data.reviewCycleDays ?? 180;
    if (age > cycle) {
      warn(`${file}: last reviewed ${age} days ago, past its ${cycle}-day cycle`);
    }
  }
}

// -------------------------------------------------------------------- main

async function main() {
  if (!existsSync(DIST)) {
    console.error('No dist/ directory. Run `npm run build` first.');
    process.exit(1);
  }

  const files = await walk(DIST);
  await checkContrast();
  const pages = await checkHtml(files);
  await checkDatasets();

  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);

  if (errors.length) {
    console.error(`\nCheck failed: ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${pages} pages.`);
    process.exit(1);
  }

  console.log(
    `Check passed: ${pages} pages, ${files.length} files${warnings.length ? `, ${warnings.length} warning(s)` : ''}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
