import { layout } from '../templates/layout.mjs';
import { label, sectionHead, supportBanner, note, reviewStamp } from '../templates/components.mjs';
import { esc, typo, slugify, isoDate } from '../lib/util.mjs';

/** Every decoder shares the same shell: search box, category chips, filtered list. */
function decoderShell({ site, data, path, description, categories, items, footer = '', lead = '', eyebrow = 'Free tool', scripts = true }) {
  const body = `${lead}
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow, title: data.title, lede: data.summary, wide: true, level: 1 })}

    <div class="search">
      <label class="visually-hidden" for="q">Search ${esc(data.title.toLowerCase())}</label>
      <input id="q" type="search" placeholder="Search…" autocomplete="off" data-search="${esc(data.slug)}">
      <p class="search__count" data-search-count hidden></p>
    </div>

    ${
      categories.length > 1
        ? `<div class="tracker-controls" data-filter-group="category">
            <button class="chip" type="button" aria-pressed="true" data-filter="all">All ${items.length}</button>
            ${categories
              .map(
                (c) => `<button class="chip" type="button" aria-pressed="false" data-filter="${esc(slugify(c))}">${esc(c)}</button>`
              )
              .join('')}
          </div>`
        : ''
    }

    <div data-filter-list>${items.map((i) => i.html).join('')}</div>
    <p class="empty" data-empty hidden>Nothing matches that search.</p>

    ${footer}
    ${reviewStamp(data)}
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description,
    path,
    body,
    scripts: scripts ? ['/assets/js/filter.js'] : [],
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

const wrapItem = (id, category, text, inner) =>
  `<article class="entry reveal" id="${esc(id)}" data-category="${esc(slugify(category ?? ''))}" data-text="${esc(
    text.toLowerCase()
  )}">${inner}</article>`;

// ------------------------------------------------------------------- index

export function renderToolsIndex({ site, data }) {
  const tools = [
    ['01', 'Certification Decoder', '/tools/certifications/', 'Cross-industry literacy', `Who runs a label, what it verifies, and what it does not. ${data.certifications.schemes.length} schemes.`],
    ['02', 'Greenwashing Decoder', '/tools/greenwashing/', 'Cross-industry literacy', `What brands claim, and what the term actually means. ${data.greenwashing.terms.length} terms.`],
    ['03', 'Material Decoder', '/tools/materials/', 'Fashion & home', `What a fibre, leather, filling, or fabric really is — and what it costs. ${data.materials.materials.length} materials.`],
    ['04', 'Record Checker', '/tools/record/', 'Corporate accountability', `Documented regulatory actions, rulings, and findings, each tied to a named public source. ${data.record.findings.length} entries.`],
    ['05', 'Where to Act', '/tools/act/', 'Take action', `Established organisations working on the two subjects we hold at equal weight. ${data.act.organisations.length} listed.`],
    ['06', 'The Reading List', '/library/', 'Research', `The investigations and databases the field notes are built from. ${data.library.entries.length} entries.`],
  ];

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Free tools',
      title: 'Awareness, made usable',
      lede: 'Reading is the first step; these are the second. Every tool is free — no account, no sign-up, no payment — and every entry names the source it rests on.',
      wide: true,
      level: 1,
    })}

    <div class="grid grid--3">
      ${tools
        .map(
          ([n, name, href, cat, text]) => `<a class="plate tilt reveal" href="${esc(href)}" style="text-decoration:none;color:inherit;display:block;">
            <div class="plate__number display">${n}</div>
            <p class="row__index" style="margin-bottom:.5rem;">${esc(cat)}</p>
            <h2 class="plate__name">${esc(name)}</h2>
            <p style="font-size:.8125rem;line-height:1.65;color:var(--ink-muted);margin:0 0 1.25rem;">${typo(text)}</p>
            <span class="arrow">Open</span>
          </a>`
        )
        .join('')}
    </div>

    <div style="margin-top:3rem;">
      ${note(
        'A limit worth stating',
        `<p class="mb-0">These tools read public records and published standards. They cannot tell you a company is ethical — only what has been documented. The absence of a record is not evidence of good practice; it is frequently evidence that nobody has looked.</p>`
      )}
    </div>
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: 'Free Tools',
    description:
      'Six free reference tools: the Certification, Greenwashing, and Material decoders, the Record Checker, the Where to Act directory, and the Reading List.',
    path: '/tools/',
    body,
  });
}

// -------------------------------------------------------------- decoders

