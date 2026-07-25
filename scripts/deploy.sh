#!/usr/bin/env bash
# ==============================================================================
# Production Zero-Downtime Deployment Script for VPS
# ==============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rapto-system}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HEALTH_CHECK_TIMEOUT=60

echo "🚀 Starting Automated Production Deployment..."
echo "📅 Date: $(date -u)"
echo "🏷️ Target Image Tag: ${IMAGE_TAG}"

cd "${DEPLOY_DIR}"

# 1. Capture currently running image tag for rollback
CURRENT_TAG=$(docker inspect --format='{{.Config.Image}}' rapto-api 2>/dev/null | cut -d':' -f2 || echo "latest")
echo "${CURRENT_TAG}" > /tmp/previous_image_tag.txt
echo "📌 Saved current running image tag for rollback: ${CURRENT_TAG}"

# 2. Pull latest Docker images from Container Registry
echo "📥 Pulling latest Docker images..."
export IMAGE_TAG="${IMAGE_TAG}"
docker compose pull api worker nginx

# 3. Execute Database Migrations in isolated non-disruptive container
echo "🗄️ Executing Prisma Database Migrations..."
if docker compose run --rm -e NODE_ENV=production api npx prisma migrate deploy; then
    echo "✅ Database migrations applied successfully."
else
    echo "❌ Database migration failed! Aborting deployment."
    exit 1
fi

# 4. Zero-Downtime Container Update
echo "🔄 Updating running services (API, Worker, NGINX)..."
docker compose up -d --no-deps --remove-orphans api worker nginx

# 5. Run Health & Readiness Checks
echo "⏳ Waiting for API health check to pass..."
if ./scripts/health-check.sh; then
    echo "🎉 Deployment PASSED Health & Readiness Checks!"
    echo "🧹 Cleaning up old unused Docker images..."
    docker image prune -af --filter "until=24h"
    echo "✅ Production Deployment Completed Successfully!"
else
    echo "⚠️ Health check FAILED! Triggering automated rollback..."
    ./scripts/rollback.sh
    echo "❌ Deployment failed and was rolled back."
    exit 1
fi
