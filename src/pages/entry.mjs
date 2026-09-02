/**
 * A page per catalogued entry.
 *
 * The decoders were built as single long pages with an anchor per entry. That
 * is the right shape for someone already here and scanning, and the wrong
 * shape for someone arriving from a search engine: an anchor cannot carry its
 * own title, description, or structured data, and cannot be ranked or cited
 * on its own. Somebody searching what a certification actually verifies is the
 * exact reader this platform exists for, and they were landing on a page of a
 * hundred other things.
 *
 * The indexes keep the full filterable list. These pages sit underneath them,
 * one per entry, and each index entry now links to its own.
 *
 * Only datasets whose entries are original work get pages. The library, the
 * sources and the archive are pointers to other people's work; a page each
 * would be thin by construction, which is worth less than no page at all.
 */
import { layout } from '../templates/layout.mjs';
import { label, note, supportBanner } from '../templates/components.mjs';
import { esc, typo, slugify } from '../lib/util.mjs';

/** Trim to a usable meta description without cutting mid-word. */
function clamp(text, max = 155) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max - 1))}…`;
}

const panel = (heading, body, warn = false) =>
  `<div class="panel${warn ? ' panel--warn' : ''}"><h2>${esc(heading)}</h2><p>${typo(body)}</p></div>`;

function breadcrumb(trail) {
  const items = trail
    .map((t, i) =>
      t.url && i < trail.length - 1
        ? `<a href="${esc(t.url)}">${esc(t.name)}</a>`
        : `<span aria-current="page">${esc(t.name)}</span>`
    )
    .join('<span class="crumb__sep" aria-hidden="true">/</span>');
  return `<nav class="crumb" aria-label="Breadcrumb">${items}</nav>`;
}

/**
 * Other entries in the same category. A dead end is a wasted arrival: someone
 * who searched one certification is the likeliest person alive to want the
 * next one.
 */
function related(entries, current, base, nameOf, catOf, max = 6) {
  const peers = entries.filter((e) => e !== current && catOf(e) === catOf(current)).slice(0, max);
  if (!peers.length) return '';

  return `<section class="section--tight" style="padding-top:0;">
    <div class="wrap wrap--narrow">
      ${label(`More in ${catOf(current)}`)}
      <ul class="peer-list">
        ${peers
          .map((e) => `<li><a href="${esc(base)}${esc(slugify(nameOf(e)))}/">${typo(nameOf(e))}</a></li>`)
          .join('')}
      </ul>
    </div>
  </section>`;
}

/**
 * Every dataset that gets pages describes itself here, so build.mjs stays a
 * loop and adding a dataset does not mean adding a renderer.
 */
export const ENTRY_TYPES = [
  {
    id: 'certifications',
    collection: 'schemes',
    base: '/tools/certifications/',
    parent: { name: 'Certification Decoder', url: '/tools/certifications/' },
    nameOf: (s) => s.name,
    catOf: (s) => s.cat,
    describe: (s) => `What ${s.name} actually verifies, what it does not guarantee, and who runs it. ${clamp(s.verifies, 90)}`,
    sub: (s) => `Run by ${s.runby}`,
    panels: (s) => [panel('What it verifies', s.verifies), panel('What it does not guarantee', s.notguarantee, true)],
    src: (s) => s.src,
    schemaType: 'DefinedTerm',
  },
  {
    id: 'greenwashing',
    generic: true, // common words, so guard against proper-noun matches
    collection: 'terms',
    base: '/tools/greenwashing/',
    parent: { name: 'Greenwashing Decoder', url: '/tools/greenwashing/' },
    nameOf: (t) => t.term,
    catOf: (t) => t.cat,
    describe: (t) => `What “${t.term}” implies on a label, and what it actually means. ${clamp(t.actual, 90)}`,
    panels: (t) => [panel('What brands imply', t.claim, true), panel('What it actually means', t.actual)],
    src: (t) => t.src,
    schemaType: 'DefinedTerm',
  },
  {
    id: 'materials',
    generic: true, // common words, so guard against proper-noun matches
    collection: 'materials',
    base: '/tools/materials/',
    parent: { name: 'Material Decoder', url: '/tools/materials/' },
    nameOf: (m) => m.name,
    catOf: (m) => m.cat,
    describe: (m) => `What ${m.name} is, what it costs an animal, and what it costs the planet. ${clamp(m.what, 90)}`,
    panels: (m) =>
      [
        panel('What it is', m.what),
        panel('Animal welfare', m.welfare, true),
        panel('Environment', m.environment),
        m.alternatives ? panel('Alternatives', m.alternatives) : '',
      ].filter(Boolean),
    src: (m) => m.src,
    schemaType: 'DefinedTerm',
  },
  {
    id: 'record',
    collection: 'findings',
    base: '/tools/record/',
    parent: { name: 'Record Checker', url: '/tools/record/' },
    nameOf: (f) => f.name,
    catOf: (f) => f.sector,
    describe: (f) => `The documented public record for ${f.name}: ${clamp(f.finding, 110)}`,
    panels: (f) => [panel('Documented finding', f.finding)],
    src: (f) => f.src,
    srcUrl: (f) => f.url,
    schemaType: 'Article',
    footer: () =>
      note(
        'What this holds, and what it does not',
        `<p class="mb-0">This holds only what the public record shows — regulatory actions, court rulings, and formal findings, each tied to a named source. Absence of a record is not evidence of good practice. A company may be absent because it has never been investigated.</p>`
      ),
  },
];

export function renderEntry({ site, type, entry, entries, dataset }) {
  const name = type.nameOf(entry);
  const slug = slugify(name);
  const path = `${type.base}${slug}/`;
  const url = type.srcUrl?.(entry);

  const body = `
<section class="section--tight" style="padding-top:clamp(2rem,5vw,3.5rem);">
  <div class="wrap wrap--narrow">
    ${breadcrumb([{ name: 'Tools', url: '/tools/' }, type.parent, { name }])}

    <div class="entry__head" style="margin-top:1.5rem;">
      <h1 class="entry__name" style="font-size:clamp(2rem,5vw,3rem);">${typo(name)}</h1>
      <span class="tag">${esc(type.catOf(entry))}</span>
    </div>
    ${type.sub ? `<p class="entry__runby">${typo(type.sub(entry))}</p>` : ''}

    <div class="detail-grid" style="margin-top:1.5rem;">
      ${type.panels(entry).join('')}
    </div>

    <p class="src-note">Source — ${typo(type.src(entry))}${
      url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open the record</a>` : ''
    }</p>

    ${type.footer ? `<div style="margin-top:2.5rem;">${type.footer()}</div>` : ''}

    <p style="margin-top:2.5rem;"><a class="arrow" href="${esc(type.parent.url)}">All ${
      entries.length
    } in the ${esc(type.parent.name)}</a></p>
  </div>
</section>

${related(entries, entry, type.base, type.nameOf, type.catOf)}

${supportBanner(site)}
`;

  const schema =
    type.schemaType === 'DefinedTerm'
      ? {
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          name,
          description: clamp(type.describe(entry), 300),
          inDefinedTermSet: { '@type': 'DefinedTermSet', name: type.parent.name, url: new URL(type.parent.url, site.url).href },
          url: new URL(path, site.url).href,
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: `${name} — the documented record`,
          description: clamp(type.describe(entry), 300),
          url: new URL(path, site.url).href,
          publisher: { '@type': 'Organization', name: site.name, url: site.url },
          isBasedOn: url || undefined,
          dateModified: dataset.reviewed,
        };

  return layout({
    site,
    title: name,
    description: clamp(type.describe(entry)),
    path,
    body,
    schema,
  });
}
