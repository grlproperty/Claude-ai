# Audit and implementation plan

Prepared 7 September 2026.

---

## Phase 1 — the audit

### What was asked

Inspect the existing GRLP/Prop project and decide, for each part, whether to keep,
improve, rebuild or remove it.

### What was found

**There is no existing GRLP application.** This is not a partial or unclear finding;
it was checked exhaustively:

- The working directory holds **FERAL FEMME** — a static site generator producing
  HTML from Markdown. No runtime, no database, no server.
- All three remote branches (`main`, `site`, `claude/feral-femme-website-84qden`)
  contain the same project.
- Every file ever committed on any branch — 40 files — belongs to that site.
- Nothing GRLP-related exists anywhere on disk.
- The account exposes exactly one repository, `grlproperty/Claude-ai`, which is
  this one.

So there was no frontend, backend, database, authentication, CRM, property module,
document handling, workflow engine or AI layer to audit. The repository is owned by
a GRLP account, but its contents are an unrelated project.

### Consequence for KEEP / IMPROVE / REBUILD / REMOVE

The four-way assessment has nothing to operate on.

| Verdict | Applies to |
| --- | --- |
| KEEP | Nothing — and importantly, the FERAL FEMME site is untouched. It remains on `main` exactly as it was. |
| IMPROVE | Nothing. |
| REBUILD | Nothing. |
| REMOVE | Nothing. No existing data was altered or deleted. |
| ADD | Everything below. |

The new system lives in `grlp-os/` on its own branch, so nothing existing was
disturbed. If GRLP would prefer it in a separate repository, the directory moves
cleanly.

---

## Current state → target state

| | Before | Now |
| --- | --- | --- |
| Application | None | Next.js 15 + TypeScript, 39-table PostgreSQL schema |
| Who decides who does the work | Mandy | A tested routing engine over a 34-entry work catalogue |
| Escalations | Verbal | Structured, and impossible to raise without a recommendation |
| Documents | Manual | Template-driven preparation with real validation |
| Pricing evidence | Manual | Adjusted comparable analysis with published workings |
| Knowing what is slipping | Memory | An eleven-rule sweep that runs on its own |
| Approval boundaries | Convention | Enforced in one gate, with tests |
| Security | — | Sessions with immediate revocation, RBAC, personal/business separation |
| Measure of success | — | CEO hours recovered, read from an execution ledger |

---

## What was built

**Foundation.** Data model and migrations; authentication with revocable sessions;
role-based access control; personal-versus-business data separation; audit logging.

**Judgement engines** — all pure, all tested, none requiring a language model:
routing and delegation; escalation; approval boundaries and conduct guardrails;
document preparation; South African validators; market assessment; the risk sweep;
inbox triage; capacity protection; notification tiering and batching.

**Execution.** A planner that decides what needs no person, and an executor that
carries it out, records an audit line, and reports honestly what it could not do.

**Interface.** Command Centre, decision inbox, prepared-work view, staff workload,
and a settings page that tells the truth about every integration.

**Verification.** 192 tests, including Mandy's day end to end against real
PostgreSQL, and a browser smoke test across every page at desktop and mobile.

---

## Integrations required

GRLP confirmed accounts for Google Workspace, Microsoft 365 and Dropbox. None are
connected yet — only credentials are missing, not code.

| Integration | Required | Unlocks |
| --- | --- | --- |
| Claude API key | `ANTHROPIC_API_KEY` | Drafting replies, reading unstructured documents, prose summaries |
| Google Workspace **or** Microsoft 365 | OAuth client, secret, redirect URI | Live inbox triage, sending approved replies, calendar intelligence, meeting briefs, and single sign-on |
| Dropbox | App key, secret, refresh token | Filing prepared documents into the GRLP folder structure |
| E-signature | Provider not yet chosen | Automatic signature routing and envelope tracking |

The mailbox integration is the highest-value one by a distance: it turns the
follow-up engine from *preparing* messages into *sending* them, which is where most
of the remaining hours are.

---

## Database changes

New schema, so no migration risk to existing data. 39 tables covering users, roles,
sessions, contacts, properties, leads, viewings, mandates, offers, transactions and
checklists, market assessments and comparables, documents with versions and extracted
fields, templates with versioned fields, tasks, escalations, approvals, signatures,
workflow definitions and runs, communications, meetings, notifications, risk findings,
AI actions, structured memory with provenance, audit logs, capacity snapshots, absence
periods, integrations and settings.

---

## Security changes

- Passwords hashed with bcrypt at cost 12; a minimum length is enforced.
- Sessions are signed JWTs in HttpOnly cookies, backed by a database row so a session
  can be revoked immediately — a signed token alone cannot be withdrawn, which matters
  when someone leaves.
- Only a hash of the session token is stored.
- Sign-in gives one message for both a wrong password and an unknown address, so the
  form cannot be used to discover who works at GRLP.
- Least-privilege RBAC: the CEO sees the business, everyone else their department and
  their own work.
- Personal data is readable only by its owner — not by other staff, and not by the CEO.
- An agent acting for a user gets exactly that user's permissions. The AI is not a
  privilege escalation.
- Every AI action and every refusal is written to the audit log.

---

## What remains, in priority order

**1. Connect a mailbox.** Everything downstream of it — real triage, sending
follow-ups, calendar intelligence, meeting briefs, single sign-on — is blocked on
this one credential set. Highest value by a wide margin.

**2. Wire the decision actions.** Approve, Reject, Delegate, Request information and
Defer currently render disabled. Making them write decisions back to the escalation
record is small work with immediate effect on the CEO's day.

**3. Approve the template wording.** Paste GRLP's mandate and offer-to-purchase
wording into the seeded template versions and approve them. Until then the document
engine correctly refuses to generate, and the mandate and OTP workflows cannot
complete.

**4. Build the workflow runner.** The definitions are seeded and the data model is
ready; the step executor is not written. This turns the event-driven automations
(lead intake, viewing completed, mandate requested, offer received) from definitions
into behaviour.

**5. Import the real records.** Contacts, properties, mandates and live transactions.
The sweep and the dashboards are only as useful as what they can see.

**6. Then, in rough order of value:** meeting briefs; the weekly CEO review; absence
mode; document ingestion and OCR; the personal assistant view; the natural-language
command bar; voice.

---

## One thing worth flagging

The system's usefulness is currently capped by a single fact: it can prepare work but
it cannot send anything, because no mailbox is connected. The follow-up engine finds
the silent seller and the forgotten buyer, writes the task, assigns the owner and
records the next action — and then stops, and says so.

That is the correct behaviour, and it is deliberate. But it means the difference
between the system as it stands and the system as intended is largely one set of
OAuth credentials.
