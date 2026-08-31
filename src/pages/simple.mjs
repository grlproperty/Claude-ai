import { layout } from '../templates/layout.mjs';
import { label, sectionHead, supportBanner } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

/** Markdown-backed institutional pages: about, funding, privacy, terms, and so on. */
export function renderPage({ site, page }) {
  const showToc = page.headings.length >= 4;

  const body = `
<article>
  <header class="article-head">
    <div class="wrap">
      ${label(page.eyebrow ?? site.name)}
      <h1>${typo(page.title)}</h1>
      ${page.summary ? `<p class="lede">${typo(page.summary)}</p>` : ''}
    </div>
  </header>

  <div class="wrap article-layout">
    ${
      showToc
        ? `<nav class="toc" aria-label="On this page">
            <p class="label label--dim">On this page</p>
            <ol>${page.headings
              .map(
                (h) =>
                  `<li${h.depth === 3 ? ' class="is-sub"' : ''}><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`
              )
              .join('')}</ol>
          </nav>`
        : '<div></div>'
    }
    <div class="prose">${page.html}</div>
  </div>
</article>

${supportBanner(site)}
`;

  return layout({
    site,
    title: page.title,
    description: page.summary,
    path: page.url,
    body,
  });
}

export function renderNotFound({ site }) {
  const body = `
<section class="section" style="padding-block:clamp(4rem,14vw,10rem);">
  <div class="wrap wrap--narrow center">
    ${label('404')}
    <h1>This page does not exist</h1>
    <p class="lede">The address may have changed, or the entry may never have existed. Nothing published here is deleted — withdrawn entries are marked as withdrawn and keep their URL.</p>
    <div class="hero__actions" style="justify-content:center;">
      <a class="btn" href="/research/">Research archive</a>
      <a class="btn btn--ghost" href="/archive/">Full index</a>
    </div>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Page not found',
    description: 'The requested page does not exist.',
    path: '/404',
    body,
    noindex: true,
  });
}

/** A single flat index of everything published — useful for readers and crawlers alike. */
export function renderArchiveIndex({ site, research, guides, pages }) {
  const group = (title, entries) =>
    entries.length
      ? `<section class="section--tight">
          <div class="wrap">
            ${label(title)}
            <div class="rows">
              ${entries
                .map(
                  (e) => `<div class="row row--aside">
                    <div>
                      <h3 class="row__title" style="font-size:1.15rem;"><a href="${esc(e.url)}">${typo(e.title)}</a></h3>
                      <p class="row__summary">${typo(e.summary)}</p>
                    </div>
                    <div class="row__aside">${esc(e.url)}</div>
                  </div>`
                )
                .join('')}
            </div>
          </div>
        </section>`
      : '';

  const references = [
    { title: 'Global Regulation Tracker', url: '/regulation/', summary: 'Where testing is prohibited, permitted, or conditionally restricted, jurisdiction by jurisdiction.' },
    { title: 'Non-Animal Methods', url: '/methods/', summary: 'Adopted test guidelines by endpoint, including the endpoints not yet replaced.' },
    { title: 'Certification Guide', url: '/certifications/', summary: 'What each scheme verifies, and what an uncertified claim verifies.' },
    { title: 'Glossary', url: '/glossary/', summary: 'The terminology of this field, defined as the instruments define it.' },
  ];

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Index',
      title: 'Everything published',
      lede: 'A flat index of every page on this platform.',
      wide: true,
      level: 1,
    })}
  </div>
</section>
${group('Research', research)}
${group('Curriculum', guides)}
${group('Reference', references)}
${group('Organisation', pages)}
`;

  return layout({
    site,
    title: 'Index',
    description: 'A flat index of every research entry, learning module, dataset, and page published on FERAL FEMME.',
    path: '/archive/',
    body,
  });
}
