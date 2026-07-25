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

echo "⚠️ INITIATING EMERGENCY ROLLBACK..."
echo "⏪ Rolling back to image tag: ${PREVIOUS_TAG}"

export IMAGE_TAG="${PREVIOUS_TAG}"

# Re-deploy previous stable containers
docker compose up -d --no-deps api worker nginx

echo "⏳ Verifying health of rolled-back containers..."
sleep 10

if ./scripts/health-check.sh; then
    echo "✅ Rollback completed successfully. System restored to stable state (${PREVIOUS_TAG})."
else
    echo "🚨 CRITICAL: Rollback failed health checks! Immediate operator intervention required."
    exit 2
fi
