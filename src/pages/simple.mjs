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

/**
 * A page that has moved.
 *
 * GitHub Pages honours no redirect configuration — the `_redirects` file is a
 * Netlify convention and is simply served as a text file — so a legacy URL has
 * to redirect itself. Written as a real page rather than a bare meta refresh:
 * a reader whose browser ignores the refresh, or who arrives with JavaScript
 * off, still sees where the thing went and can click through.
 */
export function renderRedirect({ site, from, to, title }) {
  const body = `
<section class="section" style="padding-block:clamp(4rem,14vw,10rem);">
  <div class="wrap wrap--narrow center">
    ${label('Moved')}
    <h1>${esc(title)} has moved</h1>
    <p class="lede">This page now lives at <a href="${esc(to)}">${esc(to)}</a>. You should arrive there in a moment.</p>
    <div class="hero__actions" style="justify-content:center;">
      <a class="btn" href="${esc(to)}">Go there now</a>
    </div>
  </div>
</section>
`;

  return layout({
    site,
    title: `${title} has moved`,
    description: `${title} has moved to ${to}. This page redirects there automatically.`,
    path: from,
    body,
    noindex: true,
    // Relative, deliberately. An absolute production URL here would throw
    // anyone on a preview or local build straight out to the live site.
    head: `<meta http-equiv="refresh" content="0; url=${esc(to)}">`,
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

<section class="section on-pale section--tight">
  <div class="wrap wrap--narrow center">
    ${label('Or reach us directly')}
    <h2>Tell us what you were looking for</h2>
    <p class="lede">If you followed a link to get here, the link is our problem to fix. Send us the address and we will either restore the page or tell you where it went.</p>
    <p style="margin-top:var(--s4);"><a class="btn" href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
    <p style="margin-top:var(--s5);">${(site.social.profiles ?? [])
      .map(
        (p) =>
          `<a href="${esc(p.url)}" rel="me noopener noreferrer" target="_blank">${esc(p.name)}</a>`
      )
      .join(' &nbsp;·&nbsp; ')}</p>
    <p style="margin-top:var(--s4);"><a class="arrow" href="/find-us/">Every way to reach us</a></p>
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
