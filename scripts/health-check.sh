#!/usr/bin/env bash
# ==============================================================================
# Production Health Check & Readiness Probe Script
#
# WHY docker exec instead of http://localhost/health:
#   - Your VPS runs other applications with their own NGINX on port 80.
#   - curl http://localhost/health hits the HOST nginx, not the Docker container.
#   - The HOST nginx has no /health route → returns 404 → false failure.
#   - docker exec runs the probe INSIDE the container (same as Docker's own
#     healthcheck), bypassing all reverse proxies, port mappings, and host
#     network configuration entirely.
#
# FALLBACK: If docker exec is unavailable, falls back to direct port 5000
#           (requires 127.0.0.1:5000:5000 in docker-compose ports).
# ==============================================================================
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-rapto-api}"
INTERNAL_PORT="${INTERNAL_PORT:-5000}"
MAX_RETRIES="${MAX_RETRIES:-18}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"

echo "🔍 Probing API health via docker exec (container: ${CONTAINER_NAME})"

probe_health() {
    docker exec "${CONTAINER_NAME}" \
        wget -qO- --timeout=4 "http://localhost:${INTERNAL_PORT}/health" \
        2>/dev/null
}

probe_ready() {
    docker exec "${CONTAINER_NAME}" \
        wget -qO- --timeout=4 "http://localhost:${INTERNAL_PORT}/ready" \
        2>/dev/null
}

probe_health_code() {
    local code
    code=$(docker exec "${CONTAINER_NAME}" \
        wget -qS --spider --timeout=4 "http://localhost:${INTERNAL_PORT}/health" 2>&1 \
        | grep "HTTP/" | awk '{print $2}' | head -1)
    echo "${code:-000}"
}

probe_ready_code() {
    local code
    code=$(docker exec "${CONTAINER_NAME}" \
        wget -qS --spider --timeout=4 "http://localhost:${INTERNAL_PORT}/ready" 2>&1 \
        | grep "HTTP/" | awk '{print $2}' | head -1)
    echo "${code:-000}"
}

attempt=1
while [ "$attempt" -le "$MAX_RETRIES" ]; do
    echo "  [Attempt ${attempt}/${MAX_RETRIES}] Probing /health and /ready inside container..."

    # Check container is still running before probing
    if ! docker ps --filter "name=^/${CONTAINER_NAME}$" --filter "status=running" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        echo "  ❌ Container '${CONTAINER_NAME}' is not running. Aborting probe."
        exit 1
    fi

    HEALTH_CODE=$(probe_health_code)
    READY_CODE=$(probe_ready_code)

    echo "  /health → HTTP ${HEALTH_CODE}  |  /ready → HTTP ${READY_CODE}"

    if [ "${HEALTH_CODE}" = "200" ] && [ "${READY_CODE}" = "200" ]; then
        echo ""
        echo "✅ API is HEALTHY (/health: 200) and READY (/ready: 200)!"
        echo ""
        # Print readiness payload for deployment logs
        probe_ready || true
        echo ""
        exit 0
    fi

    if [ "${HEALTH_CODE}" = "200" ] && [ "${READY_CODE}" != "200" ]; then
        echo "  ⏳ API alive but not yet ready (DBs still connecting). Retrying in ${RETRY_INTERVAL}s..."
    elif [ "${HEALTH_CODE}" = "000" ]; then
        echo "  ⚠️  Cannot reach container (port ${INTERNAL_PORT} not responding). Retrying in ${RETRY_INTERVAL}s..."
    else
        echo "  ⚠️  Unexpected response. Retrying in ${RETRY_INTERVAL}s..."
    fi

    sleep "$RETRY_INTERVAL"
    attempt=$((attempt + 1))
done

echo ""
echo "❌ Health check timed out after $((MAX_RETRIES * RETRY_INTERVAL)) seconds."
echo "💡 Run 'docker logs ${CONTAINER_NAME} --tail=50' to inspect the failure."
exit 1
