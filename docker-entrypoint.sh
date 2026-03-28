#!/bin/sh
set -eu

if [ -n "${LIBSQL_DATABASE_URL:-}" ]; then
  echo "Using LIBSQL_DATABASE_URL=${LIBSQL_DATABASE_URL}"
else
  echo "Using local database file at /app/prisma/dev.db"
fi

echo "Applying database migrations..."
node scripts/apply-migrations.js

echo "Starting Next.js server..."
exec "$@"
