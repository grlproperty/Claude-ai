import { esc, typo, formatDate, isoDate, daysSince } from '../lib/util.mjs';

export const label = (text, extra = '') =>
  `<p class="label${extra ? ` ${extra}` : ''}">${esc(text)}</p>`;

/**
 * `level` selects the heading rank. Index pages pass 1 so that every route has
 * exactly one h1; section heads within a page keep the default h2. The build
 * check fails if a page ends up with none or more than one.
 */
export function sectionHead({ eyebrow, title, lede, wide = false, centered = false, level = 2 }) {
  const h = `h${level}`;
  return `<div class="section-head${wide ? ' section-head--wide' : ''}${centered ? ' center' : ''}">
    ${eyebrow ? label(eyebrow) : ''}
    ${title ? `<${h}>${typo(title)}</${h}>` : ''}
    ${lede ? `<p class="lede mb-0">${typo(lede)}</p>` : ''}
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

  return `<article class="card card--linked tilt reveal">
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
      <h3 class="row__title"><a href="${esc(entry.url)}">${typo(entry.title)}</a></h3>
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
 */
export function newsletterForm(site, { dark = false, note = true } = {}) {
  const n = site.newsletter;
  const action = n.action || `mailto:${site.email}?subject=${encodeURIComponent(`Subscribe: ${n.name}`)}`;
  const isMailto = !n.action;
  const id = dark ? 'd' : 'l';

  return `<form class="form" action="${esc(action)}" method="${isMailto ? 'get' : 'post'}"${
    isMailto ? '' : ' target="_blank" data-subscribe'
  }>
    <label class="visually-hidden" for="nl-email-${id}">Email address</label>
    <input id="nl-email-${id}" type="email" name="email" required placeholder="you@example.com" autocomplete="email">
    ${
      isMailto
        ? ''
        : `<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="visually-hidden">
    <input type="hidden" name="_subject" value="${esc(`Subscribe: ${n.name}`)}">`
    }
    <button class="btn" type="submit">Subscribe</button>
    ${
      note
        ? `<p class="form__note">${esc(typo(n.summary))} <a href="/privacy/">What we do with your address</a>.</p>`
        : ''
    }
    <p class="form__status" role="status" aria-live="polite" hidden></p>
  </form>`;
}

/** Closing band: the funding position, and the briefing. */
export function supportBanner(site) {
  return `<section class="section on-dark">
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
