# Two AI business operating systems

Two businesses. Two AI workforces. One human in control of each.

| | **Garden Route Lifestyle Property** | **Feral Femme** |
|---|---|---|
| Folder | [`grlp/`](grlp/) | [`feral-femme/`](feral-femme/) |
| Orchestrator | AI Managing Director (GRLP-A001) | AI Publisher (FF-A001) |
| Agent roles | 157 — 33 live, 104 ready, 20 planned | 129 — 26 live, 82 ready, 21 planned |
| Workflows | New buyer enquiry · New property listing · Maintenance request · Daily sweep | New investigation · Digital product · Integrity sweep |
| Command centre | `npm run grlp -- serve` → http://127.0.0.1:4401 | `npm run ff -- serve` → http://127.0.0.1:4402 |
| Approvers | Mandy Pelser, Kandy Grieve, Ayden Brown | Ayden Rosemary Brown |
| Database, knowledge, credentials | Its own | Its own |

*Live* = coded and tested, working today without any AI key. *Ready* = instruction profile written; works when that business's Claude API key is set. *Planned* = needs an application connected first.

## Start here

```bash
cd ai-os
npm install
npm test                      # 51 tests: isolation, approvals, every workflow

npm run grlp -- seed-sample   # GRLP only: clearly-labelled SAMPLE records to try it with
npm run grlp -- serve         # GRLP command centre
npm run ff -- serve           # Feral Femme command centre (separate process, port and data)
```

Needs Node 22.13 or newer. Then read [`docs/operations-manual.md`](docs/operations-manual.md).

## The deliverables

| # | Deliverable | GRLP | Feral Femme |
|---|---|---|---|
| 1 | Business audit | [audit](grlp/docs/01-business-audit.md) | [audit](feral-femme/docs/01-business-audit.md) |
| 2 | System architecture (diagrams) | [architecture](grlp/docs/02-architecture.md) | [architecture](feral-femme/docs/02-architecture.md) |
| 3 | Agent registry | [guide](grlp/docs/03-agent-registry.md) · [spreadsheet](grlp/registry/agents.csv) · [instructions](grlp/registry/instructions/) | [guide](feral-femme/docs/03-agent-registry.md) · [spreadsheet](feral-femme/registry/agents.csv) · [instructions](feral-femme/registry/instructions/) |
| 4 | Implementation roadmap | [roadmap](grlp/docs/04-implementation-roadmap.md) | [roadmap](feral-femme/docs/04-implementation-roadmap.md) |
| 5 | First working system | [workflows](grlp/docs/05-workflows.md) | [workflows](feral-femme/docs/05-workflows.md) |
| — | Integration register | [register](grlp/docs/06-integration-register.md) | [register](feral-femme/docs/06-integration-register.md) |
| — | One-person marketing team | [map](grlp/docs/marketing-team.md) | [map](feral-femme/docs/marketing-team.md) |
| 6 | Cost and resource plan | [`docs/cost-and-resource-plan.md`](docs/cost-and-resource-plan.md) | ← same document, separate columns |
| 7 | Operations manual | [`docs/operations-manual.md`](docs/operations-manual.md) | ← same |
| — | Technical architecture and separation | [`docs/technical-architecture.md`](docs/technical-architecture.md) | ← same |
| — | Claude Projects setup | [`docs/claude-projects-setup.md`](docs/claude-projects-setup.md) | ← same |

## How the two are kept apart

