import { layout } from '../templates/layout.mjs';
import { label, sectionHead, entryCard, statBand, supportBanner } from '../templates/components.mjs';
import { esc, typo, slugify } from '../lib/util.mjs';

export function renderHome({ site, notes, data }) {
  const recent = notes.slice(0, 3);
  const shots = data.instagram?.posts ?? [];

  // The hero plate. A fixed frame rather than the newest post: the hero is the
  // brand's face and should not change shape every time the pull runs. The
  // photograph sits under the wordmark rather than beside it, so the drawn
  // cage and the photographed one read as the same object seen twice.
  const hero = shots.find((p) => p.shortcode === 'DYfHUz6O8e3') ?? null;

  const body = `
<section class="hero">
  <div class="hero__cage" data-cage aria-hidden="true"></div>
  <div class="wrap hero__inner${hero ? ' hero__inner--plated' : ''}">
   <div class="hero__type">
    <div class="hero__meta">
      <span class="is-crimson">${esc(site.descriptor)}</span>
      <span>Est. ${site.established}</span>
      <span>${esc(site.location)}</span>
      <span>${esc(site.funding)}</span>
    </div>

    <h1 class="hero__title">
      <span class="is-crimson">Feral</span><br>Femme<span class="stop">.</span>
    </h1>

    <p class="hero__claim">${typo(site.tagline)}</p>
    <p class="hero__body">${typo(site.positioning.lede)}</p>

    <div class="hero__actions">
      <a class="btn" href="/field-notes/">Read the field notes</a>
      <a class="btn btn--ghost" href="/tools/">Free tools</a>
    </div>
   </div>

    <!-- The cage's cell. Empty on purpose: it is a hole in the layout that the
         renderer measures and hangs the object into, which is what keeps the
         two from ever being written down as separate sets of numbers. -->
    <div class="hero__slot" aria-hidden="true"></div>

    ${
      hero
        ? `<figure class="hero__plate">
      <img src="${esc(hero.image)}" srcset="${esc(hero.thumb)} 640w, ${esc(hero.image)} 1200w" sizes="(min-width: 60rem) 42vw, (min-width: 34rem) 32rem, 100vw" alt="${esc(
            hero.title
          )}" width="${hero.width ?? 2096}" height="${hero.height ?? 2795}" fetchpriority="high" decoding="async">
      <figcaption>
        <span class="is-crimson">${esc(data.instagram.handle)}</span>
        ${typo(hero.title)}
        <span class="hero__plate-note">AI-directed editorial work by ${esc(site.founder.name)}.</span>
      </figcaption>
    </figure>`
        : ''
    }

    <!-- The counts stand beside the photograph rather than in a band of their
         own below it. Moving the plate out of the top row left a column of
         nothing next to it, and what the site has actually got in it is a
         better thing to put there than air. -->
    <div class="hero__stats">
      ${statBand([
        { figure: String(notes.length), label: 'Field notes' },
        { figure: String(data.archive.entries.length), label: 'Archive entries' },
        { figure: String(data.library.entries.length), label: 'Library entries' },
        { figure: String(data.industries.industries.length), label: 'Industries covered' },
      ])}
    </div>
  </div>
</section>

<section class="section on-dark" id="about">
  <div class="wrap">
    <div class="grid grid--2 grid--held" style="gap:4rem;align-items:start;">
      <div class="reveal grid__hold">
        ${label('The subject')}
        <h2>${typo('Two subjects. One machine.')}</h2>
        <p class="lede">${typo(site.positioning.body)}</p>
        <p class="mb-0" style="margin-top:2rem;">
          <a class="btn btn--quiet" href="/about/">${esc(site.standard)}</a>
        </p>
      </div>
      <div class="reveal">
        ${label('How we work')}
        <div class="rows" style="border-top-color:rgba(253,252,252,.2);">
          ${site.method
            .map(
              (m) => `<div class="row row--label-16" style="border-bottom-color:rgba(253,252,252,.12);">
                <div class="row__index" style="color:var(--blush);">${esc(m.title)}</div>
                <div>
                  <p class="row__summary" style="color:var(--on-dark);">${typo(m.body)}</p>
                  <p class="row__index" style="margin-top:.5rem;color:var(--on-dark-dim);">${esc(m.stamp)}</p>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="field-notes">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Latest',
      title: 'Field notes',
      lede: 'Public-record investigations, read in full and reframed with the original publisher credited.',
    })}
    <div class="grid grid--3">
      ${recent.map((e) => entryCard(e)).join('')}
    </div>
    <p style="margin-top:3rem;"><a class="arrow" href="/field-notes/">All ${notes.length} field notes</a></p>
  </div>
