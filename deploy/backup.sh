#!/bin/bash
# Natlig backup af Core-databasen til Hetzner Storage Box.
#  - Krypteret med restic (uden RESTIC_PASSWORD kan backuppen ikke læses – heller ikke af Hetzner)
#  - Gemmer 14 daglige, 8 ugentlige og 24 månedlige
#  - Tjekker at backuppen er hel
# Køres af systemd-timeren jhfs-backup.timer.
set -euo pipefail

MAPPE="$(cd "$(dirname "$0")" && pwd)"
set -a
# shellcheck source=/dev/null
source "$MAPPE/.env"
set +a
: "${RESTIC_REPOSITORY:?mangler i .env}" "${RESTIC_PASSWORD:?mangler i .env}"

cd "$MAPPE"
echo "$(date -Is) Backup starter"

# Første gang: opret det krypterede arkiv
restic cat config >/dev/null 2>&1 || restic init

docker compose exec -T db pg_dump -U postgres --format=custom jhfs \
  | restic backup --stdin --stdin-filename jhfs.dump --tag db --host jhfs-core

restic forget --tag db --keep-daily 14 --keep-weekly 8 --keep-monthly 24 --prune
restic check --read-data-subset=5%

echo "$(date -Is) Backup færdig"
