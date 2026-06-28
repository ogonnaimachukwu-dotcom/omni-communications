#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS SYSTEM & DOCKER RUNTIME DIAGNOSTICS
# =========================================================================
set -eo pipefail

echo "========================================================================="
# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Warning: Running as non-root operator. Some diagnostics may be limited."
fi

echo " OMNI VPS DIAGNOSTICS & TELEMETRY PANEL"
echo "========================================================================="

# 1. Host Resources
echo "--> Host CPU & Load Average:"
uptime
echo

echo "--> Memory Consumption details:"
free -h
echo

echo "--> Disk space utilization:"
df -h /
echo

# 2. Docker Runtime Details
echo "--> Docker service status:"
if systemctl is-active --quiet docker; then
  echo "  Docker status: active"
else
  echo "  Docker status: inactive (Warning!)"
fi
echo

echo "--> Docker Compose versions:"
docker compose version || echo "Docker compose CLI not detected."
echo

echo "--> Running Container Statistics:"
docker stats --no-stream || echo "Failed to fetch stats."
echo

echo "--> Container List:"
docker compose -f docker-compose.production.yml ps
echo

# 3. Networking Checks
echo "--> Open Host TCP ports:"
ss -tulpn | grep -E ':(80|443|22)\b' || echo "Failed to scan ports or no listener on 80/443."
echo

# 4. DNS Resolution Check
echo "--> DNS lookup check for api.resend.com:"
if getent ahosts api.resend.com &>/dev/null; then
  echo "  [PASS] resend.com resolves successfully."
else
  echo "  [FAIL] resend.com fails lookup (DNS issue!)"
fi
echo "========================================================================="
exit 0
