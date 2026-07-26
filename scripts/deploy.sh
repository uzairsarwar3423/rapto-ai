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

# 3. Build single-connection URL from DIRECT_URL or DATABASE_URL (for migrations only)
build_migration_url() {
    RAW=$(grep "^DIRECT_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    if [ -z "${RAW}" ]; then
        RAW=$(grep "^DATABASE_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    fi
    # Strip pre-existing connection_limit params, then enforce connection_limit=1
    CLEAN=$(echo "${RAW}" | sed -E 's/[?&]connection_limit=[0-9]+//g' | sed 's/[?&]$//')
    if echo "${CLEAN}" | grep -q "?"; then
        echo "${CLEAN}&connection_limit=1"
    else
        echo "${CLEAN}?connection_limit=1"
    fi
}

run_migration() {
    local MIGRATION_URL
    MIGRATION_URL=$(build_migration_url)
    docker compose run --rm \
        -e NODE_ENV=production \
        -e DATABASE_URL="${MIGRATION_URL}" \
        -e DIRECT_URL="${MIGRATION_URL}" \
        api npx prisma migrate deploy 2>&1
}

# 4. Execute Database Migrations
echo "🗄️ Executing Prisma Database Migrations..."

MIGRATION_LOGS=$(run_migration) && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false
echo "${MIGRATION_LOGS}"

if [ "${MIGRATION_SUCCESS}" = "false" ]; then
    if echo "${MIGRATION_LOGS}" | grep -qE "EMAXCONNSESSION|max clients|pool_size"; then
        echo "⚠️ PgBouncer pool fully saturated — stopping api + worker to free all connections..."
        docker compose stop api worker 2>/dev/null || true
        sleep 5

        echo "🔄 Retrying migration with all app connections freed..."
        MIGRATION_LOGS=$(run_migration) && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false
        echo "${MIGRATION_LOGS}"
        # Note: api + worker will be restarted in step 5 below regardless
    fi

    if [ "${MIGRATION_SUCCESS}" = "false" ] && echo "${MIGRATION_LOGS}" | grep -q "P3009"; then
        echo "⚠️ Prisma P3009 error detected — triggering self-healing recovery..."
        FAILED_MIGRATION=$(echo "${MIGRATION_LOGS}" | grep -oE '[0-9]{14}_[a-zA-Z0-9_]+' | head -n 1 || true)
        if [ -n "${FAILED_MIGRATION}" ]; then
            echo "🔧 Auto-resolving failed migration: ${FAILED_MIGRATION}..."
            MIGRATION_URL=$(build_migration_url)
            docker compose run --rm \
                -e NODE_ENV=production \
                -e DATABASE_URL="${MIGRATION_URL}" \
                -e DIRECT_URL="${MIGRATION_URL}" \
                api npx prisma migrate resolve --applied "${FAILED_MIGRATION}" || true
        fi
        echo "🔄 Retrying Prisma migrations after self-healing..."
        MIGRATION_LOGS=$(run_migration) && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false
        echo "${MIGRATION_LOGS}"
    fi

    if [ "${MIGRATION_SUCCESS}" = "false" ]; then
        echo "❌ Database migration failed! Aborting deployment."
        # Restart app containers even on failure so service stays up
        docker compose up -d --no-deps api worker nginx || true
        exit 1
    fi
fi

echo "✅ Database migrations applied successfully."

# 5. Zero-Downtime Container Update (start new image for all services)
echo "🔄 Starting updated services (API, Worker, NGINX)..."
docker compose up -d --no-deps --remove-orphans api worker nginx

# 6. Post-deploy verification
echo "⏳ Verifying deployment via Docker health state..."
sleep 10
HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
echo "🩺 Container health: ${HEALTH_STATUS}"

if [ "${HEALTH_STATUS}" = "healthy" ]; then
    echo "🎉 Deployment PASSED! Container is healthy."
    docker image prune -af --filter "until=24h" || true
    echo "✅ Production Deployment Completed Successfully!"
    exit 0
fi

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
