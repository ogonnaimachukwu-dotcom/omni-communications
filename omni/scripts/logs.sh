#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - SERVICE LOGS VIEWER UTILITY
# =========================================================================
set -eo pipefail

show_usage() {
  echo "Usage: $0 [service_name] [optional: tail_lines]" >&2
  echo "Allowed services: web, worker, db, caddy, migrate" >&2
  echo "Example: $0 worker 100" >&2
  exit 1
}

SERVICE="$1"
LINES="${2:-100}"

if [ -z "$SERVICE" ]; then
  show_usage
fi

# Validate service matches Compose service definitions
case "$SERVICE" in
  web|worker|db|caddy|migrate)
    ;;
  *)
    echo "Error: Unknown service '$SERVICE'." >&2
    show_usage
    ;;
esac

echo "==> Showing last $LINES lines for service: $SERVICE (Tailing... Press Ctrl+C to exit)"
docker compose -f docker-compose.production.yml logs -f --tail "$LINES" "$SERVICE"
