/**
 * The four tools a reader puts something of their own through: a label, a
 * page of marketing copy, ten guesses, a question for a brand.
 *
 * The decoders are files to look things up in, and stay as they are. These
 * were added because a file is read once and an instrument is come back to —
 * and because every one of them is the same reviewed data the decoders hold,
 * arriving at the moment somebody is standing in a shop with the thing in
 * their hand.
 *
 * The behaviour is in /assets/js/lab.js and the data in /assets/js/lexicon.js.
 * Every control here is rendered hidden and revealed by the script, so a
 * reader without JavaScript is sent to the decoders instead of being shown a
 * box that does nothing.
 */
import { layout } from '../templates/layout.mjs';
import { sectionHead, supportBanner, note, shelf } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';
import { QUIZ, QUIZ_BANDS, LETTERS, SAMPLES } from '../lib/lab-data.mjs';

export const LAB_SCRIPTS = ['/assets/js/lexicon.js', '/assets/js/lab.js'];

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const noscript = (what) =>
  `<noscript><p class="lab-noscript">${what} needs JavaScript. The <a href="/tools/">decoders</a> hold the same material and work without it.</p></noscript>`;

/**
 * The box. `mode` is "reader" for a label and "brand" for marketing copy;
 * `h` is the heading level the report's sections should use under wherever
 * this has been placed.
 */
export function scannerPanel({ mode = 'reader', h = 'h2', id = 'lab-in' } = {}) {
  const reader = mode === 'reader';
  return `<div class="lab" data-lab data-mode="${mode}" data-h="${h}" data-sample="${esc(SAMPLES[mode]).replace(/\n/g, '&#10;')}" hidden>
  <label class="lab__label" for="${id}">${
    reader ? 'What the label says' : 'Your copy, as it will appear'
  }</label>
  <textarea id="${id}" rows="${reader ? 6 : 7}" data-lab-input placeholder="${
    reader
      ? 'Type or paste anything off the product: the front of the pack, the ingredients list, the fabric label…'
      : 'Paste the pack copy, the product page, the caption…'
  }"></textarea>
  <div class="lab__controls">
    <button type="button" class="btn" data-lab-run>${reader ? 'Check this label' : 'Check this copy'}</button>
    ${
      reader
        ? `<button type="button" class="btn btn--ghost" data-lab-photo>Photograph the label</button>
    <input type="file" accept="image/*" capture="environment" data-lab-file hidden tabindex="-1" aria-label="Photograph of the label">`
        : ''
    }
    <button type="button" class="chip" data-lab-sample>Try an example</button>
    <button type="button" class="chip" data-lab-clear>Clear</button>
  </div>
  <p class="lab__privacy">Nothing you type${reader ? ' or photograph' : ''} leaves this page. There is no account and nothing is stored.</p>
  <p class="lab-status" data-lab-status role="status" aria-live="polite" hidden></p>
  <div class="lab__out" data-lab-out hidden></div>
  <div class="lab__after" data-lab-after hidden>
    <button type="button" class="btn btn--quiet btn--sm" data-lab-image>Save the result as an image</button>
    ${
      reader
        ? '<a class="btn btn--quiet btn--sm" href="/tools/ask/">Write to the brand</a>'
        : '<a class="btn btn--quiet btn--sm" href="/shop/">The Claims Desk</a>'
    }
  </div>
</div>
${noscript(reader ? 'The scanner' : 'The checker')}`;
}

const shell = ({ site, covers, eyebrow, title, lede, stamp, inner, tier, path, description }) =>
  layout({
    site,
    title,
    description,
    path,
    scripts: LAB_SCRIPTS,
    body: `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow, title, lede, stamp, wide: true, level: 1 })}
    ${inner}
  </div>
</section>

${shelf(site, covers, { tier, limit: 2 })}
${supportBanner(site)}
`,
  });

