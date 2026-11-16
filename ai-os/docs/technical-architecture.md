# Technical architecture, stack and separation

## The decision in one paragraph
Claude is the reasoning engine. Around it sits a small orchestration layer that the owner controls: a registry of agents, a workflow runner, an approval gate, a database and a dashboard, per business. Rule-based work runs as ordinary code; only writing and judgement go to Claude. This keeps cost low, makes the controls testable, and avoids both 137 separate AI subscriptions and a large software estate.

## Options evaluated
| Layer | Options considered | Chosen | Why |
|---|---|---|---|
| Reasoning | Claude Projects (chat); Claude API; Claude Managed Agents | **Claude API** for the system; **Claude Projects** for people | Projects are excellent for a person working interactively with the knowledge base, but cannot enforce an approval gate or run unattended. The API can. Managed Agents is worth revisiting when long-running research agents are needed |
| Agents | One Claude instance per agent; one orchestrator with instruction profiles | **One orchestrator, many instruction profiles** | An agent is an ID, an instruction file, a permission ceiling and optionally a coded handler. Same intelligence, one bill, one place to audit |
| Orchestration | No-code automation platforms (Zapier, Make, n8n); own workflow runner | **Own runner (about 100 lines)** now; a no-code platform optional later for connectors | An approval gate that cannot be bypassed must sit in code the owner controls. A platform is useful as the "hands" for specific connections once the gate exists |
| Tools and connections | Model Context Protocol connectors; direct APIs | **MCP connectors where an official one exists**, direct API otherwise | Several connectors are already visible in the owner's Claude account. Each is added per business, after testing |
| Database | SQLite; PostgreSQL; hosted database | **SQLite, one file per business** | No server to run, trivially separate, easy to back up. PostgreSQL when several people write at once or the GRLP Executive OS becomes the system of record |
| Search | Full-text search; vector database | **SQLite full-text search** | With 16 documents per business a vector database adds cost and nothing else. Revisit beyond a few hundred documents |
| Dashboard | Next.js or similar; plain HTML | **One HTML file served by Node** | Nothing to build or maintain; themed per business from its own configuration; no third-party requests |
| Hosting | Office PC; small cloud server; serverless | **Start on one machine; a small server per business when remote access is needed** | See the cost plan |
| Authentication | None; shared token; single sign-on | **Local-only by default; access token when exposed** | The server refuses to listen on a network address without a token. Single sign-on is the upgrade path when more people use it |
| Monitoring | External service; built-in | **Built-in audit log, usage log and warnings** | Failures become tasks and appear in the daily report |

## What runs where
```
ai-os/
  engine/            code only — names neither business
    tenant.mjs       loads ONE business; refuses any path outside it
    db.mjs           one SQLite file per business, stamped with its id
    policy.mjs       the approval gate (green / amber / red)
    workflows.mjs    step runner: gates, blocking, failure, retry, logging
    orchestrator.mjs routes an instruction to a workflow or agent
    llm.mjs          Claude, with that business's own key
    kb.mjs           knowledge base index and search
    reports.mjs      daily / weekly / monthly reports; dashboard state
    server.mjs       command centre API   ·   dashboard.html
    cli.mjs          command line         ·   build-registry.mjs
  grlp/              tenant.json · registry/ · knowledge/ · workflows/ · handlers/ · docs/ · data/ (ignored)
  feral-femme/       the same shape, entirely its own
  tests/             51 tests
```

## Separation, and how it is demonstrated
| Requirement | Mechanism | Test |
|---|---|---|
| Separate orchestrator and workforce | Each process loads one registry; agent IDs are prefixed; an unknown agent is refused | `knowledge, agents, records and prompts never cross` |
| Separate database | One file per business, stamped; opening it as the other business throws | `a database stamped for one business refuses to open as the other` |
| Separate knowledge and documents | Each index is built only from its own folder | same test; cross-searches return nothing |
| Separate CRM, finance, reports | All are records in that business's database and data directory | data-directory overlap test |
| Separate integrations and credentials | Different environment variable names for API key, token and data directory | `each business uses its own credentials and port` |
| Separate permissions and approvers | Approver list per business; only a listed person can decide | approval tests |
| Separate dashboards | Separate process and port; no route can name another business | API test |
| No shared context | The engine contains neither business's name; neither folder contains the other's | `the engine holds no business data`, `no business directory contains the other business's name` |

The one thing the two share is engine **code**. That is the "common technical infrastructure" the brief permits where isolation is demonstrable — and the tests are the demonstration. To remove even that, `engine/export-business.mjs` copies a business and the engine into its own repository.

## Claude usage
- Model: `claude-opus-5-5` by default, set per business in `tenant.json`. Routine drafting can be moved to a cheaper model there; see the cost plan.
- Each agent call sends that business's standing rules and the agent's instruction file as a cached system prompt, plus only the knowledge documents the agent's department may read.
- The API key belongs to one business. Create one Anthropic workspace and key per business so usage, limits and billing are separate.
- Refusals, rate limits and cut-off responses are surfaced as step failures, never as empty output.
- Token usage is logged per agent in each business's database.

## Security controls implemented
Separate databases and credentials · role-based approver lists · token authentication with constant-time comparison · JSON-only state-changing requests · security headers · no secrets in files · audit log of every step, request, decision, setting change and export · human approval records · backup command · read-only site mount · local-only listening by default · failed hand-offs leave an approval pending rather than half-applied.

## Not yet implemented (stated plainly)
Encryption at rest (use full-disk encryption on the host) · per-user logins · API rate limiting on the command centre · automatic scheduled backups · data-retention automation. Each is in the checklist; none is needed before real data and remote access are introduced, and all are needed after.
