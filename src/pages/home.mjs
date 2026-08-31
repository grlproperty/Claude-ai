import { layout } from '../templates/layout.mjs';
import {
  label,
  sectionHead,
  entryCard,
  featureCard,
  pillars,
  statBand,
  supportBanner,
} from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

export function renderHome({ site, research, guides, regulation, methods }) {
  const featured = research.find((e) => e.featured) ?? research[0];
  const recent = research.filter((e) => e !== featured).slice(0, 3);

  // These figures are derived from the datasets rather than written by hand, so
  // the home page cannot drift out of step with the tracker it summarises.
  const tracked = regulation.jurisdictions.length;
  const prohibited = regulation.jurisdictions.filter((j) => j.status === 'prohibited').length;
  const partial = regulation.jurisdictions.filter((j) => j.status === 'partial').length;

  // Individual OECD Test Guideline numbers, counted once each. An entry may
  // name several ("OECD TG 476 / 490"), so the codes are split before counting.
  const guidelineCount = new Set(
    methods.endpoints
      .flatMap((e) => e.guidelines.map((g) => g.code))
      .filter((code) => code.startsWith('OECD'))
      .flatMap((code) => code.replace(/^OECD\s*TG\s*/, '').split(/\s*\/\s*/))
      .filter((n) => /^\d/.test(n))
  ).size;

  const unresolved = methods.endpoints.filter((e) => /^(Partial|The hardest)/.test(e.status)).length;

  const body = `
<section class="hero">
  <div class="wrap hero__grid">
    <div>
      ${label(site.descriptor)}
      <h1 class="hero__title"><span class="is-crimson">Educate.</span><br>Expose.<br>Empower.</h1>
      <div class="hero__rule"></div>
      <p class="lede">${typo(
        'The information needed to make an informed ethical choice about cosmetics is public, and almost entirely unread. This platform reads the regulation, the test guidelines, and the literature — and writes down what they say.'
      )}</p>
      <div class="hero__actions">
        <a class="btn" href="/learn/">Start the curriculum</a>
        <a class="btn btn--ghost" href="/regulation/">Regulation tracker</a>
      </div>
    </div>
    <figure class="hero__figure" style="margin:0;">
      <img src="/assets/img/editorial-portrait-1200.webp"
           alt="Campaign photograph: a figure with animal ears, head enclosed in a wire cage, lit by hard directional light."
           width="1024" height="1280" fetchpriority="high" decoding="async">
      <figcaption class="hero__caption">
        <span>Campaign — primary visual</span>
      </figcaption>
    </figure>
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${statBand([
      {
        figure: `${tracked}`,
        label: 'Jurisdictions tracked',
        note: `${prohibited} prohibit testing and marketing outright; ${partial} carry material exemptions. Each entry links to the instrument itself.`,
      },
      {
        figure: `${guidelineCount}`,
        label: 'OECD test guidelines',
        note: 'Individual adopted guidelines named in our methods index — internationally accepted replacements that are in force, not in prospect.',
      },
      {
        figure: `${unresolved}`,
        label: 'Endpoints unresolved',
        note: 'Repeated-dose systemic toxicity and full reproductive toxicity have no single validated replacement. We say so, because the argument is stronger when it is accurate.',
      },
    ])}
  </div>
</section>

<section class="section on-dark">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Brand foundation',
      title: 'Three pillars',
      lede: 'Intelligent, restrained, and structured. This platform does not sell products; it exists for education and ethical clarity.',
      wide: true,
    })}
    ${pillars(site.pillars)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Latest research', title: 'From the archive' })}
    ${featured ? featureCard(featured) : ''}
    <div class="grid grid--3" style="margin-top:2rem;">
      ${recent.map((e) => entryCard(e)).join('')}
    </div>
    <p style="margin-top:3rem;"><a class="arrow" href="/research/">All research entries</a></p>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    <div class="grid grid--2" style="align-items:start;gap:4rem;">
      <div>
        ${sectionHead({
          eyebrow: 'The curriculum',
          title: 'Five modules, ninety minutes',
          lede: 'A structured sequence taking you from the architecture of cosmetics regulation to a repeatable method for assessing any claim on any label.',
        })}
        <p class="mb-0"><a class="btn" href="/learn/">Begin module one</a></p>
      </div>
      <div class="rows" style="border-top-color:var(--rule);">
        ${guides
          .map(
            (m, i) => `<div class="row row--numbered">
              <div class="row__index">${String(i + 1).padStart(2, '0')}</div>
              <div>
                <h3 class="row__title" style="font-size:1.15rem;"><a href="${esc(m.url)}">${typo(m.title)}</a></h3>
              </div>
              <div class="row__aside">${m.readingTime} min</div>
            </div>`
          )
          .join('')}
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Reference',
      title: 'Maintained datasets',
      lede: 'Four references, each reviewed on a declared cycle. When a dataset passes its review date, the page says so rather than ageing quietly.',
      wide: true,
    })}
    <div class="grid grid--4">
      ${[
        {
          href: '/regulation/',
          title: 'Regulation tracker',
          text: 'Where testing is prohibited, permitted, or conditionally restricted, jurisdiction by jurisdiction, with the timeline of each instrument.',
        },
        {
          href: '/methods/',
          title: 'Non-animal methods',
          text: 'The adopted test guidelines that replace each animal test, endpoint by endpoint — including the endpoints not yet replaced.',
        },
        {
          href: '/certifications/',
          title: 'Certification guide',
          text: 'What Leaping Bunny, PETA, and vegan trademarks each verify, what they do not, and the four questions that separate a claim from a commitment.',
        },
        {
          href: '/glossary/',
          title: 'Glossary',
          text: 'The terminology of this field defined as the instruments define it, because the precision is where the meaning lives.',
        },
      ]
        .map(
          (c) => `<article class="card card--linked">
            <h3><a class="stretch" href="${esc(c.href)}">${esc(c.title)}</a></h3>
            <p>${typo(c.text)}</p>
            <div class="card__foot"><span class="arrow">Open</span></div>
          </article>`
        )
        .join('')}
    </div>
  </div>
</section>

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
    sameAs: [site.social.instagram],
    slogan: site.tagline,
  };

  return layout({
    site,
    title: site.name,
    description: site.description,
    path: '/',
    body,
    schema,
  });
}
