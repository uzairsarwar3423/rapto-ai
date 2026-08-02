#!/usr/bin/env bash
# ==============================================================================
# Production Health Check & Readiness Probe Script for AI-Pipeline Microservice
# ==============================================================================
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-rapto-ai-pipeline}"
INTERNAL_PORT="${INTERNAL_PORT:-8001}"
MAX_RETRIES="${MAX_RETRIES:-15}"
RETRY_INTERVAL="${RETRY_INTERVAL:-4}"

echo "🔍 Probing AI-Pipeline health via python/urllib inside container (container: ${CONTAINER_NAME})"

probe_health_code() {
    docker exec "${CONTAINER_NAME}" \
        python -c "import urllib.request; res = urllib.request.urlopen('http://127.0.0.1:${INTERNAL_PORT}/health'); print(res.getcode())" 2>/dev/null || echo "000"
}

probe_health_body() {
    docker exec "${CONTAINER_NAME}" \
        python -c "import urllib.request; res = urllib.request.urlopen('http://127.0.0.1:${INTERNAL_PORT}/health'); print(res.read().decode('utf-8'))" 2>/dev/null || echo ""
}

attempt=1
while [ "$attempt" -le "$MAX_RETRIES" ]; do
    echo "  [Attempt ${attempt}/${MAX_RETRIES}] Probing GET /health on port ${INTERNAL_PORT}..."

    # Check container is still running before probing
    if ! docker ps --filter "name=^/${CONTAINER_NAME}$" --filter "status=running" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        echo "  ❌ Container '${CONTAINER_NAME}' is not running. Aborting probe."
        exit 1
    fi

    HEALTH_CODE=$(probe_health_code)
    HEALTH_BODY=$(probe_health_body)

    echo "  /health → HTTP ${HEALTH_CODE} | Response: ${HEALTH_BODY}"

    if [ "${HEALTH_CODE}" = "200" ]; then
        echo ""
        echo "✅ AI-Pipeline is HEALTHY (/health: 200)!"
        echo ""
        exit 0
    fi

    echo "  ⚠️  Container port ${INTERNAL_PORT} not ready yet. Retrying in ${RETRY_INTERVAL}s..."
    sleep "$RETRY_INTERVAL"
    attempt=$((attempt + 1))
done

echo ""
echo "❌ AI-Pipeline Health check timed out after $((MAX_RETRIES * RETRY_INTERVAL)) seconds."
echo "💡 Run 'docker logs ${CONTAINER_NAME} --tail=50' to inspect the failure."
exit 1
