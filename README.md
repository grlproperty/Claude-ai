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
date: 2026-09-02                 # publication date; drives the feed
order: 4                         # position in the index
---
```

`date` is not decorative. It is what `feed.xml` publishes as `<pubDate>`, which
is how feed readers order the notes and how the newsletter provider decides
what is new. A note without one is invisible to both. The whole launch set
carries the same date — none of it was public before — and each note written
after that carries the day it goes live.

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

The archive carries **67 visual essays pulled from Instagram** — AI-directed
editorial work by the founder, disclosed as such wherever it appears. Everything
else on the site is generated at build time or drawn in the browser.

Images are committed as WebP derivatives at two widths. The 36MB of originals
live in a gitignored cache, so the repository carries only what ships.

## Pulling the Instagram archive

`npm run instagram` fetches the visual essays, downloads each image, writes WebP
derivatives at two widths graded to the brand's photography direction, and
records the posts in `content/data/instagram.json`. The archive page leads with
the gallery; before the first pull it stays typographic, and the build never
fails for the absence.

Either Instagram connector works. `instagram_public` is the default because it
needs no Graph API app review; `instagram` carries extra insight fields but the
same media set. On a video or reel the still comes from `media_thumbnail_url` —
`media_url` is the MP4 itself.

```bash
WINDSOR_API_KEY=... npm run instagram            # fetch, download, optimise
npm run instagram -- --dry-run                   # list what would be fetched
npm run instagram -- --limit 20                  # only the newest 20
npm run instagram -- --from rows.json            # a saved Windsor payload
npm run instagram -- --connector instagram       # the Graph-API connector
npm run instagram                                # re-optimise cached data
```

Get the key from the Windsor dashboard under Settings → API. It is only needed
to *fetch*; the derivatives are committed, so the site build and CI never touch
the network or need the credential.

**Instagram's `media_url` values are signed and expire within days**, which is
why the images are downloaded and committed rather than hot-linked. Re-running
is cheap: anything already on disk is skipped.

**If the pull reports a plan error**, more accounts are connected to Windsor than
its plan allows, and it returns the error text in place of every field rather
than as an HTTP error. Disconnect the surplus accounts at
https://onboard.windsor.ai/ and run it again. The script detects that specific
response and refuses to write it into the site as content.

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
- **Newsletter** — set `newsletter.action` to the subscribe endpoint of the
  provider that sends the feed (Buttondown, MailerLite, ConvertKit, Listmonk).
  Until then the form degrades to `mailto:`. See below for the sending side.
- **Analytics** — **no analytics script is emitted.** The previous build loaded
  Google Analytics (`G-GJ387VT80N`); that is retained in `site.json` but
  disabled. Set `analytics.provider` to `"ga4"` to re-enable it, and update
  `/privacy/` to disclose it first.

## The briefing sends itself

Subscribers receive each field note in full on the day it is published. Nothing
here sends the mail: the provider does, by watching `/feed.xml`. There is no
scheduled job to maintain, no API key in the repository, and no separate edition
to write — publishing the note *is* sending it.

The feed carries the whole note in `content:encoded`, with every root-relative
link rewritten to an absolute one, so what lands in an inbox is the article
rather than a teaser. Items are ordered by `date`, newest first.

To connect it:

1. Create the list at your provider and verify the sending domain (SPF and
   DKIM). Skipping this is what puts the mail in spam.
2. Create an RSS-driven campaign pointed at `https://feral-femme.co/feed.xml`.
3. **Set its start date to now.** The entire launch set shares one publication
   date, so a campaign that treats the back catalogue as new will mail all
   eighteen notes at once. Every provider has this control; find it before
   enabling the campaign, not after.
4. Copy the provider's subscribe endpoint into `newsletter.action`.

The claims the site makes about this are on `/briefing/` and `/privacy/`: the
note in full, every claim sourced, no schedule, nothing else, and a one-click
unsubscribe in every issue. The provider supplies the unsubscribe. If the
sending arrangement changes, those two pages change with it.

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
