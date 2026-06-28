#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - ENVIRONMENT VALUES VALIDATOR
# =========================================================================
set -eo pipefail

echo "==> [Phase 4] Starting Pre-flight Environment Validation..."

if [ ! -f .env ]; then
  echo "  [FAIL] No '.env' file found at root!" >&2
  exit 1
fi

# Load variables
# Note: we export them so they are readable by scripts and docker compose
set -a
source .env
set +a

ERRORS=0

validate_url() {
  local var_name="$1"
  local url_val="${!var_name}"
  if [[ -z "$url_val" ]]; then
    echo "  [FAIL] $var_name is empty!" >&2
    ERRORS=$((ERRORS + 1))
  elif [[ ! "$url_val" =~ ^https?:// ]]; then
    echo "  [FAIL] $var_name must be a valid http/https URL (got: $url_val)" >&2
    ERRORS=$((ERRORS + 1))
  else
    echo "  [PASS] $var_name is a valid URL."
  fi
}

validate_base64_32bytes() {
  local var_name="$1"
  local val="${!var_name}"
  if [[ -z "$val" ]]; then
    echo "  [FAIL] $var_name is empty!" >&2
    ERRORS=$((ERRORS + 1))
    return
  fi
  # Verify if base64 and decodes to 32 bytes
  local decoded_len
  decoded_len=$(echo -n "$val" | base64 -d 2>/dev/null | wc -c || echo "0")
  if [ "$decoded_len" -ne 32 ]; then
    echo "  [FAIL] $var_name must be exactly 32 bytes, base64-encoded (decoded length: $decoded_len)" >&2
    ERRORS=$((ERRORS + 1))
  else
    echo "  [PASS] $var_name is valid (32-byte base64)."
  fi
}

# 1. Core URLs
validate_url "APP_URL"
validate_url "BETTER_AUTH_URL"

# 2. Database URI Check
if [[ -z "$DATABASE_URL" ]]; then
  echo "  [FAIL] DATABASE_URL is empty!" >&2
  ERRORS=$((ERRORS + 1))
elif [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
  echo "  [FAIL] DATABASE_URL must start with 'postgres://' or 'postgresql://'" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  [PASS] DATABASE_URL format is valid."
fi

# 3. Master Encryption Keys Check
validate_base64_32bytes "ENCRYPTION_MASTER_KEY"

# 4. Better Auth Secrets Check
if [[ -z "$BETTER_AUTH_SECRET" ]]; then
  echo "  [FAIL] BETTER_AUTH_SECRET is empty!" >&2
  ERRORS=$((ERRORS + 1))
elif [ "${#BETTER_AUTH_SECRET}" -lt 16 ]; then
  echo "  [FAIL] BETTER_AUTH_SECRET must be at least 16 characters (got: ${#BETTER_AUTH_SECRET})" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  [PASS] BETTER_AUTH_SECRET is valid."
fi

# 5. Resend sending checks
if [[ -z "$RESEND_API_KEY" ]]; then
  echo "  [FAIL] RESEND_API_KEY is empty!" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  [PASS] RESEND_API_KEY is set."
fi

if [[ -z "$RESEND_WEBHOOK_SECRET" ]]; then
  echo "  [FAIL] RESEND_WEBHOOK_SECRET is empty!" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  [PASS] RESEND_WEBHOOK_SECRET is set."
fi

# 6. Optional AI APIs (Optional warnings only)
if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "  [WARN] ANTHROPIC_API_KEY is not defined. Claude copywriter feature will be disabled."
else
  echo "  [PASS] ANTHROPIC_API_KEY is set."
fi

# 7. Optional OAuth Credentials (warnings only)
if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  echo "  [WARN] GOOGLE_CLIENT_ID/SECRET is not defined. Gmail integrations will be unavailable."
fi

if [[ -z "$MICROSOFT_CLIENT_ID" || -z "$MICROSOFT_CLIENT_SECRET" ]]; then
  echo "  [WARN] MICROSOFT_CLIENT_ID/SECRET is not defined. Outlook integrations will be unavailable."
fi

# Final status
if [ "$ERRORS" -gt 0 ]; then
  echo "==> Env validation failed with $ERRORS errors." >&2
  exit 1
fi

echo "==> All environment values validated successfully."
exit 0
