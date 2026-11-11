/**
 * The print stylesheet for the products.
 *
 * The colours are the site's own tokens, not near-misses of them: the first
 * two products were drawn with a brighter red and a paler pink than the site
 * uses, which is the kind of difference nobody can name and everybody sees
 * when a PDF is opened beside the page that sold it.
 */
export const CSS = `
:root {
  --ink: #12100f;
  --crimson: #8e0b14;
  --crimson-deep: #6e1220;
  --paper: #ffffff;
  --blush: #f6dfe2;
  --pale: #fbf1f3;
  --rule: #e6d3d7;
  --rule-firm: #c9aeb3;
  --dim: #5a4d4f;
  --display: 'Bodoni Moda', Georgia, serif;
  --read: 'Cormorant Garamond', Georgia, serif;
  --ui: 'Jost', 'Helvetica Neue', Arial, sans-serif;
  --mono: 'Space Mono', 'Courier New', monospace;
}

@page { size: A4; margin: 19mm 16mm 20mm; }

* { box-sizing: border-box; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  margin: 0;
  font-family: var(--read);
  font-weight: 400;
  font-size: 10.8pt;
  line-height: 1.5;
  color: var(--ink);
  background: var(--paper);
}

/* ------------------------------------------------------------------ cover
 *
 * Printed on its own, with no margins and no running footer, so the colour
 * reaches the paper edge. Chromium reserves the footer strip on every page of
 * a render, which is why the cover cannot be part of the body run.
 *
 * Paid volumes are crimson with the type reversed out; free ones are blush
 * with the type in ink. The two shelves should be tellable apart from across
 * a room, and by the same two colours the site is made of.
 */
.cover {
  position: relative;
  height: 297mm;
  overflow: hidden;
  padding: 22mm 22mm 20mm;
  display: flex;
  flex-direction: column;
}

.cover--paid { background: var(--crimson); color: #fdfcfc; }
.cover--free { background: var(--blush); color: var(--ink); }

.cover__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8mm;
}

.wordmark {
  font-family: var(--display);
  font-weight: 500;
  font-size: 13pt;
  letter-spacing: .30em;
  text-transform: uppercase;
  margin: 0;
}
.cover--free .wordmark .c { color: var(--crimson); }
.cover--paid .wordmark .c { color: var(--blush); }

.cover__tier {
  font-family: var(--mono);
  font-size: 7pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  margin: 0;
  opacity: .86;
}

/* The numeral sits behind the title, cropped by the page edge: it gives the
   cover depth without a photograph, and numbers the shelf. */
.cover__num {
  position: absolute;
  right: -9mm;
  bottom: 30mm;
  font-family: var(--display);
  font-weight: 600;
  font-size: 250pt;
  line-height: .8;
  letter-spacing: -.04em;
  margin: 0;
}
.cover--paid .cover__num { color: var(--crimson-deep); }
.cover--free .cover__num { color: #efd0d5; }

/* High on the page: the shop shows the top 130mm of a cover, and the title
   and its subtitle both have to be inside that. */
.cover__body { position: relative; margin-top: 22mm; }

.cover h1 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 53pt;
  line-height: .95;
  letter-spacing: -.02em;
  max-width: 152mm;
  margin: 0 0 8mm;
}

.cover .sub {
  font-family: var(--read);
  font-size: 14.5pt;
  line-height: 1.36;
  max-width: 118mm;
  margin: 0;
}
.cover--paid .sub { color: var(--blush); }
.cover--free .sub { color: var(--dim); }

.cover__stamp {
  position: relative;
  align-self: flex-start;
  margin-top: auto;
  margin-bottom: 9mm;
  border: 1.1pt solid currentColor;
  padding: 2.2mm 3.6mm 2mm;
  font-family: var(--mono);
  font-weight: 700;
  font-size: 6.8pt;
  letter-spacing: .15em;
  text-transform: uppercase;
  transform: rotate(-2deg);
}
.cover--free .cover__stamp { color: var(--crimson); }

.cover .foot {
  position: relative;
  border-top: 1.2pt solid currentColor;
  padding-top: 5mm;
  font-family: var(--mono);
  font-size: 6.9pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  gap: 6mm;
  white-space: nowrap;
}
.cover--free .foot { border-top-color: var(--crimson); color: var(--dim); }

/* --------------------------------------------------------------- sections */

.section { page-break-before: always; }
.section:first-of-type { page-break-before: avoid; }

.sec-head { border-bottom: 1.2pt solid var(--ink); padding-bottom: 3mm; margin-bottom: 7mm; }

.sec-num {
  font-family: var(--mono);
  font-size: 7pt;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--crimson);
  margin: 0 0 2mm;
}

h2 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 22pt;
  line-height: 1.06;
  margin: 0;
  letter-spacing: -.01em;
}

.intro {
  font-size: 12pt;
  line-height: 1.48;
  color: var(--dim);
  max-width: 138mm;
  margin: 0 0 8mm;
}

h3 {
  font-family: var(--mono);
  font-weight: 700;
  font-size: 7.6pt;
  letter-spacing: .15em;
  text-transform: uppercase;
  margin: 8mm 0 3mm;
  color: var(--crimson);
  page-break-after: avoid;
}

p { margin: 0 0 3mm; }
p:last-child { margin-bottom: 0; }
strong { font-weight: 600; }

/* --------------------------------------------------------------- contents */

.toc { list-style: none; margin: 0; padding: 0; }
.toc li {
  display: flex;
  align-items: baseline;
  gap: 3mm;
  padding: 2.5mm 0;
  border-bottom: .5pt solid var(--rule);
  font-family: var(--ui);
  font-weight: 300;
  font-size: 10pt;
}
.toc .n { font-family: var(--mono); font-size: 6.8pt; letter-spacing: .12em; text-transform: uppercase; color: var(--crimson); min-width: 27mm; }
.toc .t { flex: 1; }
.toc .p { font-variant-numeric: tabular-nums; color: var(--dim); font-size: 9pt; }

/* ----------------------------------------------------------------- notice
 *
 * The notice has a page to itself directly after the contents. A disclaimer
 * in the last paragraph of the last section protects nobody, because nobody
 * who needed to read it got that far.
 */
.notice { border: 1.2pt solid var(--crimson); padding: 8mm 9mm; }
.notice p { font-family: var(--ui); font-weight: 300; font-size: 9.6pt; line-height: 1.55; margin: 0 0 3.4mm; }
.notice p:last-child { margin-bottom: 0; }
.notice .lead { font-family: var(--read); font-weight: 600; font-size: 13.5pt; line-height: 1.3; margin-bottom: 5mm; }

/* ---------------------------------------------------------------- entries */

.entry {
  page-break-inside: avoid;
  border-top: .5pt solid var(--rule);
  padding: 2.7mm 0;
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
  font-size: 7.6pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 0 0 2.4mm;
}
.entry .meta--plain { text-transform: none; letter-spacing: .02em; font-size: 8.4pt; }

.field { display: grid; grid-template-columns: 26mm 1fr; gap: 1mm 4mm; margin: 0 0 1.2mm; }
.field:last-child { margin-bottom: 0; }

.field dt {
  font-family: var(--ui);
  font-weight: 500;
  font-size: 7.2pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dim);
  padding-top: .9mm;
}
.field dd { margin: 0; font-size: 10.3pt; line-height: 1.42; }

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
  padding: 3.5mm 0;
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
  font-family: var(--mono);
  font-size: 6.4pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 0 0 1.2mm;
}
.rw .txt { font-family: var(--display); font-weight: 600; font-size: 11.6pt; line-height: 1.2; margin: 0; }
.rw .why { font-family: var(--ui); font-weight: 300; font-size: 8pt; color: var(--crimson); margin: 1.6mm 0 0; }
.rw .now .txt { font-weight: 500; font-family: var(--read); font-size: 11pt; line-height: 1.35; }

/* ------------------------------------------------------------- worksheets
 *
 * A worksheet is ruled for a pen. Rows are a centimetre tall because that is
 * what handwriting needs, and the head of each one says what it is for and
 * how many times it may be printed — which is as many as are wanted.
 */
.ws { page-break-inside: avoid; margin: 5mm 0 7mm; }
.ws__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6mm;
  background: var(--ink);
  color: #fdfcfc;
  padding: 2.4mm 3.5mm 2.2mm;
  font-family: var(--mono);
  font-size: 6.8pt;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.ws__head .r { opacity: .7; }
.ws table { width: 100%; border-collapse: collapse; table-layout: fixed; border: .8pt solid var(--ink); border-top: 0; }
.ws th {
  text-align: left;
  font-family: var(--ui);
  font-weight: 500;
  font-size: 6.9pt;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dim);
  padding: 2.2mm 2.2mm 2mm;
  border-bottom: .8pt solid var(--ink);
  border-right: .4pt solid var(--rule-firm);
  vertical-align: bottom;
  background: var(--pale);
}
.ws td {
  height: 10mm;
  padding: 1.6mm 2.2mm;
  border-bottom: .4pt solid var(--rule-firm);
  border-right: .4pt solid var(--rule-firm);
  vertical-align: top;
  font-family: var(--ui);
  font-weight: 300;
  font-size: 8.6pt;
  line-height: 1.35;
}
.ws th:last-child, .ws td:last-child { border-right: 0; }
.ws tr:last-child td { border-bottom: 0; }
.ws td.hint { color: var(--rule-firm); font-size: 7.4pt; letter-spacing: .04em; }
.ws td.num { font-family: var(--mono); font-size: 7pt; color: var(--dim); }
.ws--tall td { height: 13mm; }
.ws--short td { height: 8mm; }

/* A filled column in a worksheet: printed text, not a blank to write in. */
.ws td.set { color: var(--ink); font-size: 8.8pt; }

/* ---------------------------------------------------------------- key rows */

.key { width: 100%; border-collapse: collapse; margin: 3mm 0 6mm; page-break-inside: avoid; }
.key td { padding: 2.2mm 3mm 2.2mm 0; border-top: .5pt solid var(--rule); vertical-align: top; }
.key tr:first-child td { border-top: 1pt solid var(--rule-firm); }
.key td.k {
  width: 40mm;
  font-family: var(--display);
  font-weight: 600;
  font-size: 11pt;
  line-height: 1.2;
}
.key td.k--narrow { width: 12mm; color: var(--crimson); font-size: 14pt; }
.key td.k--mid { width: 46mm; }
.key td.d { font-size: 10.4pt; }
.key td.t { font-family: var(--mono); font-size: 6.8pt; letter-spacing: .1em; text-transform: uppercase; color: var(--crimson); width: 24mm; padding-top: 3mm; text-align: right; padding-right: 0; }

/* -------------------------------------------------------------- checklists */

.checks { list-style: none; margin: 3mm 0 6mm; padding: 0; }
.checks li {
  position: relative;
  padding: 2.3mm 0 2.3mm 9mm;
  border-top: .5pt solid var(--rule);
  page-break-inside: avoid;
}
.checks li:first-child { border-top: 1pt solid var(--rule-firm); }
.checks li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2.9mm;
  width: 3.6mm;
  height: 3.6mm;
  border: .9pt solid var(--ink);
}

.week { page-break-inside: avoid; margin-bottom: 5mm; }
.week h4 { font-family: var(--display); font-weight: 600; font-size: 13pt; margin: 0 0 1mm; }

/* ----------------------------------------------------------------- letters
 *
 * Templates are set in the monospace so that nobody mistakes the template
 * for the document, and so the square-bracketed parts read as blanks.
 */
.letter { border: .8pt solid var(--ink); margin: 4mm 0 7mm; page-break-inside: avoid; }
.letter__head {
  background: var(--blush);
  border-bottom: .8pt solid var(--ink);
  padding: 2.4mm 4mm 2.2mm;
  font-family: var(--mono);
  font-size: 6.8pt;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--crimson);
  display: flex;
  justify-content: space-between;
  gap: 6mm;
}
.letter__body { padding: 4.5mm 5mm 5mm; }
.letter__subject { font-family: var(--mono); font-weight: 700; font-size: 8.2pt; margin: 0 0 3.4mm; }
.letter__body p { font-family: var(--mono); font-size: 8.2pt; line-height: 1.6; margin: 0 0 2.6mm; }
.letter__body p:last-child { margin-bottom: 0; }

/* ---------------------------------------------------------------- fill-ins */

.fill { border: .8pt solid var(--ink); padding: 5mm 6mm; margin: 4mm 0 7mm; page-break-inside: avoid; }
.fill p { font-size: 11.4pt; margin: 0; padding: 0 0 9mm; border-bottom: .5pt solid var(--rule-firm); margin-bottom: 3.5mm; }
.fill p:last-child { margin-bottom: 0; }
.fill .lbl { font-family: var(--mono); font-size: 6.8pt; letter-spacing: .14em; text-transform: uppercase; color: var(--crimson); border: 0; padding: 0; margin: 0 0 4mm; }

.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin: 4mm 0 7mm; page-break-inside: avoid; }
.pair > div { border: .8pt solid var(--ink); padding: 4mm 5mm; min-height: 46mm; }
.pair .lbl { font-family: var(--mono); font-size: 6.8pt; letter-spacing: .14em; text-transform: uppercase; color: var(--crimson); margin: 0; }

/* ------------------------------------------------------------ compact refs */

.cmp { width: 100%; border-collapse: collapse; margin: 2mm 0 6mm; }
.cmp td { padding: 1.6mm 3mm 1.6mm 0; border-top: .5pt solid var(--rule); vertical-align: top; font-size: 9.6pt; line-height: 1.38; }
.cmp tr { page-break-inside: avoid; }
.cmp tr:first-child td { border-top: 1pt solid var(--rule-firm); }
.cmp td.k { width: 42mm; font-family: var(--display); font-weight: 600; font-size: 10.4pt; line-height: 1.2; }
.cmp td.o { width: 22mm; font-family: var(--mono); font-size: 6.6pt; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); padding-top: 2.6mm; }
.cmp td.o--a { color: var(--crimson); }
.cmp td.a { font-family: var(--ui); font-weight: 300; font-size: 8.6pt; color: var(--dim); }

/* ------------------------------------------------------------ pocket cards */

.cut {
  border: 1pt dashed var(--ink);
  padding: 6mm 7mm;
  margin: 4mm 0 6mm;
  page-break-inside: avoid;
}
.cut__head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1pt solid var(--crimson); padding-bottom: 2mm; margin-bottom: 3mm; }
.cut__head .w { font-family: var(--display); font-weight: 500; font-size: 8pt; letter-spacing: .26em; text-transform: uppercase; }
.cut__head .w .c { color: var(--crimson); }
.cut__head .t { font-family: var(--mono); font-size: 6.6pt; letter-spacing: .14em; text-transform: uppercase; color: var(--crimson); }
.cut h4 { font-family: var(--display); font-weight: 600; font-size: 13pt; margin: 0 0 2.5mm; }
.cut p { font-family: var(--ui); font-weight: 300; font-size: 8.4pt; line-height: 1.5; margin: 0 0 2mm; }
.cut p b { font-weight: 500; }
.cut .foot { font-family: var(--mono); font-size: 6pt; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); margin-top: 3mm; }
.cut-note { font-family: var(--mono); font-size: 6.6pt; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); margin: 0; }

/* ----------------------------------------------------------------- callout */

.callout { background: var(--blush); padding: 5mm 6mm; page-break-inside: avoid; margin: 6mm 0; }
.callout p:last-child { margin-bottom: 0; }
.callout .lbl {
  font-family: var(--mono);
  font-size: 6.8pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--crimson);
  margin: 0 0 2mm;
}

.rule-note {
  font-family: var(--ui);
  font-weight: 300;
  font-size: 8.8pt;
  line-height: 1.5;
  color: var(--dim);
  border-left: 1.4pt solid var(--crimson);
  padding-left: 4mm;
  margin: 6mm 0;
  page-break-inside: avoid;
}
.rule-note strong { font-weight: 500; color: var(--ink); }

.colophon { margin-top: 7mm; border-top: 1.2pt solid var(--ink); padding-top: 5mm; page-break-inside: avoid; }
.colophon p { font-family: var(--ui); font-weight: 300; font-size: 8.8pt; line-height: 1.5; color: var(--dim); }
.colophon h3 { margin-top: 5mm; }
.colophon h3:first-child { margin-top: 0; }

.authorities { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 9mm; font-family: var(--ui); font-weight: 300; font-size: 8.6pt; }
.authorities li { padding: 1.6mm 0; border-bottom: .4pt solid var(--rule); break-inside: avoid; }
.authorities .u { display: block; font-size: 7.2pt; color: var(--dim); word-break: break-all; }
.authorities .c { display: block; font-family: var(--mono); font-size: 6.2pt; letter-spacing: .12em; text-transform: uppercase; color: var(--crimson); }
.cover .fine {
  position: relative;
  font-family: var(--ui);
  font-weight: 300;
  font-size: 7.6pt;
  letter-spacing: .04em;
  margin: 3.4mm 0 0;
  opacity: .8;
}

/* -------------------------------------------------------------- additions */

.ws .r { white-space: nowrap; }
.ws td.c { text-align: center; }
.lede2 { font-size: 11.4pt; line-height: 1.5; margin: 0 0 4mm; max-width: 150mm; }
.said { width: 100%; border-collapse: collapse; margin: 4mm 0 7mm; }
.said tr { page-break-inside: avoid; }
.said th { text-align: left; font-family: var(--mono); font-weight: 400; font-size: 6.8pt; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding: 0 4mm 2mm 0; border-bottom: 1pt solid var(--rule-firm); }
.said td { width: 50%; padding: 3mm 4mm 3mm 0; border-bottom: .5pt solid var(--rule); vertical-align: top; }
.said td.x { font-family: var(--display); font-weight: 600; font-size: 10.6pt; line-height: 1.25; color: var(--dim); text-decoration: line-through; text-decoration-color: var(--crimson); text-decoration-thickness: .8pt; }
.said td.y { font-family: var(--mono); font-size: 7.8pt; line-height: 1.55; }
.cut-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: start; }
.cut-grid .cut { margin: 0; }
.names { font-family: var(--ui); font-weight: 400; font-size: 8.4pt; line-height: 1.55; margin: 0 0 2mm; }
.front-notice { margin-top: 9mm; }
.front-notice .notice { padding: 6mm 7mm; }
.front-notice .notice p { font-size: 8.6pt; line-height: 1.5; margin-bottom: 2.6mm; }
.front-notice .notice .lead { font-size: 12pt; margin-bottom: 3.4mm; }
.ws-page { page-break-before: always; }
.ws-page .ws { margin-top: 0; }
.ws__legend { font-family: var(--mono); font-size: 6.4pt; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); margin: 2mm 0 0; }
.keep { page-break-inside: avoid; }
.tight .entry { padding: 2.1mm 0; }
.tight .entry h4 { margin-bottom: 1.2mm; }
.tight .entry .meta { margin-bottom: 1.8mm; }
.tight .field { margin-bottom: .6mm; }
.tight .field dd { font-size: 10.1pt; line-height: 1.36; }
.tight .intro { margin-bottom: 5mm; }
.also { margin-top: 6mm; page-break-inside: avoid; }
.also h3 { margin-top: 0; }
.also .cmp { margin-bottom: 3mm; }
.also .cmp td { font-family: var(--ui); font-weight: 300; font-size: 8.8pt; padding: 1.5mm 3mm 1.5mm 0; }
.also .cmp td.k { font-family: var(--display); font-weight: 600; font-size: 10.2pt; width: 66mm; white-space: nowrap; }
.also .cmp td.o { width: 20mm; padding-top: 2.2mm; }
.also .src { margin: 0; }
`;
