#!/bin/sh
set -e

echo "Applying database migrations..."
node scripts/apply-migrations.js

echo "Starting application..."
exec npm start
