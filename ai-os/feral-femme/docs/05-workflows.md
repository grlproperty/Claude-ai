# Feral Femme — workflows

Each workflow is a JSON file in `workflows/`. Every step names its responsible agent. A step with a gate stops until the Editorial Director decides. Every step is logged; a failed step fails the run, raises a priority-1 task and can be retried; a step that lacks information blocks the run and says what is missing.

## New investigation
| | |
|---|---|
| Trigger | An investigation opportunity is identified |
| Input | Title, industry (one of the ten), question; then sources `{publisher, title, url, date, type}` and claims `{text, classification, sources}` |
| Output | A site-ready field note file, a visual brief with disclosure, briefing instructions, social captions, an archive entry |
| Approvals | Four (below) |
| Stops when | The industry is not one of the ten · a source lacks publisher, link, date or type · a claim is unsourced, misclassified or an allegation worded as fact · a figure in the draft is not on the verification sheet · a publisher is not credited · the voice check finds sensational wording |

| # | Step | Agent |
|---|---|---|
| 1 | Investigation opportunity identified | Investigation Discovery (A010) |
| 2 | Research brief created | Research Director (A009) |
| 3 | Public sources gathered | Public Records Researcher (A011) |
| 4 | Sources checked | Source Verification (A025) |
| 5 | Evidence categorised | Evidence Classification (A027) |
| 6 | Sources verified by a person — **approval (amber)** | Research Integrity Auditor (A033) |
| 7 | Editorial draft produced | Field Note Writer (A034) |
| 8 | Fact-checking completed | Editorial Fact Checker (A043) |
| 9 | Editorial voice checked | Editorial Voice Checker (A040) |
| 10 | Editorial review requested — **approval (amber)** | Managing Editor (A003) |
| 11 | Visual essay brief created | Visual Essay Director (A045) |
| 12 | Final human approval — **approval (amber; red if the note contains an allegation)** | Final Publication Reviewer (A044) |
| 13 | Website publication prepared | Website Publishing Assistant (A055) |
| 14 | Research briefing distribution | Newsletter Coordinator (A058) |
| 15 | Social content prepared — **approval (amber)** | Social Media Caption Writer (A061) |
| 16 | Archive updated | Archive Management Assistant (A063) |

**Evidence classes:** established fact · allegation · finding · opinion · editorial interpretation · unresolved question. The first three need a source. Unresolved questions are printed under "What is not established".

**Without Claude connected**, step 7 assembles a labelled skeleton from the verification sheet rather than writing prose, and the final approval packet says the prose is still to be written. With Claude connected, the writer is given only the confirmed claims and is told to add no fact that is not among them; the fact check then enforces that.

**Publication.** The approved file goes to the outbox; a person adds it to `content/field-notes/`, sets the date and pushes. The Research Briefing then sends itself after the deploy.

## Digital product
Opportunity → demand and source research → outline → content → editorial review → design specification → quality assurance → **approval** → listing → sales tracking.

- The name is checked against the live catalogue.
- The system never suggests a price. With no price, the run stops. A price that differs from the catalogue raises the approval to **red**.
- A document that is still a skeleton or has unsourced statements is marked "not ready to sell" in the approval.

## Integrity sweep
Reads every tool dataset's `reviewed` date and review cycle and raises a task when one is overdue or due within 14 days; audits every published field note for title, summary, topic and date. Raises each task once.

## Adding a workflow
Copy a JSON file, name the steps, point each at an agent and a handler in `handlers/index.mjs`, add a gate where anything is published, and add a test. The system refuses to start if a step names an unknown agent, handler or action.
