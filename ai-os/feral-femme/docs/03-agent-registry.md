# Feral Femme — agent registry

Generated from `registry/source.mjs` by `npm run build`. Do not edit by hand.

The registry is data, in three forms:

- **`registry/agents.csv`** — the spreadsheet: one row per agent, opens in Excel or Google Sheets.
- **`registry/agents.json`** — what the system itself reads.
- **`registry/instructions/FF-Annn.md`** — one instruction file per agent.

Every agent has: unique name and ID, department, level, who it reports to, role, responsibilities, instructions, required inputs, expected outputs, tools, permissions, performance measures, escalation rules, approval ceiling, audit rule, status, wave and priority.

## Departments
| | Department | Head | Roles | Live | Ready | Planned |
|---|---|---|---|---|---|---|
| D01 | Executive and Editorial Management | AI Publisher (FF-A001) | 8 | 3 | 5 | 0 |
| D02 | Investigative Research | Research Director (FF-A009) | 16 | 3 | 13 | 0 |
| D03 | Source Verification and Fact Checking | Research Integrity Auditor (FF-A033) | 9 | 3 | 6 | 0 |
| D04 | Editorial Production | Final Publication Reviewer (FF-A044) | 11 | 4 | 7 | 0 |
| D05 | Visual Essay and Creative Studio | Visual Essay Director (FF-A045) | 10 | 2 | 7 | 1 |
| D06 | Publishing and Distribution | CMS Content Manager (FF-A056) | 9 | 4 | 4 | 1 |
| D07 | SEO and Website Growth | SEO Director (FF-A064) | 9 | 0 | 8 | 1 |
| D08 | Products and Revenue | Digital Product Manager (FF-A074) | 12 | 4 | 4 | 4 |
| D09 | Free Tools and Digital Products | Interactive Tool Manager (FF-A085) | 9 | 1 | 8 | 0 |
| D10 | Audience and Reader Relationships | Subscriber Management Assistant (FF-A094) | 7 | 0 | 4 | 3 |
| D11 | Business Operations and Analytics | Business Operations Manager (FF-A101) | 12 | 2 | 6 | 4 |
| D12 | Marketing Operations (One-Person Marketing Team) | Marketing Operations Lead (FF-A113) | 17 | 0 | 10 | 7 |
| | **Total** | | **129** | **26** | **82** | **21** |

**Status.** *Live*: a coded, tested handler does the job today. *Ready* (llm-ready): the instruction profile is written and the orchestrator can run it as soon as this business's Claude key is set. *Planned*: needs an application connected first.

**Ceiling.** The highest level of action an agent may *request*: green (internal only), amber (may submit customer-facing or public work for review), red (may prepare a request that needs typed authorisation). No agent approves anything, and handing work to another agent never lowers the approval it needs.

The role slots in the owner's brief keep their original numbers. Higher numbers are the one-person-marketing-team roles that had no existing equivalent; see `marketing-team.md`.

## Live agents
| Agent | Department | What it does today |
|---|---|---|
| AI Publisher (FF-A001) | D01 | Central orchestrator. Receives instructions, assigns work across departments, checks completed work against the editorial standards and reports to the human Editorial Director. |
| Managing Editor (FF-A003) | D01 | Assembles each note with its evidence into a review packet and requests editorial review. |
| Editorial Standards Checker (FF-A005) | D01 | Answers questions from the editorial standards and checks work against them, citing the clause. |
| Research Director (FF-A009) | D02 | Department head. Turns an investigation idea into a research brief: the question, the scope and the sources required. |
| Investigation Discovery (FF-A010) | D02 | Registers an investigation opportunity against one of the ten industries. |
| Public Records Researcher (FF-A011) | D02 | Gathers and registers public sources with publisher, title, date and link. |
| Source Verification (FF-A025) | D03 | Checks each source is complete, linkable and dated, and whether its publisher is on the standing list of cited authorities. |
| Evidence Classification (FF-A027) | D03 | Classifies every claim and blocks any that is unsourced, misclassified or worded beyond its evidence. |
| Research Integrity Auditor (FF-A033) | D03 | Department head. Produces the verification sheet a person signs before any draft is written. |
| Field Note Writer (FF-A034) | D04 | Writes the field note from the verified claims in the site's own format. |
| Editorial Voice Checker (FF-A040) | D04 | Checks a draft for sensational language, clickbait and tone. |
| Editorial Fact Checker (FF-A043) | D04 | Checks every figure and attribution in the draft against the verification sheet. |
| Final Publication Reviewer (FF-A044) | D04 | Department head. Assembles the final package and requests human approval to publish. |
| Visual Essay Director (FF-A045) | D05 | Department head. Writes the visual brief: concept, constraints, disclosure and reference. |
| Brand Design Manager (FF-A052) | D05 | Specifies layout and typography in the Feral Femme design system. |
| Website Publishing Assistant (FF-A055) | D06 | Produces the site-ready field note file and records the publication. |
| Newsletter Coordinator (FF-A058) | D06 | Prepares The Research Briefing for each new note. |
| Social Media Caption Writer (FF-A061) | D06 | Writes restrained social captions that credit the source. |
| Archive Management Assistant (FF-A063) | D06 | Closes the loop: records the note, its sources and its visuals in the research archive. |
| Product Development Researcher (FF-A073) | D08 | Registers a product opportunity and the demand evidence behind it. |
| Digital Product Manager (FF-A074) | D08 | Department head. Outlines each document and manages it to release. |
| Product Quality Checker (FF-A081) | D08 | Checks a document for unsourced claims, invented prices and voice before release. |
| Product Marketing Assistant (FF-A083) | D08 | Prepares the product listing copy for approval. |
| Tool Data Verification Assistant (FF-A092) | D09 | Checks every dataset against its declared review cycle and raises a review task when one is due. |
| Product Sales Analyst (FF-A109) | D11 | Sets up and reports sales tracking for each document. |
| Research Archive Manager (FF-A110) | D11 | Audits the published archive: every note dated, attributed and complete. |
