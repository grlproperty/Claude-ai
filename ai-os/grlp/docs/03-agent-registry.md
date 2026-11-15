# Garden Route Lifestyle Property — agent registry

Generated from `registry/source.mjs` by `npm run build`. Do not edit by hand.

The registry is data, in three forms:

- **`registry/agents.csv`** — the spreadsheet: one row per agent, opens in Excel or Google Sheets.
- **`registry/agents.json`** — what the system itself reads.
- **`registry/instructions/GRLP-Annn.md`** — one instruction file per agent.

Every agent has: unique name and ID, department, level, who it reports to, role, responsibilities, instructions, required inputs, expected outputs, tools, permissions, performance measures, escalation rules, approval ceiling, audit rule, status, wave and priority.

## Departments
| | Department | Head | Roles | Live | Ready | Planned |
|---|---|---|---|---|---|---|
| D01 | Executive Management and Business Intelligence | AI Managing Director (GRLP-A001) | 8 | 3 | 5 | 0 |
| D02 | Sales and Listing Acquisition | Exclusive Mandate Acquisition (GRLP-A021) | 15 | 2 | 9 | 4 |
| D03 | Buyer Management and Sales Conversion | Sales Pipeline Management (GRLP-A033) | 13 | 7 | 6 | 0 |
| D04 | Property Marketing | Marketing Director (GRLP-A037) | 19 | 7 | 12 | 0 |
| D05 | Creative Studio | Graphic Design Director (GRLP-A056) | 11 | 2 | 6 | 3 |
| D06 | Customer Service | Customer Enquiry Manager (GRLP-A067) | 9 | 2 | 6 | 1 |
| D07 | Rentals and Property Management | Rental Lead Manager (GRLP-A076) | 14 | 3 | 9 | 2 |
| D08 | Back Office and Administration | Administrative Manager (GRLP-A090) | 13 | 3 | 8 | 2 |
| D09 | Finance and Financial Intelligence | Financial Controller Assistant (GRLP-A103) | 8 | 1 | 7 | 0 |
| D10 | Compliance and Risk Management | Property Practitioner Compliance Assistant (GRLP-A113) | 7 | 1 | 6 | 0 |
| D11 | Knowledge and Training | Company Knowledge Manager (GRLP-A118) | 7 | 2 | 5 | 0 |
| D12 | Growth and Business Development | Growth Strategy Assistant (GRLP-A133) | 13 | 0 | 12 | 1 |
| D13 | Marketing Operations (One-Person Marketing Team) | Marketing Operations Lead (GRLP-A138) | 20 | 0 | 13 | 7 |
| | **Total** | | **157** | **33** | **104** | **20** |

**Status.** *Live*: a coded, tested handler does the job today. *Ready* (llm-ready): the instruction profile is written and the orchestrator can run it as soon as this business's Claude key is set. *Planned*: needs an application connected first.

**Ceiling.** The highest level of action an agent may *request*: green (internal only), amber (may submit customer-facing or public work for review), red (may prepare a request that needs typed authorisation). No agent approves anything, and handing work to another agent never lowers the approval it needs.

The role slots in the owner's brief keep their original numbers. Higher numbers are the one-person-marketing-team roles that had no existing equivalent; see `marketing-team.md`.

## Live agents
| Agent | Department | What it does today |
|---|---|---|
| AI Managing Director (GRLP-A001) | D01 | Central orchestrator. Receives instructions, assigns work to departments, checks completed work, produces the daily report and escalates decisions to the human owner. |
| KPI Manager (GRLP-A004) | D01 | Maintains targets and calculates agent scorecards and the company sales dashboard. |
| Executive Reporting Agent (GRLP-A008) | D01 | Produces the weekly performance report and monthly business review. |
| Listing Qualification (GRLP-A013) | D02 | Checks a new listing for missing or inconsistent information before any marketing starts. |
| Mandate Tracking (GRLP-A017) | D02 | Tracks every mandate: type, start, expiry and renewal action. |
| Buyer Lead Capture (GRLP-A024) | D03 | Captures an enquiry into a clean, complete buyer record. |
| Buyer Qualification (GRLP-A025) | D03 | Scores a buyer lead on readiness, finance and fit, and shows its reasons. |
| Buyer Requirements Analysis (GRLP-A026) | D03 | Turns what the buyer said into structured search requirements and flags gaps. |
| Property Matching (GRLP-A027) | D03 | Matches qualified buyers to available listings and explains each match. |
| Viewing Scheduling (GRLP-A029) | D03 | Proposes viewing slots and records confirmed viewings. |
| Buyer Conversion Analysis (GRLP-A034) | D03 | Tracks each lead through the funnel and reports conversion. |
| Lost Lead Recovery (GRLP-A035) | D03 | Finds buyers who have gone quiet and raises a follow-up for the responsible agent. |
| Marketing Director (GRLP-A037) | D04 | Department head. Assembles each campaign and submits it for human approval. |
| Property Listing Copywriter (GRLP-A039) | D04 | Writes the on-brand listing description from the listing record. |
| SEO Specialist (GRLP-A040) | D04 | Prepares page title, meta description and keywords for each listing and article. |
| Facebook Content Creator (GRLP-A042) | D04 | Writes Facebook captions using the five-part caption formula and approved hashtags. |
| Instagram Content Creator (GRLP-A043) | D04 | Writes Instagram feed, story and reel captions in the visual, lifestyle-led style. |
| Content Calendar Manager (GRLP-A054) | D04 | Schedules approved content against the seven-day posting schedule. |
| Campaign Performance Analyst (GRLP-A055) | D04 | Tracks each campaign and reports what produced enquiries. |
| Property Advert Designer (GRLP-A058) | D05 | Produces the property advert layout and design brief for each listing. |
| Brand Consistency Checker (GRLP-A059) | D05 | Checks all copy and design specifications against the brand kit before a human sees them. |
| Customer Enquiry Manager (GRLP-A067) | D06 | Department head. Routes every enquiry to the responsible person and makes sure it has an owner. |
| Website Enquiry Assistant (GRLP-A068) | D06 | Drafts the first reply to a website enquiry for an agent to approve. |
| Lease Renewal Tracker (GRLP-A081) | D07 | Flags every lease approaching expiry and raises the renewal task. |
| Maintenance Request Coordinator (GRLP-A084) | D07 | Logs each maintenance request, classifies urgency and assigns an owner. |
| Tenant Communication Assistant (GRLP-A087) | D07 | Drafts routine tenant notices and acknowledgements for approval. |
| Data Entry Assistant (GRLP-A092) | D08 | Enters and updates records accurately from structured input. |
| Duplicate Contact Detection (GRLP-A094) | D08 | Detects probable duplicate contacts before a new record is created. |
| Task Management Assistant (GRLP-A097) | D08 | Creates, assigns and chases tasks so every action has an owner and a date. |
| Financial Controller Assistant (GRLP-A103) | D09 | Department head. Assembles the financial overview from the records. |
| Mandate Document Checker (GRLP-A114) | D10 | Checks that the mandate, mandatory disclosure and FICA items are recorded before marketing begins. |
| Company Knowledge Manager (GRLP-A118) | D11 | Department head. Maintains the knowledge base: ownership, versions and provenance. |
| Internal Search Assistant (GRLP-A124) | D11 | Finds the right document, template or rule and cites it. |