One small engine (`engine/`, code only — it does not contain either business's name) runs **one business per process**. Each business has its own folder, SQLite database, knowledge base, registry, API key, access token and port. The engine refuses any file path outside the business it was started for, refuses to open a database stamped for the other business, and refuses a data directory or mount that overlaps the other. `tests/isolation.test.mjs` proves each of these, and also checks that neither business's folder, records, audit log or prompts contain the other's name.

## Read this before putting real data in

1. **This repository also holds the Feral Femme website, and earlier notes on another branch describe it as public.** Nothing confidential is committed: no client, tenant, subscriber or unpublished research data, and no secrets. All of that lives in each business's `data/` directory, which is git-ignored. Keep it that way.
2. **GRLP's system should move to its own private repository before go-live.** It sits here only because this session could write to this repository alone. `node engine/export-business.mjs grlp <folder>` produces a standalone copy.
3. **No live outbound connection is switched on.** Approved emails, posts and field notes are written to that business's outbox for a person to send or publish. Nothing customer-facing or financial happens automatically.
4. **Claude has not been called live.** No API key was available in the build session, so the Claude path is written to the current SDK but untested against the API. Everything marked *live* runs without it.

## Live implementation checklist

Legend: ✅ done and tested · 🟡 built, waiting on something named · ⬜ not started.

### Phase 1 — Foundation
- ✅ Both websites analysed; both businesses documented (audits)
- ✅ Existing software identified, with what is verified and what is to confirm
- ✅ Two separate architectures, security and access controls
- ✅ Both knowledge bases (GRLP 16 documents, Feral Femme 16, including its 2026 Brand Kit), searchable, with owner, version, provenance and access
- ✅ Both agent registries, with an instruction file per agent

### Phase 2 — Central intelligence
- ✅ GRLP orchestrator · ✅ Feral Femme orchestrator
- ✅ Delegation and approval protocol (one gate; level belongs to the action)
- ✅ Daily, weekly and monthly reports
- ✅ Separation tested (7 isolation tests)
- 🟡 Claude-backed routing and drafting — waiting on an API key per business

### Phase 3 — Core business operations
- ✅ GRLP: buyer leads, matching, pipeline tracking, listing intake, lease renewals, maintenance intake, sales performance engine
- 🟡 GRLP: seller-lead workflow (agents written; no workflow yet) · CRM is this system's own records until PropCntrl is connected
- ✅ Feral Femme: research brief, source checks, evidence classification, human verification gate, drafting skeleton, fact and voice checks, site-ready file, archive
- 🟡 Feral Femme: written prose — waiting on the Claude key

### Phase 4 — Marketing departments
- ✅ Both marketing teams mapped to agents; brand and voice checkers live, each enforcing that business's own Brand Kit
- ✅ GRLP listing campaign: description, SEO, captions, layout, schedule
- 🟡 Daily non-listing content (lifestyle, education, team) — waiting on the Claude key
- ⬜ Performance reporting from real platform data

### Phase 5 — Automation
- ✅ Workflow engine with gates, error handling, logging, retry
- 🟡 Feral Femme site publishing adapter — built, tested, switched off
- ⬜ Email in, CRM listings in, social publishing, WhatsApp, MailerLite and PayPal reporting (see each integration register for the order)
- ⬜ Scheduled runs of the daily sweep and integrity sweep (a cron entry; see the operations manual)

### Phase 6 — Dashboards
- ✅ Both command centres: day, week and month views, priorities, warnings, approvals, tasks, workflow history, agent status, knowledge search, reports, CSV exports
- ✅ GRLP targets editable without a rebuild

### Phase 7 — Testing and deployment
- ✅ Individual agents · delegation · complete workflows · approval controls · reporting · separation · command-centre API (51 automated tests)
- ✅ Both command centres exercised in a real browser
- ⬜ Integration reliability (nothing is connected yet)
- ⬜ Hosting, access tokens, backups scheduled
- ⬜ Owner sign-off before any live customer-facing action

## Questions only the owner can answer
1. GRLP approvers: the Brand Kit names Mandy and Kandy. Ayden Brown was added because the brief says "I retain ultimate control" — confirm or remove.
2. GRLP targets: are 4 mandates, 8 valuations and 80 contacts per agent or for the whole company? (Treated as per agent.)
3. GRLP commission rate, and which agent covers which area — both left unset rather than guessed.
4. Feral Femme product names: the six in the brief versus the four on the live site.
5. Which checkout sells the Feral Femme documents, and which accounting package GRLP uses.
6. Should the earlier GRLP Executive OS branch become the system of record these workflows connect to?
