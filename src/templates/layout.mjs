import { esc, typo } from '../lib/util.mjs';

const wordmark = (site, classes = 'wordmark') =>
  `<a class="${classes}" href="/" aria-label="${esc(site.name)} — home">` +
  `<span class="wordmark__feral">${esc(site.nameParts.primary)}</span>` +
  `<span class="wordmark__femme">${esc(site.nameParts.secondary)}</span></a>`;

function masthead(site, current) {
  const links = site.nav
    .map((item) => {
      const active = current && (current === item.href || current.startsWith(item.href) && item.href !== '/');
      return `<a href="${esc(item.href)}"${active ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`;
    })
    .join('');

  return `<header class="masthead">
  <div class="wrap masthead__inner">
    ${wordmark(site)}
    <nav class="nav" id="nav" aria-label="Primary">${links}</nav>
    <div class="masthead__actions">
      <a class="btn btn--sm" href="/support/">Support</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    </div>
  </div>
</header>`;
}

function colophon(site) {
  const columns = site.footerNav
    .map(
      (col) => `<div>
        <h4>${esc(col.title)}</h4>
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
        <p>${esc(typo(site.descriptor))}. Independent, reader-funded, and free to read.</p>
      </div>
      ${columns}
    </div>
    <div class="colophon__base">
      <span>© ${site.established}–${year} ${esc(site.name)}</span>
      <span>${esc(site.tagline)}</span>
      <span><a href="${esc(site.social.instagram)}" rel="me noopener noreferrer" target="_blank">${esc(site.social.instagramHandle)}</a></span>
      <span>${esc(site.motto)}</span>
    </div>
  </div>
</footer>`;
}

function analytics(site) {
  const a = site.analytics ?? {};
  if (!a.provider || !a.src) return '';
  // Cookieless providers only; nothing is emitted unless explicitly configured.
  return `<script defer data-domain="${esc(a.domain)}" src="${esc(a.src)}"></script>`;
}

/**
 * The page shell. Every route renders through here so that metadata,
 * structured data, and the brand chrome stay identical across the site.
 */
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
}) {
  const canonical = new URL(path, site.url).href;
  const fullTitle = path === '/' ? `${site.name} — ${site.descriptor}` : `${title} · ${site.name}`;
  const desc = description || site.description;
  const og = new URL(ogImage, site.url).href;

  const jsonLd = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
    : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
<meta name="theme-color" content="#efd8d8">
<meta name="color-scheme" content="light">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || site.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(og)}">

<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — ${esc(site.newsletter.name)}" href="/feed.xml">

<link rel="preload" href="/assets/fonts/cormorant-garamond-600-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/montserrat-300-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
${jsonLd}
${analytics(site)}
</head>
<body${bodyClass ? ` class="${esc(bodyClass)}"` : ''}>
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
