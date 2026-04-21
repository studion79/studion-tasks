#!/usr/bin/env sh
set -eu

# Safe update flow for server:
# 1) create DB backup (keep latest 3 by default)
# 2) pull app image
# 3) restart app container

KEEP_COUNT="${BACKUP_KEEP_COUNT:-3}"

echo "[safe-pull] creating backup (keep latest: $KEEP_COUNT)..."
docker compose exec -T app env BACKUP_KEEP_COUNT="$KEEP_COUNT" /app/scripts/backup-db.sh

echo "[safe-pull] pulling app image..."
docker compose pull app

echo "[safe-pull] restarting app..."
docker compose up -d app

echo "[safe-pull] done"
