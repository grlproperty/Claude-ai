# GRLP AI Executive Operating System

**AI Executive Administration & Real Estate Operations Assistant** for Garden Route
Lifestyle Property.

The purpose of this system is to take administrative work off Mandy — by doing it,
automating it, or routing it to the person who actually owns it — while professional
judgement, legally required approvals and signatures stay with the authorised human.

---

## The one principle

Every piece of work runs through the same hierarchy:

1. **Can the AI do it?** → it does it.
2. **Can it be automated?** → a rule does it.
3. **Does a human need to do it?** → which human, by responsibility.
4. **Who is the best person?** → role, relationship ownership, workload, availability.
5. **Does Mandy actually need to be involved?** → usually not.

Step 5 is the point. The CEO is reached by authority, professional judgement, or a
genuine exception — never because nobody else was obvious. Where no owner can be
justified the system says so rather than guessing, so work is never quietly dumped
on whoever happens to be nearby.

---

## What is real today

This matters more than a feature list, so it is stated plainly.

### Working, tested, running against a real database

| Area | State |
| --- | --- |
| Routing / ownership engine | Complete. Data-driven from a 34-entry work catalogue. |
| Escalation engine | Complete. An escalation cannot be constructed without options, a recommendation and the reason for it. |
| Approval boundaries & conduct guardrails | Complete. One gate; cannot be bypassed by any agent or route. |
| Document preparation | Complete. Populates approved templates, validates, reports gaps. |
| South African validators | Complete. Real ID-number Luhn + date checks, rand parsing, SA phone formats. |
| Market assessment (CMA) | Complete. Adjusted comparables with full workings and outlier flagging. |
| Risk sweep ("falling through the cracks") | Complete. Eleven finding types with tunable thresholds. |
| Inbox triage | Complete. Rule-based, deterministic, plus deadline extraction. |
| Capacity protection & hours recovered | Complete. |
| Notification tiering and batching | Complete. |
| Executor | Complete. Performs what it can, records an audit line, reports what it cannot. |
| Authentication, sessions, RBAC | Complete, including immediate revocation and personal/business separation. |
| Command Centre, Decisions, Work, Staff, Settings | Built and wired to the database. |
| Mail ingestion and sending | Built and tested against a fake transport. Live connection unverified — see below. |
| Document catalogue and process maps | Complete. 58 documents across 14 stages, transcribed from GRLP's own checklists, with the real sign-off gates. |
| Dropbox master-copy importer | Built and tested against a fake Dropbox. Live import needs credentials. |
| Knowledge base | Built and tested. 41 operating rules encoded from GRLP's SOPs; the importer needs Dropbox credentials for the rest. |
| Data model | 39 tables, migrated. |

**305 tests**, including the full simulation of Mandy's day (§63) against real Postgres.

### Built as a real interface, awaiting credentials

Nothing here is simulated. Each reports its own status and says what still works
without it.

| Integration | Needs | Without it |
| --- | --- | --- |
| Claude (AI) | `ANTHROPIC_API_KEY` | Everything above still runs. Only drafting and free-text summarising stop. |
| **GRLP mailbox** | `MAIL_IMAP_HOST`, `MAIL_SMTP_HOST`, `MAIL_USER`, `MAIL_PASSWORD` | Triage runs on imported messages, but nothing is read from or sent to the live mailbox. |
| Google Workspace | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | No calendar or single sign-on. |
| Microsoft 365 | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `MS_REDIRECT_URI` | As above. |
| Dropbox | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | Master copies cannot be imported; the catalogue and process are there, the wording is not. |
| E-signature | `ESIGN_PROVIDER`, `ESIGN_API_KEY` | Signature routing is tracked and chased, but sending is manual. No provider chosen yet. |

### Not built yet

Listed so nobody discovers it the hard way. See `docs/AUDIT-AND-PLAN.md` for the
sequence.

