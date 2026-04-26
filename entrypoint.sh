#!/bin/sh
set -e

# Run DB migrations only from the API container (avoid concurrent runs)
if [ "${APP_MODE:-api}" = "api" ]; then
  echo "==> [api] Running database migrations..."
  node dist/db/migrate.js
  echo "==> [api] Migrations complete"
fi

case "${APP_MODE:-api}" in
  api)
    echo "==> Starting API server (port ${PORT:-3000})..."
    exec node dist/index.js
    ;;
  socket)
    echo "==> Starting Socket.IO server (port ${SOCKET_PORT:-3001})..."
    exec node dist/socket/index.js
    ;;
  worker)
    echo "==> Starting BullMQ workers..."
    exec node dist/worker/index.js
    ;;
  *)
    echo "ERROR: Unknown APP_MODE '${APP_MODE}'. Use: api | socket | worker"
    exit 1
    ;;
esac
