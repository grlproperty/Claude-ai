import { layout } from '../templates/layout.mjs';
import {
  label,
  sectionHead,
  supportBanner,
  note,
  reviewStamp,
  statusBadge,
} from '../templates/components.mjs';
import { esc, typo, formatDate, isoDate, slugify } from '../lib/util.mjs';

// ------------------------------------------------------------- regulation

function jurisdiction(j) {
  const timeline = j.timeline?.length
    ? `<div class="panel">
        <h4>Timeline</h4>
        <ol class="timeline" style="list-style:none;">
          ${j.timeline
            .map(
              (t) => `<li>
                <time datetime="${esc(isoDate(t.date))}">${esc(formatDate(t.date))}</time>
                ${typo(t.event)}
              </li>`
            )
            .join('')}
        </ol>
      </div>`
    : '';

  const caveats = j.caveats?.length
    ? `<div class="panel">
        <h4>What the prohibition does not cover</h4>
        <ul>${j.caveats.map((c) => `<li>${typo(c)}</li>`).join('')}</ul>
      </div>`
    : '';

  const states = j.stateList?.length
    ? `<div class="panel" style="grid-column:1/-1;">
        <h4>States with sales bans in force</h4>
        <div class="scroll-x">
          <table style="width:100%;border-collapse:collapse;font-size:0.8125rem;">
            <thead>
              <tr>
                <th style="text-align:left;padding:0.5rem 1rem 0.5rem 0;border-bottom:1px solid var(--rule);font-size:0.5625rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-muted);font-weight:500;">State</th>
                <th style="text-align:left;padding:0.5rem 1rem 0.5rem 0;border-bottom:1px solid var(--rule);font-size:0.5625rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-muted);font-weight:500;">In force</th>
                <th style="text-align:left;padding:0.5rem 0;border-bottom:1px solid var(--rule);font-size:0.5625rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-muted);font-weight:500;">Instrument</th>
              </tr>
            </thead>
            <tbody>
              ${j.stateList
                .map(
                  (s) => `<tr>
                    <td style="padding:0.6rem 1rem 0.6rem 0;border-bottom:1px solid var(--rule-soft);">${esc(s.state)}</td>
                    <td style="padding:0.6rem 1rem 0.6rem 0;border-bottom:1px solid var(--rule-soft);color:var(--ink-muted);">${esc(formatDate(s.effective))}</td>
                    <td style="padding:0.6rem 0;border-bottom:1px solid var(--rule-soft);color:var(--ink-muted);">${esc(s.instrument)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`
    : '';

  return `<article class="jur" id="${esc(j.id)}" data-status="${esc(j.status)}" data-region="${esc(
    slugify(j.region)
  )}" data-text="${esc(`${j.name} ${j.region} ${j.headline}`.toLowerCase())}">
    <div class="jur__head">
      <h3 class="jur__name">${esc(j.name)}</h3>
      ${statusBadge(j.status)}
    </div>
    <p class="jur__headline">${typo(j.headline)}</p>
    <p class="label label--dim label--plain" style="margin-bottom:1.5rem;">
      ${esc(j.instrument)}${j.source ? ` — <a href="${esc(j.source)}" target="_blank" rel="noopener noreferrer">primary source</a>` : ''}
    </p>
    <div class="detail-grid">
      ${timeline}
      ${caveats}
      ${states}
    </div>
    ${
      j.appliesAlsoTo?.length
        ? `<p class="label label--dim label--plain" style="margin-top:1.5rem;">Also applies to: ${esc(j.appliesAlsoTo.join(' · '))}</p>`
        : ''
    }
  </article>`;
}

export function renderRegulation({ site, data }) {
  const regions = [...new Set(data.jurisdictions.map((j) => j.region))].sort();
  const counts = data.jurisdictions.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Reference dataset',
      title: data.title,
      lede: data.summary,
      wide: true,
      level: 1,
    })}

    ${note(
      'How to read a status',
      `<ul style="margin:0;padding-left:1.1rem;">
        ${Object.entries(data.statusKey)
          .map(([k, v]) => `<li><strong style="text-transform:capitalize;">${esc(k)}</strong> — ${typo(v)}</li>`)
          .join('')}
      </ul>`
    )}

    <div class="search" style="margin-top:2.5rem;">
      <label class="visually-hidden" for="q">Search jurisdictions</label>
      <input id="q" type="search" placeholder="Search jurisdictions…" autocomplete="off" data-search="regulation">
      <p class="search__count" data-search-count hidden></p>
    </div>

    <div class="tracker-controls" data-filter-group="status">
      <button class="chip" type="button" aria-pressed="true" data-filter="all">All ${data.jurisdictions.length}</button>
      ${['prohibited', 'partial', 'permitted']
        .filter((s) => counts[s])
        .map(
          (s) =>
            `<button class="chip" type="button" aria-pressed="false" data-filter="${esc(s)}">${esc(
              s
            )} ${counts[s]}</button>`
        )
        .join('')}
      <span style="width:1px;height:1.5rem;background:var(--rule);margin-inline:0.5rem;"></span>
      ${regions
        .map(
          (r) =>
            `<button class="chip" type="button" aria-pressed="false" data-filter-region="${esc(slugify(r))}">${esc(r)}</button>`
        )
        .join('')}
    </div>

    <div data-filter-list>
      ${data.jurisdictions.map(jurisdiction).join('')}
    </div>
    <p class="empty" data-empty hidden>No jurisdictions match those filters.</p>

    ${reviewStamp(data)}
    <p class="label label--dim label--plain">
      This dataset is published under CC BY-NC 4.0. Institutional licence holders may export it as CSV or JSON — see <a href="/licensing/">licensing</a>.
    </p>
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description:
      'A maintained tracker of where animal testing for cosmetics is prohibited, permitted, or conditionally restricted, with the primary instrument for each jurisdiction.',
    path: '/regulation/',
    body,
    scripts: ['/assets/js/filter.js'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: data.title,
      description: data.summary,
      dateModified: isoDate(data.reviewed),
      license: 'https://creativecommons.org/licenses/by-nc/4.0/',
      creator: { '@type': 'Organization', name: site.name, url: site.url },
      isAccessibleForFree: true,
    },
  });
}

// ---------------------------------------------------------------- methods

export function renderMethods({ site, data }) {
  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Reference dataset', title: data.title, lede: data.summary, wide: true, level: 1 })}

    ${note(
      data.framing.title,
      `<p>${typo(data.framing.body)}</p>
       <p class="mb-0"><a href="${esc(data.framing.source)}" target="_blank" rel="noopener noreferrer">Russell &amp; Burch, 1959</a></p>`
    )}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${data.endpoints
      .map(
        (e) => `<article class="jur" id="${esc(slugify(e.endpoint))}">
          <div class="jur__head">
            <h3 class="jur__name">${esc(e.endpoint)}</h3>
            <span class="label label--dim label--plain" style="margin:0;">Replaces: ${esc(e.replaces)}</span>
          </div>
          <p class="jur__headline">${typo(e.how)}</p>
          <div class="detail-grid">
            <div class="panel">
              <h4>Adopted methods</h4>
              <ul>${e.guidelines
                .map((g) => `<li><strong>${esc(g.code)}</strong> — ${esc(g.name)}</li>`)
                .join('')}</ul>
            </div>
            <div class="panel">
              <h4>Status</h4>
              <p style="margin:0;font-size:0.8125rem;line-height:1.7;color:var(--ink-secondary);">${typo(e.status)}</p>
            </div>
          </div>
        </article>`
      )
      .join('')}
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Supporting approaches',
      title: 'What reduces the need for new data at all',
      lede: 'Not every safety question requires a new test. These approaches do a large share of the practical work.',
    })}
    <div class="grid grid--2">
      ${data.supporting
        .map(
          (s) => `<div class="panel">
            <h4>${esc(s.name)}</h4>
            <p style="margin:0;font-size:0.875rem;line-height:1.7;color:var(--ink-secondary);">${typo(s.detail)}</p>
          </div>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Institutions',
      title: 'Who validates a method',
      lede: 'A method demonstrated in a laboratory is not a method a regulator will accept. Between the two sits validation — and validation capacity, not scientific imagination, is the rate-limiting step.',
      wide: true,
    })}
    <div class="rows">
      ${data.bodies
        .map(
          (b) => `<div class="row row--label-14">
            <div class="row__index">${esc(b.name)}</div>
            <div>
              <p class="row__summary" style="margin-bottom:0.4rem;">${typo(b.role)}</p>
              <a class="arrow" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">Visit</a>
            </div>
          </div>`
        )
        .join('')}
    </div>
    ${reviewStamp(data)}
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description:
      'The adopted OECD test guidelines that replace animal tests, endpoint by endpoint — including the endpoints for which no validated replacement yet exists.',
    path: '/methods/',
    body,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: data.title,
      description: data.summary,
      dateModified: isoDate(data.reviewed),
      creator: { '@type': 'Organization', name: site.name, url: site.url },
      isAccessibleForFree: true,
    },
  });
}

