import { layout } from '../templates/layout.mjs';
import { label, sectionHead, note, newsletterForm } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

/**
 * Build the URL that opens PayPal with an amount already filled in.
 *
 * The two shapes PayPal hands out take the amount completely differently, and
 * appending to the wrong one produces a link that opens a blank donation form:
 *
 *   paypal.me/handle          → /25USD as a path segment
 *   paypal.com/donate?...     → &amount=25&currency_code=USD as query params
 *
 * Anything else is treated as a query-string processor, which is the safer of
 * the two guesses: a stray parameter is ignored, a stray path segment 404s.
 */
function donateUrl(d, amount) {
  const link = d.link.replace(/\/+$/, '');
  const currency = d.currency || 'USD';

  if (/(^|\/\/)(www\.)?paypal\.me\//i.test(link)) return `${link}/${amount}${currency}`;

  const url = new URL(link);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('currency_code', currency);
  return url.href;
}

/**
 * The donation link is configured in content/site.json. Where it is not set,
 * the button degrades to an enquiry mailto: rather than shipping a dead
 * control — the page is publishable before the processor is connected.
 */
function donateAction(site, amount, featured) {
  const d = site.donate;
  const cls = `btn${featured ? '' : ' btn--ghost'}`;
  if (d.link) {
    return `<a class="${cls}" href="${esc(donateUrl(d, amount))}" rel="noopener" target="_blank">Give ${esc(
      d.currencySymbol
    )}${amount}</a>`;
  }
  const subject = encodeURIComponent(`Donation — ${d.currencySymbol}${amount}`);
  return `<a class="${cls}" href="mailto:${esc(site.email)}?subject=${subject}">Give ${esc(d.currencySymbol)}${amount}</a>`;
}

export function renderDonate({ site }) {
  const d = site.donate;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Self-funded', title: d.headline, lede: d.summary, wide: true, level: 1 })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="amount-grid">
      ${d.amounts
        .map(
          (a) => `<div class="amount${a.featured ? ' amount--featured' : ''} tilt reveal">
            <div class="amount__value display">${esc(d.currencySymbol)}${a.value}</div>
            <p class="amount__label">${typo(a.label)}</p>
            <p class="amount__detail">${typo(a.detail)}</p>
            ${donateAction(site, a.value, a.featured)}
          </div>`
        )
        .join('')}
    </div>

    <p class="src-note" style="margin-top:1.5rem;">
      ${esc(d.processor)} · ${esc(d.processorNote)} Conversions shown elsewhere are approximate; your bank sets the final rate.
    </p>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    <div class="grid grid--2" style="gap:4rem;align-items:start;">
      <div>
        ${sectionHead({ eyebrow: 'Where it goes', title: 'What a donation pays for' })}
        <div class="rows" style="border-top-color:var(--rule-strong);">
          ${[
            ['Source access', 'Database subscriptions, archive access, and the paywalled reporting that the field notes are built on.'],
            ['Research time', 'Reading investigations in full, checking them against the primary filings, and writing the note that follows.'],
            ['Open publication', 'Everything stays free to read. No paywall, no advertising, no affiliate links, no sponsored placements.'],
            ['The tools', 'Maintaining the decoders as standards change — a reference that is not maintained becomes actively misleading.'],
          ]
            .map(
              ([t, x]) => `<div class="row row--label-16">
                <div class="row__index">${esc(t)}</div>
                <p class="row__summary">${typo(x)}</p>
              </div>`
            )
            .join('')}
        </div>

        <div style="margin-top:2rem;">
          ${label('Cause tags')}
          <div class="tags">
            ${d.causes.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}
          </div>
          <p class="src-note">A donation can be tagged to the strand of research you most want funded.</p>
        </div>
      </div>

      <div>
        ${note(
          'What we will not take',
          `<p>No advertisers. No industry sponsorship. No affiliate revenue. No paid placements, and no funding from any company whose conduct this platform documents.</p>
           <p class="mb-0">That is the whole reason the platform can name companies in the <a href="/tools/record/">Record Checker</a> without hesitating.</p>`
        )}

        <div style="margin-top:2rem;">
          ${label(site.newsletter.name)}
          <p style="font-size:.875rem;line-height:1.7;color:var(--ink-muted);">Not able to give? Reading and sharing the work is genuinely useful — everything here is free for exactly that reason.</p>
          ${newsletterForm(site)}
        </div>
      </div>
    </div>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Donate',
    description: d.summary,
    path: '/donate/',
    body,
  });
}

export function renderBriefing({ site }) {
  const n = site.newsletter;

  const body = `
<section class="section" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap wrap--narrow center">
    ${label(`${n.cadence} briefing`)}
    <h1 class="display" style="font-size:clamp(2.6rem,7vw,4.5rem);text-transform:uppercase;">${esc(n.name)}</h1>
    <p class="lede">${typo(n.summary)}</p>
    <div style="display:flex;justify-content:center;margin-top:2.5rem;">
      ${newsletterForm(site, { note: false })}
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap wrap--narrow">
    ${sectionHead({ eyebrow: 'What is in it', title: 'Four sections, every issue' })}
    <div class="rows" style="border-top-color:var(--rule-strong);">
      ${[
        ['The field notes', 'What was published since the last issue, and the reporting each note was built from.'],
        ['What moved', 'Regulatory actions, rulings, and formal findings across the ten industries — with the source.'],
        ['Read, watch, act', 'One investigation worth your time, and one organisation worth your attention.'],
        ['One correction', 'A widely repeated claim about these industries that is wrong, and what the record actually says.'],
      ]
        .map(
          ([t, x]) => `<div class="row row--label-14">
            <div class="row__index">${esc(t)}</div>
            <p class="row__summary">${typo(x)}</p>
          </div>`
        )
        .join('')}
    </div>

    <div style="margin-top:3rem;">
      ${note(
        'What it is not',
        `<p class="mb-0">No promotions, no affiliate links, no product recommendations, no sponsored placements. Your address is used to send this and nothing else, is shared with no one, and is deleted on unsubscribe. See <a href="/privacy/">Privacy &amp; POPIA</a>.</p>`
      )}
    </div>
  </div>
</section>
`;

  return layout({ site, title: n.name, description: n.summary, path: '/briefing/', body });
}
