#!/usr/bin/env bash
# ---------------------------------------------------------------------
# The backup the CRM refuses to pretend it takes.
#
# The application says NOT CONNECTED for backups and shows no green tick,
# because it takes none and cannot verify one. This script is the other
# half of that honesty: it is the thing that actually does it.
#
# Two things are backed up, and both are needed to restore:
#   * the database   — every record
#   * /data/storage  — the FICA documents, mandates and photos
#
# Install as a nightly cron, off the server, encrypted:
#   0 2 * * * /opt/grlp-crm/deploy/backup.sh >> /var/log/grlp-backup.log 2>&1
# ---------------------------------------------------------------------
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/grlp-crm}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/grlp-crm/deploy}"
# A public key means this script can encrypt but never decrypt — so a
# compromised server cannot read its own backup history.
AGE_RECIPIENT="${AGE_RECIPIENT:-}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$BACKUP_DIR"
echo "[$(date -uIs)] starting backup $stamp"

# --- the database ----------------------------------------------------
# Custom format, so a single table can be restored without the rest.
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_dump --format=custom --no-owner --no-acl --username=grlp_owner grlp_crm \
  > "$work/database.dump"

# --- the documents ---------------------------------------------------
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T app \
  tar -cf - -C /data storage > "$work/storage.tar"

# --- one archive, checksummed ----------------------------------------
( cd "$work" && sha256sum database.dump storage.tar > manifest.sha256 )
tar -czf "$work/grlp-crm-$stamp.tar.gz" -C "$work" database.dump storage.tar manifest.sha256

if [[ -n "$AGE_RECIPIENT" ]]; then
  if ! command -v age >/dev/null; then
    echo "AGE_RECIPIENT is set but age is not installed. Refusing to write an unencrypted backup." >&2
    exit 1
  fi
  age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/grlp-crm-$stamp.tar.gz.age" "$work/grlp-crm-$stamp.tar.gz"
  final="$BACKUP_DIR/grlp-crm-$stamp.tar.gz.age"
else
  # Said out loud rather than done silently: this archive holds identity
  # numbers and FICA documents.
  echo "WARNING: AGE_RECIPIENT is not set, so this backup is NOT encrypted." >&2
  echo "         It contains identity numbers and FICA documents. Set AGE_RECIPIENT." >&2
  mv "$work/grlp-crm-$stamp.tar.gz" "$BACKUP_DIR/"
  final="$BACKUP_DIR/grlp-crm-$stamp.tar.gz"
fi

size="$(du -h "$final" | cut -f1)"
echo "[$(date -uIs)] wrote $final ($size)"

# --- off the server --------------------------------------------------
# A backup sitting next to the thing it is backing up is not a backup.
# Point this at object storage in the same country as the data.
if [[ -n "${OFFSITE_RCLONE_REMOTE:-}" ]]; then
  rclone copy "$final" "$OFFSITE_RCLONE_REMOTE" --no-traverse
  echo "[$(date -uIs)] copied to $OFFSITE_RCLONE_REMOTE"
else
  echo "WARNING: OFFSITE_RCLONE_REMOTE is not set. This backup is only on this server." >&2
fi

find "$BACKUP_DIR" -name 'grlp-crm-*.tar.gz*' -mtime "+$KEEP_DAYS" -print -delete

echo "[$(date -uIs)] done."
echo
echo "A backup nobody has restored is a backup nobody has."
echo "Run deploy/restore-test.sh at least once a quarter, and record who owns"
echo "this in the CRM under Settings > System health."
