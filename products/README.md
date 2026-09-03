# Products

Two PDFs that are sold rather than published: a reference pack for brands and
agencies, and a field guide for readers.

    npm run products      →  products/dist/*.pdf

The build needs `dist/` to exist for the typefaces, which is why the script
runs the site build first.

## Where the content comes from

The reference sections are **generated**, not written. They come out of
`content/data/greenwashing.json`, `certifications.json`, `materials.json` and
`sources.json` — the same datasets the public decoders render. When a dataset
is reviewed, rebuilding reissues the products, so a scope change reaches the
paid PDFs rather than leaving a stale file in circulation.

`copy.json` holds the part that had to be written:

| Key             | What it is                                                        |
|-----------------|-------------------------------------------------------------------|
| `tests`         | For each of the 36 flagged terms, the evidence a brand must be able to produce if it uses the term. Keyed by the term exactly as it appears in `greenwashing.json`. |
| `procedure`     | The six-step claims review that opens the pack.                   |
| `rewrites`      | Eight real claim patterns, with why each fails and a defensible version. |
| `consumerSteps` | The six checks that open the field guide.                         |

Every term needs a matching entry in `tests`. Nothing enforces that, so after
adding a term to `greenwashing.json`:

    node -e "const g=require('./content/data/greenwashing.json').terms.map(t=>t.term), \
      c=Object.keys(require('./products/copy.json').tests); \
      console.log(g.filter(t=>!c.includes(t)), c.filter(t=>!g.includes(t)))"

## How it renders

Headless Chromium, not a PDF library, so the pages can use the site's own
typefaces and hold to the same design. Three things in `build.mjs` are less
obvious than they look, and all three were bugs first:

1. **Fonts are embedded as data URIs.** A `file://` page cannot fetch a
   `file://` font.

2. **The body is rendered twice.** The contents page cites page numbers, and a
   page number does not exist until the document has been laid out. So a
   throwaway call collects the section list, a measuring pass renders *with* a
   contents page and blank numbers — so it paginates identically to the final
   one — and `pages.py` reads back where each section landed. Leaving the blank
   contents out of the measuring pass puts every number out by one.

3. **The cover is a separate render, merged in by `merge.py`.** Chromium
   reserves the running-footer strip on every page of a render, which stops a
   full-bleed cover reaching the foot of the paper, and a cover should not
   carry a folio anyway. Its document also has to reset `@page { margin: 0 }`,
   because the stylesheet's own `@page` margin wins over the one passed to
   `page.pdf()` — without that the cover spills onto a second, nearly empty
   page.

The cover is unnumbered, which is the ordinary print convention and is why the
folios in the contents match the printed footers rather than the PDF's page
indices.

## Selling them

Through PayPal, and by hand.

Create one PayPal no-code checkout link per product — the same way the donate
tiers were made, with the price fixed on PayPal's side — and paste each into
`shop.products[].buy` in `content/site.json`. With that field empty the buy
button falls back to an enquiry email, so `/shop/` is publishable and can earn
before the links exist.

PayPal hands the buyer a receipt, not a file. Delivery is manual: the payment
notification arrives, you email the PDF to the address on the receipt. At a
handful of sales a month that is a few minutes, it is more reliable than a
storefront, and it leaves you holding the buyer's address — which is how they
get told when an edition changes. `/shop/` says all of this next to the button,
because a buyer who is not told expects an instant download and reads the email
as a failure.

Both products carry their own licence and disclaimer pages, so nothing further
is needed to put them on sale.

Bump the edition line in `build.mjs` when the content changes materially, and
email the new file to anyone who bought the previous one.
