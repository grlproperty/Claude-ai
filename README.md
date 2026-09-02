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

- **Donations** — each entry in `donate.amounts` carries its own `link`, and
  `donate.custom.link` backs the open-amount button. These are PayPal no-code
  checkout links, whose amount is fixed on PayPal's side when the button is
  created: appending one to the URL does nothing, so the tier and the link are
  paired in the configuration and never computed in code. Changing a tier's
  figure therefore means creating the matching button in PayPal first. The
  account-wide `donate.link` is a fallback for a PayPal.me or hosted-button URL,
  which *do* take an appended amount. With neither set the page renders an
  enquiry `mailto:` rather than a dead button.

  The buttons are plain links on purpose. PayPal also offers a `sdk/js`
  hosted-buttons embed, which would put a third-party script on the page and
  let PayPal observe every visitor to `/donate/` whether or not they give. This
  site makes no third-party requests at all — fonts are self-hosted and
  analytics are off — so a link that contacts PayPal only once someone chooses
  to give is both the lighter and the more honest option. Adopting the embed
  would mean disclosing it on `/privacy/` first.
- **Newsletter** — set `newsletter.action` to the subscribe endpoint of the
  provider that sends the feed (Buttondown, MailerLite, ConvertKit, Listmonk),
  and `newsletter.emailField` to the field name that endpoint expects: `email`
  for Formspree and FormSubmit, `fields[email]` for a MailerLite embedded form.
  Getting the field name wrong is the worst kind of failure available here —
  the endpoint accepts the POST, the form reports success, and no subscriber is
  ever created — so check it against the provider's own embed code rather than
  assuming. Until `action` is set the form degrades to `mailto:`. See below for
  the sending side.

  No API key belongs in this repository. A subscribe endpoint is a public URL
  by design; an API key is an account credential, and the static site has
  nothing to do with it.

  Two traps, both found the hard way against the live endpoint:

  - **Post to `assets.mailerlite.com`, not `dashboard.mailerlite.com`.** The
    dashboard address that MailerLite's own share page carries answers with a
    301 to the assets one, and `fetch` downgrades a POST to a GET when it
    follows a 301 — the address would be dropped on the way.
  - **A 2xx is not agreement.** MailerLite answers a rejected address with HTTP
    200 and `{"success":false,...}`. Checking `res.ok` alone tells a reader they
    subscribed when they did not, so the body is parsed and the flag checked.
- **Analytics** — **no analytics script is emitted.** The previous build loaded
  Google Analytics (`G-GJ387VT80N`); that is retained in `site.json` but
  disabled. Set `analytics.provider` to `"ga4"` to re-enable it, and update
  `/privacy/` to disclose it first.

## The briefing sends itself

Subscribers receive each field note in full on the day it is published, and
publishing the note is the act of sending it. There is no separate edition to
write.

MailerLite's API exposes no RSS-driven campaign — campaigns come in `regular`,
`ab`, `resend` and `multivariate` only, and no automation trigger watches a feed
— so the feed cannot send itself and the repository does it instead. Whether
the dashboard offers one on some plan was not established; this path needs no
such feature and does not depend on the answer.
`.github/workflows/briefing.yml` runs `scripts/send-briefing.mjs` after Deploy
has succeeded on `main`, never before: the email links straight to the note, and
mailing a link to a page that is not live yet is worse than sending nothing.

Two properties are worth keeping when changing any of this.

**Nothing tracks sent state in this repository.** MailerLite is the record. A
campaign is named `Field note — <slug>`, and a note whose campaign already
exists is skipped. Re-running the workflow is therefore safe, and there is no
state file that can drift out of step with what subscribers actually received.

**The back catalogue can never be mailed.** Every launch note shares one
publication date, so `newsletter.automationStart` in `content/site.json` is a
cutover: only notes dated strictly *after* it are ever eligible. Nothing
downstream — a bad filter, a re-run, a restored backup — can put eighteen emails
in anyone's inbox.

Run it by hand to see what would go out. A dry run is the default and creates
nothing:

```bash
MAILERLITE_API_KEY=... npm run briefing            # list what would be sent
MAILERLITE_API_KEY=... npm run briefing -- --send  # create and send
```

Before the first real send, authenticate the sending domain in MailerLite
(Settings → Domains). Without SPF and DKIM the receiving side has nothing to
check the sender against, so the note is filtered or refused — and a domain
that sends unauthenticated mail earns a reputation that outlasts the fix. The
script checks this on every run and warns, but does not refuse: whether to send
anyway is the account owner's call, not the script's.

To enable it, add `MAILERLITE_API_KEY` to the repository secrets. **Issue a
separate key for this.** A key restricted to an IP allowlist — the right setting
for one used from a fixed machine — cannot work from a CI runner, which never
has a fixed address; the script detects that specific refusal and says so rather
than failing obscurely. Without the secret the workflow logs a notice and exits
cleanly, so a fork or a clone never tries to mail anyone.

The claims the site makes about all this are on `/briefing/` and `/privacy/`:
the note in full, every claim sourced, no schedule, nothing else, and a
one-click unsubscribe in every issue. MailerLite appends the unsubscribe link
itself. If the sending arrangement changes, those two pages change with it.

## Deployment

The build writes a directory of static files. Any host that serves files will
serve it, and the site depends on none of them in particular.

- **Build command** — `npm run build && npm run check`
- **Publish directory** — `dist`
- **Node** — 22

`netlify.toml` carries those values for Netlify. Cloudflare Pages takes the
same two in its dashboard. Nothing else is needed: `dist/404.html` is picked up
for unknown paths, and `dist/_redirects` is honoured natively by both, so the
legacy `/rss.xml`, `/feed` and `/research/` addresses resolve.

To publish without connecting a repository at all, run `npm run build` and drop
the `dist` folder onto https://app.netlify.com/drop.

**One deployment caveat.** Every asset and link is an absolute path
(`/assets/…`, `/field-notes/…`), which assumes the site is served from the root
of a domain. That is correct for `feral-femme.co` and for the address a host
assigns you, but a subpath deployment would break every path.

For a custom domain, add `public/CNAME` containing the domain **only if the
host reads it** — Netlify and Cloudflare take the domain in their dashboard
instead, and the file is ignored.

## Licence

Written content is published under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). The FERAL FEMME
name and marks, and the archive's editorial imagery, are fully reserved. Bodoni
Moda, Cormorant Garamond, and Jost are licensed under the SIL Open Font
License 1.1.