const behind = (counts) => `<div class="lab-behind">
  <h2>What it reads from</h2>
  <p>Four files, each reviewed on a fixed cycle, each entry tied to a named source. The scanner finds their entries in what you give it and prints what each entry already says — so it cannot tell you anything the decoders do not.</p>
  <ul class="lab-behind__list">
    <li><a href="/tools/ingredients/">${counts.ingredients} ingredients</a>, with the other names a label uses for each</li>
    <li><a href="/tools/greenwashing/">${counts.terms} marketing terms</a>, with what each one actually tells you</li>
    <li><a href="/tools/certifications/">${counts.schemes} certification schemes</a>, with what each does not cover</li>
    <li><a href="/tools/materials/">${counts.materials} materials</a>, with the welfare position on each</li>
  </ul>
</div>`;

const counts = (data) => ({
  ingredients: data.ingredients.ingredients.length,
  terms: data.greenwashing.terms.length,
  schemes: data.certifications.schemes.length,
  materials: data.materials.materials.length,
});

// --------------------------------------------------------------- /tools/scan/

export function renderScan({ site, data, covers = {} }) {
  const c = counts(data);
  return shell({
    site,
    covers,
    tier: 'reader',
    path: '/tools/scan/',
    eyebrow: 'Free tool',
    title: 'Label Scanner',
    lede: 'Type, paste or photograph what is printed on a product. This reads it back: which ingredients and fibres come from an animal, which you would have to ask about, which words are doing the selling, and what each certification on it does not cover.',
    stamp: `${c.ingredients + c.terms + c.schemes + c.materials} entries behind it · free to use`,
    description:
      'Paste or photograph a product label and read back which ingredients and fibres come from an animal, which words are marketing, and what each certification does not cover.',
    inner: `${scannerPanel({ mode: 'reader' })}
    ${behind(c)}
    ${note(
      'What a scan cannot do',
      `<p class="mb-0">It reads words. It cannot see a logo, taste a formula or check a factory, and it does not know the product: the same report comes back for the same words whoever printed them. Where it finds nothing, that is a gap in this file, not a clean bill of health. The label in your hand is the authority on what the product contains.</p>`
    )}`,
  });
}

// ------------------------------------------------------------- /tools/claims/

export function renderClaims({ site, data, covers = {} }) {
  const c = counts(data);
  return shell({
    site,
    covers,
    tier: 'professional',
    path: '/tools/claims/',
    eyebrow: 'Free tool · for brands',
    title: 'Claim Checker',
    lede: 'Paste your own copy before it ships. This finds the environmental and welfare terms in it, says which have no agreed meaning, flags a comparison with no baseline, and tells you what to have ready for each.',
    stamp: `${c.terms} terms · ${c.schemes} certification scopes`,
    description:
      'Paste marketing copy and see which environmental and welfare claims it makes, which have no agreed meaning, and what evidence each one calls for before it is used.',
    inner: `${scannerPanel({ mode: 'brand' })}
    ${note(
      'Not legal advice',
      `<p class="mb-0">${typo(
        'This describes what published guidance asks for. It does not approve a claim, a clean result does not make copy compliant, and it cannot see the claims a picture, a colour or a product name makes. For a decision that carries legal or financial consequences, read the primary source and take advice from a qualified professional in your own country.'
      )}</p>`
    )}
    <div class="lab-behind">
      <h2>When the copy needs a file behind it</h2>
      <p>The checker reads one page of copy. <a href="/shop/">The Claims Desk</a> is the working file for the whole review: the six-step procedure, a claim inventory, an evidence index, a sign-off sheet and a change log, with the full register and every certification scope.</p>
    </div>`,
  });
}

// --------------------------------------------------------------- /tools/spot/

