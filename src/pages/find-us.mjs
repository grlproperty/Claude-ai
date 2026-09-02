/**
 * Find us: every way to reach the platform, on one page.
 *
 * The social profiles come from site.social.profiles, so adding a platform is
 * a line of configuration rather than an edit here. Nothing is listed that is
 * not real — an empty row for a network with no account is worse than no row,
 * because a reader clicks it before they read it.
 */
import { layout } from '../templates/layout.mjs';
import { label, sectionHead, note, supportBanner, newsletterForm } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

export function renderFindUs({ site }) {
  const profiles = site.social.profiles ?? [];

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Find us',
      title: 'Where to reach us',
      lede: `One inbox, read by the person who writes the site, and ${
        profiles.length === 1 ? 'the account' : 'the accounts'
      } where the work is published.`,
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="grid grid--2" style="gap:4rem;align-items:start;">

      <div>
        ${label('By email')}
        <p class="contact-address"><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
        <div class="rows" style="border-top-color:var(--rule-strong);margin-top:1.5rem;">
          ${[
            ['Source tips', 'Documents, filings, and things that are on the record but not yet reported.'],
            ['Corrections', 'The entry, the passage, and the basis. Published in full at /corrections/.'],
            ['Press and speaking', 'Interviews, panels, and syndication of the field notes.'],
            ['Everything else', 'Partnerships, commissioning, and anything for the founder directly.'],
          ]
            .map(
              ([t, x]) => `<div class="row row--label-16">
                <div class="row__index">${esc(t)}</div>
                <p class="row__summary">${typo(x)}</p>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <div>
        ${label(profiles.length === 1 ? 'On social' : 'On social platforms')}
        <ul class="social-list">
          ${profiles
            .map(
              (p) => `<li>
                <a href="${esc(p.url)}" rel="me noopener noreferrer" target="_blank">
                  <span class="social-list__name">${esc(p.name)}</span>
                  <span class="social-list__handle">${esc(p.handle)}</span>
                </a>
                ${p.what ? `<p class="social-list__what">${typo(p.what)}</p>` : ''}
              </li>`
            )
            .join('')}
        </ul>

        <div style="margin-top:2rem;">
          ${note(
            'Where the work actually lives',
            `<p class="mb-0">Everything published anywhere else is published here first and in full, with its sources. A platform can change what it shows you; this site cannot.</p>`
          )}
        </div>
      </div>

    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap wrap--narrow">
    ${sectionHead({ eyebrow: site.newsletter.name, title: 'Or have it sent to you' })}
    ${newsletterForm(site)}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="rows" style="border-top-color:var(--rule-strong);">
      ${[
        ['Operating from', site.location],
        ['Established', String(site.established)],
        ['Funding', site.funding],
        ['Founder', `${site.founder.name} — ${site.founder.role}`],
      ]
        .map(
          ([t, x]) => `<div class="row row--label-16">
            <div class="row__index">${esc(t)}</div>
            <p class="row__summary">${typo(x)}</p>
          </div>`
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
    email: site.email,
    sameAs: profiles.map((p) => p.url),
    address: { '@type': 'PostalAddress', addressCountry: site.location },
  };

  return layout({
    site,
    title: 'Find us',
    description: `How to reach ${site.name}: one inbox for tips, corrections, press and partnerships, plus every platform the work is published on.`,
    path: '/find-us/',
    body,
    schema,
  });
}
