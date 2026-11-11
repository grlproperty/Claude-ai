import { layout } from '../templates/layout.mjs';
import {
  label,
  sectionHead,
  entryCard,
  statBand,
  supportBanner,
  ticker,
  shelf,
} from '../templates/components.mjs';
import { scannerPanel, LAB_SCRIPTS } from './lab.mjs';
import { esc, typo, slugify } from '../lib/util.mjs';

const SPELLED = ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function renderHome({ site, notes, data }) {
  const recent = notes.slice(0, 3);
  const shots = data.instagram?.posts ?? [];

  // The hero plate. A fixed frame rather than the newest post: the hero is the
  // brand's face and should not change shape every time the pull runs. The
  // photograph sits under the wordmark rather than beside it, so the drawn
  // cage and the photographed one read as the same object seen twice.
  //
  // A file in content/images/ wins if there is one — see the README there. The
  // pulled frames carry a burnt-in wordmark, which is a duplicate on a page
  // already headed FERAL FEMME, so the override exists to hold a clean
  // original. Falls back to the pull, so removing the file undoes it.
  const pulled = shots.find((p) => p.shortcode === 'DYfHUz6O8e3') ?? null;
  const hero = data.hero
    ? { ...data.hero, title: pulled?.title ?? site.tagline }
    : pulled;

  // Counted, not written down. The standfirst under this heading read "Nine
  // interactive tools" against six cards for as long as the section has
  // existed — an unsourced number on the front page of a publication whose
  // whole argument is that a claim should be checkable against its source.
  const tools = [
    ['Spot the Greenwash', '/tools/spot/', 'Ten claims off the kind of packaging you buy every week. Which ones tell you anything? Two minutes, with a score card to share.'],
    ['Message Builder', '/tools/ask/', 'A short, polite message asking a brand what evidence is behind a claim. Written for you, sent from your own email.'],
    ['Claim Checker', '/tools/claims/', `For brands. Paste your own copy and see which of ${data.greenwashing.terms.length} terms it uses, and what to have ready for each.`],
    ['Certification Decoder', '/tools/certifications/', `${data.certifications.schemes.length} schemes. Who runs a label, what it verifies, and what it does not.`],
    ['Greenwashing Decoder', '/tools/greenwashing/', `${data.greenwashing.terms.length} terms. What brands claim, and what the words actually mean.`],
    ['Material Decoder', '/tools/materials/', `${data.materials.materials.length} materials. What a fibre or leather is, and what it costs an animal or the planet.`],
    // The reading list sat in this row as a sixth card. It is a shelf, not an
    // instrument, and it was holding the place of the one tool on the site a
    // reader can put their own shopping through.
    ['Ingredient Decoder', '/tools/ingredients/', `${data.ingredients.ingredients.length} substances. Paste an ingredients list and read back what each one is, and whether an animal paid for it.`],
    ['Record Checker', '/tools/record/', `${data.record.findings.length} documented findings — regulatory actions, rulings, and formal findings, each with a named source.`],
    ['Where to Act', '/tools/act/', `${data.act.organisations.length} established organisations, filterable by the subject they work on.`],
  ];

  /*
   * Three things a stranger did not know, at the top of the page.
   *
   * The front page used to open on what the publication is and how it works,
   * which is what a reader wants once they have a reason to care and not
   * before. These are that reason. Each one is the first sentence of an entry
   * this site already holds, with its source, and links to it — so nothing is
   * said here that is not said, and cited, on the page it leads to. If an
   * entry is ever renamed or removed its fact simply drops out.
   */
  const sentence = (text, n = 1, from = 0) =>
    String(text ?? '')
      .split(/(?<=[.!?])\s+/)
      .slice(from, from + n)
      .join(' ');
  const natural = data.greenwashing.terms.find((t) => t.term === 'Natural');
  const bunny = data.certifications.schemes.find((x) => x.name === 'Leaping Bunny');
  const garment = notes.find((n) => /garment-worker/.test(n.url));
  const facts = [
    natural && {
      kicker: 'On the front of the pack',
      text: sentence(natural.actual),
      href: `/tools/greenwashing/${slugify(natural.term)}/`,
      more: 'What “natural” means',
    },
    bunny && {
      kicker: 'Beside the logo',
      text: sentence(bunny.notguarantee, 1, 1),
      href: `/tools/certifications/${slugify(bunny.name)}/`,
      more: 'What the mark covers',
    },
    garment && {
      kicker: 'Behind the price',
      text: sentence(garment.summary, 2),
      href: garment.url,
      more: 'Read the investigation',
    },
  ].filter((f) => f && f.text);

  const body = `
<section class="hero">
  <div class="hero__cage" data-cage aria-hidden="true"></div>
  <div class="wrap hero__inner${hero ? ' hero__inner--plated' : ''}">
   <div class="hero__type">
    <div class="hero__meta">
      <span class="is-crimson">${esc(site.descriptor)}</span>
      <span>Est. ${site.established}</span>
      <span>${esc(site.funding)}</span>
    </div>

    <h1 class="hero__title">
      <span class="is-crimson">Feral</span><br>Femme<span class="stop">.</span>
    </h1>

    <p class="hero__claim">${typo(site.tagline).replace(
      'Same refusal to consent.',
      '<span class="mark">Same refusal to consent.</span>'
    )}</p>
   </div>

    <!-- The cage's cell. Empty on purpose: it is a hole in the layout that the
         renderer measures and hangs the object into, which is what keeps the
         two from ever being written down as separate sets of numbers. It sits
         beside the wordmark at every width, which is why the paragraph and the
         buttons are a block of their own below rather than part of the column
         the cage stands next to — at 393px a column narrow enough to leave
         room for the cage is too narrow to set running text in. -->
    <div class="hero__slot" aria-hidden="true"></div>

   <div class="hero__say">
    <p class="hero__body">${typo(site.positioning.hook)}</p>

    <!-- The first button does something rather than going somewhere: it puts
         the reader in the scanner, which is on this page. The href is where it
         leads if the script has not run. -->
    <div class="hero__actions">
      <a class="btn" href="/tools/scan/" data-scan-jump>Check a label</a>
      <a class="btn btn--ghost" href="/field-notes/">Read the investigations</a>
    </div>
   </div>

    ${
      hero
        ? `<figure class="hero__plate reveal reveal--wipe${hero.cutout ? ' hero__plate--cutout' : ''}">
      <span class="hero__frame"><img data-drift src="${esc(hero.image)}" srcset="${esc(hero.thumb)} 640w, ${esc(hero.image)} 1200w" sizes="(min-width: 60rem) 42vw, (min-width: 34rem) 32rem, 100vw" alt="${esc(
            hero.title
          )}" width="${hero.width ?? 2096}" height="${hero.height ?? 2795}" fetchpriority="high" decoding="async"></span>
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
      ${
        // The photograph is taller than four numbers, and the column beside it
        // ran out two-fifths of the way down. What belongs in the rest is the
        // thing the plate is one of: the series. The newest three, so the top
        // of the front page moves whenever the archive does. One link, named
        // by its text, so a screen reader is not read three captions in a row
        // on the way to the same page.
        shots.length >= 3
          ? `<a class="hero__latest reveal" href="/archive/">
        <span class="label">Newest in the archive</span>
        <span class="hero__latest-row">
          ${shots
            .slice(0, 3)
            .map(
              (post) =>
                `<span class="hero__latest-shot"><img src="${esc(post.thumb)}" alt="" loading="lazy" decoding="async"${
                  post.width && post.height ? ` width="${post.width}" height="${post.height}"` : ''
                }></span>`
            )
            .join('')}
        </span>
        <span class="arrow">All ${shots.length} frames</span>
      </a>`
          : ''
      }
    </div>
  </div>
