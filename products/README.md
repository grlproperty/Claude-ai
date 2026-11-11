# Products

Eight PDFs: four free, four sold.

    npm run products         build all eight, and bring the shop page into line
    npm run products:check   confirm every file is there and matches the shop page

| No. | Title                          | Tier | Goes to                                      |
|-----|--------------------------------|------|----------------------------------------------|
| 01  | The Phrasebook                 | free | `public/downloads/feral-femme-phrasebook.pdf` |
| 02  | The Logo Guide                 | free | `public/downloads/feral-femme-logo-guide.pdf` |
| 03  | The Ingredient Reader          | free | `public/downloads/feral-femme-ingredient-reader.pdf` |
| 04  | The Fabric Reader              | free | `public/downloads/feral-femme-fabric-reader.pdf` |
| 05  | The Brand Audit Workbook       | paid | `products/dist/brand-audit-workbook.pdf`     |
| 06  | The Claims Desk                | paid | `products/dist/claims-desk.pdf`              |
| 07  | The Wardrobe & Bathroom Audit  | paid | `products/dist/wardrobe-bathroom-audit.pdf`  |
| 08  | The Complaint Kit              | paid | `products/dist/complaint-kit.pdf`            |

The free ones are committed and served by the site. The sold ones are
gitignored — paid documents do not belong in the repository — and are emailed
by hand after payment, so **`products/dist/` is the folder to send from**.

The build also writes the first page of each as
`content/images/covers/the-<slug>.jpg`, which is what the shop shows, and the
real page count and file size into `content/site.json`, which is what the shop
prints. Neither is typed in by hand.

The build needs `dist/` to exist for the typefaces, which is why the npm script
runs the site build first.

## What is in which file

| File            | What it holds                                                    |
|-----------------|------------------------------------------------------------------|
| `catalogue.mjs` | The eight products: title, cover text, and the sections in order. |
| `written.mjs`   | Everything that had to be written: methods, worksheet instructions, template messages, the notice, the licences. |
| `copy.json`     | Older written content still in use: the 36 claim tests, the review procedure, the eight rewrites, the six reader habits. |
| `parts.mjs`     | What a worksheet, a template, a checklist and a reference entry look like. |
| `style.mjs`     | The print stylesheet. The colours are the site's own tokens.      |
| `build.mjs`     | The machinery: rendering, page counting, covers, metadata.       |

The reference sections are **generated**, not written. They come out of
`content/data/greenwashing.json`, `certifications.json`, `materials.json`,
`ingredients.json`, `sources.json` and `regulators.json` — the same datasets
the public tools render. When a dataset is reviewed, rebuilding reissues the
products, so a change reaches the PDFs rather than leaving a stale file in
circulation.

## Three rules for anything written here

These are in the header of `written.mjs` and they are the reason the products
are safe to publish. Keep them when editing.

1. **No new facts about a company, a scheme or a substance.** Anything of that
   kind belongs in a dataset, with a source, where the review cycle and the
   citation monitor can see it. The written parts describe how to check, not
   what is true, and they name no company.
2. **Nothing tells a reader what the law requires of them.** The text says what
   published guidance asks for and where to read it.
3. **A template asks a question or states what was seen.** None alleges intent,
   and none threatens.

## The notice

Every product says that it is not legal advice in four places, and none of
them is optional or configurable per product:

- on the cover, under the rule;
- on the first page after the contents (sharing the contents page in the
  short free ones), in a box, before anything else can be read;
- in the footer of every page;
- in the file's own properties, which is what `products:check` looks for.

The wording is `NOTICE` in `written.mjs`. Products with worksheets or
templates add a paragraph saying they are not legal documents; products with
ingredient names add one saying they are not medical or allergy advice.

## How it renders

Headless Chromium, not a PDF library, so the pages use the site's own
typefaces. Four things in `build.mjs` are less obvious than they look:

1. **Fonts are embedded as data URIs.** A `file://` page cannot fetch a
   `file://` font.

2. **Page numbers are counted, not searched for.** Every section starts on a
   new page, so a section rendered alone has exactly as many pages as it has
   in the book. The front matter and each section are rendered once on their
   own, the counts are added into the contents, and the total is checked
   against the finished body. If they disagree the build stops rather than
   print a contents page that is out by one.

3. **The cover is a separate render, placed in front afterwards.** Chromium
   reserves the running-footer strip on every page of a render, which stops a
   full-bleed cover reaching the foot of the paper. Its document also resets
   `@page { margin: 0 }`, because the stylesheet's own `@page` margin wins
   over the one passed to `page.pdf()`. The cover is unnumbered, which is why
   the folios in the contents match the printed footers rather than the PDF's
   own page index.

4. **A worksheet given `page: true` gets a page to itself and is ruled to the
   foot of it.** Otherwise a sheet that does not fit under its introduction
   is pushed whole to the next page and leaves half of each blank.

Chromium is not bundled with `playwright-core`. Set `PLAYWRIGHT_BROWSERS_PATH`
or `FF_CHROMIUM` if the build cannot find one.

## Adding or changing a product

- Text: edit `written.mjs` or `copy.json`, rebuild.
- A new term in `greenwashing.json` needs a matching entry in `copy.json`
  `tests`. The build refuses to run without it.
- A new product: add it to `CATALOGUE` in `catalogue.mjs`, then add its card
  to `shop.products` or `shop.free` in `content/site.json` under the same
  name. `pages` and `bytes` are filled in by the build.
- After any change, look at the pages. `pdftoppm -r 60 -png <file> <prefix>`
  is enough to see a worksheet that has been pushed off its page.

## Selling them

Each sold product needs its own PayPal checkout link with the price fixed on
PayPal's side, pasted into that product's `buy` in `content/site.json`. While
`buy` is empty the button on the shop page is an email enquiry, so the page is
safe to publish before the links exist.
