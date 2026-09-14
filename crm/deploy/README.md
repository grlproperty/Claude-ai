# Putting the GRLP CRM on a server

There is no "upload the files and it works" path, and any host that offers one
cannot run this application. It needs three things a shared hosting account
does not give you:

1. **PostgreSQL 16** with the ability to `CREATE ROLE` — not MySQL.
2. **A long-running process**, not a per-request function.
3. **A persistent disk** for FICA documents and mandates.

So the shape is: a small VPS with root, in South Africa. Below is the whole
thing, start to finish, in about twenty minutes.

---

## Before you start

**A server.** 2 vCPU, 4 GB RAM, 40 GB disk is ample for 5–15 users and tens of
thousands of records. Ubuntu 24.04. In South Africa if you can — AWS Lightsail
`af-south-1` (Cape Town), or a Teraco-hosted VPS from Xneelo, Afrihost or
RSAWEB. The data is South African personal information, including identity
numbers and FICA documents.

Do not take a 2 GB plan. Password hashing is scrypt at `N = 2¹⁵, r = 8`, which
is deliberately memory-hard: roughly **32 MB per concurrent sign-in**. Add
PostgreSQL and Node and 2 GB runs out at the worst possible moment.

**A domain.** Point an A record for `crm.grproperty.co.za` at the server's IP
*before* you start, or Caddy cannot get a TLS certificate. This is not
optional: session cookies are set `secure` in production, so over plain HTTP
nobody can sign in at all.

---

## 1. The server

```bash
ssh root@your-server-ip

apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 git age rclone ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Nothing else needs to be open. PostgreSQL is never published to the host, let
alone the internet.

## 2. The application

```bash
mkdir -p /opt/grlp-crm && cd /opt/grlp-crm

# Either clone it:
git clone --branch claude/loving-feynman-pqh1fu <repository-url> .
cd crm

# Or, if you uploaded grlp-crm-deploy.tar.gz with scp:
#   tar -xzf grlp-crm-deploy.tar.gz -C /opt/grlp-crm --strip-components=1
```

## 3. The secrets

```bash
cd deploy
cp env.production.example .env.production

# Four secrets. Generate each one separately.
for n in DB_OWNER_PASSWORD DB_APP_PASSWORD SESSION_SECRET IDENTITY_PEPPER; do
  echo "$n=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
done

nano .env.production      # paste them in, and set CRM_DOMAIN
chmod 600 .env.production
```

**`IDENTITY_PEPPER` is set once and never changed.** Changing it does not break
sign-in, but every existing identity fingerprint becomes unmatchable, so
duplicate detection on ID numbers silently stops working for records already
captured. Keep it wherever you keep the database password.

## 4. Start it

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production logs db | grep -A4 'role check'
```

Read that last output. It prints:

```
  rolname   | rolsuper | rolbypassrls | rolcreaterole
------------+----------+--------------+---------------
 grlp_owner | f        | f            | f
 grlp_app   | f        | f            | f
```

**If `rolbypassrls` is `t` for `grlp_app`, stop.** The entire authorisation
model is 190 row-level-security policies enforced against that role. If it can
bypass them, every one of them is decoration and any signed-in user can read
every record in the office.

## 5. The migrations

```bash
docker compose --env-file .env.production exec app \
  node --experimental-strip-types scripts/migrate.ts
```

Thirteen migrations, applied in order, each with a checksum recorded. If a
migration is ever edited after being applied, the next run refuses rather than
half-applying it.

Run this on **every** deploy, before the new container takes traffic.

## 6. The first user

Open `https://crm.grproperty.co.za`. The first authorised
`@grproperty.co.za` address becomes Management. There is no registration page,
and there never will be — after this, Management invites people and each sets
their own password from a single-use link.

**Do this immediately**, from the office, before anyone else can reach the
domain. It is the one moment the CRM will accept a new account unprompted.

## 7. Backups — the part the CRM refuses to fake

The application shows backups as **NOT CONNECTED** and will never display a
green tick for them, because it takes none and can verify none. Closing that
loop is your job, and it is two commands.

