#!/usr/bin/env bash
# ==============================================================================
# Production Zero-Downtime Deployment Script for AI-Pipeline Microservice
# ==============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rapto-system}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_NAME="rapto-ai-pipeline"

echo "🚀 Starting Automated Production Deployment for AI-Pipeline..."
echo "📅 Date: $(date -u)"
echo "🏷️  Target Image Tag: ${IMAGE_TAG}"

cd "${DEPLOY_DIR}"

# 1. Capture currently running image tag for rollback
CURRENT_TAG=$(docker inspect --format='{{.Config.Image}}' "${CONTAINER_NAME}" 2>/dev/null | cut -d':' -f2 || echo "latest")
echo "${CURRENT_TAG}" > /tmp/previous_ai_pipeline_image_tag.txt
echo "📌 Saved current AI-Pipeline image tag for rollback: ${CURRENT_TAG}"

# 2. Ensure supporting backing databases are up (Redis & MongoDB)
echo "🔍 [1/3] Ensuring Redis and MongoDB backing stores are running..."
if ! docker compose up -d --remove-orphans redis mongodb; then
    echo "⚠️ Redis/MongoDB startup encountered container or port conflict. Force recreating cleanly..."
    docker rm -f rapto-redis 2>/dev/null || true
    docker compose up -d --force-recreate redis mongodb
fi

# 3. Pull latest AI-Pipeline Docker image from GHCR
echo "📥 [2/3] Pulling latest AI-Pipeline Docker image..."
export IMAGE_TAG="${IMAGE_TAG}"
docker compose pull ai-pipeline

# 4. Zero-Downtime Container Update
echo "🔄 [3/3] Deploying updated AI-Pipeline container..."
if ! docker compose up -d --no-build --no-deps --force-recreate ai-pipeline; then
    echo "⚠️ Initial startup failed. Cleaning up stale container and recreating..."
    docker rm -f rapto-ai-pipeline 2>/dev/null || true
    docker compose up -d --no-build --no-deps --force-recreate ai-pipeline
fi

# 5. Post-deploy verification & health check
echo "⏳ Waiting for container startup..."
sleep 8

if CONTAINER_NAME="${CONTAINER_NAME}" INTERNAL_PORT="8001" ./scripts/health-check-ai.sh; then
    echo "🎉 AI-Pipeline Deployment PASSED Health & Readiness Checks!"
    docker image prune -af --filter "until=24h" || true
    echo "✅ AI-Pipeline Deployment Completed Successfully!"
    exit 0
else
    echo "⚠️ Health check FAILED for AI-Pipeline! Triggering automated rollback..."
    ./scripts/rollback-ai.sh
    echo "❌ AI-Pipeline Deployment failed and was rolled back."
    exit 1
fi
