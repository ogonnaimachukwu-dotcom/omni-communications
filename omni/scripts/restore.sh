#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS DATABASE RESTORE SCRIPT
# =========================================================================
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 /path/to/backup_file.sql.gz" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File '$BACKUP_FILE' does not exist." >&2
  exit 1
fi

echo "==> WARNING: This restore will OVERWRITE the current production database."
read -p "Are you absolutely sure you want to proceed? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore aborted."
  exit 0
fi

# 1. Stop active writing worker threads to prevent corruption
echo "==> stopping campaign worker service..."
docker compose -f docker-compose.production.yml stop worker

# 2. Re-create empty target database to assure clean imports
echo "==> purging and re-creating empty database schema..."
docker compose -f docker-compose.production.yml exec -T db dropdb -U omni --if-exists omni
docker compose -f docker-compose.production.yml exec -T db createdb -U omni omni

# 3. Stream backup back into db
echo "==> streaming SQL backup into database container..."
gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.production.yml exec -T db psql -U omni -d omni

# 4. Re-run migrations to align schema if restore came from older branch
echo "==> running schema migration check..."
docker compose -f docker-compose.production.yml run --rm migrate

# 5. Boot worker services back up
echo "==> starting campaign worker service..."
docker compose -f docker-compose.production.yml start worker

echo "==> database restore complete. system online."
