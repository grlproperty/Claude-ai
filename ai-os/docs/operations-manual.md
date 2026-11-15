# Operations manual

How to run each AI company day to day. Commands are shown for GRLP (`npm run grlp -- …`); for Feral Femme use `npm run ff -- …`. Run them from the `ai-os` folder. Everything here can also be done in the command centre in a browser.

## 1. Starting up
```bash
npm install                 # once
npm run grlp -- serve       # GRLP command centre at http://127.0.0.1:4401
npm run ff -- serve         # Feral Femme command centre at http://127.0.0.1:4402
```
Each is a separate process with separate data. Run one, the other, or both.

To connect Claude, set that business's own key before starting it, in the shell or the host's secret store — never in a file in this repository:
```bash
export GRLP_ANTHROPIC_API_KEY=…        # GRLP's Anthropic workspace
export FF_ANTHROPIC_API_KEY=…          # Feral Femme's Anthropic workspace
```
To allow access from another device, set `GRLP_DASHBOARD_TOKEN` (or `FF_DASHBOARD_TOKEN`) and start with `--host 0.0.0.0`. Without a token the system refuses to listen on the network. Put it behind HTTPS.

To keep real data outside the repository folder, set `GRLP_DATA_DIR` / `FF_DATA_DIR` to a folder that is backed up.

## 2. Giving instructions
Type into **"Here's what I need done today"**, or:
```bash
npm run grlp -- instruct "New buyer enquiry {\"name\":\"…\",\"phone\":\"…\",\"message\":\"…\"}"
npm run grlp -- instruct "Show me the sales scorecard"
npm run ff   -- instruct "What is our corrections policy?"
```
The orchestrator picks the workflow or agent that owns the instruction and tells you what it did:
- **started** a workflow (and where it is waiting),
- **needs information** — it names the missing fields and logs a task,
- **done** — a live agent completed it,
- **queued** — assigned to an agent that needs Claude connected,
- **unrouted** — nothing clearly owns it; logged for you rather than guessed.

With Claude connected, the orchestrator reads free text and extracts the details itself, using only what you actually said.

## 3. Assigning work directly
Use **Run a workflow** in the command centre: pick the workflow, edit the example input, press Start. Or:
```bash
npm run grlp -- workflows                       # what exists and what each needs
npm run grlp -- run new-property-listing '{…}'
npm run grlp -- resume RUN-0007 '{"price": 2950000}'   # supply what a blocked run was missing, or retry a failed one
```

## 4. Monitoring progress
- **Command centre:** priorities, warnings, tiles, tasks, workflow history (open a run to see every step and who did it), agent activity. Switch between Daily, Weekly and Monthly.
- **Command line:** `status`, `tasks`, `runs`, `runs RUN-0007`, `audit`.

## 5. Approving
Everything that would reach a client, the public or money waits under **Pending approvals**.

