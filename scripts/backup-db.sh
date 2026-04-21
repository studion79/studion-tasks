#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
KEEP_COUNT="${BACKUP_KEEP_COUNT:-0}"
DB_URL="${LIBSQL_DATABASE_URL:-file:/data/dev.db}"

db_path_from_url() {
  case "$1" in
    file:*) printf "%s" "${1#file:}" ;;
    *) printf "%s" "$1" ;;
  esac
}

DB_PATH="$(db_path_from_url "$DB_URL")"
if [ ! -f "$DB_PATH" ]; then
  echo "[backup] DB not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/task-app-$STAMP.db.gz"
TMP="$BACKUP_DIR/.tmp-$STAMP.db"

cp "$DB_PATH" "$TMP"
gzip -9 "$TMP"
mv "$TMP.gz" "$DEST"

echo "[backup] created: $DEST"

find "$BACKUP_DIR" -type f -name "task-app-*.db.gz" -mtime +"$RETENTION_DAYS" -delete || true
echo "[backup] retention applied (>$RETENTION_DAYS days removed)"

if [ "$KEEP_COUNT" -gt 0 ] 2>/dev/null; then
  ls -1t "$BACKUP_DIR"/task-app-*.db.gz 2>/dev/null \
    | awk "NR>$KEEP_COUNT" \
    | while IFS= read -r old; do
        [ -n "$old" ] && rm -f "$old"
      done
  echo "[backup] keep-count applied (kept latest $KEEP_COUNT backups)"
fi
