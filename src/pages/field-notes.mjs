import { layout } from '../templates/layout.mjs';
import { label, sectionHead, entryRow, entryCard, supportBanner, note } from '../templates/components.mjs';
import { esc, typo, slugify } from '../lib/util.mjs';

export function renderFieldNotesIndex({ site, entries }) {
  const topics = [...new Set(entries.flatMap((e) => e.topics ?? [e.topic]).filter(Boolean))].sort();

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Editorial',
      title: 'Field Notes',
      lede: 'Investigations that already exist in the public record, read in full and reframed. The original publisher always gets the credit; the sources are always named.',
      wide: true,
      level: 1,
    })}

    <div class="search">
      <label class="visually-hidden" for="q">Search the field notes</label>
      <input id="q" type="search" placeholder="Search titles, topics, and text…" autocomplete="off" data-search="notes">
      <p class="search__count" data-search-count hidden></p>
    </div>

    <div class="tracker-controls" data-filter-group="topic">
      <button class="chip" type="button" aria-pressed="true" data-filter="all">All ${entries.length}</button>
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
            `<div data-topic="${esc((e.topics ?? [e.topic]).map(slugify).join(' '))}" data-text="${esc(
              `${e.title} ${e.summary} ${(e.topics ?? []).join(' ')}`.toLowerCase()
            )}">${entryRow(e, i)}</div>`
        )
        .join('')}
    </div>
    <p class="empty" data-empty hidden>No field notes match that search.</p>
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: 'Field Notes',
    description:
      'Public-record investigations across beauty, fashion, food, animal welfare, women’s rights, environment, tech, consumer rights, corporate accountability, and advertising — reframed with attribution.',
    path: '/field-notes/',
    body,
    scripts: ['/assets/js/filter.js'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Field Notes — ${site.name}`,
      url: new URL('/field-notes/', site.url).href,
      description: site.description,
    },
  });
}

function toc(headings) {
  if (headings.length < 3) return '<div></div>';
  return `<nav class="toc" aria-label="On this page">
    <p class="label label--dim">On this page</p>
    <ol>
      ${headings
        .map(
          (h) => `<li${h.depth === 3 ? ' class="is-sub"' : ''}><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`
        )
        .join('')}
    </ol>
  </nav>`;
}

function related(entry, all) {
  const others = all.filter((e) => e.url !== entry.url);
  const mine = new Set(entry.topics ?? [entry.topic]);
  const shared = others.filter((e) => (e.topics ?? [e.topic]).some((t) => mine.has(t)));
  const picked = [...shared, ...others.filter((e) => !shared.includes(e))].slice(0, 3);
  if (!picked.length) return '';

  return `<section class="section on-pale">
    <div class="wrap">
      ${sectionHead({ eyebrow: 'Continue', title: 'Related field notes' })}
      <div class="grid grid--3">${picked.map((e) => entryCard(e)).join('')}</div>
    </div>
  </section>`;
}

export function renderFieldNote({ site, entry, all }) {
  const body = `
<article>
  <header class="article-head">
    <div class="wrap">
      ${label((entry.topics ?? [entry.topic]).join(' · '))}
      <h1>${typo(entry.title)}</h1>
      <p class="lede">${typo(entry.summary)}</p>
      <div class="article-meta" style="margin-top:2rem;">
        <span><strong>${entry.readingTime} min</strong> read</span>
        ${entry.form ? `<span>${esc(entry.form)}</span>` : ''}
        <span><a href="/editorial-standards/">Editorial standards</a></span>
        <span><a href="/sources/">Sources</a></span>
      </div>
    </div>
  </header>

  <div class="wrap article-layout">
    ${toc(entry.headings)}
    <div>
      <div class="prose">${entry.html}</div>
      ${note(
        'Attribution',
        `<p class="mb-0">This note summarises reporting that already exists in the public record and credits the original publisher. If any statement here is inaccurate, write to <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> — substantive corrections are published in full at <a href="/corrections/">/corrections/</a>.</p>`
      )}
    </div>
  </div>
</article>

${related(entry, all)}
${supportBanner(site)}
`;

  return layout({
    site,
    title: entry.title,
    description: entry.summary,
    path: entry.url,
    body,
    ogImage: `/assets/og/${entry.slug}.png`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: entry.title,
      description: entry.summary,
      author: { '@type': 'Organization', name: site.name, url: site.url },
      publisher: { '@type': 'Organization', name: site.name, url: site.url },
      mainEntityOfPage: new URL(entry.url, site.url).href,
      isAccessibleForFree: true,
    },
  });
}