export function renderCertifications({ site, data }) {
  const categories = [...new Set(data.schemes.map((s) => s.cat))].sort();
  const items = data.schemes.map((s) => ({
    html: wrapItem(
      slugify(s.name),
      s.cat,
      `${s.name} ${s.runby} ${s.verifies} ${s.notguarantee}`,
      `<div class="entry__head">
        <h2 class="entry__name">${typo(s.name)}</h2>
        <span class="tag">${esc(s.cat)}</span>
      </div>
      <p class="entry__runby">Run by ${esc(s.runby)}</p>
      <div class="detail-grid">
        <div class="panel"><h4>What it verifies</h4><p>${typo(s.verifies)}</p></div>
        <div class="panel panel--warn"><h4>What it does not guarantee</h4><p>${typo(s.notguarantee)}</p></div>
      </div>
      <p class="src-note">Source — ${typo(s.src)}</p>`
    ),
  }));

  return decoderShell({
    site,
    data,
    path: '/tools/certifications/',
    description:
      'What Leaping Bunny, PETA, Certified Vegan, RSPCA Assured, GOTS, Fairtrade, B Corp, FSC and others actually verify — and what each one does not.',
    categories,
    items,
  });
}

export function renderGreenwashing({ site, data }) {
  const categories = [...new Set(data.terms.map((t) => t.cat))].sort();
  const items = data.terms.map((t) => ({
    html: wrapItem(
      slugify(t.term),
      t.cat,
      `${t.term} ${t.claim} ${t.actual}`,
      `<div class="entry__head">
        <h2 class="entry__name">${typo(t.term)}</h2>
        <span class="tag">${esc(t.cat)}</span>
      </div>
      <div class="detail-grid">
        <div class="panel panel--warn"><h4>What brands imply</h4><p>${typo(t.claim)}</p></div>
        <div class="panel"><h4>What it actually means</h4><p>${typo(t.actual)}</p></div>
      </div>
      ${t.src ? `<p class="src-note">Source — ${typo(t.src)}</p>` : ''}`
    ),
  }));

  return decoderShell({
    site,
    data,
    path: '/tools/greenwashing/',
    description:
      'A reference for the language brands use when they want to suggest virtue without committing to it — what is implied, and what the term actually means.',
    categories,
    items,
  });
}

export function renderMaterials({ site, data }) {
  const categories = [...new Set(data.materials.map((m) => m.cat))].sort();
  const items = data.materials.map((m) => ({
    html: wrapItem(
      slugify(m.name),
      m.cat,
      `${m.name} ${m.what} ${m.welfare} ${m.environment}`,
      `<div class="entry__head">
        <h2 class="entry__name">${typo(m.name)}</h2>
        <span class="tag">${esc(m.cat)}</span>
      </div>
      <p class="entry__runby">${typo(m.what)}</p>
      <div class="detail-grid">
        <div class="panel panel--warn"><h4>Animal welfare</h4><p>${typo(m.welfare)}</p></div>
        <div class="panel"><h4>Environment</h4><p>${typo(m.environment)}</p></div>
      </div>
      ${m.alternatives ? `<div class="panel" style="margin-top:1.5rem;"><h4>Alternatives</h4><p>${typo(m.alternatives)}</p></div>` : ''}
      ${m.src ? `<p class="src-note">Source — ${typo(m.src)}</p>` : ''}`
    ),
  }));

  return decoderShell({
    site,
    data,
    path: '/tools/materials/',
    description:
      'What a fibre, leather, filling, or fabric really is — its animal-welfare position, its environmental cost, and the alternatives that exist.',
    categories,
    items,
  });
}

export function renderRecord({ site, data }) {
  const categories = [...new Set(data.findings.map((f) => f.sector))].sort();
  const items = data.findings.map((f) => ({
    html: wrapItem(
      slugify(f.name),
      f.sector,
      `${f.name} ${f.sector} ${f.finding}`,
      `<div class="entry__head">
        <h2 class="entry__name">${typo(f.name)}</h2>
        <span class="tag">${esc(f.sector)}</span>
      </div>
      <div class="panel"><h4>Documented finding</h4><p>${typo(f.finding)}</p></div>
      <p class="src-note">Source — ${typo(f.src)}${
        f.url ? ` · <a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Open the record</a>` : ''
      }</p>`
    ),
  }));

  const footer = `<div style="margin-top:2.5rem;">${note(
    'What this holds, and what it does not',
    `<p class="mb-0">This holds only what the public record shows — regulatory actions, court rulings, and formal findings, each tied to a named source. Absence of a record is not evidence of good practice. A company may be absent because it has never been investigated.</p>`
  )}</div>`;

  return decoderShell({
    site,
    data,
    path: '/tools/record/',
    description:
      'Documented regulatory actions, court rulings, and formal findings against named companies and sectors, each tied to a public source.',
    categories,
    items,
    footer,
  });
}

export function renderAct({ site, data }) {
  const categories = [...new Set(data.organisations.map((o) => o.cat))].sort();
  const items = data.organisations.map((o) => ({
    html: wrapItem(
      slugify(o.name),
      o.cat,
      `${o.name} ${o.cat} ${o.what}`,
      `<div class="entry__head">
        <h2 class="entry__name">${typo(o.name)}</h2>
        <span class="tag">${esc(o.cat)}</span>
      </div>
      <p style="font-size:.9375rem;line-height:1.7;color:var(--ink-muted);max-width:70ch;">${typo(o.what ?? '')}</p>
      <p style="margin-top:1rem;"><a class="arrow" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Get involved</a></p>`
    ),
  }));

  return decoderShell({
    site,
    data,
    path: '/tools/act/',
    description:
      'A directory of established organisations working on the two subjects FERAL FEMME holds at equal weight — women and animals — across the industries it covers.',
    categories,
    items,
  });
}

