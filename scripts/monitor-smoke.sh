#!/usr/bin/env sh
set -eu

BASE_URL="${1:-http://localhost:3000}"

echo "[monitor] live check..."
LIVE_BODY="$(curl -fsS "$BASE_URL/api/health/live")"
printf "%s" "$LIVE_BODY" | grep -q '"kind":"live"' || {
  echo "[monitor] live payload invalid"
  exit 1
}

echo "[monitor] ready check..."
READY_BODY="$(curl -fsS "$BASE_URL/api/health")"
printf "%s" "$READY_BODY" | grep -q '"kind":"ready"' || {
  echo "[monitor] ready payload invalid"
  exit 1
}

echo "[monitor] ok"
