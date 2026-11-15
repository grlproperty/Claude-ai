# Garden Route Lifestyle Property — system architecture

```mermaid
flowchart TB
  H["LEVEL 1 · HUMAN OWNERS<br/>Mandy Pelser (Principal) · Kandy Grieve (GM) · Ayden Brown"]
  CC["GRLP COMMAND CENTRE<br/>port 4401 · own access token"]
  O["LEVEL 2 · AI MANAGING DIRECTOR (GRLP-A001)<br/>routes instructions · runs workflows · checks work · daily report"]
  GATE{{"APPROVAL GATE<br/>green: automatic · amber: review · red: typed authorisation"}}
  subgraph DEPTS["LEVEL 3 · DEPARTMENT HEADS  →  LEVEL 4 · SPECIALIST AGENTS (157 roles)"]
    direction LR
    D1["D01 Executive & BI (8)"]
    D2["D02 Sales & Listing Acquisition (15)"]
    D3["D03 Buyer Management (13)"]
    D4["D04 Property Marketing (19)"]
    D5["D05 Creative Studio (11)"]
    D6["D06 Customer Service (9)"]
    D7["D07 Rentals & Property Mgmt (14)"]
    D8["D08 Back Office (13)"]
    D9["D09 Finance (8)"]
    D10["D10 Compliance & Risk (7)"]
    D11["D11 Knowledge & Training (7)"]
    D12["D12 Growth (13)"]
    D13["D13 Marketing Operations (20)"]
  end
  subgraph BRAIN["CENTRAL INTELLIGENCE — GRLP only"]
    KB[("Knowledge base<br/>16 documents, owned and versioned")]
    DB[("GRLP database<br/>records · tasks · approvals · runs · audit")]
    REG["Agent registry + instruction files"]
    WF["Workflows<br/>buyer enquiry · new listing · maintenance · daily sweep"]
    LLM["Claude API<br/>GRLP's own key and workspace"]
  end
  OUT["OUTBOX<br/>approved work, ready to send"]
  subgraph APPS["APPLICATIONS (connected one at a time, after testing)"]
    A1["Email (xneelo)"]; A2["WhatsApp Business"]; A3["PropCntrl CRM"]; A4["Property24 / Private Property"]
    A5["Facebook · Instagram · TikTok · LinkedIn"]; A6["Dropbox"]; A7["TPN"]; A8["Accounting"]
  end
  REP["REPORTS<br/>daily · weekly · monthly · scorecards · CSV exports"]
  H <--> CC <--> O
  O --> DEPTS
  DEPTS <--> BRAIN
  DEPTS --> GATE
  GATE -- "approved by a named person" --> OUT --> APPS
  GATE -- "rejected: rework task" --> DEPTS
  O --> REP --> H
  APPS -. "enquiries, listings, payments (read)" .-> DEPTS
```

## How the levels work
1. **Human owners** decide. Brand and marketing approvals go to Mandy or Kandy, as the Brand Kit requires.
2. **AI Managing Director** receives an instruction, chooses the workflow or agent that owns it, starts the work and reports. If it cannot tell who owns something it logs it as unrouted; it does not guess.
3. **Department heads** own a department's workflows and results.
4. **Specialist agents** each do one defined job. 33 are live as tested code; 104 are instruction profiles that work as soon as Claude is connected; 20 wait for an application to be connected.
5. **Human approval** sits between every agent and the outside world.

## An agent is not a separate Claude subscription
All agents share one orchestrator and one Claude API key for GRLP. An "agent" is a registry entry: an ID, an instruction file, a permission ceiling and, where the job is rule-based, a coded handler. Deterministic work (scoring, matching, checking, tracking) runs as code and costs nothing per use; only writing and judgement calls go to Claude.

## Relationship to the Executive OS
An earlier build on the branch `claude/grlp-ai-executive-os` (a Next.js and PostgreSQL application) covers the principal's executive administration: work routing, escalation, document preparation, mail and WhatsApp ingestion. It is not merged. This workforce layer is deliberately small and self-contained; the sensible next step is to decide whether the Executive OS becomes the system of record that these workflows read from and write to (see the roadmap, wave 4).

## Security and data protection
- GRLP's database, knowledge, registry, credentials and port are its own. The runtime refuses any path outside this business.
- The command centre listens on the local machine only unless an access token is set.
- Secrets are read from environment variables only: `GRLP_ANTHROPIC_API_KEY`, `GRLP_DASHBOARD_TOKEN`, `GRLP_DATA_DIR`. None is stored in a file.
- **POPIA:** buyer records carry a marketing-consent flag; without it the system replies to the enquiry and nothing more. WhatsApp alerts are for opted-in contacts and carry an opt-out.
- **FICA and transaction documents are not stored here.** The system records only whether each document is on file.
- Every step, request, decision and export is in the audit log. Backups: `npm run grlp -- backup`.
- Real client data lives only in the data directory, which is never committed.
