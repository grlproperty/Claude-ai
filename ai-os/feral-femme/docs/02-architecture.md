# Feral Femme — system architecture

```mermaid
flowchart TB
  H["LEVEL 1 · HUMAN EDITORIAL DIRECTOR<br/>Ayden Rosemary Brown — every editorial decision"]
  CC["FERAL FEMME COMMAND CENTRE<br/>port 4402 · own access token"]
  O["LEVEL 2 · AI PUBLISHER (FF-A001)<br/>routes instructions · runs workflows · checks work against the standards · daily report"]
  GATE{{"APPROVAL GATE<br/>green: automatic · amber: review · red: typed authorisation<br/>any allegation about a named party is RED"}}
  subgraph DEPTS["LEVEL 3 · DEPARTMENT HEADS  →  LEVEL 4 · SPECIALIST AGENTS (129 roles)"]
    direction LR
    D1["D01 Executive & Editorial Mgmt (8)"]
    D2["D02 Investigative Research (16)"]
    D3["D03 Verification & Fact Checking (9)"]
    D4["D04 Editorial Production (11)"]
    D5["D05 Visual Essay & Creative (10)"]
    D6["D06 Publishing & Distribution (9)"]
    D7["D07 SEO & Website Growth (9)"]
    D8["D08 Products & Revenue (12)"]
    D9["D09 Free Tools (9)"]
    D10["D10 Audience & Readers (7)"]
    D11["D11 Operations & Analytics (12)"]
    D12["D12 Marketing Operations (17)"]
  end
  subgraph BRAIN["CENTRAL INTELLIGENCE — Feral Femme only"]
    KB[("Knowledge base<br/>constitution · brand kit · voice · standards · catalogue")]
    DB[("Feral Femme database<br/>investigations · sources · claims · approvals · audit")]
    REG["Agent registry + instruction files"]
    WF["Workflows<br/>new investigation · digital product · integrity sweep"]
    LLM["Claude API<br/>Feral Femme's own key and workspace"]
    SITE[("Site content — read-only<br/>field notes · datasets · cited authorities")]
  end
  OUT["OUTBOX<br/>approved, site-ready files"]
  subgraph APPS["APPLICATIONS"]
    A1["Site repository → GitHub Actions deploy"]; A2["MailerLite — The Research Briefing"]; A3["RSS feed"]
    A4["Instagram · Facebook · TikTok · LinkedIn"]; A5["PayPal donations"]; A6["Document checkout"]
  end
  REP["REPORTS<br/>daily · weekly · monthly · CSV exports"]
  H <--> CC <--> O
  O --> DEPTS
  DEPTS <--> BRAIN
  DEPTS --> GATE
  GATE -- "approved by the Editorial Director" --> OUT --> A1 --> A2
  A1 --> A3
  GATE -- "rejected: rework task" --> DEPTS
  O --> REP --> H
```

## The editorial pipeline and its four human gates
```mermaid
flowchart LR
  a[Opportunity] --> b[Research brief] --> c[Sources gathered] --> d[Sources checked] --> e[Evidence classified]
  e --> g1{{"GATE 1 · amber<br/>person verifies each claim against its source"}}
  g1 --> f[Draft] --> h[Fact check] --> i[Voice check]
  i --> g2{{"GATE 2 · amber<br/>editorial review"}}
  g2 --> j[Visual brief + disclosure]
  j --> g3{{"GATE 3 · amber, or RED if any allegation<br/>approve for publication"}}
  g3 --> k[Site-ready file] --> l[Briefing] --> m[Social captions]
  m --> g4{{"GATE 4 · amber<br/>social posts"}} --> n[Archive]
```

No draft exists until a person has confirmed the verification sheet. That is the platform's published standard — "every factual claim … is verified against the named source by a human before publication" — enforced as a step that cannot be skipped.

## What the automated checks do, and do not do
They confirm **structure**: a source has a publisher, title, working link, date and type; a claim has a classification and, where needed, a source; an allegation says who alleges it; every figure in the draft appears on the verification sheet; every publisher is credited by name; the voice is restrained. They do **not** decide whether a source says what a claim says. Only a person does.

## An agent is not a separate Claude subscription
All agents share one orchestrator and one Claude API key for Feral Femme. An agent is a registry entry: an ID, an instruction file, a permission ceiling and, where the job is rule-based, a coded handler. 26 are live as tested code, 82 are ready the moment Claude is connected, 21 wait for a connection.

## Security and editorial protection
- The database, knowledge, registry, credentials and port are Feral Femme's own. The runtime refuses any path outside this business and its one declared mount.
- The site content is mounted **read-only**. The system cannot change a published page. The adapter that writes an approved note into `content/field-notes/` exists, is tested, and is off; turning it on is a deliberate two-setting change.
- Unpublished investigations, sources and drafts live only in the data directory, which is never committed.
- Secrets come from environment variables only: `FF_ANTHROPIC_API_KEY`, `FF_DASHBOARD_TOKEN`, `FF_DATA_DIR`.
- Independence is in every agent's standing instructions: no advertising, sponsorship or affiliate logic may be proposed.
- Subscriber data is not held here. MailerLite remains the record.
- Every step, request, decision and export is in the audit log. Backups: `npm run ff -- backup`.
