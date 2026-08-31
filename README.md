# FERAL FEMME

The website for FERAL FEMME — an educational activism platform examining animal
testing in the skincare and beauty industry through calm, research-based
awareness.

**Educate. Expose. Empower.** · [feral-femme.co](https://feral-femme.co) ·
[@feralfemme.co](https://www.instagram.com/feralfemme.co)

---

## What this is

A static site generated from Markdown and JSON. There is no runtime, no
database, and no server — `npm run build` writes a directory of HTML that any
static host will serve, and GitHub Actions deploys it on every push.

It publishes:

| Route | What it is |
| --- | --- |
| `/` | Home — pillars, latest research, dataset index |
| `/research/` | Long-form entries, filterable and searchable |
| `/learn/` | A five-module curriculum, ordered and cross-linked |
| `/regulation/` | Global regulation tracker, filterable by status and region |
| `/methods/` | Non-animal test methods, endpoint by endpoint |
| `/certifications/` | What each certification scheme actually verifies |
| `/glossary/` | Terminology, searchable |
| `/support/`, `/licensing/` | Membership, institutional licensing, commissions |
| `/about/`, `/funding/`, `/editorial-standards/`, `/corrections/` | The institutional pages that make an ethics platform credible |

Plus `/feed.xml`, `/sitemap.xml`, `/robots.txt`, `/search-index.json`, a social
preview card per entry, and a generated favicon and app-icon set.

## Getting started

```bash
npm install
npm run build     # writes dist/
npm run dev       # preview at http://localhost:4321
npm run check     # verify the build (see below)
```

Node 20 or newer.

## Writing

All content lives in `content/`. Nothing else needs to be touched to publish.

```bash
npm run new -- research "The Title"  --topic Regulation
npm run new -- guide    "Module Title" --order 6
npm run new -- page     "Page Title"
```

- `content/research/*.md` — research entries, ordered by `date`
- `content/guides/*.md` — learning modules, ordered by the numeric filename
  prefix, which never appears in the URL
- `content/pages/*.md` — institutional pages
- `content/data/*.json` — the four maintained datasets
- `content/site.json` — navigation, membership tiers, newsletter, analytics

### Front matter

```yaml
---
title: The Marketing Ban Is Not a Testing Ban
summary: One or two sentences that stand alone in the archive and in link previews.
topic: Regulation          # groups the entry and drives the archive filter
date: 2026-02-11
updated: 2026-08-31        # shown as "Reviewed"
featured: true             # at most one; leads the home page
image: /assets/img/editorial-portrait-1200.webp
---
```

Learning modules use `order`, `duration`, and an `outcomes:` list instead of
`topic` and `date`.

## Verification

`npm run check` runs against `dist/` and **fails the build** on:

- internal links pointing at routes that were never generated
- images referenced but not built, or missing an `alt` attribute
- a page missing its title, description, canonical link, `h1`, or main landmark
- any brand colour pair falling below WCAG AA contrast — the thresholds are read
  from `site.css` itself, so the check cannot drift from what ships

It warns, without failing, when a dataset has passed its declared review cycle.

This runs on every pull request and before every deploy. The accessibility page
makes public commitments; this is what holds the site to them.

## Datasets and the review cycle

Each file in `content/data/` declares when it was last reviewed and how often it
should be:

```json
{ "reviewed": "2026-08-31", "reviewCycleDays": 120 }
```

When a dataset passes its cycle, the page says so on its own face rather than
ageing quietly, and the weekly `Dataset review` workflow opens an issue. Law
changes; a reference that is not maintained becomes actively misleading, and
this is the mechanism that keeps that visible.

## Design system

The brand kit is implemented, not approximated. `src/assets/css/site.css` holds
the whole system in one file.

- **Palette** — Soft Blush `#EFD8D8`, Deep Crimson `#9B0000`, Pure Black
  `#0A0A0A`, Clean White `#FDFCFC`, used at the specified 60/25/10/5
  proportions. Every derived tone is a mix of those four; no new hues.
- **Type** — Cormorant Garamond for display, Montserrat for body and UI. Two
  families, as the brand rules require. Both are self-hosted from
  `src/assets/fonts/`, so the site makes no third-party requests and no visitor
  IP address reaches a font CDN.
- **Imagery** — the campaign photography, graded to the brand's stated
  direction (desaturated, cool-toned) by `scripts/optimise-images.mjs`.

Regenerating either font set is a one-off, and the output is committed so the
build stays hermetic:

```bash
node scripts/fetch-fonts.mjs   # woff2 for the site
node scripts/fetch-ttf.mjs     # TrueType, for rasterising text into images
```

## Social kit

Generates an Instagram carousel from a published entry, using the post system in
the brand kit — title slide, numbered section slides drawn from the entry's own
headings, a pull quote, and the closing reflection card. 1080 × 1350 PNG plus a
caption file, written to `social/<slug>/`.

```bash
npm run social                                       # every entry
npm run social -- marketing-ban-is-not-a-testing-ban  # one entry
```

## Configuration

Everything commercial is configured in `content/site.json`, not in code.

- **Membership** — set each tier's `link` to a Stripe Payment Link, Ko-fi, or
  Open Collective URL. Empty links render as an enquiry `mailto:`, so the page
  is publishable before the payment provider is connected and never ships a
  dead button.
- **Newsletter** — set `newsletter.action` to your provider's form endpoint
  (Buttondown, ConvertKit, MailerLite, Listmonk). Until then the form degrades
  to `mailto:`.
- **Analytics** — left empty, no third-party script is emitted at all. Set
  `provider` and `src` only for a cookieless, aggregate-only provider, and
  update `/privacy/` to name it before switching it on.

## Deployment

`.github/workflows/deploy.yml` builds, verifies, and publishes to GitHub Pages
on every push to `main`. To use a custom domain, add `public/CNAME` containing
`feral-femme.co` and point the DNS at GitHub Pages.

The output is a plain directory, so Netlify, Cloudflare Pages, Vercel, or any
static host works equally well — build command `npm run build`, output `dist`.

**One deployment caveat.** Every asset and link is an absolute path (`/assets/…`,
`/research/…`), which assumes the site is served from the root of a domain. That
is correct for `feral-femme.co` and for a `*.github.io` user site, but a GitHub
Pages *project* site serves from a subpath (`/<repo>/`) and every path would
break. Use a custom domain, or a user/organisation site, rather than a project
path.

## Licence

Written content is published under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). The FERAL FEMME
name and marks, and all campaign photography, are fully reserved. Cormorant
Garamond and Montserrat are licensed under the SIL Open Font License 1.1.
