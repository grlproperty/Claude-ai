import { layout } from '../templates/layout.mjs';
import { label, sectionHead, entryRow, entryCard, supportBanner, note } from '../templates/components.mjs';
import { esc, typo, formatDate, isoDate, slugify } from '../lib/util.mjs';

export function renderResearchIndex({ site, entries }) {
  const topics = [...new Set(entries.map((e) => e.topic).filter(Boolean))].sort();

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Archive',
      title: 'Research',
      level: 1,
      lede: 'Long-form entries on regulation, method, and certification. Every factual claim is traceable to a primary source and cited at the foot of the entry.',
      wide: true,
    })}

    <div class="search">
      <label class="visually-hidden" for="q">Search the archive</label>
      <input id="q" type="search" placeholder="Search titles, topics, and text…" autocomplete="off" data-search="research">
      <p class="search__count" data-search-count hidden></p>
    </div>

    <div class="tracker-controls" data-filter-group="topic">
      <button class="chip" type="button" aria-pressed="true" data-filter="all">All</button>
      ${topics
        .map(
          (t) => `<button class="chip" type="button" aria-pressed="false" data-filter="${esc(slugify(t))}">${esc(t)}</button>`
        )
        .join('')}
    </div>

    <div class="rows" data-filter-list>
      ${entries
        .map(
          (e, i) =>
            `<div data-topic="${esc(slugify(e.topic ?? 'research'))}" data-text="${esc(
              `${e.title} ${e.summary} ${e.topic ?? ''}`.toLowerCase()
            )}">${entryRow(e, i)}</div>`
        )
        .join('')}
    </div>
    <p class="empty" data-empty hidden>No entries match that search.</p>
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: 'Research',
    description:
      'Long-form research entries on the regulation of animal testing in cosmetics, the methods that replace it, and the certifications that claim to verify it.',
    path: '/research/',
    body,
    scripts: ['/assets/js/filter.js'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Research — ${site.name}`,
      url: new URL('/research/', site.url).href,
      description: site.description,
    },
  });
}

/** Table of contents built from the h2/h3 structure the renderer collected. */
function toc(headings) {
  if (headings.length < 3) return '';
  return `<nav class="toc" aria-label="On this page">
    <p class="label label--dim">On this page</p>
    <ol>
      ${headings
        .map(
          (h) =>
            `<li${h.depth === 3 ? ' class="is-sub"' : ''}><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`
        )
        .join('')}
    </ol>
  </nav>`;
}

/** Two related entries, preferring the same topic before falling back to recency. */
function related(entry, all) {
  const others = all.filter((e) => e.url !== entry.url);
  const sameTopic = others.filter((e) => e.topic === entry.topic);
  const picked = [...sameTopic, ...others.filter((e) => !sameTopic.includes(e))].slice(0, 3);
  if (!picked.length) return '';

  return `<section class="section on-white">
    <div class="wrap">
      ${sectionHead({ eyebrow: 'Continue', title: 'Related entries' })}
      <div class="grid grid--3">${picked.map((e) => entryCard(e)).join('')}</div>
    </div>
  </section>`;
}

export function renderEntry({ site, entry, all }) {
  const body = `
<article>
  <header class="article-head">
    <div class="wrap">
      ${label(entry.topic ?? 'Research')}
      <h1>${typo(entry.title)}</h1>
      <p class="lede">${typo(entry.summary)}</p>
      <div class="article-meta" style="margin-top:2rem;">
        ${entry.date ? `<span>Published <strong><time datetime="${esc(isoDate(entry.date))}">${esc(formatDate(entry.date))}</time></strong></span>` : ''}
        ${entry.updated && entry.updated !== entry.date ? `<span>Reviewed <strong>${esc(formatDate(entry.updated))}</strong></span>` : ''}
        <span><strong>${entry.readingTime} min</strong> read</span>
        <span><a href="/editorial-standards/">Editorial standards</a></span>
      </div>
    </div>
  </header>

  <div class="wrap article-layout">
    ${toc(entry.headings)}
    <div>
      <div class="prose">${entry.html}</div>
      ${note(
        'Verification',
        `<p class="mb-0">Every claim in this entry is sourced above. If any statement is inaccurate or has been overtaken by events, write to <a href="mailto:corrections@feral-femme.co">corrections@feral-femme.co</a> — substantive corrections are published in full at <a href="/corrections/">/corrections/</a>.</p>`
      )}
    </div>
  </div>
</article>

${related(entry, all)}
${supportBanner(site)}
`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry.title,
    description: entry.summary,
    datePublished: isoDate(entry.date),
    dateModified: isoDate(entry.updated ?? entry.date),
    author: { '@type': 'Organization', name: site.name, url: site.url },
    publisher: { '@type': 'Organization', name: site.name, url: site.url },
    mainEntityOfPage: new URL(entry.url, site.url).href,
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by-nc/4.0/',
  };

  return layout({
    site,
    title: entry.title,
    description: entry.summary,
    path: entry.url,
    body,
    schema,
    ogImage: `/assets/og/${entry.slug}.png`,
  });
}
