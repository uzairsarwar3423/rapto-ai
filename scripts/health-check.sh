#!/usr/bin/env bash
# ==============================================================================
# Production Health Check & Readiness Probe Script
# ==============================================================================
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-http://localhost}"
MAX_RETRIES=12
RETRY_INTERVAL=5

echo "🔍 Probing API Health Endpoint: ${TARGET_HOST}/health"

attempt=1
while [ $attempt -le $MAX_RETRIES ]; do
    echo "  [Attempt ${attempt}/${MAX_RETRIES}] Checking /health and /ready..."
    
    # 1. Check Liveness /health endpoint
    HTTP_HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_HOST}/health" || echo "000")
    
    # 2. Check Readiness /ready endpoint (verifies Redis + Postgres + Mongo)
    HTTP_READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_HOST}/ready" || echo "000")

    if [ "$HTTP_HEALTH_CODE" -eq 200 ] && [ "$HTTP_READY_CODE" -eq 200 ]; then
        echo "✅ API is ALIVE (/health: 200) and READY (/ready: 200)!"
        
        # Output detailed readiness payload
        curl -s "${TARGET_HOST}/ready" || true
        echo ""
        exit 0
    fi

    echo "  ⚠️ API not fully ready yet (/health: ${HTTP_HEALTH_CODE}, /ready: ${HTTP_READY_CODE}). Retrying in ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
done

echo "❌ Health check timed out after $((MAX_RETRIES * RETRY_INTERVAL)) seconds."
exit 1
