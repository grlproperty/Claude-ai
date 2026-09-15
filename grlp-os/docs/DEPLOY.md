# Deploying the GRLP Command Centre

Nothing here is tied to a hosting company. The system is a Next.js application
and a PostgreSQL database. Anything that can run a Docker container — a laptop,
an office machine, a rented Linux server, any cloud provider — can run it.

Read this once from top to bottom before you start. The whole install is about
fifteen minutes, and most of that is deciding on the values in `.env`.

---

## What you need

| | |
|---|---|
| **Docker** | Version 24 or newer, with the `docker compose` plugin. This is the only requirement for the recommended path. |
| **PostgreSQL 16** | Only if you are supplying your own database instead of letting Compose run one. |
| **A domain and TLS certificate** | Only if the system is reachable from outside the office. See [Putting it behind HTTPS](#putting-it-behind-https). |

The application listens on port 3000 inside the container. Everything else is
configuration.

---

## Option A — Docker Compose (recommended)

This runs the application and its database together on one machine.

```sh
git clone <this repository>
cd grlp-os

cp .env.example .env
```

Open `.env` and set two values. Everything else can stay empty for now:

```sh
# A password for the database Compose will create. Any long random string.
POSTGRES_PASSWORD="…"

# The key that signs sign-in sessions. Generate it, do not invent it:
#   openssl rand -base64 48
SESSION_SECRET="…"
```

Leave `DATABASE_URL` as it is — under Compose it is ignored, because Compose
builds the connection string from `POSTGRES_PASSWORD` and points the
application at the database container.

Then:

```sh
docker compose up -d
```

That builds the image, starts PostgreSQL, waits until the database is actually
accepting connections, applies every outstanding migration, and starts the
application. The first build takes a few minutes; later ones are cached.

Confirm it came up:

```sh
curl http://localhost:3000/api/health
```

A healthy system answers `200` with `"status":"ok"`. Anything else is explained
under [The health endpoint](#the-health-endpoint).

### First run: create the team and a password

A fresh database has no people in it, so nobody can sign in yet.

```sh
# Creates the eleven team members, the workflow definitions, the template
# field definitions and the integration register. Safe to run twice.
docker compose run --rm tools npm run seed

# Give someone a password so they can sign in.
docker compose run --rm tools npx tsx scripts/set-password.ts mandy@grproperty.co.za 'a-real-password'

# Tells you what is present and what is still missing.
docker compose run --rm tools npm run doctor
```

`doctor` is the honest inventory. It reports how many staff, templates,
clients and properties exist, which integrations are connected, and what each
missing piece costs you. Run it whenever something seems not to work.

Then open `http://localhost:3000` and sign in.

> **Why `tools` and not `exec app`?** The setup and import commands are written
> in TypeScript and run through `tsx`, which is a development dependency. The
> production image deliberately does not carry development dependencies, so
> those commands run from the build stage instead. The `tools` service exists
> only for this; it never runs as part of `docker compose up`.

---

## Option B — the image, against a database you already have

If you already run PostgreSQL — a managed instance, or a server of your own —
skip the `db` service and run the image directly.

```sh
docker build -t grlp-os .

docker run -d \
  --name grlp-os \
  -p 3000:3000 \
  -e DATABASE_URL='postgresql://user:password@your-db-host:5432/grlp_os' \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  grlp-os
```

The container applies migrations on start, so the database it points at may be
empty. It must exist, though — the system creates tables, not databases.

Seeding, password-setting and imports need the build stage:

```sh
docker build -t grlp-os-tools --target build .
docker run --rm -e DATABASE_URL='…' grlp-os-tools npm run seed
```

---

## Option C — no Docker at all

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

with `DATABASE_URL` and `SESSION_SECRET` in a `.env` file or in the
environment. Node 22 or newer. This is the shape to use if you are deploying
onto a platform that builds from source rather than from an image.

---

## Configuration

Two values are required. The system refuses to report itself healthy without
them, and says exactly what is wrong rather than starting in a broken state.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Under Compose this is built for you. |
| `SESSION_SECRET` | Signs sign-in sessions. At least 32 characters. Generate with `openssl rand -base64 48`. Changing it signs everyone out. |

Everything else is optional, and every one of them is a capability the system
does without rather than fakes:

| Variable | What it unlocks | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Drafting and free-text summarising. | Routing, triage, validation, document population, the market assessment and the risk sweep all still run — they are deterministic and use no language model. Only the prose-writing stops. |
| `MAIL_*` | Reading and sending from the GRLP mailbox. | Mail is neither read nor sent. The follow-up engine still prepares what it would send, and stops there. |
| `DROPBOX_*` | Importing master documents and the knowledge base. | Masters and knowledge must be loaded another way. Document generation stays blocked until templates are approved. |
| `WHATSAPP_*` | The live WhatsApp Business webhook. | Conversations come in from chat exports instead. The system never replies on WhatsApp under any configuration. |
| `GOOGLE_*`, `MS_*` | Single sign-on and calendar. | Sign-in is by email and password. |
| `ESIGN_*` | Electronic signature routing. | Signature routing stays manual. |

`.env` holds credentials. It is in `.gitignore` and must stay there.

---

## The health endpoint

`GET /api/health` is the one place that tells the truth about the installation.

* **`200` with `"status":"ok"`** — the database is reachable and configuration
  is complete. `degraded` still lists integrations that are not connected; that
  is information, not a fault.
* **`503` with `"configuration":"incomplete"`** — a required value is missing,
  too short, or still a placeholder. `issues` names each one and how to fix it.
* **`503` with `"database":false`** — the database is unreachable.

The container's own `HEALTHCHECK` calls this, so `docker ps` shows `healthy` or
`unhealthy` without you having to ask.

---

## Putting it behind HTTPS

The application speaks plain HTTP on port 3000 and does not terminate TLS. Put
a reverse proxy in front of it — Caddy, nginx, Traefik, or whatever your host
provides — and let that handle certificates.

Sign-in cookies are `HttpOnly` and marked `Secure` in production, which means
**sign-in will not work over plain HTTP from another machine**. On the office
machine itself `http://localhost:3000` is fine; anywhere else needs HTTPS.

A minimal Caddy configuration is the whole job:

```
command-centre.grproperty.co.za {
    reverse_proxy localhost:3000
}
```

---

## Backups

Everything that matters is in PostgreSQL: the people, the clients, the
properties, the templates, the knowledge base, the AI action ledger and the
decision history. The container holds nothing of value — it can be destroyed
and rebuilt at any time.

Under Compose the database lives in the `grlp-data` volume.

```sh
# Back up
docker compose exec -T db pg_dump -U grlp grlp_os | gzip > grlp-$(date +%F).sql.gz

# Restore into an empty database
gunzip -c grlp-2026-09-15.sql.gz | docker compose exec -T db psql -U grlp grlp_os
```

Take a backup before every upgrade. Keep them somewhere that is not the same
machine.

---

## Upgrading

```sh
git pull
docker compose up -d --build
```

Migrations run automatically when the new container starts. They are applied in
order and recorded, so restarting a container that is already up to date does
nothing.

If a migration fails the container stops rather than serving requests against a
schema it does not understand. Read `docker compose logs app`, fix the cause,
and start it again.

---

## When something is wrong

| Symptom | Where to look |
|---|---|
| Container will not start | `docker compose logs app` — the entrypoint prints each step before it runs it. |
| Health returns 503 | The `issues` array names the problem. |
| Screens are empty | `docker compose run --rm tools npm run doctor` — most likely no clients or properties have been imported. |
| Nobody can sign in | No password has been set. See [First run](#first-run-create-the-team-and-a-password). |
| A document will not generate | Its template has not been approved. `doctor` reports the count. This is deliberate: the system will not produce a legal document from unapproved wording. |
