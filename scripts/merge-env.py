#!/usr/bin/env python3
"""
Production Environment Variable Merger & Preserver.
Reads existing /opt/rapto-system/.env file, updates keys from process environment variables,
and writes out the merged .env atomically using POSIX file replacement.
"""

import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("merge-env")


def main() -> None:
    deploy_dir = os.environ.get("DEPLOY_DIR", "/opt/rapto-system")
    env_path = os.path.join(deploy_dir, ".env")
    temp_path = os.path.join(deploy_dir, ".env.tmp")

    logger.info(f"Target deployment directory: {deploy_dir}")

    existing: dict[str, str] = {}

    # 1. Parse existing .env file if present
    if os.path.exists(env_path):
        logger.info(f"Reading existing environment file: {env_path}")
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str and not line_str.startswith("#") and "=" in line_str:
                        key, val = line_str.split("=", 1)
                        existing[key.strip()] = val.strip()
        except Exception as e:
            logger.error(f"Failed to read existing .env file: {e}")
            sys.exit(1)

    # 2. Core deployment metadata defaults
    existing["NODE_ENV"] = "production"
    existing["PORT"] = "5000"
    existing["DOCKER_REGISTRY"] = "ghcr.io"

    repo_name = os.environ.get("REPO_NAME", "")
    if repo_name:
        existing["IMAGE_NAME"] = f"{repo_name}/api"

    target_tag = os.environ.get("TARGET_TAG", "")
    if target_tag:
        existing["IMAGE_TAG"] = target_tag

    # 3. Secret mapping dictionary (Environment variable -> Target .env key)
    secret_map = {
        "PROD_DATABASE_URL": "DATABASE_URL",
        "PROD_DIRECT_URL": "DIRECT_URL",
        "PROD_MONGODB_URL": "MONGODB_URL",
        "PROD_REDIS_URL": "REDIS_URL",
        "PROD_JWT_ACCESS_SECRET": "JWT_ACCESS_SECRET",
        "PROD_JWT_REFRESH_SECRET": "JWT_REFRESH_SECRET",
        "PROD_APP_URL": "APP_URL",
        "PROD_FRONTEND_URL": "FRONTEND_URL",
        "PROD_API_URL": "API_URL",
        "PROD_JIRA_CLIENT_ID": "JIRA_CLIENT_ID",
        "PROD_JIRA_CLIENT_SECRET": "JIRA_CLIENT_SECRET",
        "PROD_JIRA_CALLBACK_URL": "JIRA_CALLBACK_URL",
        "PROD_JIRA_WEBHOOK_SECRET": "JIRA_WEBHOOK_SECRET",
        "PROD_BREVO_API_KEY": "BREVO_API_KEY",
        "PROD_BREVO_FROM_EMAIL": "BREVO_FROM_EMAIL",
        "PROD_PADDLE_API_KEY": "PADDLE_API_KEY",
        "PROD_PADDLE_CLIENT_TOKEN": "PADDLE_CLIENT_TOKEN",
        "PROD_PADDLE_WEBHOOK_SECRET": "PADDLE_WEBHOOK_SECRET",
        "PROD_PADDLE_ENVIRONMENT": "PADDLE_ENVIRONMENT",
        "PROD_PADDLE_PRICE_STARTER_M": "PADDLE_PRICE_STARTER_M",
        "PROD_PADDLE_PRICE_STARTER_Y": "PADDLE_PRICE_STARTER_Y",
        "PROD_PADDLE_PRICE_GROWTH_M": "PADDLE_PRICE_GROWTH_M",
        "PROD_PADDLE_PRICE_GROWTH_Y": "PADDLE_PRICE_GROWTH_Y",
        "PROD_PADDLE_PRICE_BUSINESS_M": "PADDLE_PRICE_BUSINESS_M",
        "PROD_PADDLE_PRICE_BUSINESS_Y": "PADDLE_PRICE_BUSINESS_Y",
        "PROD_AI_PIPELINE_URL": "AI_PIPELINE_URL",
        "PROD_AI_PIPELINE_SECRET": "AI_PIPELINE_SECRET",
    }

    updated_count = 0
    preserved_count = 0

    # 4. Merge rule: update ONLY if OS environment variable is non-empty
    for env_var, target_key in secret_map.items():
        val = os.environ.get(env_var, "").strip()
        if val:
            existing[target_key] = val
            updated_count += 1
        elif target_key in existing:
            preserved_count += 1

    # 5. Atomic write operation
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            for k, v in existing.items():
                f.write(f"{k}={v}\n")

        # POSIX atomic replace
        os.replace(temp_path, env_path)
        os.chmod(env_path, 0o600)

        logger.info(
            f"✅ Environment file successfully merged & saved to {env_path} "
            f"(Updated: {updated_count}, Preserved: {preserved_count})"
        )
    except Exception as e:
        logger.error(f"❌ Failed during atomic write/replace of .env file: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        sys.exit(1)


if __name__ == "__main__":
    main()
