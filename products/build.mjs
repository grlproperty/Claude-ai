/**
 * Builds the two sellable PDFs from the site's own datasets.
 *
 * The reference tables are generated, not written — they come out of
 * content/data/*.json, which is the same material the public decoders render.
 * That is deliberate: when a dataset is reviewed, rebuilding here reissues the
 * product rather than leaving a stale PDF in circulation. The written parts
 * (the substantiation tests, the procedure, the rewrites) live in copy.json.
 *
 * Rendered through headless Chromium rather than a PDF library, so the pages
 * can use the site's own typefaces and hold to the same design. Fonts are
 * embedded as data URIs because a file:// page cannot fetch a file:// font.
 *
 * Page numbers need two passes: the contents cannot cite a page until the
 * document has been laid out, so the first pass is measured with pypdf and the
 * second is rendered with the numbers filled in.
 *
 *   node products/build.mjs   →   products/dist/*.pdf
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'products', 'dist');
const FONTS = join(ROOT, 'dist', 'assets', 'fonts');

const FACES = [
  ['Bodoni Moda', 500, 'normal', 'bodoni-moda-500-normal-latin.woff2'],
  ['Bodoni Moda', 600, 'normal', 'bodoni-moda-600-normal-latin.woff2'],
  ['Cormorant Garamond', 400, 'normal', 'cormorant-garamond-400-normal-latin.woff2'],
  ['Cormorant Garamond', 600, 'normal', 'cormorant-garamond-600-normal-latin.woff2'],
  ['Cormorant Garamond', 400, 'italic', 'cormorant-garamond-400-italic-latin.woff2'],
  ['Jost', 300, 'normal', 'jost-300-normal-latin.woff2'],
  ['Jost', 400, 'normal', 'jost-400-normal-latin.woff2'],
  ['Jost', 500, 'normal', 'jost-500-normal-latin.woff2'],
];

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Curly quotes and dashes. These are sold documents; straight quotes look unfinished. */
const typo = (s) =>
  esc(s)
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/"([^"]*)"/g, '“$1”')
    .replace(/ - /g, ' — ');

