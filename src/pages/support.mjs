import { layout } from '../templates/layout.mjs';
import { label, sectionHead, note, newsletterForm } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

/**
 * Payment links are configured in content/site.json. Where a link is not yet
 * set, the button degrades to an enquiry mailto: rather than shipping a dead
 * control — the page is publishable before the payment provider is connected.
 */
function tierAction(tier, site) {
  if (tier.link) {
    return `<a class="btn${tier.featured ? '' : ' btn--ghost'}" href="${esc(tier.link)}" rel="noopener">Support at ${esc(
      site.support.currencySymbol
    )}${tier.price}</a>`;
  }
  const subject = encodeURIComponent(`Supporting membership — ${tier.name}`);
  return `<a class="btn${tier.featured ? '' : ' btn--ghost'}" href="mailto:${esc(site.email)}?subject=${subject}">Enquire</a>`;
}

export function renderSupport({ site }) {
  const s = site.support;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Support',
      title: s.headline,
      lede: s.summary,
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="grid grid--3">
      ${s.tiers
        .map(
          (t) => `<div class="tier${t.featured ? ' tier--featured' : ''}">
            <div class="tier__flag">${t.featured ? label('Most chosen') : ''}</div>
            <h3 class="tier__name">${esc(t.name)}</h3>
            <div class="tier__price">${esc(s.currencySymbol)}${t.price}<small>per ${esc(t.period)}</small></div>
            <p class="tier__summary">${typo(t.summary)}</p>
            <ul>${t.benefits.map((b) => `<li>${typo(b)}</li>`).join('')}</ul>
            ${tierAction(t, site)}
          </div>`
        )
        .join('')}
    </div>

    <div style="margin-top:2.5rem;">
      <div class="panel" style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;justify-content:space-between;">
        <div style="max-width:52ch;">
          <h4>${esc(s.oneOff.label)}</h4>
          <p style="margin:0;font-size:0.875rem;line-height:1.7;color:var(--ink-secondary);">${typo(s.oneOff.summary)}</p>
        </div>
        ${
          s.oneOff.link
            ? `<a class="btn btn--quiet" href="${esc(s.oneOff.link)}" rel="noopener">Contribute</a>`
            : `<a class="btn btn--quiet" href="mailto:${esc(site.email)}?subject=${encodeURIComponent(
                'One-off contribution'
              )}">Enquire</a>`
        }
      </div>
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    <div class="grid grid--2" style="gap:4rem;align-items:start;">
      <div>
        ${sectionHead({
          eyebrow: 'What it pays for',
          title: 'Where the money goes',
        })}
        <div class="rows" style="border-top-color:var(--rule);">
          ${[
            [
              'Primary-source research',
              'Reading regulations, test guidelines, and validation reports in full, and writing entries that cite them accurately. This is most of the work and it is slow by design.',
            ],
            [
              'Dataset maintenance',
              'The regulation tracker, methods index, and certification guide are reviewed on declared cycles. Law changes; a reference that is not maintained becomes actively misleading.',
            ],
            [
              'Keeping the archive open',
              'No paywall, no advertising, no affiliate links. Every entry is free to read for anyone, funded by the people who can pay for it.',
            ],
            [
              'Curriculum and teaching materials',
              'Slide decks, lesson plans, and source packs for educators, licensed for classroom use and free at the point of reading.',
            ],
          ]
            .map(
              ([t, d]) => `<div class="row row--label-16">
                <div class="row__index">${esc(t)}</div>
                <p class="row__summary">${typo(d)}</p>
              </div>`
            )
            .join('')}
        </div>
      </div>
      <div>
        ${note(
          'What we will not take',
          `<p>No funding from cosmetics manufacturers, retailers, ingredient suppliers, contract research organisations, or certification bodies. No advertising. No affiliate revenue.</p>
           <p class="mb-0">This is why we do not recommend products: a recommendation is worth more when it cannot be monetised. The full position is at <a href="/funding/">Funding &amp; Independence</a>.</p>`
        )}

        <div style="margin-top:2rem;">
          ${label(site.newsletter.name)}
          <p style="font-size:0.875rem;line-height:1.7;color:var(--ink-secondary);">Not able to contribute? Reading and sharing the work is genuinely useful, and the archive is free for that reason.</p>
          ${newsletterForm(site)}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section on-crimson">
  <div class="wrap center">
    ${label('Institutions')}
    <h2 style="max-width:20ch;margin-inline:auto;">Teaching this, or funding research into it?</h2>
    <p class="lede" style="color:rgba(253,252,252,0.85);max-width:60ch;margin-inline:auto;">Classroom and institutional licences include editable slide decks, lesson plans, dataset exports, and live sessions — and they are what keeps the archive free for everyone else.</p>
    <p style="margin-top:2rem;"><a class="btn btn--quiet" href="/licensing/">Educational licensing</a></p>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Support the Work',
    description:
      'FERAL FEMME takes no money from cosmetics manufacturers, retailers, or certification bodies, and carries no advertising. It is funded by its readers.',
    path: '/support/',
    body,
  });
}

