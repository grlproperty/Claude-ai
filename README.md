# FERAL FEMME

The website for FERAL FEMME — an editorial, research, and sustainability-tools
platform investigating every industry built on a body that could not agree to
it, holding animals and women at equal weight.

**Two subjects. One machine. Same refusal to consent.**

Est. 2026 · South Africa · Self-funded ·
[feral-femme.co](https://feral-femme.co) ·
[@feralfemme.co](https://www.instagram.com/feralfemme.co)

---

## What this is

A static site generated from Markdown and JSON. There is no runtime, no
database, and no server — `npm run build` writes a directory of HTML that any
static host will serve, and GitHub Actions deploys it on every push.

It publishes:

| Route | What it is |
| --- | --- |
| `/` | Home — WebGL cage hero, method, industries, tools |
| `/field-notes/` | 18 long-form and short notes, filterable and searchable |
| `/industries/` | The ten industries, each with its standing reference |
| `/archive/` | 60 numbered entries in the visual essay series |
| `/library/` | 42 investigations and databases, linked to their originals |
| `/tools/` | Index of the six free reference tools |
| `/tools/certifications/` | 22 schemes — who runs them, what they verify, what they do not |
| `/tools/greenwashing/` | 36 terms — what is implied, what is meant |
| `/tools/materials/` | 21 materials — welfare position, environmental cost, alternatives |
| `/tools/record/` | 21 documented findings against named companies |
| `/tools/act/` | 10 organisations, filterable by subject |
| `/sources/` | The 54 publishers and bodies this platform cites |
| `/donate/` | Reader funding — the platform's only revenue |
| `/about/`, `/editorial-standards/`, `/corrections/`, `/contact/` | The institutional pages |
| `/privacy/`, `/terms/`, `/accessibility/` | POPIA-aligned legal pages |

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
npm run new -- note "Field note title" --topic Fashion
npm run new -- page "Page title"
```

- `content/field-notes/*.md` — field notes, ordered by the numeric filename
  prefix, which never appears in the URL
- `content/pages/*.md` — institutional pages
- `content/data/*.json` — the nine maintained datasets
- `content/site.json` — navigation, positioning, method, donation tiers,
  newsletter, analytics

### Front matter

```yaml
---
title: "What \"Cage-Free\" Actually Means"
summary: "One or two sentences that stand alone in the index and in link previews."
topic: "Animals"                 # the primary topic
topics: ["Animals", "Note"]      # every topic; drives the index filter
form: "Short"                    # or "Long read"
duration: 3                      # minutes
order: 4                         # position in the index
---
```

## Verification

`npm run check` runs against `dist/` and **fails the build** on:

- internal links pointing at routes that were never generated
- images referenced but not built, or missing an `alt` attribute
- a page missing its title, description, canonical link, `h1`, or main landmark
- any brand colour pair falling below WCAG AA contrast — the thresholds are read
  from `site.css` itself, so the check cannot drift from what ships

It warns, without failing, when a dataset has passed its declared review cycle.

Contrast is checked for text at 4.5:1 and for control borders at 3:1, the two
thresholds WCAG actually sets.

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

`src/assets/css/site.css` holds the whole system in one file.

- **Palette** — Blush `#F6DFE2`, Crimson `#8E0B14`, Ink `#12100F`, White
  `#FDFCFC`, plus two blush tints and a dim. Every de-emphasis level is an
  alpha over those, and the alphas are the lowest that clear WCAG AA.
- **Type** — three faces, each with one job. **Bodoni Moda** carries the
  wordmark, hero, and figures; a didone's extreme thick/thin is the visual
  signature. **Cormorant Garamond** carries editorial headings and long-form
  serif. **Jost** carries labels, UI, and data. All self-hosted from
  `src/assets/fonts/`, so the site makes no third-party requests and no
  visitor IP address reaches a font CDN.
- **Depth** — one elevation ramp (`--lift-1/2/3`), pointer-tilted cards, and
  scroll reveal. Every one of them is a progressive enhancement.

### The cage

`src/assets/js/cage.js` renders the hero's wireframe birdcage in raw WebGL —
bowed bars, rings, and a suspension chain, rotating slowly with pointer
parallax. It is the brand's own motif rather than a generic shader.

No 3D library: the scene is roughly 2,000 line segments, so a 600KB framework
would be almost entirely dead weight on a page whose point is that it loads
fast and requests nothing from anyone else. It degrades in three steps — no
WebGL falls back to a CSS lattice, `prefers-reduced-motion` renders one static
frame, and going offscreen or backgrounding the tab pauses the loop.

### Imagery

This build ships **no photography**. The archive's editorial imagery is
AI-directed work by the founder and is not bundled here; archive plates render
typographically instead. Every visual on the site is generated at build time or
drawn in the browser.

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
npm run social                                    # every field note
npm run social -- what-cage-free-actually-means   # one note
```

## Configuration

Everything commercial is configured in `content/site.json`, not in code.

- **Donations** — set `donate.link` to a PayPal.me or hosted-button URL. Empty
  renders an enquiry `mailto:`, so the page is publishable before the processor
  is connected and never ships a dead button.
- **Newsletter** — set `newsletter.action` to your provider's form endpoint
  (Buttondown, ConvertKit, MailerLite, Listmonk). Until then the form degrades
  to `mailto:`.
- **Analytics** — **no analytics script is emitted.** The previous build loaded
  Google Analytics (`G-GJ387VT80N`); that is retained in `site.json` but
  disabled. Set `analytics.provider` to `"ga4"` to re-enable it, and update
  `/privacy/` to disclose it first.

## Deployment

`.github/workflows/deploy.yml` builds, verifies, and publishes to GitHub Pages
on every push to `main`. To use a custom domain, add `public/CNAME` containing
`feral-femme.co` and point the DNS at GitHub Pages.

The output is a plain directory, so Netlify, Cloudflare Pages, Vercel, or any
static host works equally well — build command `npm run build`, output `dist`.

**One deployment caveat.** Every asset and link is an absolute path (`/assets/…`,
`/field-notes/…`), which assumes the site is served from the root of a domain. That
is correct for `feral-femme.co` and for a `*.github.io` user site, but a GitHub
Pages *project* site serves from a subpath (`/<repo>/`) and every path would
break. Use a custom domain, or a user/organisation site, rather than a project
path.

## Licence

Written content is published under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). The FERAL FEMME
name and marks, and the archive's editorial imagery, are fully reserved. Bodoni
Moda, Cormorant Garamond, and Jost are licensed under the SIL Open Font
License 1.1.
