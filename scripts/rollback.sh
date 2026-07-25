#!/usr/bin/env bash
# ==============================================================================
# Automated Production Rollback Script for VPS
# ==============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rapto-system}"

cd "${DEPLOY_DIR}"

if [ -f /tmp/previous_image_tag.txt ]; then
    PREVIOUS_TAG=$(cat /tmp/previous_image_tag.txt)
else
    PREVIOUS_TAG="latest"
fi

echo "⚠️  INITIATING EMERGENCY ROLLBACK..."
echo "⏪ Rolling back to image tag: ${PREVIOUS_TAG}"

export IMAGE_TAG="${PREVIOUS_TAG}"

# Re-deploy previous stable containers
docker compose up -d --no-deps api worker nginx

echo "⏳ Waiting 15s for rolled-back containers to stabilize..."
sleep 15

# Check if the old container is at least running and passing Docker's own healthcheck
HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' rapto-api 2>/dev/null || echo "unknown")
echo "🔍 Docker healthcheck status: ${HEALTH_STATUS}"

if [ "${HEALTH_STATUS}" = "healthy" ]; then
    echo "✅ Rollback completed successfully. System restored to stable state (${PREVIOUS_TAG})."
    exit 0
elif [ "${HEALTH_STATUS}" = "starting" ]; then
    echo "⏳ Container still starting after rollback. Waiting 30s more..."
    sleep 30
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' rapto-api 2>/dev/null || echo "unknown")
    if [ "${HEALTH_STATUS}" = "healthy" ]; then
        echo "✅ Rollback completed. Container healthy."
        exit 0
    fi
fi

echo "🚨 CRITICAL: Rollback container status is '${HEALTH_STATUS}'. Immediate operator intervention required."
echo "💡 Run: docker logs rapto-api --tail=100"
exit 2
