#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS DATABASE BACKUP & INTEGRITY VERIFICATION
# =========================================================================
set -eo pipefail

BACKUP_DIR="/var/backups/omni"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="omni_db_$TIMESTAMP.sql.gz"
DEST_FILE="$BACKUP_DIR/$FILENAME"

echo "==> [Phase 8] Starting Omni database snapshot..."

# 1. Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# 2. Check if pg container is running
if ! docker compose -f docker-compose.production.yml ps | grep -q "db"; then
  echo "Error: database container is not running." >&2
  exit 1
fi

# 3. Stream pg_dump to gzip file
echo "--> streaming pg_dump from container..."
docker compose -f docker-compose.production.yml exec -T db pg_dump -U omni -d omni | gzip > "$DEST_FILE"

# 4. Secure backup permissions
chmod 600 "$DEST_FILE"

# 5. Backup Verification (Integrity & Content Checks)
echo "--> Running backup integrity verification checks..."
if [ ! -s "$DEST_FILE" ]; then
  echo "  [FAIL] Backup file is empty!" >&2
  rm -f "$DEST_FILE"
  exit 1
fi

# Test gzip integrity
if ! gzip -t "$DEST_FILE"; then
  echo "  [FAIL] Backup file is corrupted (Gzip test failed)!" >&2
  rm -f "$DEST_FILE"
  exit 1
fi

# Test database contents (must contain standard SQL definitions)
if ! gunzip -c "$DEST_FILE" | head -n 50 | grep -qE "PostgreSQL|CREATE|ALTER|INSERT"; then
  echo "  [FAIL] Backup file content verification failed (Invalid SQL headers)!" >&2
  rm -f "$DEST_FILE"
  exit 1
fi

echo "  [PASS] Backup integrity and content verification completed successfully."
echo "==> Backup saved successfully to: $DEST_FILE"

# 6. Prune backups older than 30 days
echo "--> pruning snapshots older than 30 days..."
find "$BACKUP_DIR" -name "omni_db_*.sql.gz" -type f -mtime +30 -delete

echo "==> Database backup step complete."
exit 0
