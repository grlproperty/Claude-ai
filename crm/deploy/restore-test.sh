#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Proving the backup is real.
#
# Restores a backup into a throwaway database beside the live one and
# counts what came back. It touches nothing in production.
#
#   ./restore-test.sh /var/backups/grlp-crm/grlp-crm-20260914T020000Z.tar.gz.age
#
# Do this quarterly. An untested backup is a hope, not a plan.
# ---------------------------------------------------------------------
set -Eeuo pipefail

archive="${1:?usage: restore-test.sh <backup archive>}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/grlp-crm/deploy}"
scratch_db="grlp_restore_test_$(date -u +%s)"

work="$(mktemp -d)"
trap 'rm -rf "$work"; docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
        psql -U grlp_owner -d postgres -c "drop database if exists $scratch_db" >/dev/null 2>&1 || true' EXIT

if [[ "$archive" == *.age ]]; then
  : "${AGE_IDENTITY:?set AGE_IDENTITY to the private key file}"
  age -d -i "$AGE_IDENTITY" -o "$work/backup.tar.gz" "$archive"
else
  cp "$archive" "$work/backup.tar.gz"
fi

tar -xzf "$work/backup.tar.gz" -C "$work"
( cd "$work" && sha256sum -c manifest.sha256 )
echo "checksums verified."

docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  psql -U grlp_owner -d postgres -c "create database $scratch_db owner grlp_owner"

docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_restore --no-owner --no-acl --username=grlp_owner --dbname="$scratch_db" \
  < "$work/database.dump"

echo
echo "--- what came back ---"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  psql -U grlp_owner -d "$scratch_db" -c "
    select 'people'      as record, count(*) from people
    union all select 'properties',   count(*) from properties
    union all select 'transactions', count(*) from transactions
    union all select 'commissions',  count(*) from commissions
    union all select 'documents',    count(*) from documents
    union all select 'audit_logs',   count(*) from audit_logs
    union all select 'migrations',   count(*) from schema_migrations;"

echo
echo "--- documents in the archive ---"
tar -tf "$work/storage.tar" | wc -l | xargs echo "files:"

echo
echo "Restore test passed. The scratch database is being dropped now;"
echo "production was never touched."
