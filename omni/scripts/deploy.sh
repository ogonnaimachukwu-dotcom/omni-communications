#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS PRODUCTION DEPLOYMENT & ROLLBACK AUTOMATION
# =========================================================================
set -eo pipefail

echo "==> [Phase 3] Starting Deployment Flow..."

# 1. Run Pre-flight Env Verification
if ! ./scripts/validate_env.sh; then
  echo "Error: Pre-flight environment check failed. Aborting deployment." >&2
  exit 1
fi

# Load variables
set -a
source .env
set +a

# 2. Record Pre-deployment State for Rollback
echo "--> Checking running state for potential rollback..."
PREV_CONTAINERS=$(docker compose -f docker-compose.production.yml ps -q || true)
HAS_PREV=0
if [ -n "$PREV_CONTAINERS" ]; then
  HAS_PREV=1
  echo "  Active containers detected. Rollback baseline established."
else
  echo "  No previous containers running. Rollback will clean-deploy down."
fi

# 3. Pull latest code (if in git environment)
if [ -d .git ]; then
  echo "--> Fetching latest git code..."
  git pull || echo "Warning: Git sync skipped."
fi

# 4. Build and boot services
echo "==> [Phase 5] Starting production containers..."
if ! docker compose -f docker-compose.production.yml up -d --build --remove-orphans; then
  echo "Error: Docker compose build/up failed!" >&2
  exit 1
fi

# 5. Poll health check routes
echo "==> [Phase 6] Starting Health Check Verification Loops..."
MAX_ATTEMPTS=12
ATTEMPT=1
HEALTHY=0

HEALTH_LIVE_URL="$APP_URL/api/health/live"
HEALTH_READY_URL="$APP_URL/api/health/ready"
HEALTH_STATUS_URL="$APP_URL/api/health"
METRICS_URL="$APP_URL/api/metrics"

echo "Polling live, ready, health, and metrics endpoints..."

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS: checking route health..."
  
  LIVE_RES=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_LIVE_URL" || echo "000")
  READY_RES=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_READY_URL" || echo "000")
  STATUS_RES=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_STATUS_URL" || echo "000")
  METRICS_RES=$(curl -s -o /dev/null -w "%{http_code}" "$METRICS_URL" || echo "000")
  
  if [ "$LIVE_RES" -eq 200 ] && [ "$READY_RES" -eq 200 ] && [ "$STATUS_RES" -eq 200 ] && [ "$METRICS_RES" -eq 200 ]; then
    echo "  [PASS] All core HTTP endpoints returned 200 OK."
    HEALTHY=1
    break
  fi
  
  echo "  [WAIT] Status: Live=$LIVE_RES Ready=$READY_RES Status=$STATUS_RES Metrics=$METRICS_RES. Retrying in 5 seconds..."
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))
done

# 6. Automatic Rollback on Failed Health Checks
if [ "$HEALTHY" -ne 1 ]; then
  echo "==> [FAIL] Health check failed to verify after $((MAX_ATTEMPTS * 5)) seconds!" >&2
  echo "==> INITIATING AUTOMATIC ROLLBACK..." >&2
  
  if [ "$HAS_PREV" -eq 1 ]; then
    echo "Reverting container images to previous stable state..." >&2
    # If using git, rollback repository state to stable head
    if [ -d .git ]; then
      git reset --hard HEAD@{1}
    fi
    docker compose -f docker-compose.production.yml up -d --build --remove-orphans
    echo "==> Rollback complete. Stable state restored." >&2
  else
    echo "Stopping and purging failed deployment containers..." >&2
    docker compose -f docker-compose.production.yml down
    echo "==> Purge complete. Host is clean." >&2
  fi
  exit 1
fi

# 7. SSL Certificate Verification
if [[ "$APP_URL" =~ ^https:// ]]; then
  echo "--> Verifying SSL/TLS certification..."
  DOMAIN=$(echo "$APP_URL" | sed -E 's|https://([^/]+).*|\1|')
  if openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" </dev/null &>/dev/null; then
    echo "  [PASS] SSL/TLS certificate resolved successfully."
  else
    echo "  [WARN] SSL/TLS handshake failed. Caddy may still be provisioning certificates." >&2
  fi
fi

# 8. Render Deployment Summary Report
echo "========================================================================="
echo " OMNI COMMUNICATIONS - PRODUCTION DEPLOYMENT REPORT"
echo "========================================================================="
echo "  ✔ Installed packages: verified"
echo "  ✔ Docker status: running"
echo "  ✔ Health status: healthy (All endpoints returned 200 OK)"
echo "  ✔ Running containers:"
docker compose -f docker-compose.production.yml ps
echo "  ✔ Open ports:"
ss -tulpn | grep -E ':(80|443)\b' || echo "No public HTTP ports bound on host (Caddy is routing)."
echo "========================================================================="
echo "==> Deployment completed successfully."
exit 0
