#!/usr/bin/env bash
# ==============================================================================
# Automated Production Rollback Script for AI-Pipeline Microservice
# ==============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rapto-system}"
CONTAINER_NAME="rapto-ai-pipeline"

cd "${DEPLOY_DIR}"

if [ -f /tmp/previous_ai_pipeline_image_tag.txt ]; then
    PREVIOUS_TAG=$(cat /tmp/previous_ai_pipeline_image_tag.txt)
else
    PREVIOUS_TAG="latest"
fi

echo "⚠️  INITIATING EMERGENCY ROLLBACK FOR AI-PIPELINE..."
echo "⏪ Rolling back to image tag: ${PREVIOUS_TAG}"

export IMAGE_TAG="${PREVIOUS_TAG}"

# Re-deploy previous stable container
docker compose up -d --no-build --no-deps ai-pipeline

echo "⏳ Waiting 10s for rolled-back container to stabilize..."
sleep 10

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
echo "🔍 Docker healthcheck status: ${HEALTH_STATUS}"

if [ "${HEALTH_STATUS}" = "healthy" ]; then
    echo "✅ Rollback completed successfully. AI-Pipeline restored to stable state (${PREVIOUS_TAG})."
    exit 0
elif [ "${HEALTH_STATUS}" = "starting" ]; then
    echo "⏳ Container still starting after rollback. Waiting 15s more..."
    sleep 15
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
    if [ "${HEALTH_STATUS}" = "healthy" ]; then
        echo "✅ Rollback completed. Container healthy."
        exit 0
    fi
fi

echo "🚨 CRITICAL: Rollback container status is '${HEALTH_STATUS}'. Immediate operator intervention required."
echo "💡 Run: docker logs ${CONTAINER_NAME} --tail=100"
exit 2
