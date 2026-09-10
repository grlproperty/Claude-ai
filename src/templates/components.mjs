import { esc, typo, formatDate, isoDate, daysSince } from '../lib/util.mjs';

export const label = (text, extra = '') =>
  `<p class="label${extra ? ` ${extra}` : ''}">${esc(text)}</p>`;

/**
 * `level` selects the heading rank. Index pages pass 1 so that every route has
 * exactly one h1; section heads within a page keep the default h2. The build
 * check fails if a page ends up with none or more than one.
 *
 * `split` opens the head across three columns on a wide screen — title, stamp,
 * standfirst — instead of stacking them. It is opt-in because it only reads as
 * a spread when all three parts are actually present.
 */
export function sectionHead({
  eyebrow,
  title,
  lede,
  wide = false,
  centered = false,
  level = 2,
  stamp = '',
  split = false,
}) {
  const h = `h${level}`;
  // A split head is a wide one by definition: it opens across the full measure,
  // so it must also opt out of the section rail, which pins a narrow head into
  // a 17rem column — three columns inside that is not a spread, it is a wreck.
  const full = wide || split;
  return `<div class="section-head reveal${full ? ' section-head--wide' : ''}${
    split ? ' section-head--split' : ''
  }${centered ? ' center' : ''}">
    ${eyebrow ? label(eyebrow) : ''}
    ${title ? `<${h}>${typo(title)}</${h}>` : ''}
    ${lede ? `<p class="lede mb-0">${typo(lede)}</p>` : ''}
    ${stamp ? `<p class="section-head__stamp mb-0"><span class="stamp">${esc(stamp)}</span></p>` : ''}
  </div>`;
}