1. Open **Review what will be released** and read it.
2. Choose your name. Approve, or reject with a reason (the reason becomes the agent's rework task).
3. **Red** items need the phrase shown (for example `AUTHORISE AP-0012`) typed exactly.

```bash
npm run grlp -- approvals
npm run grlp -- approve AP-0012 --by "Kandy Grieve"
npm run ff   -- approve AP-0003 --by "Ayden Rosemary Brown" --confirm "AUTHORISE AP-0003"
npm run grlp -- reject  AP-0013 --by "Mandy Pelser" --note "Price is wrong"
```
Approved work is written to that business's `data/outbox/`. **Until a connection is switched on, a person sends or publishes it from there.** For Feral Femme, the approved field note file goes into `content/field-notes/` of the site, with the publication date set, and is pushed; the briefing then sends itself.

| Level | Meaning | Examples |
|---|---|---|
| Green | Automatic | Research, drafts, internal summaries, tasks, analysis, internal reports |
| Amber | A named person reviews | Social posts, website updates, client messages, campaigns, editorial publication, financial reports |
| Red | Typed authorisation | Payments, bank details, signing, contracts, legal commitments, allegations, deleting records, permissions, employment, tenant approval, lease changes, valuations, prices |

## 6. Reports
```bash
npm run grlp -- report day      # also: week, month
```
Or **Generate report for this period**. Ten sections: completed, needs attention, outstanding tasks, deadlines, opportunities, problems, agent performance, pending approvals, suggested improvements, three highest-priority actions. Saved under `data/reports/`. CSV exports of tasks, approvals, runs, agents and the audit trail are one click each.

## 7. Scheduling the routine
Nothing runs on a timer until you add one. On the host, add scheduled jobs such as:
```
30 6 * * 1-5   cd /path/to/ai-os && npm run -s grlp -- run daily-sweep '{}' && npm run -s grlp -- report day
0  7 * * 1     cd /path/to/ai-os && npm run -s ff -- run integrity-sweep '{}' && npm run -s ff -- report week
0  2 * * *     cd /path/to/ai-os && npm run -s grlp -- backup && npm run -s ff -- backup
```

## 8. Changing targets (GRLP)
Command centre → **Targets** → edit → choose your name → Save. Scorecards recalculate at once and the change is in the audit trail. Or:
```bash
npm run grlp -- targets --set '{"sales": 3, "commission_rate_pct": 5}' --by "Mandy Pelser"
```

## 9. Changing an agent's instructions
1. Open that business's `registry/source.mjs`. Find the agent's line, or its department's `rules`.
2. Edit the role, rules, ceiling or wave.
3. `npm run build` regenerates the registry, the spreadsheet, every instruction file and the roadmap. `npm test` confirms nothing broke.

Rules that apply to every agent in a business are the `constitution` lines in its `tenant.json`.

## 10. Adding an agent
- **A writing or judgement agent:** add one line to `registry/source.mjs` with the next number, then `npm run build`. It is *ready* as soon as Claude is connected, and the orchestrator can route to it.
- **A rule-based agent:** also add a function to `handlers/index.mjs`, name it as the agent's handler, and add a test. It becomes *live*.
- **To make it part of a process:** add a step to a workflow JSON file.

## 11. Adding knowledge
Add a Markdown file under that business's `knowledge/` folder with this header, then run `kb-reindex`:
```
---
title: Rental application checklist
owner: Rentals Agent
version: 1
updated: 2026-11-20
status: verified            # verified | assumption | to-confirm
source: Rentals SOP, November 2026
access: all                 # or department ids, e.g. D07,D10
---
```
Version history is the file's history in git. Agents may rely only on what is here.

## 12. Switching on a connection
Connections are listed in each business's integration register. The rule: test it with sample data, run it through the outbox for a while, then enable it in `tenant.json` under `dispatch`. Feral Femme's site publishing is the worked example: set the `site` mount to `"mode": "rw"` **and** set `"enabled": true` for `editorial.publish` and `allegation.publish`. Both settings are needed; either alone does nothing or fails safely.

## 13. Troubleshooting
| Symptom | Cause | What to do |
|---|---|---|
| A run is **blocked** | Information is missing, or a check failed | Open the run; the reason and the list are on the step. Supply it with `resume`, or fix the input and start again |
| A run is **failed** | A step threw an error | A priority-1 task explains it. Fix the cause, then `resume RUN-…` to retry from that step |
| "…is not permitted to request…" | An agent tried an action above its ceiling | Working as designed. Route the step through an agent whose role includes it; it will still need human approval |
| "Approvals must be decided by a named person" / "not an authorised approver" | The name is not on the approver list | Use a listed name, or change `approvers` in `tenant.json` (a deliberate, reviewable change) |
| Agents are **queued**, not working | Claude is not connected for that business | Set its API key and restart |
| "Claude API key … was rejected" / rate limit | Key or limits | Check the key and the workspace's limits in the Anthropic Console |
| "Isolation violation" | A path, database or mount points at the other business | Working as designed. Check the data directory settings |
| Knowledge search finds nothing | The index is stale or the document is missing | `kb-reindex`; add the document |
| The command centre asks for a token | A token is set | Enter it in the box at the top right |
| Something looks wrong and you want to stop everything | — | Stop the process. Nothing is sent without approval, and approved items sit in the outbox until a person acts |

## 14. Backups and recovery
`npm run grlp -- backup` writes a consistent copy of the database to `data/backups/`. Copy backups off the machine. To recover, stop the process and replace `data/aios.db` with a backup. The knowledge base, registry and workflows are in git.

## 15. Removing someone's access
Remove their name from `approvers` in that business's `tenant.json`, change that business's dashboard token, and restart. Rotate the Claude API key in the Anthropic Console if they had it.
