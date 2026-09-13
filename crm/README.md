# GRLP CRM

The internal CRM for **Garden Route Lifestyle Property**. *Find your way home.*

A private system for GRLP staff: one master record per person, one master
record per property, and an honest account of what has actually happened with
each of them.

## Running it

```bash
cd crm
npm install
cp .env.example .env.local     # then fill in the two secrets
npm run migrate
npm run dev                    # http://localhost:3000
```

The first authorised company email address to visit `/setup` becomes the
Management account. Everyone else is invited from **Settings → Users**.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # runs against a real PostgreSQL database
npm run build
npm run ci        # all of the above
```

`npm test` needs a second database and the `TEST_DATABASE_URL` /
`TEST_DATABASE_ADMIN_URL` variables. Tests run as the real application role,
so every policy, grant and constraint is exercised exactly as in production.

## Architecture

| Layer | Choice |
| --- | --- |
| Framework | Next.js App Router, React, TypeScript (strict) |
| Styling | Tailwind CSS, Montserrat, GRLP brand tokens |
| Database | PostgreSQL with SQL migrations, foreign keys, constraints and indexes |
| Authorisation | Role and per-user granular permissions, enforced by row level security |
| Authentication | scrypt password hashing, HMAC-hashed session cookies, company domain restriction |
| Files | Private storage, never served directly; access is permission-checked and logged |

Supabase is a supported deployment target: it is PostgreSQL, and the schema,
policies and helper functions here run on it unchanged. Nothing in the
application requires it.

### Why authorisation lives in the database

The application connects as a role with neither `SUPERUSER` nor `BYPASSRLS`.
Every policy reads `app.user_id`, which is set with `SET LOCAL` at the start of
each transaction. A missing permission check in a page or an action is
therefore a bug rather than a breach: the query still returns nothing.

Two things the application role deliberately cannot do at all:

- read `users.password_hash` — it is excluded from the column grant, and
  reachable only through the `app.auth_credentials()` entry point
- change or delete an audit record — the log is append-only in the database

### What this CRM does not do

It does not send email or WhatsApp messages, and it does not update property
portals. It opens the dialler, WhatsApp or the staff member's own email client,
and records what was said. Nothing is ever reported as sent that was not sent.