// --------------------------------------------------------- certifications

export function renderCertifications({ site, data }) {
  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Reference dataset', title: data.title, lede: data.summary, wide: true, level: 1 })}

    ${data.schemes
      .map(
        (s) => `<article class="jur" id="${esc(s.id)}">
          <div class="jur__head">
            <h3 class="jur__name">${esc(s.name)}</h3>
            <span class="status status--${s.strength === 'Strongest' ? 'prohibited' : 'partial'}">${esc(s.strength)}</span>
          </div>
          <p class="label label--dim label--plain" style="margin-bottom:1.5rem;">
            ${esc(s.operator)}${s.url ? ` — <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">scheme criteria</a>` : ''}
          </p>
          <div class="detail-grid">
            <div class="panel">
              <h4>What it verifies</h4>
              <ul>${s.verifies.map((v) => `<li>${typo(v)}</li>`).join('')}</ul>
            </div>
            <div class="panel">
              <h4>What it does not verify</h4>
              <ul>${s.doesNotVerify.map((v) => `<li>${typo(v)}</li>`).join('')}</ul>
            </div>
          </div>
          <p style="margin-top:1.5rem;font-size:0.875rem;line-height:1.7;color:var(--ink-secondary);max-width:70ch;">${typo(s.note)}</p>
        </article>`
      )
      .join('')}
  </div>
</section>

<section class="section on-dark">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Method', title: data.questions.title, wide: true })}
    <ol style="max-width:70ch;font-family:var(--display);font-size:clamp(1.25rem,2.2vw,1.6rem);line-height:1.5;padding-left:1.5rem;">
      ${data.questions.items.map((q) => `<li style="margin-bottom:1.25rem;">${typo(q)}</li>`).join('')}
    </ol>
    <p style="margin-top:2.5rem;"><a class="btn btn--quiet" href="/learn/reading-the-label/">The full method — module four</a></p>
  </div>
</section>

<section class="section--tight">
  <div class="wrap">${reviewStamp(data)}</div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description:
      'What Leaping Bunny, PETA Beauty Without Bunnies, and vegan trademarks each verify — and what an uncertified cruelty-free claim verifies, which is nothing.',
    path: '/certifications/',
    body,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: data.title,
      description: data.summary,
      dateModified: isoDate(data.reviewed),
      creator: { '@type': 'Organization', name: site.name, url: site.url },
      isAccessibleForFree: true,
    },
  });
}

// --------------------------------------------------------------- glossary

export function renderGlossary({ site, data }) {
  const categories = [...new Set(data.terms.map((t) => t.category))].sort();
  const sorted = [...data.terms].sort((a, b) => a.term.localeCompare(b.term, 'en'));

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Reference', title: data.title, lede: data.summary, wide: true, level: 1 })}

    <div class="search">
      <label class="visually-hidden" for="q">Search terms</label>
      <input id="q" type="search" placeholder="Search terms and definitions…" autocomplete="off" data-search="glossary">
      <p class="search__count" data-search-count hidden></p>
    </div>

    <div class="tracker-controls" data-filter-group="category">
      <button class="chip" type="button" aria-pressed="true" data-filter="all">All</button>
      ${categories
        .map(
          (c) =>
            `<button class="chip" type="button" aria-pressed="false" data-filter="${esc(slugify(c))}">${esc(c)}</button>`
        )
        .join('')}
    </div>

    <dl class="rows" data-filter-list style="margin:0;">
      ${sorted
        .map(
          (t) => `<div class="row row--label-16" id="${esc(slugify(t.term))}" data-category="${esc(slugify(t.category))}"
                       data-text="${esc(`${t.term} ${(t.aliases ?? []).join(' ')} ${t.definition}`.toLowerCase())}">
            <dt>
              <span class="row__title" style="display:block;font-size:1.25rem;">${esc(t.term)}</span>
              ${
                t.aliases?.length
                  ? `<span class="row__index" style="display:block;margin-top:0.4rem;">${esc(t.aliases.join(' · '))}</span>`
                  : ''
              }
            </dt>
            <dd style="margin:0;">
              <p class="row__summary">${typo(t.definition)}</p>
              <p class="row__index" style="margin-top:0.6rem;">${esc(t.category)}</p>
            </dd>
          </div>`
        )
        .join('')}
    </dl>
    <p class="empty" data-empty hidden>No terms match that search.</p>

    ${reviewStamp(data)}
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description:
      'The terminology of cosmetics regulation and toxicology, defined as the instruments define it — endpoints, marketing bans, NAMs, defined approaches, cut-off dates.',
    path: '/glossary/',
    body,
    scripts: ['/assets/js/filter.js'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      name: data.title,
      description: data.summary,
      hasDefinedTerm: sorted.map((t) => ({
        '@type': 'DefinedTerm',
        name: t.term,
        description: t.definition,
        inDefinedTermSet: new URL('/glossary/', site.url).href,
      })),
    },
  });
}