</section>

${ticker(
  data.industries.industries.map((ind) => ({
    label: `${ind.number} ${ind.name}`,
    href: `/industries/#${slugify(ind.name)}`,
  })),
  { ariaLabel: 'The ten industries this publication documents' }
)}

${
  facts.length
    ? `<section class="section on-dark" id="facts">
  <div class="wrap">
    ${label('Before you read anything else')}
    <h2 class="facts__title">${typo(`${SPELLED[facts.length]} things the label will not tell you`)}</h2>
    <div class="facts">
      ${facts
        .map(
          (f) => `<a class="fact reveal" href="${esc(f.href)}">
        <span class="fact__k">${esc(f.kicker)}</span>
        <span class="fact__t">${typo(f.text)}</span>
        <span class="arrow">${esc(f.more)}</span>
      </a>`
        )
        .join('')}
    </div>
  </div>
</section>`
    : ''
}

<section class="section on-white" id="scan">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Try it now',
      title: 'What does the label actually say?',
      lede: 'Type, paste or photograph anything printed on a product. This reads it back: what comes from an animal, which words are doing the selling, and what each certification on it does not cover.',
      stamp: 'Free \u00b7 nothing leaves this page',
    })}
    ${scannerPanel({ mode: 'reader', h: 'h3' })}
    <p style="margin-top:var(--s5);"><a class="arrow" href="/tools/scan/">The scanner on its own page, and what it reads from</a></p>
  </div>
