import { layout } from '../templates/layout.mjs';
import { label, supportBanner } from '../templates/components.mjs';
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
    <p class="lede">The address may have changed, or the entry may never have existed. Nothing published here is deleted — a withdrawn note is marked as withdrawn and keeps its URL.</p>
    <div class="hero__actions" style="justify-content:center;">
      <a class="btn" href="/field-notes/">Field notes</a>
      <a class="btn btn--ghost" href="/tools/">Free tools</a>
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