</section>

<section class="section on-pale" id="industries">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'The remit',
      title: 'Industries we document',
      lede: data.industries.summary,
    })}
    <div class="grid grid--4">
      ${data.industries.industries
        .map(
          (ind) => `<a class="plate tilt reveal" href="/industries/#${esc(slugify(ind.name))}" style="text-decoration:none;color:inherit;display:block;">
            <div class="plate__number display">${esc(ind.number)}</div>
            <h3 class="plate__name">${typo(ind.name)}</h3>
            <div class="tags">${ind.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            <p style="font-size:.8125rem;line-height:1.65;color:var(--ink-muted);margin:0;">${typo(ind.resource.title)}</p>
          </a>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section" id="tools">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Free tools',
      title: 'Awareness, made usable',
      lede: 'Nine interactive tools that turn reading into practice. All free — no account, no sign-up, no payment.',
    })}
    <div class="grid grid--3">
      ${[
        ['Certification Decoder', '/tools/certifications/', `${data.certifications.schemes.length} schemes. Who runs a label, what it verifies, and what it does not.`],
        ['Greenwashing Decoder', '/tools/greenwashing/', `${data.greenwashing.terms.length} terms. What brands claim, and what the words actually mean.`],
        ['Material Decoder', '/tools/materials/', `${data.materials.materials.length} materials. What a fibre or leather is, and what it costs an animal or the planet.`],
        ['Record Checker', '/tools/record/', `${data.record.findings.length} documented findings — regulatory actions, rulings, and formal findings, each with a named source.`],
        ['Where to Act', '/tools/act/', `${data.act.organisations.length} established organisations, filterable by the subject they work on.`],
        ['The Reading List', '/library/', `${data.library.entries.length} investigations and databases worth your time, each linked to the original.`],
      ]
        .map(
          ([name, href, text]) => `<article class="card card--linked tilt reveal">
            <h3><a class="stretch" href="${esc(href)}">${esc(name)}</a></h3>
            <p>${typo(text)}</p>
            <div class="card__foot"><span class="arrow">Open</span></div>
          </article>`
        )
        .join('')}
    </div>
  </div>
</section>

${
  shots.length
    ? `<section class="section on-pale" id="archive">
  <div class="wrap">
    ${sectionHead({
      eyebrow: `The visual essays · ${esc(data.instagram.handle)}`,
      title: 'One case per frame',
      lede: 'Each image in the series carries a single documented case. The archive files them in full, with the caption and the note behind it.',
      wide: true,
    })}
    <div class="gallery gallery--strip">
      ${shots
        .slice(0, 8)
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
    <p style="margin-top:3rem;"><a class="arrow" href="/archive/">The full archive — ${
      data.archive.entries.length
    } entries</a></p>
  </div>
</section>`
    : ''
}

${supportBanner(site)}
`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    description: site.description,
    foundingDate: String(site.established),
    email: site.email,
    slogan: site.motto,
    sameAs: [site.social.instagram],
    founder: { '@type': 'Person', name: site.founder.name },
    address: { '@type': 'PostalAddress', addressCountry: site.location },
  };

  return layout({
    site,
    title: site.name,
    description: site.description,
    path: '/',
    body,
    schema,
    scripts: ['/assets/js/cage.js'],
  });
}