async function fontCss() {
  const out = [];
  for (const [family, weight, style, file] of FACES) {
    const buf = await readFile(join(FONTS, file));
    out.push(
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
        `font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')}`
    );
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- stylesheet

const CSS = `
:root {
  --ink: #100c0d;
  --crimson: #a80d13;
  --paper: #ffffff;
  --blush: #f9eef0;
  --pale: #fcf7f8;
  --rule: #e0d3d5;
  --rule-firm: #c3b1b4;
  --dim: #5d5153;
  --display: 'Bodoni Moda', Georgia, serif;
  --read: 'Cormorant Garamond', Georgia, serif;
  --ui: 'Jost', 'Helvetica Neue', Arial, sans-serif;
}

@page { size: A4; margin: 19mm 16mm 20mm; }

* { box-sizing: border-box; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  margin: 0;
  font-family: var(--read);
  font-weight: 400;
  font-size: 10.6pt;
  line-height: 1.5;
  color: var(--ink);
  background: var(--paper);
}

/* ------------------------------------------------------------------ cover */

.cover {
  page-break-after: always;
  background: var(--blush);
  /* Printed on its own, with no margins and no running footer, so the colour
     reaches the paper edge. Chromium reserves the footer strip on every page
     of a render, which is why this cannot be part of the body run. */
  padding: 58mm 26mm 26mm;
  /* A fixed height a shade under A4, with overflow clipped. min-height: 297mm
     is exactly the page and rounds over it, which spills the foot of the cover
     onto a second, almost-empty page. */
  height: 292mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wordmark {
  font-family: var(--display);
  font-weight: 500;
  font-size: 13pt;
  letter-spacing: .30em;
  text-transform: uppercase;
  margin: 0 0 34mm;
}
.wordmark .c { color: var(--crimson); }

.cover h1 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 38pt;
  line-height: .98;
  letter-spacing: -.015em;
  /* Narrow enough that the title breaks where it reads best rather than
     leaving one word alone on the second line. */
  max-width: 112mm;
  margin: 0 0 7mm;
}

.cover .sub {
  font-family: var(--read);
  font-size: 14pt;
  line-height: 1.4;
  color: var(--dim);
  max-width: 105mm;
  margin: 0 0 auto;
}

.cover .foot {
  border-top: 1.4pt solid var(--crimson);
  padding-top: 5mm;
  font-family: var(--ui);
  font-weight: 300;
  font-size: 8pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dim);
  display: flex;
  justify-content: space-between;
  gap: 8mm;
}

/* --------------------------------------------------------------- sections */

.section { page-break-before: always; }
.section:first-of-type { page-break-before: avoid; }

.sec-head { border-bottom: 1.2pt solid var(--ink); padding-bottom: 3mm; margin-bottom: 7mm; }

.sec-num {
  font-family: var(--ui);
  font-weight: 400;
  font-size: 7.6pt;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--crimson);
  margin: 0 0 2mm;
}

h2 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 21pt;
  line-height: 1.08;
  margin: 0;
  letter-spacing: -.01em;
}

.intro {
  font-size: 11.6pt;
  line-height: 1.5;
  color: var(--dim);
  max-width: 132mm;
  margin: 0 0 8mm;
}

h3 {
  font-family: var(--ui);
  font-weight: 500;
  font-size: 9.4pt;
  letter-spacing: .13em;
  text-transform: uppercase;
  margin: 8mm 0 3mm;
  color: var(--ink);
  page-break-after: avoid;
}

p { margin: 0 0 3mm; }
p:last-child { margin-bottom: 0; }

/* --------------------------------------------------------------- contents */

.toc { list-style: none; margin: 0; padding: 0; }
.toc li {
  display: flex;
  align-items: baseline;
  gap: 3mm;
  padding: 2.6mm 0;
  border-bottom: .5pt solid var(--rule);
  font-family: var(--ui);
  font-weight: 300;
  font-size: 10pt;
}
.toc .n { font-size: 7.6pt; letter-spacing: .16em; color: var(--crimson); min-width: 12mm; }
.toc .t { flex: 1; }
.toc .p { font-variant-numeric: tabular-nums; color: var(--dim); font-size: 9pt; }

/* ---------------------------------------------------------------- entries */

.entry {
  page-break-inside: avoid;
  border-top: .5pt solid var(--rule);
  padding: 3.1mm 0;
}
.entry:first-of-type { border-top: 1pt solid var(--rule-firm); }

.entry h4 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 12.4pt;
  margin: 0 0 1.6mm;
  line-height: 1.12;
}

.entry .meta {
  font-family: var(--ui);
  font-weight: 300;
  font-size: 7.4pt;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 0 0 2.5mm;
}

.field { display: grid; grid-template-columns: 25mm 1fr; gap: 1mm 4mm; margin-bottom: 1.2mm; }
.field:last-child { margin-bottom: 0; }

.field dt {
  font-family: var(--ui);
  font-weight: 500;
  font-size: 7.2pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dim);
  padding-top: .8mm;
}
.field dd { margin: 0; }

.field--test dt { color: var(--crimson); }
.field--test dd { font-family: var(--ui); font-weight: 300; font-size: 9.2pt; line-height: 1.45; }

.field--not dt { color: var(--crimson); }
.field--not dd { font-weight: 600; }

.src { font-family: var(--ui); font-weight: 300; font-size: 7.6pt; color: var(--dim); }

/* --------------------------------------------------------------- numbered */

.steps { counter-reset: st; list-style: none; margin: 0; padding: 0; }
.steps > li {
  counter-increment: st;
  page-break-inside: avoid;
  display: grid;
  grid-template-columns: 14mm 1fr;
  gap: 0 5mm;
  padding: 4.5mm 0;
  border-top: .5pt solid var(--rule);
}
.steps > li::before {
  content: counter(st, decimal-leading-zero);
  font-family: var(--display);
  font-weight: 600;
  font-size: 17pt;
  color: var(--crimson);
  line-height: 1;
}
.steps h4 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 13pt;
  margin: 0 0 1.5mm;
  line-height: 1.15;
}

/* --------------------------------------------------------------- rewrites */

.rw { page-break-inside: avoid; border: .6pt solid var(--rule-firm); margin-bottom: 4mm; }
.rw > div { padding: 3mm 4mm; }
.rw .was { background: var(--pale); border-bottom: .5pt solid var(--rule); }
.rw .lbl {
  font-family: var(--ui);
  font-weight: 500;
  font-size: 6.8pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 0 0 1.2mm;
}
.rw .txt { font-family: var(--display); font-weight: 600; font-size: 11.6pt; line-height: 1.2; margin: 0; }
.rw .why { font-family: var(--ui); font-weight: 300; font-size: 8pt; color: var(--crimson); margin: 1.6mm 0 0; }
.rw .now .txt { font-weight: 500; font-family: var(--read); font-size: 11pt; line-height: 1.35; }

/* ------------------------------------------------------------- signoff box */

.signoff { border: 1pt solid var(--ink); padding: 5mm 6mm; page-break-inside: avoid; }
.signoff table { width: 100%; border-collapse: collapse; font-family: var(--ui); font-weight: 300; font-size: 8.6pt; }
.signoff th {
  text-align: left;
  font-weight: 500;
  font-size: 6.8pt;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--dim);
  padding-bottom: 2mm;
  border-bottom: .6pt solid var(--ink);
}
.signoff td { padding: 4.2mm 3mm 4.2mm 0; border-bottom: .4pt solid var(--rule-firm); vertical-align: top; white-space: nowrap; }
.signoff td:last-child { padding-right: 0; }
.signoff .blank { color: var(--rule-firm); }

/* ----------------------------------------------------------------- callout */

.callout { background: var(--blush); padding: 5mm 6mm; page-break-inside: avoid; margin: 6mm 0; }
.callout p:last-child { margin-bottom: 0; }
.callout .lbl {
  font-family: var(--ui);
  font-weight: 500;
  font-size: 7pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--crimson);
  margin: 0 0 2mm;
}

.rule-note {
  font-family: var(--ui);
  font-weight: 300;
  font-size: 8.4pt;
  line-height: 1.5;
  color: var(--dim);
  border-left: 1.4pt solid var(--crimson);
  padding-left: 4mm;
  margin: 6mm 0;
}

.two { column-count: 2; column-gap: 9mm; }
.two .entry { break-inside: avoid; }

.authorities { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 9mm; font-family: var(--ui); font-weight: 300; font-size: 8.6pt; }
.authorities li { padding: 1.6mm 0; border-bottom: .4pt solid var(--rule); break-inside: avoid; }
.authorities .u { display: block; font-size: 7.2pt; color: var(--dim); word-break: break-all; }
`;

// ------------------------------------------------------------------ helpers

const CATS = {
  general: 'General', waste: 'Packaging & waste', animals: 'Animals',
  climate: 'Climate & energy', food: 'Food', beauty: 'Beauty & personal care',
  social: 'Labour & social', environment: 'Environment',
};

function coverPage({ title, sub, kind, price }) {
  return `<div class="cover">
  <p class="wordmark"><span class="c">FERAL</span> FEMME<span class="c">.</span></p>
  <h1>${typo(title)}</h1>
  <p class="sub">${typo(sub)}</p>
  <div class="foot"><span>${esc(kind)}</span><span>Edition 1 &middot; September 2026</span><span>${esc(price)}</span></div>
</div>`;
}

/** Labels and titles are collected here so the page finder can be handed them. */
const outline = [];

function section(num, title, inner, opts = {}) {
  const first = opts.first ? ' section--first' : '';
  if (!outline.some((o) => o[0] === num)) outline.push([num, title]);
  return `<div class="section${first}" data-sec="${esc(title)}">
  <div class="sec-head"><p class="sec-num">${esc(num)}</p><h2>${typo(title)}</h2></div>
  ${inner}
</div>`;
}

function termEntry(t, test) {
  // No category line: in the pack these are grouped under one already.
  return `<div class="entry">
  <h4>${typo(t.term)}</h4>
  <dl class="field"><dt>Implies</dt><dd>${typo(t.claim)}</dd></dl>
  <dl class="field"><dt>Actually means</dt><dd>${typo(t.actual)}</dd></dl>
  ${test ? `<dl class="field field--test"><dt>You must produce</dt><dd>${typo(test)}</dd></dl>` : ''}
  <dl class="field"><dt>Source</dt><dd class="src">${typo(t.src)}</dd></dl>
</div>`;
}

function termEntryConsumer(t) {
  return `<div class="entry">
  <h4>${typo(t.term)}</h4>
  <p class="meta">${esc(CATS[t.cat] ?? t.cat)}</p>
  <dl class="field"><dt>You'll think</dt><dd>${typo(t.claim)}</dd></dl>
  <dl class="field field--not"><dt>It means</dt><dd>${typo(t.actual)}</dd></dl>
  <dl class="field"><dt>Source</dt><dd class="src">${typo(t.src)}</dd></dl>
</div>`;
}

function schemeEntry(s) {
  return `<div class="entry">
  <h4>${typo(s.name)}</h4>
  <p class="meta">Run by ${esc(s.runby)}</p>
  <dl class="field"><dt>Verifies</dt><dd>${typo(s.verifies)}</dd></dl>
  <dl class="field field--not"><dt>Does not</dt><dd>${typo(s.notguarantee)}</dd></dl>
  <dl class="field"><dt>Source</dt><dd class="src">${typo(s.src)}</dd></dl>
</div>`;
}

function materialEntry(m, full) {
  return `<div class="entry">
  <h4>${typo(m.name)}</h4>
  <p class="meta">${m.cat === 'animal' ? 'Animal-derived' : m.cat === 'plant' ? 'Plant-derived' : 'Synthetic / processed'}</p>
  <dl class="field"><dt>What it is</dt><dd>${typo(m.what)}</dd></dl>
  <dl class="field"><dt>Welfare</dt><dd>${typo(m.welfare)}</dd></dl>
  ${full ? `<dl class="field"><dt>Environment</dt><dd>${typo(m.environment)}</dd></dl>` : ''}
  <dl class="field"><dt>Alternatives</dt><dd>${typo(m.alternatives)}</dd></dl>
  ${full ? `<dl class="field"><dt>Source</dt><dd class="src">${typo(m.src)}</dd></dl>` : ''}
</div>`;
}

const DISCLAIMER = `<div class="callout">
  <p class="lbl">What this is not</p>
  <p>This document is research, not legal advice. Every entry cites a public source you can open and read yourself, and the whole of it is drawn from the same reviewed datasets that power the free tools at feral-femme.co.</p>
  <p>It does not certify compliance, it does not approve a claim, and it is not a substitute for advice from a qualified attorney on your specific product and market. Where an entry says a claim requires substantiation, that is a statement about what the published guidance asks for &mdash; not a legal opinion on your liability.</p>
  <p>Regulation in this area is moving quickly. Check the edition date on the cover against the review dates published at feral-femme.co/sources/ before you rely on anything here.</p>
</div>`;

const LICENCE = `<h3>Licence</h3>
<p>One licence covers one organisation. Circulate it internally as widely as you like &mdash; to your team, your agency, your printer, anyone who writes or signs off a claim on your behalf. Do not republish it, resell it, or post it publicly.</p>
<p>The reference sections are generated from datasets that are reviewed on a fixed cycle. If a scheme changes its scope, the dataset changes and the next edition changes with it. Buying this edition does not include future editions, but it does include the free public tools, which are always current.</p>
<h3>Corrections</h3>
<p>If you find something wrong, we would rather hear it than not: info@feral-femme.co. Substantive corrections are published in full at feral-femme.co/corrections/, with what was said, what was wrong, and when it changed.</p>`;

// ------------------------------------------------------------------ product A

function packHtml(data, toc) {
  const { gw, certs, mats, copy, sources } = data;
  const byCat = (arr, key) => {
    const order = ['general', 'climate', 'waste', 'animals', 'social', 'food', 'beauty', 'environment'];
    return order.filter((c) => arr.some((x) => x[key] === c)).map((c) => [c, arr.filter((x) => x[key] === c)]);
  };

  const secs = [];

  secs.push(section('Section one', 'How to run a claims review', `
<p class="intro">Six steps. The whole method fits on two pages, and the reference sections that follow are what you need to complete step three and step four.</p>
<ol class="steps">${copy.procedure.map((s) => `<li><div><h4>${typo(s.title)}</h4><p>${typo(s.body)}</p></div></li>`).join('')}</ol>
<div class="rule-note"><strong>The single most common failure.</strong> A comparative claim with no stated comparator &mdash; &ldquo;greener&rdquo;, &ldquo;better for the planet&rdquo;, &ldquo;more sustainable&rdquo; &mdash; is the finding that comes up most often in regulatory casework, and it is also the easiest to fix. Either name the baseline or delete the comparison.</div>`, { first: true }));

  secs.push(section('Section two', 'The claim register', `
<p class="intro">Thirty-six terms, each with what a buyer infers from it, what it actually means, and the evidence you have to be able to produce if you use it. The last line is the one to read before signing anything off.</p>
${byCat(gw.terms, 'cat').map(([c, list]) => `<h3>${esc(CATS[c] ?? c)}</h3>${list.map((t) => termEntry(t, copy.tests[t.term])).join('')}`).join('')}`));

  secs.push(section('Section three', 'Certification scope reference', `
<p class="intro">Twenty-two schemes. For each: who runs it, what it verifies, and what it explicitly does not. The gap between the second and the third is where most claims break, because the logo implies the wider reading and the standard only supports the narrower one.</p>
${byCat(certs.schemes, 'cat').map(([c, list]) => `<h3>${esc(CATS[c] ?? c)}</h3>${list.map(schemeEntry).join('')}`).join('')}`));

  secs.push(section('Section four', 'Material claims reference', `
<p class="intro">Twenty-one materials, with the welfare and environmental position on each and the alternatives that exist. Use it when a claim rests on what something is made of rather than on how it was made.</p>
${mats.materials.map((m) => materialEntry(m, true)).join('')}`));

  secs.push(section('Section five', 'Eight claims, rewritten', `
<p class="intro">Each of these is a real pattern, not an invented one. The rewrite is longer than the original in every case. That is the trade: a sentence you can defend costs you more words than a word you cannot.</p>
${copy.rewrites.map((r) => `<div class="rw">
  <div class="was"><p class="lbl">Was</p><p class="txt">${typo(r.was)}</p><p class="why">${typo(r.why)}</p></div>
  <div class="now"><p class="lbl">Defensible</p><p class="txt">${typo(r.now)}</p></div>
</div>`).join('')}
<div class="rule-note"><strong>Notice what the last one does.</strong> It volunteers a limitation &mdash; the standard does not cover slaughter &mdash; that the brand was under no obligation to mention. That sentence is worth more than the certification logo, because it is the sentence a sceptical reader did not expect and cannot argue with.</div>`));

  secs.push(section('Section six', 'Pre-launch sign-off', `
<p class="intro">Print this, fill it in, keep it. A dated claims file is what turns a regulatory challenge from a crisis into a conversation, and it is the cheapest insurance in this document.</p>
<div class="signoff">
<table>
<thead><tr><th style="width:32%">Claim, as written</th><th style="width:19%">Type</th><th style="width:29%">Evidence held</th><th style="width:20%">Verdict &amp; date</th></tr></thead>
<tbody>${Array.from({ length: 9 }, () => `<tr><td></td><td class="blank">Abs / Comp / Fact</td><td></td><td></td></tr>`).join('')}</tbody>
</table>
</div>
<h3>Before you sign</h3>
<p>Have you listed the claims in the imagery as well as the copy? A leaf, a forest photograph, an earth-toned palette and the word &ldquo;pure&rdquo; are environmental claims in regulatory terms whether or not you intended them.</p>
<p>Have you checked every certification against its published scope, rather than against what you remember it covering?</p>
<p>Is there a named person against each verdict? An unattributed sign-off is the same as none.</p>`));

  secs.push(section('Section seven', 'Where to check for yourself', `
<p class="intro">Every entry in this pack traces back to one of these. None of them is behind a paywall. If you disagree with something here, this is where to go and settle it.</p>
<ul class="authorities">${sources.authorities.map((a) => `<li>${typo(a.name)}<span class="u">${esc(a.url)}</span></li>`).join('')}</ul>
${DISCLAIMER}
${LICENCE}`));

  return document({
    title: 'The Claims Compliance Pack',
    cover: coverPage({
      title: 'The Claims Compliance Pack',
      sub: 'Everything you need to check an environmental, welfare or sourcing claim before it ships — and the evidence you must be able to produce if you use it.',
      kind: 'Reference · for brands and agencies',
      price: 'Single-organisation licence',
    }),
    toc,
    tocIntro: 'Sections one and six are the method. Two, three, four and seven are reference — go to them when you need them, rather than reading them through.',
    secs,
  });
}

// ------------------------------------------------------------------ product B

function guideHtml(data, toc) {
  const { gw, certs, mats, copy } = data;
  const secs = [];

  secs.push(section('One', 'Six things to check', `
<p class="intro">You do not need to memorise anything. You need six habits, and they take about a minute each once they are habits.</p>
<ol class="steps">${copy.consumerSteps.map((s) => `<li><div><h4>${typo(s.t)}</h4><p>${typo(s.b)}</p></div></li>`).join('')}</ol>`, { first: true }));

  secs.push(section('Two', 'Thirty-six words, decoded', `
<p class="intro">These are the terms that do the most work on packaging and mean the least. For each one: what you are meant to think, and what it actually tells you.</p>
${gw.terms.map(termEntryConsumer).join('')}`));

  secs.push(section('Three', 'Which logos mean something', `
<p class="intro">Twenty-two certifications, with what each one actually verifies and &mdash; the useful part &mdash; what it does not. Almost every one is narrower than it looks.</p>
${certs.schemes.map(schemeEntry).join('')}`));

  secs.push(section('Four', 'What things are made of', `
<p class="intro">Twenty-one materials, the welfare question attached to each, and what exists instead.</p>
${mats.materials.map((m) => materialEntry(m, false)).join('')}`));

  secs.push(section('Five', 'The honest limits of this', `
<p class="intro">A guide that told you it could settle every question would be doing the thing it warns you about.</p>
<p>This will not tell you whether a specific product is ethical. Nothing can, in a document. Verifying a single brand means checking its published policy, the scope of its certifications, its market presence and its ownership &mdash; and any answer goes out of date the moment a formulation or a supplier changes.</p>
<p>What it does is give you the method we would use ourselves, and the reference material to apply it. It takes a couple of minutes per product and produces an answer you can explain, which is worth more than one you have to trust.</p>
<p>The same material is free, searchable and always current at <strong>feral-femme.co/tools/</strong>. This is the version you can read on a train and take into a shop.</p>
${DISCLAIMER}
<h3>Corrections</h3>
<p>If something here is wrong, tell us: info@feral-femme.co. Substantive corrections are published in full at feral-femme.co/corrections/, with what was said, what was wrong, and when it changed. We would rather be corrected than quoted incorrectly.</p>`));

  return document({
    title: 'The Greenwashing Field Guide',
    cover: coverPage({
      title: 'The Greenwashing Field Guide',
      sub: 'Thirty-six words that sound like a promise, twenty-two logos that are narrower than they look, and twenty-one materials — with what each one actually tells you.',
      kind: 'Field guide · for anyone who buys things',
      price: 'Personal use',
    }),
    toc,
    tocIntro: 'Read section one. Use the rest as a reference — look a word up when you meet it.',
    secs,
  });
}

// ------------------------------------------------------------------ document

let FONT_CSS = '';

function document({ title, cover, toc, tocIntro, secs }) {
  const contents = toc
    ? `<div class="section section--first">
  <div class="sec-head"><p class="sec-num">Contents</p><h2>${typo(title)}</h2></div>
  <p class="intro">${typo(tocIntro)}</p>
  <ul class="toc">${toc.map((t) => `<li><span class="n">${esc(t.n)}</span><span class="t">${typo(t.t)}</span><span class="p">${t.p ?? ''}</span></li>`).join('')}</ul>
</div>`
    : '';

  return {
    cover: coverDoc(title, cover),
    body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${FONT_CSS}</style><style>${CSS}</style></head>
<body>${contents}${secs.join('')}</body></html>`,
  };
}

/** The cover, as its own borderless document. */
function coverDoc(title, cover) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${FONT_CSS}</style><style>${CSS}
/* The stylesheet's own @page margin wins over the one passed to page.pdf(),
   so it has to be cleared here or the cover paginates onto a second page. */
@page { size: A4; margin: 0; }
.cover { page-break-after: avoid; height: 297mm; }
</style></head>
<body>${cover}</body></html>`;
}

// ---------------------------------------------------------------------- main

async function main() {
  FONT_CSS = await fontCss();
  await mkdir(OUT, { recursive: true });

  const j = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
  const data = {
    gw: await j('content/data/greenwashing.json'),
    certs: await j('content/data/certifications.json'),
    mats: await j('content/data/materials.json'),
    sources: await j('content/data/sources.json'),
    copy: await j('products/copy.json'),
  };

  // Chromium is not bundled with playwright-core. PLAYWRIGHT_BROWSERS_PATH is
  // the variable Playwright itself uses, so an environment that already has a
  // browser needs no extra configuration here.
  const bin =
    process.env.FF_CHROMIUM ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
      : undefined);
  const browser = await chromium.launch(bin ? { executablePath: bin } : {});

  for (const [file, make, label] of [
    ['claims-compliance-pack', packHtml, 'The Claims Compliance Pack'],
    ['greenwashing-field-guide', guideHtml, 'The Greenwashing Field Guide'],
  ]) {
    const render = async (html, name, folios) => {
      const src = join(OUT, `${name}.html`);
      await writeFile(src, html);
      const page = await browser.newPage();
      await page.goto('file://' + src, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const pdf = join(OUT, `${name}.pdf`);
      await page.pdf({
        path: pdf,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: folios,
        headerTemplate: '<div></div>',
        footerTemplate: folios
          ? `<div style="width:100%;padding:0 16mm;font:300 7pt Helvetica,Arial,sans-serif;` +
            `color:#8d7f81;display:flex;justify-content:space-between;letter-spacing:.09em;` +
            `text-transform:uppercase"><span>Feral Femme &middot; ${label}</span>` +
            `<span class="pageNumber"></span></div>`
          : '<div></div>',
        margin: folios
          ? { top: '19mm', bottom: '20mm', left: '16mm', right: '16mm' }
          : { top: '0', bottom: '0', left: '0', right: '0' },
      });
      await page.close();
      return pdf;
    };

    // A first throwaway call collects the section list. The measuring pass then
    // renders *with* a contents page, numbers left blank, so it paginates
    // identically to the final one; the last pass fills them in.
    outline.length = 0;
    make(data, null);
    const blank = outline.map(([n, tt]) => ({ n, t: tt, p: '' }));
    const folios = [];

    let body;
    for (const pass of [1, 2]) {
      const docs = make(data, pass === 2 ? folios : blank);
      body = await render(docs.body, `${file}.body`, true);
      if (pass === 1) {
        const { execFileSync } = await import('node:child_process');
        const found = JSON.parse(
          execFileSync('python3', [join(ROOT, 'products', 'pages.py'), body, JSON.stringify(outline)], {
            encoding: 'utf8',
          })
        );
        const missing = found.filter((x) => !x.p).map((x) => x.n);
        if (missing.length) throw new Error(`no page found for: ${missing.join(', ')}`);
        folios.push(...found);
      }
    }

    // The cover carries no folio, which is the ordinary convention and is why
    // the numbers in the contents match the footers rather than the PDF's own
    // page indices.
    const coverPdf = await render(make(data, null).cover, `${file}.cover`, false);

    const { execFileSync } = await import('node:child_process');
    execFileSync('python3', [
      join(ROOT, 'products', 'merge.py'),
      join(OUT, `${file}.pdf`),
      coverPdf,
      body,
      label,
    ]);

    const { statSync, rmSync } = await import('node:fs');
    for (const junk of process.env.FF_KEEP ? [] : [`${file}.body.html`, `${file}.body.pdf`, `${file}.cover.html`, `${file}.cover.pdf`]) {
      rmSync(join(OUT, junk), { force: true });
    }
    console.log(`  ${label}`);
    console.log(`    ${file}.pdf  ${(statSync(join(OUT, `${file}.pdf`)).size / 1024).toFixed(0)} KB`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