export function renderSpot({ site, data, covers = {} }) {
  // A pack that points at an entry nobody holds would show an empty answer.
  const have = new Set([
    ...data.greenwashing.terms.map((t) => `t:${t.term}`),
    ...data.certifications.schemes.map((s) => `s:${s.name}`),
  ]);
  const lost = QUIZ.filter((q) => !have.has(q.ref.join(':')));
  if (lost.length) throw new Error(`quiz: no entry for ${lost.map((q) => q.ref[1]).join(', ')}`);

  return shell({
    site,
    covers,
    tier: 'reader',
    path: '/tools/spot/',
    eyebrow: 'Free tool · two minutes',
    title: 'Spot the Greenwash',
    lede: 'Ten claims off the kind of packaging you buy every week. For each one: does it tell you something you could check, or nothing at all? The answer comes with the reason.',
    stamp: `10 labels a round · ${QUIZ.length} in the deck`,
    description:
      'A two-minute quiz: ten packaging claims, and for each one whether it tells you something you could check or nothing at all — with the reason.',
    inner: `<div class="spot" data-spot hidden>
      <script type="application/json" data-spot-items>${json({ items: QUIZ, bands: QUIZ_BANDS })}</script>
      <div class="spot__stage" data-spot-stage></div>
    </div>
    ${noscript('The quiz')}
    ${note(
      'About these labels',
      `<p class="mb-0">Every claim in the quiz was written for it. None is taken from a real product, and none is a statement about any brand. The explanations are the entries in the <a href="/tools/greenwashing/">Greenwashing</a> and <a href="/tools/certifications/">Certification</a> decoders, each of which names its source.</p>`
    )}`,
  });
}

// ---------------------------------------------------------------- /tools/ask/

export function renderAsk({ site, covers = {} }) {
  return shell({
    site,
    covers,
    tier: 'reader',
    path: '/tools/ask/',
    eyebrow: 'Free tool',
    title: 'Message Builder',
    lede: 'A brand may have the evidence and simply not have published it. Asking costs you two minutes and tells you what kind of answer you get. Choose the question, fill in what you saw, and send it from your own email.',
    stamp: `${LETTERS.length} questions · nothing sent from here`,
    description:
      'Write a short, polite message asking a brand what evidence is behind a claim, where an ingredient comes from, or whether a fibre is certified.',
    inner: `<div class="lab ask" data-ask hidden>
      <script type="application/json" data-ask-letters>${json(LETTERS)}</script>
      <div class="ask__form">
        <label class="ask-field"><span>What you want to ask</span>
          <select data-ask-kind>${LETTERS.map((l) => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('')}</select>
        </label>
        <div data-ask-fields></div>
        <label class="ask-field"><span>Your name</span><input type="text" data-ask-name autocomplete="name" placeholder="Optional"></label>
      </div>
      <div class="ask__letter">
        <p class="ask__subject"><span>Subject</span> <strong data-ask-subject></strong></p>
        <pre class="ask__body" data-ask-body tabindex="0"></pre>
        <div class="lab__controls">
          <button type="button" class="btn" data-ask-copy>Copy the message</button>
          <a class="btn btn--ghost" data-ask-mail href="mailto:">Open in my email</a>
        </div>
        <p class="lab__privacy">Nothing is sent from this page. The message opens in your own email, addressed to nobody: add the brand’s contact address yourself.</p>
        <p class="lab-status" data-ask-status role="status" aria-live="polite" hidden></p>
      </div>
    </div>
    ${noscript('The builder')}
    <div class="lab-behind">
      <h2>Reading the reply</h2>
      <ul class="lab-behind__list">
        <li>A specific answer names a source, a scheme or a number. “Plant-derived, from coconut” is an answer.</li>
        <li>“We take animal welfare extremely seriously” is not an answer, however sincerely it is meant. Record it as no answer, and decide what that means to you.</li>
        <li>No reply after two weeks is also an answer of a kind. Note the date.</li>
      </ul>
    </div>
    ${note(
      'A question, not a complaint',
      `<p class="mb-0">${typo(
        'These messages ask; they do not accuse, and they are a starting point to adapt, not a legal document. Sending one does not make a complaint well-founded or a statement about a business safe to publish. If the answer does not settle it, the follow-up, the questions for a certification scheme, a retailer and a regulator, and the logs to keep are in'
      )} <a href="/shop/">The Complaint Kit</a>.</p>`
    )}`,
  });
}
