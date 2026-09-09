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
import { esc, typo, slugify as slug } from '../lib/util.mjs';

/**
 * R12,000, not R12000 and not R12 000. Prices are read at a glance or not at
 * all, and en-ZA groups with a space, which at display size reads as two
 * separate numbers.
 */
const money = (symbol, value) => `${symbol}${Number(value).toLocaleString('en-US')}`;

/**
 * The cover of the thing being sold, where there is one.
 *
 * It is the first page of the PDF itself rather than a mock-up, which is the
 * only version of a cover worth showing: a buyer who has seen it has seen
 * something true about the document. Products whose source PDF is not in this
 * repository render without one, and the card is designed to work either way.
 */
function cover(covers, name, tag = '') {
  const c = covers[slug(name)];
  if (!c) return '';
  // The tag is the price or the word Free, printed on the cover itself. It is
  // the one fact a reader scanning a wall of covers is actually looking for,
  // and it is repeated verbatim in the card's own buy row below — so it is
  // aria-hidden here rather than read out twice.
  return `<div class="product__cover"><img src="${esc(c.image)}" srcset="${esc(c.thumb)} 420w, ${esc(
    c.image
  )} 840w" sizes="(min-width: 60rem) 22vw, 40vw" alt="Cover of ${esc(name)}" width="${c.width ?? 911}" height="${
    c.height ?? 1287
  }" loading="lazy" decoding="async">${
    tag ? `<span class="product__tag" aria-hidden="true">${esc(tag)}</span>` : ''
  }</div>`;
}

/** A download link should say how big the thing behind it is. */
const kb = (bytes) => `${Math.round(Number(bytes) / 1024)} KB`;

/*
 * The `download` attribute is given its filename rather than left bare.
 *
 * A bare `download` tells the browser to save rather than navigate, and leaves
 * the name to the URL's last segment — which works until the URL is a data:
 * URI, as it is in the single-file build, where there is no last segment and
 * both cards save as "download.pdf". The second then collides with the first
 * in the reader's downloads folder.
 */

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

export function renderShop({ site, rates, covers = {} }) {
  const s = site.shop;
  const sym = s.currencySymbol;

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Published',
      title: 'Printed, and worth printing',
      lede: 'Everything on this site is free and stays free. These are the documents that took long enough to assemble that they are sold instead — plus two pocket cards that are not, because a card you can carry is worth more in circulation than it is behind a payment.',
      wide: true,
      level: 1,
    })}
  </div>
</section>

${
  s.free && s.free.length
    ? `<section class="section--tight">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Free to download',
      title: 'The two pocket cards',
      lede: s.freeNote,
    })}
    <div class="grid grid--2" style="gap:2.5rem;align-items:start;">
      ${s.free
        .map(
          (f) => `<article class="product product--free tilt reveal" data-pointer-label="Download">
        ${cover(covers, f.name, 'Free')}
        <p class="product__for">${esc(f.for)}</p>
        <h2 class="product__name">${typo(f.name)}</h2>
        <p class="product__meta">1 page &middot; PDF &middot; ${kb(f.bytes)} &middot; Free</p>
        <p class="product__summary">${typo(f.summary)}</p>
        <ul class="product__contains">
          ${f.contains.map((c) => `<li>${typo(c)}</li>`).join('')}
        </ul>
        <div class="product__buy">
          <a class="btn" href="${esc(f.file)}" download="${esc(f.file.split('/').pop())}">Download the PDF</a>
          <p class="product__delivery">Straight down, no email asked for.</p>
        </div>
      </article>`
        )
        .join('')}
    </div>
  </div>
</section>`
    : ''
}

<section class="section--tight">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Published',
      title: 'The documents',
      lede: 'Priced in US dollars, which is what the payment links are issued in. Use the selector to read them in another currency — your bank sets the rate it actually applies.',
    })}
    ${currencyPicker(rates)}
    <div class="grid grid--2" style="gap:2.5rem;align-items:start;">
      ${s.products
        .map(
          (p) => `<article class="product${p.featured ? ' product--featured' : ''} tilt reveal">
        ${cover(covers, p.name, `${sym}${p.price}`)}
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
          }Emailed to the address you give at checkout &mdash; not downloaded.</p>
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
    <p class="prose">${typo(s.deliveryNote)}</p>
    <p class="prose">${typo(s.processorNote)}</p>
    ${note(
      s.refundsTitle,
      `<p>${typo(s.refunds)}</p>
      <p class="mb-0">We will always put right a transaction that did not deliver what it promised:</p>
      <ul class="product__contains">${s.refundsExceptions.map((e) => `<li>${typo(e)}</li>`).join('')}</ul>
      <p class="mb-0">${typo(s.refundsRights)} The full statement is in the <a href="/terms/">terms</a>.</p>`
    )}
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
    <p class="prose">None of it is legal advice. Nothing here certifies compliance or approves a claim.</p>
    <p class="prose">The Claims Compliance Pack and the Greenwashing Field Guide are generated from the same reviewed datasets the <a href="/tools/">free tools</a> run on, so a change to a certification reaches the PDF rather than leaving a stale file in circulation. The Conscious volumes and the journal are written documents rather than generated ones &mdash; every brand and material entry cites a source you can open and read, but they are revised on their own schedule and the edition date on the cover is the one that matters.</p>
    <p class="prose">Where an entry says a claim requires substantiation, that is a statement about what the published guidance asks for &mdash; not an opinion on your liability. For that, take advice from a qualified attorney on your specific product and market.</p>
    <p class="prose">If you want the reference material and not the document, the decoders and the record are all on this site, searchable and always current. The PDFs exist because a printed reference you can take into a shop or a meeting is a different thing from a website, not because the website is missing anything. The two pocket cards above are the clearest case of that, which is why they are free.</p>
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
      'Five documents and two free pocket cards: a claims-compliance reference for brands, the Conscious Wardrobe and Home Kit, a thirty-day journal, and a field guide for readers.',
    path: '/shop/',
    body,
  });
}
