/**
 * The pieces a product is assembled from.
 *
 * Everything here returns an HTML string and knows nothing about which product
 * it is in. The catalogue decides what goes where; this file decides what a
 * worksheet, a template or a reference entry looks like, once, so that the
 * eighth product is set the same way as the first.
 */
import { NOTICE, LICENCE } from './written.mjs';

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Curly quotes and dashes. Straight quotes in a printed document look unfinished. */
export const typo = (s) =>
  esc(s)
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/"([^"]*)"/g, '“$1”')
    .replace(/ - /g, ' — ');

export const CATS = {
  general: 'General', waste: 'Packaging & waste', animals: 'Animals',
  climate: 'Climate & energy', food: 'Food', beauty: 'Beauty & personal care',
  social: 'Labour & social', environment: 'Environment',
};
const CAT_ORDER = ['general', 'climate', 'waste', 'animals', 'social', 'food', 'beauty', 'environment'];

/** [[category, items], …] in a fixed order, skipping the empty ones. */
export const byCat = (arr) =>
  CAT_ORDER.filter((c) => arr.some((x) => x.cat === c)).map((c) => [c, arr.filter((x) => x.cat === c)]);

export const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

// ------------------------------------------------------------------ structure

/** A section. `label` is the small line above the heading and in the contents. */
export const sec = (label, title, html, cls = '') => ({ label, title, html, cls });

export const sectionHtml = (s) => `<div class="section${s.cls ? ` ${s.cls}` : ''}">
  <div class="sec-head"><p class="sec-num">${esc(s.label)}</p><h2>${typo(s.title)}</h2></div>
  ${s.html}
</div>`;

export const intro = (t) => `<p class="intro">${typo(t)}</p>`;
export const h3 = (t) => `<h3>${typo(t)}</h3>`;
export const p = (t) => `<p>${typo(t)}</p>`;
export const paras = (list) => list.map(p).join('');

/** Numbered steps, from either {t, b} or {title, body}. */
export const steps = (list) =>
  `<ol class="steps">${list
    .map((s) => `<li><div><h4>${typo(s.t ?? s.title)}</h4><p>${typo(s.b ?? s.body)}</p></div></li>`)
    .join('')}</ol>`;

export const checks = (list) => `<ul class="checks">${list.map((c) => `<li>${typo(c)}</li>`).join('')}</ul>`;

/** Kept on one page: a heading is not left behind by the table it introduces. */
export const keep = (html) => `<div class="keep">${html}</div>`;

export const callout = (label, list) =>
  `<div class="callout"><p class="lbl">${esc(label)}</p>${list.map(p).join('')}</div>`;

export const ruleNote = (strong, text) =>
  `<div class="rule-note"><strong>${typo(strong)}</strong> ${typo(text)}</div>`;

/** Rows of [key, description, tag?]. */
export const key = (rows, kCls = '') =>
  `<table class="key">${rows
    .map(
      (r) =>
        `<tr><td class="k ${kCls}">${typo(r[0])}</td><td class="d">${typo(r[1])}</td>${
          r[2] !== undefined ? `<td class="t">${typo(r[2])}</td>` : ''
        }</tr>`
    )
    .join('')}</table>`;

// ----------------------------------------------------------------- worksheets

/**
 * A ruled sheet to be written on.
 *
 * `cols` is [{ h, w, hint }]. `rows` is either a count of blank rows or an
 * array of rows, each an array of cells — a string is printed, null is left
 * blank to be filled in.
 */
const FILL = { '': 22, tall: 17, short: 27 };

