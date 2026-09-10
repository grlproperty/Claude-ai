import { esc, typo } from '../lib/util.mjs';
import { socialTiles } from './components.mjs';

const wordmark = (site, classes = 'wordmark') =>
  `<a class="${classes}" href="/" aria-label="${esc(site.name)} — home">` +
  `<span class="is-crimson">${esc(site.nameParts.primary)}</span> ` +
  `<span>${esc(site.nameParts.secondary)}</span>` +
  `<span class="stop is-crimson">${esc(site.nameParts.stop)}</span></a>`;

function masthead(site, current) {
  // No price in the nav. It was there to mark the one commercial item in a row
  // of editorial ones, and it did — but a figure in the masthead prices the
  // publication rather than the document, and the cheapest number on the site
  // is the wrong thing for a masthead to lead with.
  const links = site.nav
    .map((item) => {
      const active = current === item.href || (item.href !== '/' && current.startsWith(item.href));
      return `<a href="${esc(item.href)}"${active ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`;
    })
    .join('');

  return `<header class="masthead">
  <div class="masthead__progress" data-progress aria-hidden="true"></div>
  <div class="wrap masthead__inner">
    ${wordmark(site)}
    <nav class="nav" id="nav" aria-label="Primary">${links}</nav>
    <div class="masthead__actions">
      <a class="btn btn--sm" href="/donate/">Donate</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    </div>
  </div>
</header>`;
}

function colophon(site) {
  // The columns are numbered indexes, the way the printed contents pages are:
  // an ordinal against every entry, counted per column so each one starts at
  // 01. The ordinals are drawn by a CSS counter, so nothing here has to know
  // how many links a column holds.
  const columns = site.footerNav
    .map(
      (col) => `<div>
        <h2>${esc(col.title)}<span class="count">${String(col.links.length).padStart(2, '0')}</span></h2>
        <ul class="index-list">${col.links
          .map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`)
          .join('')}</ul>
      </div>`
    )
    .join('');

  const year = new Date().getUTCFullYear();

  return `<footer class="colophon">
  <div class="wrap">
    <div class="colophon__grid">
      <div class="colophon__brand">
        ${wordmark(site)}
        <p>${esc(typo(site.description))}</p>
        ${socialTiles(site.social.profiles ?? [], { size: '2.9rem' })}
      </div>
      ${columns}
    </div>
    <div class="colophon__base">
      <span>© ${String(site.established) === String(year) ? year : `${site.established}\u2013${year}`} ${esc(site.name)}</span>
      <span>Est. ${site.established} · ${esc(site.location)} · ${esc(site.funding)}</span>
      <span><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></span>
      <span>${esc(site.motto)}</span>
    </div>
  </div>
</footer>`;
}

/**
 * Analytics is opt-in. The previous build loaded Google Analytics on every
 * page; nothing is emitted here unless `analytics.provider` is set, and the
 * privacy page has to name the provider before it is.
 */
function analytics(site) {
  const a = site.analytics ?? {};
  if (a.provider !== 'ga4' || !a.measurementId) return '';
  const id = esc(a.measurementId);
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date);gtag('config','${id}');</script>`;
}

/**
 * A meta description that ends where a sentence does.
 *
 * A search engine shows roughly 160 characters and cuts the rest mid-word.
 * These summaries were written as standfirsts rather than as descriptions —
 * one runs to three hundred characters — so rather than keep a second copy of
 * every summary, the description is the first whole sentence or two that fit.
 * Trimming at a full stop and only falling back to a word boundary means the
 * result always reads as a finished thought.
 */
function trimForSearch(text, limit = 160) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;

  // The last sentence end inside the limit, if there is one worth keeping.
  const window = clean.slice(0, limit + 1);
  const stop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (stop >= limit * 0.55) return clean.slice(0, stop + 1);

  // Otherwise the last word boundary, with an ellipsis so the cut is deliberate.
  const cut = clean.lastIndexOf(' ', limit - 1);
  return clean.slice(0, cut > 0 ? cut : limit - 1).replace(/[,;:—-]$/, '') + '…';
}

export function layout({
  site,
  title,
  description,
  path = '/',
  body,
  bodyClass = '',
  schema = null,
  ogImage = '/assets/og/default.png',
  scripts = [],
  noindex = false,
  head = '',
}) {
  const canonical = new URL(path, site.url).href;

  // The headline is the content; the brand is the garnish. A search result
  // shows about sixty characters, and eight of the field notes have headlines
  // long enough that the whole of " · FERAL FEMME" was being spent pushing the
  // end of the actual title past the cut. The suffix is added when there is
  // room for it and dropped when there is not — never the other way round.
  const suffix = ` · ${site.name}`;
  const fullTitle =
    path === '/'
      ? `${site.name} — ${site.descriptor}`
      : `${title}${title.length + suffix.length <= 62 ? suffix : ''}`;

  const desc = trimForSearch(description || site.description);
  const og = new URL(ogImage, site.url).href;

  const jsonLd = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.className+=' js'</script>
<title>${esc(fullTitle)}</title>
${head}
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
<meta name="theme-color" content="${esc(site.brand.colours.blush)}">
<meta name="color-scheme" content="light">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="en_ZA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || site.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(og)}">

<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — ${esc(site.newsletter.name)}" href="/feed.xml">

<link rel="preload" href="/assets/fonts/bodoni-moda-500-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/jost-300-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/cormorant-garamond-600-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/space-mono-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
${jsonLd}
${analytics(site)}
</head>
<body${bodyClass ? ` class="${esc(bodyClass)}"` : ''}>
<!--
  The opening curtain. Hidden in CSS and only shown by the script below, so a
  reader without JavaScript never meets an overlay that nothing will remove.
  It is not a fake progress bar: the line sweeps rather than filling, because
  nothing here knows how far through the load it is. It lifts on the load
  event, with a floor so it cannot flash, a ceiling so a stalled asset cannot
  trap the page, and a session flag so it happens once rather than on every
  page.
-->
<div class="curtain" data-curtain aria-hidden="true">
  <div class="curtain__mark">${esc(site.nameParts.primary)} <em>${esc(site.nameParts.secondary)}</em><span>${esc(
    site.nameParts.stop
  )}</span></div>
  <div class="curtain__line"><i></i></div>
</div>
<script>
(function () {
  var el = document.currentScript.previousElementSibling;
  var seen = false;
  try { seen = !!sessionStorage.getItem('ff-open'); } catch (e) {}
  if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.parentNode.removeChild(el); return; }
  el.setAttribute('data-on', '');
  var start = Date.now(), gone = false;
  function lift() {
    if (gone) return;
    gone = true;
    try { sessionStorage.setItem('ff-open', '1'); } catch (e) {}
    setTimeout(function () {
      el.setAttribute('data-off', '');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }, Math.max(0, 520 - (Date.now() - start)));
  }
  if (document.readyState === 'complete') lift();
  else window.addEventListener('load', lift);
  setTimeout(lift, 6000);
})();
</script>
<a class="skip" href="#main">Skip to content</a>
${masthead(site, path)}
<main id="main">
${body}
</main>
${colophon(site)}
<script src="/assets/js/site.js" defer></script>
${scripts.map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}
