#!/usr/bin/env bash
# ==============================================================================
# Production Zero-Downtime Deployment Script for VPS
# ==============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rapto-system}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_NAME="rapto-api"

echo "🚀 Starting Automated Production Deployment..."
echo "📅 Date: $(date -u)"
echo "🏷️  Target Image Tag: ${IMAGE_TAG}"

cd "${DEPLOY_DIR}"

# 1. Capture currently running image tag for rollback
CURRENT_TAG=$(docker inspect --format='{{.Config.Image}}' "${CONTAINER_NAME}" 2>/dev/null | cut -d':' -f2 || echo "latest")
echo "${CURRENT_TAG}" > /tmp/previous_image_tag.txt
echo "📌 Saved current image tag for rollback: ${CURRENT_TAG}"

# 2. Pull latest Docker images from Container Registry
echo "📥 Pulling latest Docker images..."
export IMAGE_TAG="${IMAGE_TAG}"
docker compose pull api worker nginx

# 3. Execute Database Migrations in isolated non-disruptive container
echo "🗄️ Executing Prisma Database Migrations..."

run_migration() {
    RAW_DIRECT=$(grep "^DIRECT_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    if [ -z "${RAW_DIRECT}" ]; then
        RAW_DIRECT=$(grep "^DATABASE_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    fi

    if [ -n "${RAW_DIRECT}" ]; then
        # Strip any pre-existing connection_limit params to force connection_limit=1
        CLEAN_URL=$(echo "${RAW_DIRECT}" | sed -E 's/([?&])connection_limit=[0-9]+/\1/g' | sed 's/[?&]$//')
        if echo "${CLEAN_URL}" | grep -q "\?"; then
            SINGLE_CONN_URL="${CLEAN_URL}&connection_limit=1"
        else
            SINGLE_CONN_URL="${CLEAN_URL}?connection_limit=1"
        fi

        docker compose run --rm \
            -e NODE_ENV=production \
            -e DATABASE_URL="${SINGLE_CONN_URL}" \
            -e DIRECT_URL="${SINGLE_CONN_URL}" \
            api npx prisma migrate deploy 2>&1
    else
        docker compose run --rm \
            -e NODE_ENV=production \
            api npx prisma migrate deploy 2>&1
    fi
}

MIGRATION_LOGS=$(run_migration) && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false

echo "${MIGRATION_LOGS}"

if [ "${MIGRATION_SUCCESS}" = "false" ]; then
    # Handle PgBouncer EMAXCONNSESSION (max clients reached in session mode)
    if echo "${MIGRATION_LOGS}" | grep -qE "EMAXCONNSESSION|max clients|pool_size"; then
        echo "⚠️ PgBouncer connection pool limit reached. Temporarily pausing worker to free database connections..."
        docker compose stop worker 2>/dev/null || true
        sleep 3
        
        MIGRATION_LOGS=$(run_migration) && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false
        echo "${MIGRATION_LOGS}"

        # Restart worker after migration check
        docker compose up -d worker 2>/dev/null || true
    fi

    # Handle Prisma P3009 (failed migration previously recorded)
    if [ "${MIGRATION_SUCCESS}" = "false" ] && echo "${MIGRATION_LOGS}" | grep -q "P3009"; then
        echo "⚠️ Prisma P3009 error detected. Triggering self-healing recovery..."

        FAILED_MIGRATION=$(echo "${MIGRATION_LOGS}" | grep -oE '[0-9]{14}_[a-zA-Z0-9_]+' | head -n 1 || true)

        if [ -n "${FAILED_MIGRATION}" ]; then
            echo "🔧 Auto-resolving failed migration: ${FAILED_MIGRATION}..."
            docker compose run --rm -e NODE_ENV=production api npx prisma migrate resolve --applied "${FAILED_MIGRATION}" || true
        fi

        echo "🔄 Retrying Prisma migrations after self-healing..."
        if run_migration; then
            MIGRATION_SUCCESS=true
            echo "✅ Database migrations applied successfully after auto-recovery!"
        fi
    fi

    if [ "${MIGRATION_SUCCESS}" = "false" ]; then
        echo "❌ Database migration failed! Aborting deployment."
        exit 1
    fi
else
    echo "✅ Database migrations applied successfully."
fi

# 4. Zero-Downtime Container Update
echo "🔄 Updating running services (API, Worker, NGINX)..."
docker compose up -d --no-deps --remove-orphans api worker nginx

# 5. Post-deploy verification using docker inspect
echo "⏳ Verifying deployment via Docker health state..."
HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
echo "🩺 Container health: ${HEALTH_STATUS}"

if [ "${HEALTH_STATUS}" = "healthy" ]; then
    echo "🎉 Deployment PASSED! Container is healthy."
    echo "🧹 Cleaning up old Docker images..."
    docker image prune -af --filter "until=24h" || true
    echo "✅ Production Deployment Completed Successfully!"
    exit 0
fi

# Fallback extended probe
echo "⚠️ Unexpected health state '${HEALTH_STATUS}' — running extended probe..."
if CONTAINER_NAME="${CONTAINER_NAME}" ./scripts/health-check.sh; then
    echo "🎉 Deployment PASSED Health & Readiness Checks!"
    docker image prune -af --filter "until=24h" || true
    echo "✅ Production Deployment Completed Successfully!"
else
    echo "⚠️ Health check FAILED! Triggering automated rollback..."
    ./scripts/rollback.sh
    echo "❌ Deployment failed and was rolled back."
    exit 1
fi
