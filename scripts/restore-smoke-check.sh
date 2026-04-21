#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"

LATEST="$(ls -1t "$BACKUP_DIR"/task-app-*.db.gz 2>/dev/null | head -n 1 || true)"
if [ -z "$LATEST" ]; then
  echo "[restore-check] no backup found in $BACKUP_DIR"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

TMP_DB="$TMP_DIR/restore-test.db"
gzip -dc "$LATEST" > "$TMP_DB"

if [ ! -s "$TMP_DB" ]; then
  echo "[restore-check] extracted DB is empty"
  exit 1
fi

node - <<'NODE' "$TMP_DB"
const dbPath = process.argv[2];
const { createClient } = require("@libsql/client");

async function run() {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    const rs = await client.execute("SELECT COUNT(*) as c FROM sqlite_master");
    const count = Number(rs.rows?.[0]?.c ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      console.error("[restore-check] sqlite_master is empty");
      process.exit(1);
    }
    console.log(`[restore-check] OK (${count} sqlite objects)`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error("[restore-check] failed:", err?.message || err);
  process.exit(1);
});
NODE
