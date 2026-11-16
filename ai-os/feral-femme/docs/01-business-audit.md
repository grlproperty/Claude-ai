# Feral Femme — business audit

Audited 15–16 November 2026 from three sources: the live home page at feral-femme.co, the site's own repository (content, configuration, scripts), and the Brand Identity Kit, Edition 2026. Sub-pages of the live site could not be fetched individually, so anything about them comes from the repository. Each line is **Verified** or **To confirm**.

## Business model
| | Basis |
|---|---|
| Independent, self-funded editorial, research and tools platform. Est. 2026, South Africa. Founder and Editorial Director: Ayden Rosemary Brown | Verified (site configuration) |
| "Two subjects. One machine. Same refusal to consent." Investigates every industry built on a body that could not agree to it, holding animals and women at equal weight | Verified |
| Standard: "Written to be verified, not agreed with." Public-record reporting, reframed with attribution | Verified |
| Revenue: reader donations (PayPal, USD) and paid documents. No advertisers, sponsorship or affiliate links | Verified on the live home page |
| International, digital audience; South African legal base (POPIA privacy page) | Verified |

## What it publishes
| | Count | Basis |
|---|---|---|
| Field notes | 18 filed | Verified (live page and repository) |
| Visual essay archive | 60 written entries, 76 frames | Verified |
| Library of investigations and databases | 42 | Verified |
| Standing cited authorities | 54 | Verified (repository) |
| Industries | 10: Beauty, Fashion, Food & Agriculture, Animal Welfare, Women's Rights, Environment, Technology, Consumer Rights, Corporate Accountability, Media & Advertising | Verified |
| Free tools | Ten named on the live page (label scanner, Spot the Greenwash, Message Builder, Claim Checker, four decoders, Record Checker, Where to Act) | Verified; the Brand Kit confirms ten |
| Free guides | The Phrasebook, The Logo Guide, The Ingredient Reader, The Fabric Reader | Verified |
| Paid documents | The Brand Audit Workbook, The Claims Desk, The Wardrobe & Bathroom Audit, The Complaint Kit — each shown at $30 | Verified |

## Audience
Readers who want to check claims for themselves: consumers, researchers, journalists, campaigners, and brands checking their own copy (the Claim Checker). They are readers and supporters, not sales leads.

## Existing systems
| System | Role | Basis |
|---|---|---|
| Static site generator in this repository (Node, Markdown, JSON) | The whole website; no server, no database | Verified |
| GitHub Actions | Build check, deploy, weekly dataset review, briefing | Verified |
| MailerLite | The Research Briefing; one campaign per new note, sent by script after deploy | Verified |
| PayPal | Donations, with a payment link per tier | Verified |
| Checkout for paid documents | Unknown | To confirm |
| Analytics | Off by default; a Google Analytics ID exists but is disabled | Verified |
| Instagram, Facebook, TikTok, LinkedIn | Social | Verified |
| Self-hosted fonts, no third-party requests | Privacy by design | Verified |

## Operational requirements
1. Every factual claim traceable to a named, dated source; allegations never presented as findings.
2. A human verifies every claim against its source before publication (the platform's own published standard).
3. Restrained voice; no clickbait.
4. Imagery always disclosed as AI-generated and conceptual.
5. Datasets kept within their review cycle.
6. Independence protected in every workflow: no advertising or sponsorship logic anywhere.
7. Corrections visible; nothing silently deleted.

## Findings worth acting on
| # | Finding | Why it matters |
|---|---|---|
| 1 | The editorial standards page in the repository says reader donations are "the only revenue it takes"; the live site sells four documents. | A platform whose subject is misleading claims should not carry a stale one about its own funding. |
| 2 | The Brand Kit says ten free tools. The live home page lists ten but says "Eleven" in one place; the site configuration says nine; the README says six. | Same reason. Correct all three to ten. |
| 3 | The brief's product names (Claims Compliance Pack, Brand Audit Pack, Conscious Wardrobe, Conscious Home Kit, Re-Wilding Journal, Greenwashing Field Guide) do not match the live catalogue. | The system is told never to invent products; it holds the unmatched names as planned until confirmed. |
| 4 | The live home page links /about/, /shop/ and /donate/ as hash routes, and the plain addresses returned "not found" to a direct fetch. | Search engines and link previews may not reach those pages. Worth a technical SEO check. |
| 6 | The Brand Kit sets four typefaces, adding Space Mono for evidence labels. The repository on this branch ships three (Bodoni Moda, Cormorant Garamond, Jost) and its README says "three faces". | Either the live site is ahead of this branch, or Space Mono still needs adding and self-hosting. |
| 7 | The Brand Kit says "no affiliate revenue" and names readers as the only funders; the kit also shows paid workbooks. Consistent with the live site, not with the repository's standards page (finding 1). | Confirms which wording is current. |
| 5 | The checkout provider and delivery method for paid documents are not visible. | Needed before sales reporting can be connected. |

## Opportunities for automation, ranked
1. **Verification discipline as a pipeline** — sources, classification, human verification sheet, fact check, voice check, staged approvals. Built.
2. **Site-ready field note files** in the site's own format. Built (file to outbox; direct write to the content folder is built and switched off).
3. **Dataset and archive integrity sweep.** Built.
4. **Digital product pipeline** with catalogue and price protection. Built.
5. **Drafting from the verification sheet** — needs Claude connected.
6. **Research assistance** (finding the primary instrument, contradictory evidence) — needs Claude connected with web research enabled.
7. **Subscriber, donation and sales dashboards** — need read-only MailerLite and PayPal connections.