- Workflow **runner** (definitions are seeded; the step executor is not written)
- Decision actions (Approve / Reject / Delegate render disabled, deliberately)
- Calendar ingestion (blocked on Google or Microsoft credentials)
- Scheduled ingestion — `npm run mail:ingest` is manual or cron-driven; there is no in-app scheduler
- Meeting briefs, absence mode, weekly CEO review, personal assistant UI
- Document ingestion and OCR
- Natural-language command bar and voice

### Connecting the mailbox

`grproperty.co.za` mail is hosted on **rdsa-mail.com (xneelo)**, confirmed from the
MX records — not Google Workspace and not Microsoft 365. So there is no OAuth client
to create, no admin console and no app verification: it is plain IMAP and SMTP with a
username and password.

```bash
# in .env
MAIL_IMAP_HOST="mail.grproperty.co.za"
MAIL_IMAP_PORT="993"          # implicit TLS
MAIL_SMTP_HOST="mail.grproperty.co.za"
MAIL_SMTP_PORT="587"          # STARTTLS
MAIL_USER="mandy@grproperty.co.za"
MAIL_PASSWORD="..."

npm run mail:test             # performs a real IMAP login
npm run mail:ingest           # reads new mail, triages it, routes it
```

Two things follow from password authentication rather than OAuth, and both matter:

- **The password is a full mailbox credential, not a scoped token.** It belongs in
  `.env` — never in the database, never in the repository. Where the host allows it,
  use a mailbox created for this system rather than a person's own.
- **"Connected" means one thing only:** a real IMAP login succeeded. `npm run mail:test`
  performs that login. Run it where the application will run — a network that only
  allows HTTPS cannot reach port 993, and will report a failure that says nothing
  about whether the credentials are right.

Ingestion never sends. Triage decides what *should* happen; a reply leaves the mailbox
only after a person has approved that specific message.

---

## What the system knows about GRLP

`src/domain/operating-rules.ts` holds 41 rules read out of the agency's own
standard operating procedures, each carrying the document it came from. This is
what lets the system behave like GRLP rather than like a generic estate agency:

- **The systems GRLP runs on** — PropCntrl for listings, syndication to Property24
  and Private Property, TPN for tenant credit checks and rentbook invoicing,
  Dropbox as the property file, the New Listings and Changes WhatsApp group.
- **Filing conventions** — a listing folder named by erf and street address; a
  relisted property's old listing moved into an OLD folder, not deleted.
- **Statutory deadlines** — a deposit reconciliation within 7 days, refund within
  14, interest belonging to the tenant, the R250 000 cooling-off threshold.
- **Money rules** — everything through the trust account, never a personal one;
  commission the first charge against the deposit; payments released only after
  management authorises them.
- **Approval points** — the four rentals gates, the landlord approving the tenant,
  the landlord authorising maintenance before a contractor is instructed.
- **Company facts** — registration number, VAT number, Fidelity Fund Certificate,
  both office addresses, the 6.5% default commission.

Commercially sensitive policies — commission negotiation, the listing versus
selling agent split — are deliberately **not** transcribed into this repository,
which is public. They import into the database like any other document.

### Importing the knowledge base

```bash
npm run import:knowledge -- --dry-run
npm run import:knowledge
```

Fifteen folders of procedures, compliance, checklists and area information. Text
goes to the database, never to this repository. Superseded copies, per-employee
signed acknowledgements and images are skipped. Unchanged documents are left
alone; edited ones are updated.

Once imported, the system can answer *what does GRLP do about X?* and cite the
document — so an answer can always be checked against the procedure it came from.

---

## The document catalogue

`src/domain/master-documents.ts` holds GRLP's two processes end to end — 31 sales
documents across 8 stages, 27 rentals documents across 6 — transcribed from the
agency's own **Rental Document checklist** and **after-sale checklist**, including
the four "SIGNED OFF BY SUPERIOR" gates. A gated stage is not passed until a named
person signs it, whatever the documents say.

Browse it at `/documents`.

### Importing the master copies

