/**
 * The page that asks for money in exchange for something specific: the PDFs.
 *
 * Prices are read out of site.json rather than carried here, because a price
 * appears in three places — the card, the button, and the enquiry email's
 * subject — and three copies of a number is three chances to publish the wrong
 * one.
 */
import { layout } from '../templates/layout.mjs';
import { label, sectionHead, note, newsletterForm, currencyPicker } from '../templates/components.mjs';
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
    return `<a class="${cls}" href="${esc(buy)}" rel="noopener" target="_blank">Buy &mdash; <span data-usd="${esc(
      String(price)
    )}">${esc(money(symbol, price))}</span></a>`;
  }
  const subject = encodeURIComponent(`${name} — ${money(symbol, price)}`);
  return `<a class="${cls}" href="mailto:${esc(site.email)}?subject=${subject}">Buy by email &mdash; <span data-usd="${esc(
    String(price)
  )}">${esc(money(symbol, price))}</span></a>`;
}

// ------------------------------------------------------------------- /shop/

export function renderShop({ site, rates }) {
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
    ${currencyPicker(rates)}
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

// ------------------------------------------------------------ /claim-check/

/**
 * One service, one price.
 *
 * This was a four-tier ladder and is deliberately not one any more. A single
 * low-friction offer converts better than a menu — a buyer choosing between
 * four unfamiliar services mostly chooses none of them — and anything larger
 * than one page is a conversation rather than a published rate, which is also
 * the honest position for a practice this size.
 *
 * Priced in rand rather than dollars because it is invoiced directly, not sold
 * through a checkout. That is a different transaction from the PDFs and it
 * should look like one.
 */
export function renderClaimCheck({ site }) {
  const sv = site.services;
  const price = `${sv.currencySymbol}${Number(sv.price).toLocaleString('en-US')}`;

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
    <div class="offer">
      <div class="offer__price">
        <p class="offer__figure display">${esc(price)}</p>
        <p class="offer__meta">${esc(sv.turnaround)}</p>
      </div>
      <div class="offer__body">
        <h2 class="offer__name">One claim, or one product page</h2>
        <p>${typo(sv.detail)}</p>
        <p class="mb-0"><a class="btn" href="mailto:${esc(site.email)}?subject=${encodeURIComponent(
          'Claim check'
        )}">Send us the page</a></p>
      </div>
    </div>
    <p class="figure-note" style="margin-top:1.5rem;">${typo(sv.beyond)}</p>
    <p class="figure-note">${typo(sv.invoiceNote)} Excludes VAT, which does not currently apply. Nothing is invoiced until you have agreed the scope.</p>
  </div>
</section>

<section class="section on-white">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'What we check against', title: 'Four published rulebooks', wide: true })}
    <div class="rows" style="border-top-color:var(--rule-strong);max-width:var(--measure);">
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

<section class="section--tight">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Read this part', title: 'What this is not' })}
    <p class="prose">It is not legal advice, and it is not a certification. It is the same research published free on this site, pointed at your page instead of somebody else's, done by the person who wrote the tools.</p>
    <p class="prose">We will not tell you your product is ethical, and we do not sell endorsements &mdash; there is nothing you can buy that appears on this site as praise. If we find something serious, we will tell you plainly. That is what you are paying for.</p>
    <p class="prose">Nothing we find is ever published without your agreement. What we will not do is take money from a company that already appears in the <a href="/tools/record/">Record Checker</a>, in any form. The reasoning, and everything else about where the money comes from, is on the <a href="/funding/">funding and conflicts page</a>.</p>
  </div>
</section>

<section class="section on-pale">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Or do it yourself', title: 'The method is published' })}
    <p class="prose">Nothing about this is secret. The <a href="/tools/certifications/">Certification Decoder</a> and the <a href="/tools/greenwashing/">Greenwashing Decoder</a> are the same reference we use, free and searchable, and <a href="/shop/">The Claims Compliance Pack</a> is the whole method in one document.</p>
    <p class="prose mb-0">Plenty of brands will read those and never need us. That is fine &mdash; a claim fixed is the point, not who fixed it.</p>
  </div>
</section>
`;

  return layout({
    site,
    title: 'Claim check',
    description:
      'We read one claim or one product page and tell you which parts hold, which do not, and what to say instead — with the rule behind each answer and a source you can check yourself.',
    path: '/claim-check/',
    body,
  });
}
