# Cost and resource plan

Prepared 15 November 2026. **Every rand figure is an estimate built on stated assumptions**, not a quotation.

## Assumptions
- **Exchange rate:** R16.40 to US$1 (mid-market quotes around 10 November 2026 were R16.37–R16.38). Card and bank rates will be higher.
- **Claude API prices** (Anthropic's published first-party rates as of early November 2026, per million tokens): Opus 5.5 $4 in / $20 out · Sonnet 5.5 $2 / $10 · Haiku 5.5 $0.10 / $0.50. Cached input is billed at a small fraction of the input rate.
- **One agent call** ≈ 5,000 input tokens (about 4,000 of them the cached standing rules, instructions and knowledge) and about 1,000 visible output tokens, plus reasoning tokens. On Opus 5.5 that is roughly **US$0.035 (about R0.57) per call**. On Sonnet 5.5, roughly half.
- **Rule-based agents cost nothing per use.** Scoring, matching, checking, tracking and reporting are code.
- 22 working days a month.
- Subscription and hosting prices marked ⚠ are typical market figures that were **not** verified in this session — check the supplier's current price page before budgeting.

## Monthly Claude API cost, per business
| Usage level | Agent calls per working day | What that looks like | Opus 5.5 | Sonnet 5.5 for routine drafting |
|---|---|---|---|---|
| Light | 50 | A handful of listings, enquiries or one note a week, plus daily content | ≈ US$39 · **R630** | ≈ **R320** |
| Medium | 200 | Daily content on every platform, every enquiry drafted, weekly research | ≈ US$154 · **R2,530** | ≈ **R1,270** |
| Heavy | 600 | Everything above plus research agents and long-form drafting | ≈ US$462 · **R7,580** | ≈ **R3,790** |

Expected starting point: **GRLP between light and medium; Feral Femme light**, because its volume is a few notes a month and its heaviest step is human verification. Set a monthly spend limit on each Anthropic workspace so a runaway loop cannot exceed it.

## Software and hosting, per month
| Item | GRLP | Feral Femme | Notes |
|---|---|---|---|
| Claude API | R630 – R2,530 | R320 – R630 | Above |
| Claude subscription for people (interactive use of the Claude Project) | ⚠ about R330 – R500 per person | ⚠ about R330 | ⚠ Historically about US$20 per person per month for an individual plan, more per seat for team plans. Optional: the system itself runs on the API |
| Hosting | R0 on an existing office PC, or ⚠ about R100 – R250 for a small cloud server | R0 on the founder's machine, or ⚠ about R100 – R250 | ⚠ Small virtual servers are typically US$5 – US$15 a month. One per business keeps separation physical |
| Database, search, dashboard, workflow engine | R0 | R0 | Included: SQLite and Node, no licences |
| WhatsApp Business Platform | ⚠ per-conversation fees | — | ⚠ Meta charges per conversation by category; verify before enabling alerts |
| Social scheduling tool (optional) | ⚠ R0 – R600 | ⚠ R0 – R600 | Only if direct platform connections prove impractical |
| Existing tools (PropCntrl, TPN, Property24, MailerLite, PayPal, Dropbox) | No change | No change | Already paid for; this system adds no cost to them |
| **Indicative total** | **about R700 – R3,500** | **about R350 – R1,500** | Excluding people's time and existing tools |

## Implementation cost
No software has to be bought to reach the current state. What remains is **people's time** and, if wanted, a developer for the connections.

| Step | Who | Effort |
|---|---|---|
| Answer the open questions in the README | Owner | 1 hour |
| Create two Anthropic workspaces and keys; set spend limits | Owner | 30 minutes |
| Move GRLP to its own private repository; choose hosting; set tokens; schedule backups and the daily sweep | Owner or a developer | Half a day |
| Supply approved templates and SOPs for the GRLP knowledge base | General Manager | 2 – 4 hours |
| Trial month on the outbox: approve real work, correct the agents' instructions | Approvers | 15 – 30 minutes a day |
| Connect email in (GRLP) | Developer, or Claude Code in a further session | About 1 day |
| Connect PropCntrl listings (GRLP) | Depends on what PropCntrl offers | To be scoped |
| Connect social publishing (each business) | Developer | 1 – 2 days each, after platform approval |
| Switch on site publishing; connect MailerLite and PayPal reporting (Feral Femme) | Developer | About 1 day |

## Human involvement that stays, by design
| | GRLP | Feral Femme |
|---|---|---|
| Daily | Read the daily report (5 minutes); decide approvals; act on hot leads | Read the daily report; decide approvals |
| Per item | Approve every client message and every campaign; place the real logo and photograph on layouts | Verify every claim against its source; write or direct the prose; approve publication; direct the imagery |
| Always human | Valuations and prices, mandates, tenant approval, leases, money, legal and regulatory matters, staff matters | Editorial judgement, allegations, pricing, money, corrections |
| Monthly | Review targets, the roadmap and agent instructions | Review dataset tasks, the roadmap and agent instructions |

## Keeping cost down
1. Leave rule-based work as code (already the case).
2. Keep the standing rules and knowledge stable so they stay cached.
3. Set `"model"` in `tenant.json` to a cheaper model for routine drafting once quality has been compared on real work; keep the strongest model for judgement and long-form writing.
4. Watch the per-agent usage log (`usage` table; shown in the dashboard state) and trim any agent that is called more than its value justifies.
