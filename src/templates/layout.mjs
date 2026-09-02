import { esc, typo } from '../lib/util.mjs';

const wordmark = (site, classes = 'wordmark') =>
  `<a class="${classes}" href="/" aria-label="${esc(site.name)} — home">` +
  `<span class="is-crimson">${esc(site.nameParts.primary)}</span> ` +
  `<span>${esc(site.nameParts.secondary)}</span>` +
  `<span class="stop is-crimson">${esc(site.nameParts.stop)}</span></a>`;

function masthead(site, current) {
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
  const columns = site.footerNav
    .map(
      (col) => `<div>
        <h2>${esc(col.title)}</h2>
        <ul>${col.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>
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
      </div>
      ${columns}
    </div>
    <div class="colophon__base">
      <span>© ${String(site.established) === String(year) ? year : `${site.established}\u2013${year}`} ${esc(site.name)}</span>
      <span>Est. ${site.established} · ${esc(site.location)} · ${esc(site.funding)}</span>
      ${(site.social.profiles ?? [])
        .map(
          (p) =>
            `<span><a href="${esc(p.url)}" rel="me noopener noreferrer" target="_blank">${esc(p.handle)}</a></span>`
        )
        .join('')}
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
  const fullTitle = path === '/' ? `${site.name} — ${site.descriptor}` : `${title} · ${site.name}`;
  const desc = description || site.description;
  const og = new URL(ogImage, site.url).href;

  const jsonLd = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
