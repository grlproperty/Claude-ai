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

/** Card for a research entry or learning module. */
export function entryCard(entry, { kind = 'Research' } = {}) {
  const meta = [
    entry.topic ? `<span class="is-crimson">${esc(entry.topic)}</span>` : `<span class="is-crimson">${esc(kind)}</span>`,
    entry.date ? `<span>${esc(formatDate(entry.date))}</span>` : '',
    entry.readingTime ? `<span>${entry.readingTime} min</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `<article class="card card--linked">
    <div class="card__meta">${meta}</div>
    <h3><a class="stretch" href="${esc(entry.url)}">${typo(entry.title)}</a></h3>
    <p>${typo(entry.summary)}</p>
    <div class="card__foot"><span class="arrow">Read</span></div>
  </article>`;
}

/** Wide, image-led treatment for the single most important entry on a page. */
export function featureCard(entry) {
  return `<article class="feature">
    <div class="feature__media">
      ${
        entry.image
          ? `<img src="${esc(entry.image)}" alt="" loading="lazy" decoding="async" width="1200" height="1500">`
          : ''
      }
    </div>
    <div class="feature__body">
      ${label(entry.topic || 'Featured research')}
      <h2><a href="${esc(entry.url)}">${typo(entry.title)}</a></h2>
      <p class="lede">${typo(entry.summary)}</p>
      <div class="card__meta" style="margin-top:auto;padding-top:1.5rem;">
        ${entry.date ? `<span>${esc(formatDate(entry.date))}</span>` : ''}
        ${entry.readingTime ? `<span>${entry.readingTime} min read</span>` : ''}
      </div>
      <p class="mb-0"><a class="arrow" href="${esc(entry.url)}">Read the analysis</a></p>
    </div>
  </article>`;
}

/** Compact index row — the default listing treatment across the archive. */
export function entryRow(entry, index) {
  return `<article class="row">
    <div class="row__index">${String(index + 1).padStart(2, '0')} — ${esc(entry.topic || 'Research')}</div>
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
  return `<div class="stat-band">
    ${stats
      .map(
        (s) => `<div class="stat">
          <div class="stat__figure">${typo(s.figure)}</div>
          <div class="stat__label">${esc(s.label)}</div>
          <p class="stat__note">${typo(s.note)}</p>
        </div>`
      )
      .join('')}
  </div>`;
}

export function pillars(list) {
  return `<div class="grid grid--3">
    ${list
      .map(
        (p) => `<div class="pillar">
          <div class="pillar__number">${esc(p.number)}</div>
          <h3>${esc(p.title)}</h3>
          <p>${typo(p.summary)}</p>
          <p>${typo(p.detail)}</p>
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

export function newsletterForm(site, { dark = false } = {}) {
  const n = site.newsletter;
  const action = n.action || `mailto:${site.email}?subject=${encodeURIComponent(`Subscribe: ${n.name}`)}`;
  const isMailto = !n.action;

  return `<form class="form" action="${esc(action)}" method="${isMailto ? 'get' : 'post'}"${
    isMailto ? '' : ' target="_blank"'
  }>
    <label class="visually-hidden" for="nl-email-${dark ? 'd' : 'l'}">Email address</label>
    <input id="nl-email-${dark ? 'd' : 'l'}" type="email" name="email" required placeholder="you@example.com" autocomplete="email">
    <button class="btn" type="submit">Subscribe</button>
    <p class="form__note">${esc(typo(n.summary))}</p>
  </form>`;
}

export function supportBanner(site) {
  return `<section class="section on-dark">
    <div class="wrap">
      <div class="grid grid--2" style="align-items:center;">
        <div>
          ${label('Support')}
          <h2>${typo(site.support.headline)}</h2>
          <p class="lede">${typo(site.support.summary)}</p>
          <p class="mb-0" style="margin-top:2rem;">
            <a class="btn" href="/support/">Become a supporter</a>
            <a class="btn btn--quiet" href="/funding/" style="margin-left:0.5rem;">How we are funded</a>
          </p>
        </div>
        <div>
          ${label(site.newsletter.name)}
          <p class="lede">${esc(site.newsletter.cadence)} — regulatory movement, method validation, and industry disclosure, in one email.</p>
          ${newsletterForm(site, { dark: true })}
        </div>
      </div>
    </div>
  </section>`;
}

export const statusBadge = (status) =>
  `<span class="status status--${esc(status)}">${esc(status)}</span>`;