export function ws({ title, right = 'Print as many as you need', cols, rows, size = '', page = false, legend = '', before = '' }) {
  // A sheet given a page to itself is ruled to the foot of it.
  const count = rows ?? (page ? FILL[size] : 8);
  const body = (Array.isArray(count) ? count : Array.from({ length: count }, () => cols.map(() => null)))
    .map(
      (r) =>
        `<tr>${cols
          .map((c, i) => {
            const v = r[i];
            if (v !== null && v !== undefined) return `<td class="set">${typo(v)}</td>`;
            return c.hint ? `<td class="hint">${typo(c.hint)}</td>` : '<td></td>';
          })
          .join('')}</tr>`
    )
    .join('');
  const sheet = `<div class="ws${size ? ` ws--${size}` : ''}">
  <div class="ws__head"><span>${typo(title)}</span><span class="r">${typo(right)}</span></div>
  <table>
    <colgroup>${cols.map((c) => `<col style="width:${c.w}">`).join('')}</colgroup>
    <thead><tr>${cols.map((c) => `<th>${typo(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${legend ? `<p class="ws__legend">${typo(legend)}</p>` : ''}
</div>`;
  return page ? `<div class="ws-page">${before}${sheet}</div>` : sheet;
}

/** A box of labelled lines to write on. */
export const fill = (label, lines) =>
  `<div class="fill"><p class="lbl">${typo(label)}</p>${lines.map((l) => `<p>${typo(l)}</p>`).join('')}</div>`;

export const pair = (a, b) =>
  `<div class="pair"><div><p class="lbl">${typo(a)}</p></div><div><p class="lbl">${typo(b)}</p></div></div>`;

/** A template message. Set in the monospace so nobody mistakes it for the sent thing. */
export const letter = (l, label = 'Template', right = 'Adapt before sending') =>
  `<div class="letter">
  <div class="letter__head"><span>${typo(label)}</span><span>${typo(right)}</span></div>
  <div class="letter__body"><p class="letter__subject">Subject: ${typo(l.subject)}</p>${l.body.map(p).join('')}</div>
</div>`;

export const said = (rows) =>
  `<table class="said"><thead><tr><th>Stronger than the evidence</th><th>What the evidence supports</th></tr></thead><tbody>${rows
    .map((r) => `<tr><td class="x">${typo(r[0])}</td><td class="y">${typo(r[1])}</td></tr>`)
    .join('')}</tbody></table>`;

export const rewrites = (list) =>
  list
    .map(
      (r) => `<div class="rw">
  <div class="was"><p class="lbl">Was</p><p class="txt">${typo(r.was)}</p><p class="why">${typo(r.why)}</p></div>
  <div class="now"><p class="lbl">Rewritten</p><p class="txt">${typo(r.now)}</p></div>
</div>`
    )
    .join('');

// -------------------------------------------------------------------- entries

const field = (dt, dd, cls = '') =>
  `<dl class="field${cls ? ` field--${cls}` : ''}"><dt>${esc(dt)}</dt><dd>${dd}</dd></dl>`;

/** A flagged term, for someone making the claim. */
export const termBrand = (t, test) => `<div class="entry">
  <h4>${typo(t.term)}</h4>
  ${field('Implies', typo(t.claim))}
  ${field('Actually means', typo(t.actual))}
  ${test ? field('Have ready', typo(test), 'test') : ''}
  ${field('Source', `<span class="src">${typo(t.src)}</span>`)}
</div>`;

/** The same term, for someone reading it on a pack. */
export const termReader = (t) => `<div class="entry">
  <h4>${typo(t.term)}</h4>
  ${field('You’ll think', typo(t.claim))}
  ${field('It means', typo(t.actual), 'not')}
  ${field('Source', `<span class="src">${typo(t.src)}</span>`)}
</div>`;

export const scheme = (s) => `<div class="entry">
  <h4>${typo(s.name)}</h4>
  <p class="meta">Run by ${typo(s.runby)}</p>
  ${field('Verifies', typo(s.verifies))}
  ${field('Does not', typo(s.notguarantee), 'not')}
  ${field('Source', `<span class="src">${typo(s.src)}</span>`)}
</div>`;

const MAT = { animal: 'Animal-derived', plant: 'Plant-derived', synthetic: 'Synthetic / processed' };

export const material = (m, full = true) => `<div class="entry">
  <h4>${typo(m.name)}</h4>
  <p class="meta">${MAT[m.cat] ?? esc(m.cat)}</p>
  ${field('What it is', typo(m.what))}
  ${field('Welfare', typo(m.welfare))}
  ${full ? field('Environment', typo(m.environment)) : ''}
  ${field('Instead', typo(m.alternatives))}
  ${field('Source', `<span class="src">${typo(m.src)}</span>`)}
</div>`;

const ORIGIN = { Animal: 'Animal-derived', Varies: 'Ask first — origin varies', Synthetic: 'Synthetic', Mineral: 'Mineral', Plant: 'Plant-derived' };

export const ingredient = (i) => `<div class="entry">
  <h4>${typo(i.name)}</h4>
  <p class="meta meta--plain">${i.aliases?.length ? `On a label: ${typo(i.aliases.join(' · '))}` : 'Usually listed under this name'}</p>
  ${field('What it is', typo(i.what))}
  ${i.note ? field(i.cat === 'Varies' ? 'Ask' : 'Note', typo(i.note), i.cat === 'Animal' ? 'not' : '') : ''}
</div>`;

// --------------------------------------------------------------- compact refs

export const cmpTerms = (terms) =>
  `<table class="cmp">${terms
    .map((t) => `<tr><td class="k">${typo(t.term)}</td><td>${typo(t.actual)}</td></tr>`)
    .join('')}</table>`;

export const cmpMaterials = (mats) =>
  `<table class="cmp">${mats
    .map(
      (m) =>
        `<tr><td class="k">${typo(m.name)}</td><td class="o${m.cat === 'animal' ? ' o--a' : ''}">${
          m.cat === 'animal' ? 'Animal' : m.cat === 'plant' ? 'Plant' : 'Synthetic'
        }</td><td>${typo(m.welfare)}</td></tr>`
    )
    .join('')}</table>`;

export const cmpIngredients = (list) =>
  `<table class="cmp">${list
    .map(
      (i) =>
        `<tr><td class="k">${typo(i.name)}</td><td class="o${i.cat === 'Animal' ? ' o--a' : ''}">${esc(
          i.cat === 'Varies' ? 'Ask first' : i.cat
        )}</td><td>${typo(i.what)}${
          i.aliases?.length ? ` <span class="a">Also: ${typo(i.aliases.join(', '))}.</span>` : ''
        }</td></tr>`
    )
    .join('')}</table>`;

export const authorities = (list) =>
  `<ul class="authorities">${list
    .map((a) => `<li>${typo(a.name)}<span class="u">${esc(a.url.replace(/^https?:\/\//, ''))}</span></li>`)
    .join('')}</ul>`;

export const regulators = (list) =>
  `<ul class="authorities">${list
    .map(
      (b) =>
        `<li><span class="c">${esc(b.country)}</span>${typo(b.name)} — ${typo(b.role)}<span class="u">${esc(
          b.url.replace(/^https?:\/\//, '')
        )}</span></li>`
    )
    .join('')}</ul>`;

// ---------------------------------------------------------------- pocket card

export const pocket = ({ tag, title, blocks }) => `<div class="cut">
  <div class="cut__head"><span class="w"><span class="c">Feral</span> Femme<span class="c">.</span></span><span class="t">${esc(tag)}</span></div>
  <h4>${typo(title)}</h4>
  ${blocks.map(([b, t]) => `<p><b>${typo(b)}</b> ${typo(t)}</p>`).join('')}
  <p class="foot">A prompt for reading a label · not advice · feral-femme.co/tools</p>
</div>`;

// ------------------------------------------------------------- notice, licence

/**
 * The notice. `kind` adds the paragraph that applies to what the product holds:
 * templates and worksheets, or ingredient names.
 */
export function noticeBox({ templates = false, ingredients = false } = {}) {
  const extra = [];
  if (templates) extra.push(NOTICE.templates);
  if (ingredients) extra.push(NOTICE.ingredients);
  const [first, ...rest] = NOTICE.base;
  return `<div class="notice">
  <p class="lead">This is not legal advice, and it does not certify anything.</p>
  ${[first, ...extra, ...rest].map(p).join('')}
</div>`;
}

export const colophon = (licence, edition) => `<div class="colophon">
  <h3>Licence</h3>
  ${LICENCE[licence].map(p).join('')}
  <h3>Corrections</h3>
  ${p(LICENCE.corrections)}
  <h3>Edition</h3>
  ${p(`${edition}. Published by FERAL FEMME, an independent publication. The reference entries are generated from the datasets behind the free tools at feral-femme.co/tools/, as they stood on the edition date.`)}
</div>`;