```bash
# A key whose private half lives OFF this server, so a compromised server
# cannot decrypt its own backup history.
age-keygen -o /root/backup-key.txt
grep public /root/backup-key.txt          # the AGE_RECIPIENT value
# Now copy backup-key.txt somewhere else entirely, and delete it from here.

nano deploy/.env.production                # set AGE_RECIPIENT and OFFSITE_RCLONE_REMOTE

crontab -e
# 0 2 * * * /opt/grlp-crm/crm/deploy/backup.sh >> /var/log/grlp-backup.log 2>&1
```

Then — and this is the bit everyone skips — prove it works:

```bash
AGE_IDENTITY=/path/to/backup-key.txt \
  ./deploy/restore-test.sh /var/backups/grlp-crm/grlp-crm-*.tar.gz.age
```

It restores into a throwaway database beside the live one, counts what came
back, and drops it again. Production is never touched. Do it quarterly.

Finally, record **who owns backups** in the CRM itself, under
**Settings → System health**. That field exists precisely so the answer is not
lost when somebody leaves.

---

## Deploying a change

```bash
cd /opt/grlp-crm/crm
git pull
cd deploy
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production exec app \
  node --experimental-strip-types scripts/migrate.ts
```

## Without Docker

If you would rather run PostgreSQL and Node directly on the host:

1. `sudo -u postgres psql -f deploy/init-db.sql` — but **edit the two passwords
   at the top first**. This creates both roles correctly, which is the only
   part that is easy to get dangerously wrong.
2. `npm ci && npm run build`, then copy `.next/standalone`, `.next/static`,
   `public`, `db` and `scripts` to `/opt/grlp-crm`.
3. `/etc/grlp-crm/env` with the same variables, `chmod 600`, owned by root.
4. `deploy/grlp-crm.service` into `/etc/systemd/system/`. It is hardened:
   read-only filesystem except the document store, no capabilities, a
   restricted syscall filter.
5. Caddy or nginx in front for TLS. The application sets its own security
   headers in `next.config.ts`, so they survive whatever proxy you choose.

## Managed PostgreSQL

If you use RDS, Azure Database or similar instead of the `db` container,
`deploy/init-db.sql` still applies — run it as the master user. Two things to
check first:

- **Can you create a role that is not the database owner?** On most managed
  services yes, but verify it. If the application ends up connecting as the
  owner, row-level security stops applying to it.
- **Connect directly, not through a transaction-mode pooler.** The pool sets
  `statement_timeout` and `idle_in_transaction_session_timeout` as connection
  options, and PgBouncer in transaction mode drops those.

---

## What is in this directory

| File | What it is for |
|---|---|
| `docker-compose.yml` | The whole stack: PostgreSQL, the CRM, Caddy for TLS |
| `Dockerfile` | Three-stage build; what ships has no source and no build tools |
| `init-app-role.sql` | Creates `grlp_app` on first start — the role that cannot bypass RLS |
| `init-db.sql` | The same job, for managed PostgreSQL or a bare install |
| `Caddyfile` | TLS from Let's Encrypt, HSTS, a 30 MB body limit |
| `../.dockerignore` | At the repository root, because that is the build context |
| `env.production.example` | Every variable, with what each one does |
| `grlp-crm.service` | Hardened systemd unit, for running without Docker |
| `backup.sh` | Database plus documents, checksummed, encrypted, copied off the box |
| `restore-test.sh` | Proves a backup restores, without touching production |

## If something is wrong

```bash
docker compose --env-file .env.production logs -f app     # application
docker compose --env-file .env.production logs -f caddy   # TLS and requests
docker compose --env-file .env.production logs -f db      # database
```

- **No certificate.** The A record must resolve to this server *before* Caddy
  starts. Check with `dig +short crm.grproperty.co.za`, then restart Caddy.
- **Sign-in does nothing.** Almost always HTTP rather than HTTPS: the session
  cookie is `secure`, so the browser discards it silently.
- **"permission denied for table …"** means row-level security is doing its
  job. Check the user's role under **Settings → People who use the CRM**.
- **A migration refuses to run.** The checksum guard found an applied migration
  that has since been edited. Do not force it; add a new migration instead.