</section>

<section class="section" id="field-notes">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'The investigations',
      title: 'Field notes',
      lede: 'Public-record investigations, read in full and reframed with the original publisher credited.',
      stamp: `${notes.length} filed \u00b7 newest first`,
    })}
    <div class="grid grid--3">
      ${recent.map((e) => entryCard(e)).join('')}
    </div>
    <p style="margin-top:3rem;"><a class="arrow" href="/field-notes/">All ${notes.length} field notes</a></p>
  </div>
</section>

<section class="section on-pale" id="tools">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Free tools',
      title: 'Awareness, made usable',
      lede: `The scanner above is one of ${(SPELLED[tools.length + 1] ?? String(tools.length + 1)).toLowerCase()}. These are the others — three more to put something through, and six files to look things up in. All free: no account, no sign-up, no payment.`,
      stamp: `${tools.length + 1} tools \u00b7 no account, no payment`,
    })}
    <div class="grid grid--3">
      ${tools
        .map(
          ([name, href, text]) => `<article class="card card--linked tilt reveal" data-pointer-label="Open">
            <h3><a class="stretch" href="${esc(href)}">${esc(name)}</a></h3>
            <p>${typo(text)}</p>
            <div class="card__foot"><span class="arrow">Open</span></div>
          </article>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section" id="industries">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'The remit',
      title: 'Industries we document',
      lede: data.industries.summary,
      stamp: `${data.industries.industries.length} industries · open file`,
      split: true,
    })}
    <div class="grid grid--4 grid--ten">
      ${data.industries.industries
        .map(
          (ind) => `<a class="plate tilt reveal" data-pointer-label="Open file" href="/industries/#${esc(slugify(ind.name))}" style="text-decoration:none;color:inherit;display:block;">
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

<section class="section on-dark" id="about">
  <div class="wrap">
    <div class="grid grid--2 grid--held" style="gap:4rem;align-items:start;">
      <div class="reveal grid__hold">
        ${label('The subject')}
        <h2>${typo('Two subjects. One machine.')}</h2>
        <p class="lede">${typo(site.positioning.lede)}</p>
        <p style="color:var(--on-dark);">${typo(site.positioning.body)}</p>
        <p class="mb-0" style="margin-top:2rem;">
          <a class="btn btn--quiet" href="/about/">${esc(site.standard)}</a>
        </p>
      </div>
      <div class="reveal">
        ${label('Why you can trust this')}
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

${shelf(site, data.covers, { tier: 'all', limit: 6 })}

${
  shots.length
    ? `<section class="section" id="archive">
  <div class="wrap">
    ${sectionHead({
      eyebrow: `The visual essays · ${esc(data.instagram.handle)}`,
      title: 'One case per frame',
      lede: 'Each image in the series carries a single documented case. The archive files them in full, with the caption and the note behind it.',
      wide: true,
      split: true,
      // The strip under this heading is the frames, so the stamp counts the
      // frames. It used to carry the number of written entries, a different
      // collection that happens to live on the same page.
      stamp: `${shots.length} frames`,
    })}
    <div class="rail" data-rail>
      ${shots
        .slice(0, 10)
        .map(
          (post) => `<figure class="shot reveal">
            <a data-pointer-label="View" href="${esc(post.permalink)}" target="_blank" rel="noopener noreferrer">
              <img src="${esc(post.thumb)}" alt="${esc(post.title)}" loading="lazy" decoding="async"${
                post.width && post.height ? ` width="${post.width}" height="${post.height}"` : ''
              }>
            </a>
            <figcaption>${typo(post.title)}</figcaption>
          </figure>`
        )
        .join('')}
    </div>
    <p style="margin-top:3rem;"><a class="arrow" href="/archive/">The full archive — ${shots.length} frames, ${
      data.archive.entries.length
    } written entries</a></p>
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
    // No address and no country. This is an itinerant publication with no
    // premises, and structured data asserting a location it does not have is
    // exactly the unverifiable detail the site exists to object to.
  };

  return layout({
    site,
    title: site.name,
    description: site.description,
    path: '/',
    body,
    schema,
    // The mesh first: cage.js reads it at module scope, and a deferred script
    // that arrives second would find nothing there. Both are deferred, and
    // deferred scripts run in document order, so ordering them here is enough.
    scripts: ['/assets/js/cage-mesh.js', '/assets/js/cage.js', ...LAB_SCRIPTS],
  });
}
