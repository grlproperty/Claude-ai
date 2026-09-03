/**
 * The two pages that ask for money in exchange for something specific: the
 * PDFs, and the claims-review service.
 *
 * Both read their prices out of site.json rather than carrying them here,
 * because a price appears in three places — the card, the summary line, and
 * the enquiry email's subject — and three copies of a number is three chances
 * to publish the wrong one.
 */
import { layout } from '../templates/layout.mjs';
import { label, sectionHead, note, newsletterForm } from '../templates/components.mjs';
import { esc, typo } from '../lib/util.mjs';

/**
 * R12,000, not R12000 and not R12 000. Prices are read at a glance or not at
 * all, and en-ZA groups with a space, which at display size reads as two
 * separate numbers.
 */
const money = (symbol, value) => `${symbol}${Number(value).toLocaleString('en-US')}`;

/**
 * A buy button, or an enquiry email when no payment link is set yet.
 *
 * `buy` is a PayPal no-code checkout link with the price fixed on PayPal's
 * side, exactly like the donate tiers — which is why the price is never
 * appended to the URL here. Appending one to an NCP link does nothing, and
 * computing a price the checkout will then ignore is how a page ends up
 * advertising one figure and charging another.
 *
 * With no link the button becomes a mailto rather than nothing. Shipping a
 * dead control is worse than an extra step: a button that goes nowhere reads
 * as a broken site, whereas an email reads as a small operation — and it means
 * the page can go live and start earning before the links exist.
 */
function buyAction(site, { name, price, symbol, featured, buy }) {
  const cls = `btn${featured ? '' : ' btn--ghost'}`;
  if (buy) {
    return `<a class="${cls}" href="${esc(buy)}" rel="noopener" target="_blank">Buy &mdash; ${esc(
      money(symbol, price)
    )}</a>`;
  }
  const subject = encodeURIComponent(`${name} — ${money(symbol, price)}`);
  return `<a class="${cls}" href="mailto:${esc(site.email)}?subject=${subject}">Buy by email &mdash; ${esc(
    money(symbol, price)
  )}</a>`;
}

// ------------------------------------------------------------------- /shop/

export function renderShop({ site }) {
  const s = site.shop;
  const sym = s.currencySymbol;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Published',
      title: 'Two things worth paying for',
      lede: 'Everything on this site is free and stays free. These are the two documents that took long enough to assemble that they are sold instead — the reference sections are generated from the same reviewed datasets the free tools run on, so a change to a certification reaches the PDF rather than leaving a stale file in circulation.',
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <div class="grid grid--2" style="gap:2.5rem;align-items:start;">
      ${s.products
        .map(
          (p) => `<article class="product${p.featured ? ' product--featured' : ''} tilt reveal">
        <p class="product__for">${esc(p.for)}</p>
        <h2 class="product__name">${typo(p.name)}</h2>
        <p class="product__meta">${p.pages} pages &middot; PDF &middot; ${esc(p.licence)}</p>
        <p class="product__summary">${typo(p.summary)}</p>
        <ul class="product__contains">
          ${p.contains.map((c) => `<li>${typo(c)}</li>`).join('')}
        </ul>
        <div class="product__buy">
          ${buyAction(site, { name: p.name, price: p.price, symbol: sym, featured: p.featured, buy: p.buy })}
          <p class="product__delivery">${
            p.buy ? `Paid by ${esc(s.processor)}. ` : ''
          }Emailed, not downloaded &mdash; see below.</p>
        </div>
      </article>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'How it arrives', title: 'Bought through PayPal, sent by email' })}
    <p class="prose">${typo(s.delivery)}</p>
    <p class="prose">${typo(s.processorNote)}</p>
    ${note(
      'Why not an instant download',
      `<p class="mb-0">Because at this size a person emailing a file is more reliable than a storefront, and because it means we have somewhere to send the next edition. If your copy has not arrived within a working day, email <a href="mailto:${esc(
        site.email
      )}">${esc(site.email)}</a> with your PayPal receipt and we will fix it.</p>`
    )}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Before you buy', title: 'What these are not' })}
    <p class="prose">Neither is legal advice. Every entry in both documents cites a public source you can open and read yourself, and all of it is drawn from the reviewed datasets behind the <a href="/tools/">free tools</a>. Nothing here certifies compliance or approves a claim.</p>
    <p class="prose">Where an entry says a claim requires substantiation, that is a statement about what the published guidance asks for &mdash; not an opinion on your liability. For that, take advice from a qualified attorney on your specific product and market.</p>
    <p class="prose">If you want the reference material and not the document, it is all on this site, searchable and always current. The PDFs exist because a printed reference you can take into a meeting is a different thing from a website, not because the website is missing anything.</p>
    ${note(
      'If something in them is wrong',
      `<p class="mb-0">Tell us: <a href="mailto:${esc(site.email)}">${esc(
        site.email
      )}</a>. Substantive corrections are published in full at <a href="/corrections/">/corrections/</a>, and buyers of the current edition are told when one lands.</p>`
    )}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Also', title: 'We do this work directly' })}
    <p class="prose">If you would rather someone read your own copy than read a reference and do it yourself, that is the <a href="/claims-review/">claims review</a> &mdash; the same research pointed at your product instead of somebody else's.</p>
    <p><a class="arrow" href="/claims-review/">What a claims review covers</a></p>
  </div>
