#!/bin/sh
set -e

echo "==> Running database migrations..."
node dist/db/migrate.js

echo "==> Starting Astrobless backend..."
exec node dist/index.js