export function renderLicensing({ site }) {
  const l = site.licensing;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'For institutions',
      title: 'Educational Licensing',
      lede: l.summary,
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="grid grid--3">
      ${l.packages
        .map(
          (p) => `<div class="tier">
            <h3 class="tier__name">${esc(p.name)}</h3>
            <div class="tier__price" style="font-size:2rem;">${esc(p.price)}</div>
            <p class="tier__summary">${esc(p.audience)}</p>
            <ul>${p.includes.map((i) => `<li>${typo(i)}</li>`).join('')}</ul>
            <a class="btn btn--ghost" href="mailto:${esc(site.educationEmail)}?subject=${encodeURIComponent(
              `Licensing enquiry — ${p.name}`
            )}">Enquire</a>
          </div>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    <div class="grid grid--2" style="gap:4rem;align-items:start;">
      <div>
        ${sectionHead({ eyebrow: 'Terms', title: 'What a licence does and does not buy' })}
        <div class="prose" style="font-size:0.9375rem;">
          <p>A licence buys materials and support. It does not buy influence over content.</p>
          <p>Licensees receive editable slide decks, lesson plans with learning outcomes and assessment prompts, printable source packs, and — at institutional level — dataset exports and live sessions.</p>
          <p>Licensees do not receive any right of review, approval, or veto over what this platform publishes, and no licence is conditional on any editorial outcome. Where a licensee is also a subject of our research, that fact is disclosed on the relevant entry.</p>
          <p class="mb-0">Written content remains available free under <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a> for non-commercial teaching with attribution. A licence is required for commercial use, and is what funds the free tier.</p>
        </div>
      </div>
      <div>
        ${note(
          'Commissioned research',
          `<p>We undertake scoped literature and regulation reviews for policy bodies, funders, and newsrooms.</p>
           <p>The commissioning party is named on publication. The agreement gives the funder no right of approval over findings. Results are published openly unless the commission is genuinely commercially confidential — in which case we disclose that a confidential commission was undertaken and name the sector.</p>
           <p class="mb-0">We do not accept commissions from cosmetics manufacturers, retailers, ingredient suppliers, contract research organisations, or certification bodies, on any terms.</p>`
        )}
        <p style="margin-top:2rem;">
          <a class="btn" href="mailto:${esc(site.educationEmail)}?subject=${encodeURIComponent('Commissioned research enquiry')}">Discuss a commission</a>
        </p>
      </div>
    </div>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Educational Licensing',
    description:
      'Classroom, institutional, and commissioned research licences for the FERAL FEMME curriculum and datasets. Licensees receive materials, never editorial influence.',
    path: '/licensing/',
    body,
  });
}

export function renderDispatch({ site }) {
  const n = site.newsletter;

  const body = `
<section class="section" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap wrap--narrow center">
    ${label(`${n.cadence} briefing`)}
    <h1>${esc(n.name)}</h1>
    <p class="lede">${typo(n.summary)}</p>
    <div style="display:flex;justify-content:center;margin-top:2.5rem;">
      ${newsletterForm(site)}
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap wrap--narrow">
    ${sectionHead({ eyebrow: 'What is in it', title: 'Four sections, every issue' })}
    <div class="rows" style="border-top-color:var(--rule);">
      ${[
        ['Regulatory movement', 'Instruments enacted, amended, or brought into force since the last issue, with the citation and what changed in substance.'],
        ['Method validation', 'Test guidelines adopted or updated, and methods entering or completing validation at ECVAM, ICCVAM, and JaCVAM.'],
        ['Industry disclosure', 'Policy publications, certification changes, and market entries or exits that bear on a company’s testing position.'],
        ['One correction', 'A widely repeated claim about this subject that is wrong, and what the primary source actually says.'],
      ]
        .map(
          ([t, d]) => `<div class="row row--label-14">
            <div class="row__index">${esc(t)}</div>
            <p class="row__summary">${typo(d)}</p>
          </div>`
        )
        .join('')}
    </div>

    <div style="margin-top:3rem;">
      ${note(
        'What it is not',
        `<p class="mb-0">No promotions, no affiliate links, no product recommendations, no sponsored placements. Your address is used to send this and nothing else, is shared with no one, and is deleted on unsubscribe — every issue carries a one-click unsubscribe link. See <a href="/privacy/">Privacy</a>.</p>`
      )}
    </div>
  </div>
</section>
`;

  return layout({
    site,
    title: n.name,
    description: n.summary,
    path: '/dispatch/',
    body,
  });
}
