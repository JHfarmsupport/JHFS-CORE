#!/bin/bash
# Ugentlig test: kan den nyeste backup faktisk læses tilbage?
# Henter backuppen, lægger den ind i en midlertidig database og tæller rækker.
# Rører IKKE den rigtige database.
set -euo pipefail

MAPPE="$(cd "$(dirname "$0")" && pwd)"
set -a
# shellcheck source=/dev/null
source "$MAPPE/.env"
set +a

NAVN="jhfs-backup-test-$$"
TMP="$(mktemp -d)"
trap 'docker rm -f "$NAVN" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

echo "$(date -Is) Henter nyeste backup"
restic dump --tag db latest jhfs.dump > "$TMP/jhfs.dump"
test -s "$TMP/jhfs.dump"

echo "Starter midlertidig database"
docker run -d --name "$NAVN" -e POSTGRES_PASSWORD=test -v "$TMP:/backup:ro" postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAVN" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker exec "$NAVN" psql -U postgres -qc "create role jhfs_app nologin; create role jhfs_auth nologin bypassrls; create role jhfs_web login in role jhfs_app;"
docker exec "$NAVN" pg_restore -U postgres --create --dbname postgres /backup/jhfs.dump

FIRMAER=$(docker exec "$NAVN" psql -U postgres -d jhfs -tAc "select count(*) from firma")
BRUGERE=$(docker exec "$NAVN" psql -U postgres -d jhfs -tAc "select count(*) from bruger")
MIGRATIONER=$(docker exec "$NAVN" psql -U postgres -d jhfs -tAc "select count(*) from schema_migration")

if [[ "$FIRMAER" -lt 1 || "$MIGRATIONER" -lt 1 ]]; then
  echo "FEJL: backuppen ser tom ud (firmaer=$FIRMAER, migrationer=$MIGRATIONER)" >&2
  exit 1
fi
echo "$(date -Is) Backup OK: $FIRMAER firma(er), $BRUGERE bruger(e), $MIGRATIONER migrationer"