</section>

<section class="section on-pale">
  <div class="wrap">
    ${sectionHead({ eyebrow: site.newsletter.name, title: 'Told when an edition changes' })}
    ${newsletterForm(site)}
  </div>
</section>
`;

  return layout({
    site,
    title: 'Published',
    description:
      'Two documents drawn from the same reviewed datasets as the free tools: a claims-compliance reference for brands and agencies, and a field guide for readers.',
    path: '/shop/',
    body,
  });
}

// ---------------------------------------------------------- /claims-review/

export function renderClaimsReview({ site }) {
  const sv = site.services;
  const sym = sv.currencySymbol;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Research service',
      title: sv.headline,
      lede: sv.summary,
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    <p class="prose">We read what you have written &mdash; the packaging, the product pages, the campaign &mdash; and tell you which claims hold, which do not, and why. Each answer comes with the rule it runs into and a suggested rewording that says the same true thing in a way that survives.</p>

    ${label('What we check against')}
    <div class="rows" style="border-top-color:var(--rule-strong);margin-top:1rem;max-width:var(--measure);">
      ${sv.checks
        .map(
          (c, i) => `<div class="row row--label-16">
            <div class="row__index">${String(i + 1).padStart(2, '0')}</div>
            <p class="row__summary">${typo(c)}</p>
          </div>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'What it costs', title: 'Four ways in', wide: true })}
    <div class="amount-grid">
      ${sv.tiers
        .map(
          (t) => `<div class="amount${t.featured ? ' amount--featured' : ''} tilt reveal">
        <div class="amount__value display">${esc(money(sym, t.price))}${
          t.per ? `<span class="amount__per">/${esc(t.per)}</span>` : ''
        }</div>
        <p class="amount__label">${typo(t.name)}</p>
        <p class="amount__detail">${typo(t.detail)}</p>
        <p class="amount__note">${esc(t.turnaround)}</p>
      </div>`
        )
        .join('')}
    </div>
    <p class="figure-note" style="margin-top:1.5rem;">Prices exclude VAT, which does not currently apply. A quote is confirmed in writing before any work starts, and nothing is invoiced until you have agreed the scope.</p>
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'What you get', title: 'A document, not a workshop' })}
    <p class="prose">Every claim listed. Each one marked <strong>defensible</strong>, <strong>needs substantiation</strong>, or <strong>do not use</strong>, with the basis stated and a source you can check yourself. Where a claim fails, we propose wording that does not.</p>
    <p class="prose">No slide deck. No half-day session. A written report you can hand to your agency and to your lawyer.</p>

    ${sectionHead({ eyebrow: 'Read this part', title: 'What this is not' })}
    <p class="prose">It is not legal advice, and it is not a certification. It is the same research published free on this site, pointed at your product instead of somebody else's, done by the person who wrote the tools.</p>
    <p class="prose">We will not tell you your product is ethical, and we do not sell endorsements &mdash; there is nothing you can buy here that appears on the site as praise. If we find something serious, we will tell you plainly. That is what you are paying for.</p>
    <p class="prose">Nothing we learn in a review is ever published without your agreement. What we will not do is take work from a company that already appears in the <a href="/tools/record/">Record Checker</a>, for any fee. The reasoning, and everything else about where the money comes from, is set out on the <a href="/funding/">funding and conflicts page</a>.</p>

    ${note(
      'How to start',
      `<p class="mb-0">Email <a href="mailto:${esc(site.email)}?subject=${encodeURIComponent(
        'Claims review enquiry'
      )}">${esc(
        site.email
      )}</a> with a link to the page you are unsure about. If you want to see the work before committing, start with a Claim Check &mdash; it is the cheapest way to find out whether we are worth listening to.</p>`
    )}
  </div>
</section>

<section class="section on-pale">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Or do it yourself', title: 'The method is published' })}
    <p class="prose">Nothing about this service is secret. The <a href="/tools/certifications/">Certification Decoder</a> and the <a href="/tools/greenwashing/">Greenwashing Decoder</a> are the same reference we use, free and searchable, and <a href="/shop/">The Claims Compliance Pack</a> is the whole method in one document for ${esc(
      money(site.shop.currencySymbol, site.shop.products[0].price)
    )}.</p>
    <p class="prose mb-0">Plenty of brands will read those and never need us. That is fine &mdash; a claim fixed is the point, not who fixed it.</p>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Claims review',
    description:
      'We read your packaging, product pages and campaign copy, and tell you which environmental, welfare and sourcing claims hold, which do not, and what to say instead.',
    path: '/claims-review/',
    body,
  });
}