// -------------------------------------------------------- library, archive

export function renderLibrary({ site, data }) {
  const categories = [...new Set(data.entries.flatMap((e) => e.tags))].filter(Boolean).sort();
  const items = data.entries.map((e) => ({
    html: `<article class="entry reveal" data-category="${esc(e.tags.map(slugify).join(' '))}" data-text="${esc(
      `${e.title} ${e.publisher} ${e.summary} ${e.tags.join(' ')}`.toLowerCase()
    )}">
      <div class="tags">${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <p class="entry__runby" style="margin-bottom:.5rem;">${typo(e.publisher)}</p>
      <h2 class="entry__name" style="margin-bottom:.75rem;">${typo(e.title)}</h2>
      <p style="font-size:.9375rem;line-height:1.7;color:var(--ink-muted);max-width:74ch;">${typo(e.summary)}</p>
      ${e.url ? `<p style="margin-top:1rem;"><a class="arrow" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Read the original</a></p>` : ''}
    </article>`,
  }));

  return decoderShell({
    site,
    data,
    path: '/library/',
    description:
      'The investigations, databases, and reports FERAL FEMME returns to — every one public, published by a named organisation, and linked to its original.',
    categories,
    items,
    eyebrow: 'Research',
  });
}

/**
 * The visual essay series. Until `npm run instagram` has run there are no
 * images, and each entry renders as a typographic plate; once the pull has
 * happened the same page leads with the gallery.
 */
export function renderArchive({ site, data, instagram }) {
  const items = data.entries.map((e) => ({
    html: `<article class="entry reveal" data-text="${esc(`${e.title} ${e.caption} ${e.lore} ${e.badge}`.toLowerCase())}">
      <div class="entry__head">
        <h2 class="entry__name"><span class="display is-crimson" style="margin-right:.6rem;">${esc(e.index)}</span>${typo(e.title)}</h2>
        ${e.badge ? `<span class="tag">${esc(e.badge)}</span>` : ''}
      </div>
      ${e.caption ? `<p style="font-size:.9375rem;line-height:1.7;color:var(--ink-muted);max-width:74ch;">${typo(e.caption)}</p>` : ''}
      ${e.lore ? `<div class="panel" style="margin-top:1.25rem;"><h4>The note behind it</h4><p>${typo(e.lore)}</p></div>` : ''}
    </article>`,
  }));

  const hasImages = Boolean(instagram?.posts?.length);

  const gallery = hasImages
    ? `<section class="section--tight">
        <div class="wrap">
          ${sectionHead({
            eyebrow: `From Instagram · ${esc(instagram.handle)}`,
            title: 'The visual essays',
            lede: instagram.summary,
            wide: true,
          })}
          <div class="gallery">
            ${instagram.posts
              .map(
                (post) => `<figure class="shot reveal">
                  <a href="${esc(post.permalink)}" target="_blank" rel="noopener noreferrer">
                    <img src="${esc(post.thumb)}" alt="${esc(post.title)}" loading="lazy" decoding="async"${
                      post.width && post.height ? ` width="${post.width}" height="${post.height}"` : ''
                    }>
                  </a>
                  <figcaption>${typo(post.title)}</figcaption>
                </figure>`
              )
              .join('')}
          </div>
        </div>
      </section>`
    : '';

  const imageryNote = hasImages
    ? `<p class="mb-0">The visual essays are AI-directed editorial work by ${esc(site.founder.name)} — conceptual frames, not documentary photography — and that is disclosed wherever they appear.</p>`
    : `<p class="mb-0">${typo(data.note)} The visual essays are AI-directed editorial work by ${esc(site.founder.name)} — conceptual frames, not documentary photography — and that is disclosed wherever they appear.</p>`;

  const footer = `<div style="margin-top:2.5rem;">${note('On the imagery', imageryNote)}</div>`;

  return decoderShell({
    site,
    data,
    path: '/archive/',
    description:
      'The FERAL FEMME digital archive: numbered entries in the visual essay series, each a single documented case filed with its caption and note.',
    categories: [],
    items,
    footer,
    lead: gallery,
    eyebrow: 'The archive',
  });
}

export function renderSources({ site, data }) {
  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Provenance', title: data.title, lede: data.summary, wide: true, level: 1 })}

    <div class="rows">
      ${data.authorities
        .map(
          (a) => `<div class="row row--aside">
            <div><h3 class="row__title" style="font-size:1.15rem;">${typo(a.name)}</h3></div>
            <div class="row__aside"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Visit</a></div>
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
    description: 'The publishers, regulators, and research bodies FERAL FEMME cites.',
    path: '/sources/',
    body,
  });
}
