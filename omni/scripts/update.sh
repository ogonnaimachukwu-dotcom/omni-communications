#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS ROLLING UPDATE SCRIPT
# =========================================================================
set -eo pipefail

echo "==> starting Omni Communications rolling update..."

# 1. Sync repository
if [ -d .git ]; then
  echo "==> pulling latest code changes..."
  git fetch origin main
  git reset --hard origin/main
fi

# 2. Rebuild and launch migrate/web/worker
echo "==> building new containers..."
docker compose -f docker-compose.production.yml build

echo "==> running drizzle migrations..."
docker compose -f docker-compose.production.yml run --rm migrate

echo "==> restarting web and worker services..."
docker compose -f docker-compose.production.yml up -d --no-deps web worker

echo "==> pruning old unused docker items..."
docker image prune -f

echo "==> update complete. checking system status..."
sleep 5
docker compose -f docker-compose.production.yml ps