export function entryCard(entry, { kind = 'Field note' } = {}) {
  const meta = [
    `<span class="is-crimson">${esc(entry.topic || kind)}</span>`,
    entry.date ? `<span>${esc(formatDate(entry.date))}</span>` : '',
    entry.readingTime ? `<span>${entry.readingTime} min</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `<article class="card card--linked tilt reveal" data-pointer-label="Read">
    <div class="card__meta">${meta}</div>
    <h3><a class="stretch" href="${esc(entry.url)}">${typo(entry.title)}</a></h3>
    <p>${typo(entry.summary)}</p>
    <div class="card__foot"><span class="arrow">Read</span></div>
  </article>`;
}

export function entryRow(entry, index) {
  return `<article class="row">
    <div class="row__index">${String(index + 1).padStart(2, '0')} — ${esc(entry.topic || 'Field note')}</div>
    <div>
      <h2 class="row__title"><a href="${esc(entry.url)}">${typo(entry.title)}</a></h2>
      <p class="row__summary">${typo(entry.summary)}</p>
    </div>
    <div class="row__aside">
      ${entry.date ? `<time datetime="${esc(isoDate(entry.date))}">${esc(formatDate(entry.date))}</time>` : ''}
      ${entry.readingTime ? `<br>${entry.readingTime} min` : ''}
    </div>
  </article>`;
}

export function statBand(stats) {
  return `<div class="stat-band reveal">
    ${stats
      .map(
        (s) => `<div class="stat">
          <div class="stat__figure display">${typo(s.figure)}</div>
          <div class="stat__label">${esc(s.label)}</div>
        </div>`
      )
      .join('')}
  </div>`;
}

/**
 * The ticker. A crimson band running one list end to end under the hero.
 *
 * The run is printed twice into a single track and the track is translated by
 * exactly half its width, so the list meets itself with no seam and no gap. The
 * duplicate is `aria-hidden` — a screen reader gets the list once, and gets it
 * as a list, because that is what it is; the movement is a CSS animation over
 * the top of working markup and stops entirely under prefers-reduced-motion.
 *
 * `items` are `{ label, href }`; `href` is optional, and an item without one is
 * printed as plain text rather than as a link that goes nowhere.
 */
export function ticker(items, { ariaLabel = 'Coverage' } = {}) {
  const run = (hidden) =>
    `<ul class="ticker__run"${hidden ? ' aria-hidden="true"' : ` aria-label="${esc(ariaLabel)}"`}>` +
    items
      .map((item) =>
        item.href
          ? `<li><a href="${esc(item.href)}"${hidden ? ' tabindex="-1"' : ''}>${esc(item.label)}</a></li>`
          : `<li>${esc(item.label)}</li>`
      )
      .join('') +
    '</ul>';

  return `<div class="ticker" data-ticker>
    <div class="ticker__track">${run(false)}${run(true)}</div>
  </div>`;
}

/**
 * A numbered index. The footer columns and the standing lists number their
 * entries, and carry a count wherever one is real — a reader deciding whether
 * to open a section is partly deciding on its size. The ordinals are a CSS
 * counter, so this stays a plain list of links.
 */
export function indexList(links) {
  return `<ul class="index-list">${links
    .map(
      (l) =>
        `<li><a href="${esc(l.href)}">${esc(l.label)}${
          l.count != null ? `<span class="count">${esc(String(l.count))}</span>` : ''
        }</a></li>`
    )
    .join('')}</ul>`;
}

/**
 * The social tiles.
 *
 * Extruded squircles with a blush glyph, from the brand kit. They are drawn in
 * CSS and inline SVG rather than shipped as images: at four platforms and three
 * grounds that would be a dozen files to keep in step, and a raster tile cannot
 * take the ground's colour or press when it is clicked.
 *
 * Driven by site.social.profiles, so adding a platform there adds a tile — and
 * a platform with no glyph drawn for it gets its initial rather than an empty
 * tile, which is the failure that would otherwise ship silently.
 */
const GLYPHS = {
  instagram:
    '<rect x="19" y="19" width="82" height="82" rx="25" fill="none" stroke-width="9"></rect>' +
    '<circle cx="60" cy="60" r="19" fill="none" stroke-width="9"></circle>' +
    '<circle cx="85" cy="35" r="6"></circle>',
  tiktok:
    '<path d="M72 16h18c2 13 11 22 24 23v18c-9 0-17-3-24-8v35c0 18-14 32-32 32s-32-14-32-32 14-32 32-32c2 0 4 0 6 1v19c-2-1-4-1-6-1-7 0-13 6-13 13s6 13 13 13 13-6 13-13Z"></path>',
  linkedin:
    '<circle cx="32" cy="30" r="10"></circle>' +
    '<rect x="23" y="46" width="18" height="52" rx="2"></rect>' +
    '<path d="M52 46h17v9c5-10 34-13 34 13v30H86V74c0-11-16-9-16 2v22H52z"></path>',
  facebook:
    '<path d="M78 22h-14c-14 0-23 9-23 24v14H27v20h14v40h20V80h15l3-20H61V48c0-4 2-6 7-6h10z"></path>',
};

export function socialTiles(profiles, { size = '4.6rem', className = '' } = {}) {
  if (!profiles || !profiles.length) return '';
  return (
    `<ul class="tiles${className ? ` ${className}` : ''}" style="--tile: ${esc(size)};">` +
    profiles
      .map((p) => {
        const key = String(p.name || '').toLowerCase().replace(/[^a-z]/g, '');
        const glyph = GLYPHS[key];
        // The tile is the link's whole target, and the platform's name is its
        // accessible name — the glyph is decoration and says nothing.
        return `<li><a class="tile" href="${esc(p.url)}" rel="me noopener noreferrer" target="_blank" aria-label="${esc(
          p.name
        )}${p.handle ? ` — ${esc(p.handle)}` : ''}">${
          glyph
            ? `<svg class="tile__glyph" viewBox="0 0 120 120" aria-hidden="true" focusable="false">${glyph}</svg>`
            : `<span class="tile__initial" aria-hidden="true">${esc(String(p.name || '?').charAt(0))}</span>`
        }</a></li>`;
      })
      .join('') +
    '</ul>'
  );
}

export function note(title, body) {
  return `<aside class="note">
    ${title ? `<p class="note__title">${esc(title)}</p>` : ''}
    ${body}
  </aside>`;
}

/**
 * Provenance line for a dataset. The review cycle is declared in the data file,
 * so a stale dataset says so on the page rather than quietly ageing.
 */
export function reviewStamp(dataset) {
  const age = daysSince(dataset.reviewed);
  const overdue = age > (dataset.reviewCycleDays ?? 180);
  const text = overdue
    ? `Last reviewed ${formatDate(dataset.reviewed)} — this dataset is past its review cycle and may not reflect recent changes.`
    : `Last reviewed ${formatDate(dataset.reviewed)}. Reviewed on a ${dataset.reviewCycleDays ?? 180}-day cycle.`;
  return `<p class="label label--dim" style="margin-top:2rem;">${esc(text)}</p>`;
}

/**
 * The subscribe form. `newsletter.action` in content/site.json is whatever
 * endpoint collects the address — the site is static, so something off it has
 * to receive the POST. Until that is set the form degrades to a mailto:, which
 * still reaches a human rather than shipping a control that silently discards
 * what a reader typed.
 *
 * With JavaScript the submit is intercepted so the reader stays on the page
 * and gets an inline confirmation; without it the browser posts natively to
 * the provider's own thank-you page. Both paths work.
 *
 * `note: false` drops the standing note, for pages that already say the same
 * thing in their own copy.
 *
 * The address input takes its name from `newsletter.emailField`, because
 * providers disagree about it and a POST carrying the wrong one is the worst
 * kind of failure: the endpoint accepts the request, the form reports success,
 * and no subscriber is ever created. Formspree and FormSubmit want `email`;
 * a MailerLite embedded form wants `fields[email]`.
 */
export function newsletterForm(site, { dark = false, note = true } = {}) {
  const n = site.newsletter;
  const action = n.action || `mailto:${site.email}?subject=${encodeURIComponent(`Subscribe: ${n.name}`)}`;
  const isMailto = !n.action;
  const id = dark ? 'd' : 'l';
  const field = isMailto ? 'email' : n.emailField || 'email';

  return `<form class="form" action="${esc(action)}" method="${isMailto ? 'get' : 'post'}"${
    isMailto ? '' : ' target="_blank" data-subscribe'
  }>
    <label class="visually-hidden" for="nl-email-${id}">Email address</label>
    <input id="nl-email-${id}" type="email" name="${esc(field)}" required placeholder="you@example.com" autocomplete="email">
    ${
      isMailto
        ? ''
        : `<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="visually-hidden">
    ${Object.entries(n.fields ?? {})
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join('\n    ')}`
    }
    <button class="btn" type="submit">Subscribe</button>
    ${
      note
        ? `<p class="form__note">${esc(typo(n.summary))} <a href="/privacy/">What we do with your address</a>.</p>`
        : ''
    }
    <p class="form__status" role="status" aria-live="polite" hidden${
      isMailto ? '' : ` data-confirm="${esc(n.confirmText || 'Thank you — you are on the list.')}"`
    }></p>
  </form>`;
}

/** Closing band: the funding position, and the briefing. */
/**
 * The shelf: the paid documents, shown where the reading happens.
 *
 * They were reachable from every page and findable from none — one nav item,
 * labelled "Published", which a stranger reads as "things they have written"
 * rather than "things you can buy". Nothing on the home page said the site
 * sold anything at all, and the one high-intent block on a finished field note
 * asked for a donation.
 *
 * Two rules keep it a shelf rather than a banner. It shows the actual covers
 * and the actual prices — no pitch, no urgency, no invented scarcity — and it
 * says plainly what the money does, which is what the funding page says.
 *
 * Selling our own work is not what the no-advertising claim is about, and the
 * copy here should not blur the two. The claim is that nobody can pay to
 * appear on this site and nothing said about a company is for sale. A shelf of
 * documents this platform wrote and sells to fund itself leaves that intact —
 * so this block says what the money buys, and does not reach for a denial to
 * excuse itself.
 *
 * `tier` picks who is being shown to: 'reader' for the volumes under $50,
 * 'professional' for the org-licensed packs. A reader at the end of a field
 * note and an auditor half-way through the certification decoder are not
 * looking at the same thing.
 */
export function shelf(site, covers = {}, { tier = 'all', limit = 3, heading = true } = {}) {
  const s = site.shop ?? {};
  const all = s.products ?? [];
  if (!all.length) return '';

  const pick =
    tier === 'reader'
      ? all.filter((p) => p.price < 50)
      : tier === 'professional'
        ? all.filter((p) => p.price >= 50)
        : all;
  const shown = (pick.length ? pick : all).slice(0, limit);
  if (!shown.length) return '';

  const cheapest = Math.min(...all.map((p) => p.price));
  const sym = s.currencySymbol ?? '$';
  const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const items = shown
    .map((p) => {
      const c = covers[slugOf(p.name)];
      return `<li class="shelf__item">
        <a class="shelf__link" href="/shop/">
          ${
            c
              ? `<span class="shelf__cover"><img src="${esc(c.thumb)}" alt="" loading="lazy" decoding="async" width="${
                  c.width ?? 911
                }" height="${c.height ?? 1287}"></span>`
              : '<span class="shelf__cover shelf__cover--blank" aria-hidden="true"></span>'
          }
          <span class="shelf__name">${esc(p.name)}</span>
          <span class="shelf__price">${esc(sym)}${esc(String(p.price))}</span>
        </a>
      </li>`;
    })
    .join('');

  return `<section class="section shelf-band">
    <div class="wrap">
      ${
        heading
          ? sectionHead({
              eyebrow: 'Published',
              title: 'The documents',
              lede: `Everything else on this site is free and stays free. These took long enough to assemble that they are sold instead, and what they earn is what pays for the research — the reading time, the database access, and the next ${
                site.donate?.fundsNotes ?? 'eighteen'
              } field notes. Buying one funds the work. It buys no influence over it.`,
              stamp: `${all.length} volumes · from ${sym}${cheapest}`,
            })
          : ''
      }
      <ul class="shelf">${items}</ul>
      <p class="shelf__more"><a class="arrow" href="/shop/">Every document, with what is in each</a></p>
    </div>
  </section>`;
}

export function supportBanner(site) {
  return `<section class="section on-crimson">
    <div class="wrap">
      <div class="grid grid--2" style="align-items:start;gap:4rem;">
        <div>
          ${label('Self-funded')}
          <h2>${typo(site.donate.headline)}</h2>
          <p class="lede">${typo(site.donate.summary)}</p>
          <p class="mb-0" style="margin-top:2rem;">
            <a class="btn" href="/donate/">Donate</a>
            <a class="btn btn--quiet" href="/about/" style="margin-left:0.5rem;">How we work</a>
          </p>
        </div>
        <div>
          ${label(site.newsletter.name)}
          <p class="lede">Every field note, in full, on the day it is published. Nothing else.</p>
          ${newsletterForm(site, { dark: true })}
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * The currency selector.
 *
 * The rate table is written into a data attribute rather than fetched, so the
 * page converts on the first frame with no network round trip and no flash of
 * the wrong number. It is small — twelve currencies — and the single-file
 * build has no other way to carry it.
 *
 * Everything it converts is marked with data-usd. The dollar figure stays
 * visible alongside the converted one, because the dollar figure is the only
 * one that is true at the checkout.
 */
export function currencyPicker(rates, { note } = {}) {
  if (!rates?.currencies?.length) return '';
  const payload = esc(
    JSON.stringify({
      date: rates.date,
      sourceUrl: rates.sourceUrl,
      currencies: rates.currencies,
    })
  );

  return `<div class="currency" data-currency="${payload}">
  <label class="currency__label" for="currency-select">Show prices in</label>
  <select class="currency__select" id="currency-select"></select>
  <p class="currency__note">${
    note ??
    'Converted for guidance only. Every price is charged in US dollars — your bank sets the rate it actually applies.'
  } Rates: European Central Bank, <span data-currency-date>&mdash;</span>.</p>
</div>`;
}