```bash
npm run import:masters -- --dry-run   # report what would be imported
npm run import:masters                # import
```

The importer reads Dropbox, matches each file to a catalogue entry (including
variants — five OTP forms, five lease forms, three FICA schedules), and records
Dropbox's revision so a re-import skips unchanged masters and versions changed ones.

Four rules it will not break:

- **It reads only.** The masters are edited in Dropbox by the people responsible
  for them; nothing is written back.
- **Wording goes to the database, never to this repository** — which is public.
- **Imported versions are unapproved.** Importing a master copy does not put it
  into circulation; the document engine still refuses to generate until a person
  approves the wording.
- **An unrecognised file is reported, not guessed at.**

Legacy `.doc` files cannot have their text extracted reliably. The importer
catalogues them, says so plainly, and asks for them to be saved as `.docx`. For
anything that cannot be converted, `npm run load:master <key> <file>` loads the
wording from a local path you supply — again, never through the repository.

---

## Template wording is deliberately not supplied

Templates ship with their **field definitions and validation rules** — which are
genuinely useful and were the hard part — and with wording marked *not approved*.
The document engine refuses to produce anything from an unapproved version.

Before a mandate or offer to purchase can be generated, paste GRLP's approved
wording into the template version (keeping the `{{placeholders}}`) and have an
authorised person approve it. The system does not write legal wording, and it will
not put unreviewed wording in front of a client.

---

## Getting started

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and SESSION_SECRET
npm run db:deploy             # apply migrations
npm run seed                  # team, templates, workflows, integration registry
npx tsx scripts/set-password.ts mandy@grproperty.co.za '<password>'
npm run dev
```

`SESSION_SECRET` must be at least 32 characters: `openssl rand -base64 48`.

### The seed creates configuration, not data

It seeds the real team, the template field definitions, the workflow definitions and
the integration registry. It creates **no** clients, properties, leads, mandates or
transactions. A system that shipped with invented records would demonstrate well and
mean nothing — GRLP's real records are imported, not imagined.

### Commands

```bash
npm run check      # typecheck + tests
npm test           # tests only (needs DATABASE_URL)
npm run build
node tests/e2e/smoke.mjs <screenshot-dir>   # browser smoke test, server must be running
```

---

## Architecture

```
src/
  domain/        Pure engines. No database, no network, fully unit-tested.
                 routing · escalation · approvals · documents · validators
                 market-assessment · risk · triage · capacity
  agents/        Specialist agents over a common contract (§33).
                 Most need no language model at all.
  integrations/  The registry that keeps the system honest about what is connected.
  server/        Database, auth, RBAC, snapshot, executive planning, executor.
  app/           Next.js App Router pages.
```

The engines are deliberately pure: the system's judgement about ownership, risk,
validation and pricing evidence is deterministic and auditable. The language model
writes prose, and nothing else.

### Why so little depends on the model

Because judgement that cannot be tested cannot be trusted with a mandate. Routing,
triage, validation, document population, comparable analysis and the risk sweep are
rules and arithmetic — every one of them has tests that pin the behaviour down.

---

## Safety rules that cannot be bypassed

Enforced in `src/domain/approvals.ts`, with tests:

- It does not sign documents on a person's behalf.
- It does not give legal advice or make legal determinations.
- It does not write or alter contract wording; clauses come from an approved template.
- It does not send as Mandy without her approval of that specific message.
- It does not provide professional sign-off — a valuation or compliance opinion is a person's.
- It does not act above its authorised approval level.

A refused action is recorded with its reason. Nothing fails silently.

---

## The measure

**CEO hours recovered**, counted conservatively:

- Only work actually carried out is counted, read from the execution ledger.
- A prepared document counts for the preparation, never the review.
- Work that still needs Mandy is never counted as recovered.
- An action blocked on a missing integration earns minutes for what it did, not for what it intended.

The Command Centre shows *recovered* and *ready to remove* as two different numbers,
because they are two different things.
