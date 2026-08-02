#!/usr/bin/env python3
"""
Production Environment Variable Merger & Preserver.

Reads existing /opt/rapto-system/.env file, updates keys from process environment
variables, and writes out the merged .env atomically using POSIX file replacement.

Critical fixes applied:
  - REDIS_URL is ALWAYS forced to redis://rapto-redis:6379 (Docker service name).
    This overrides any PROD_REDIS_URL secret that may contain 'localhost'.
  - REDIS_HOST and REDIS_PORT are always written for explicit ioredis resolution.
  - IMAGE_TAG must come from TARGET_TAG (never left as stale 'latest').
"""

import logging
import os
import sys
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("merge-env")

# ── Docker internal Redis URL — always correct inside docker-compose network ──
DOCKER_REDIS_URL = "redis://rapto-redis:6379"
DOCKER_REDIS_HOST = "rapto-redis"
DOCKER_REDIS_PORT = "6379"

LOCALHOST_VARIANTS = {"localhost", "127.0.0.1", "::1", ""}


def is_localhost_redis(url: str) -> bool:
    """Return True if the Redis URL points to localhost (unusable inside Docker)."""
    try:
        parsed = urlparse(url)
        return parsed.hostname in LOCALHOST_VARIANTS
    except Exception:
        return True


def clean_val(v: str) -> str:
    """Sanitize environment variable value by stripping outer/dangling quotes."""
    v = v.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1].strip()
    return v.rstrip("\\").strip('"').strip("'")


def format_env_line(key: str, val: str) -> str:
    """Format key-value pair for Docker Compose .env file compatibility."""
    val = clean_val(val)
    if any(c in val for c in [" ", "#", "$", '"', "'", "\t"]):
        safe_val = val.replace('"', '\\"')
        return f'{key}="{safe_val}"\n'
    return f"{key}={val}\n"


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
                        existing[key.strip()] = clean_val(val)
        except Exception as e:
            logger.error(f"Failed to read existing .env file: {e}")
            sys.exit(1)

    # 2. Core deployment metadata — always overwrite
    existing["NODE_ENV"] = "production"
    existing["PORT"] = "5000"
    existing["DOCKER_REGISTRY"] = "ghcr.io"

    repo_name = os.environ.get("REPO_NAME", "")
    if repo_name:
        existing["IMAGE_NAME"] = f"{repo_name}/api"
        existing["IMAGE_NAME_AI"] = f"{repo_name}/ai-pipeline"

    target_tag = os.environ.get("TARGET_TAG", "").strip()
    if target_tag:
        existing["IMAGE_TAG"] = target_tag
        logger.info(f"🏷️  Deployment image tag: {target_tag}")
    else:
        logger.warning("⚠️  TARGET_TAG not set — IMAGE_TAG will not be updated.")

    # Core production domain defaults
    if not existing.get("FRONTEND_URL") or "localhost" in existing.get("FRONTEND_URL", ""):
        existing["FRONTEND_URL"] = "https://app.rapto.cloud"
    if not existing.get("APP_URL") or "localhost" in existing.get("APP_URL", ""):
        existing["APP_URL"] = "https://app.rapto.cloud"
    if not existing.get("API_URL") or "localhost" in existing.get("API_URL", ""):
        existing["API_URL"] = "https://api.rapto.cloud"
    if not existing.get("GOOGLE_CALENDAR_CALLBACK_URL"):
        existing["GOOGLE_CALENDAR_CALLBACK_URL"] = "https://api.rapto.cloud/api/v1/auth/google-calendar/callback"

    # 3. Secret mapping dictionary (Environment variable -> Target .env key)
    secret_map = {
        "PROD_DATABASE_URL":          "DATABASE_URL",
        "PROD_DIRECT_URL":            "DIRECT_URL",
        "PROD_MONGODB_URL":           "MONGODB_URL",
        "PROD_REDIS_URL":             "REDIS_URL",
        "PROD_JWT_ACCESS_SECRET":     "JWT_ACCESS_SECRET",
        "PROD_JWT_REFRESH_SECRET":    "JWT_REFRESH_SECRET",
        "PROD_APP_URL":               "APP_URL",
        "PROD_FRONTEND_URL":          "FRONTEND_URL",
        "PROD_API_URL":               "API_URL",
        "PROD_JIRA_CLIENT_ID":        "JIRA_CLIENT_ID",
        "PROD_JIRA_CLIENT_SECRET":    "JIRA_CLIENT_SECRET",
        "PROD_JIRA_CALLBACK_URL":     "JIRA_CALLBACK_URL",
        "PROD_JIRA_WEBHOOK_SECRET":   "JIRA_WEBHOOK_SECRET",
        "PROD_BREVO_API_KEY":         "BREVO_API_KEY",
        "PROD_BREVO_FROM_EMAIL":      "BREVO_FROM_EMAIL",
        "PROD_PADDLE_API_KEY":        "PADDLE_API_KEY",
        "PROD_PADDLE_CLIENT_TOKEN":   "PADDLE_CLIENT_TOKEN",
        "PROD_PADDLE_WEBHOOK_SECRET": "PADDLE_WEBHOOK_SECRET",
        "PROD_PADDLE_ENVIRONMENT":    "PADDLE_ENVIRONMENT",
        "PROD_PADDLE_PRICE_STARTER_M":"PADDLE_PRICE_STARTER_M",
        "PROD_PADDLE_PRICE_STARTER_Y":"PADDLE_PRICE_STARTER_Y",
        "PROD_PADDLE_PRICE_GROWTH_M": "PADDLE_PRICE_GROWTH_M",
        "PROD_PADDLE_PRICE_GROWTH_Y": "PADDLE_PRICE_GROWTH_Y",
        "PROD_PADDLE_PRICE_BUSINESS_M":"PADDLE_PRICE_BUSINESS_M",
        "PROD_PADDLE_PRICE_BUSINESS_Y":"PADDLE_PRICE_BUSINESS_Y",
        "PROD_AI_PIPELINE_URL":       "AI_PIPELINE_URL",
        "PROD_AI_PIPELINE_SECRET":    "AI_PIPELINE_SECRET",
        "PROD_GOOGLE_CALENDAR_CALLBACK_URL": "GOOGLE_CALENDAR_CALLBACK_URL",

        # ── AI Pipeline Specific Secrets & Config ──
        "PROD_OPENAI_API_KEY":               "OPENAI_API_KEY",
        "PROD_OPENAI_ORG_ID":                "OPENAI_ORG_ID",
        "PROD_OPENAI_GPT41_MINI_MODEL_NAME": "OPENAI_GPT41_MINI_MODEL_NAME",
        "PROD_OPENAI_GPT41_MODEL_NAME":      "OPENAI_GPT41_MODEL_NAME",
        "PROD_OPENAI_EMBEDDING_MODEL_NAME":  "OPENAI_EMBEDDING_MODEL_NAME",
        "PROD_MONGODB_DATABASE":             "MONGODB_DATABASE",
        "PROD_API_SHARED_SECRET":            "API_SHARED_SECRET",
        "PROD_NODE_API_INTERNAL_ORIGIN":     "NODE_API_INTERNAL_ORIGIN",
        "PROD_LOG_LEVEL":                    "LOG_LEVEL",
    }

    updated_count = 0
    preserved_count = 0

    # 4. Merge: update only if secret is non-empty
    for env_var, target_key in secret_map.items():
        val = os.environ.get(env_var, "").strip()
        if val:
            existing[target_key] = clean_val(val)
            updated_count += 1
            logger.debug(f"Updated: {target_key}")
        elif target_key in existing:
            preserved_count += 1
            logger.debug(f"Preserved: {target_key}")

    # Synchronize AI_PIPELINE_SECRET and API_SHARED_SECRET to guarantee auth parity
    shared_secret = existing.get("AI_PIPELINE_SECRET") or existing.get("API_SHARED_SECRET")
    if shared_secret:
        existing["AI_PIPELINE_SECRET"] = shared_secret
        existing["API_SHARED_SECRET"] = shared_secret
        logger.info("✅ AI_PIPELINE_SECRET and API_SHARED_SECRET synchronized.")

    # ── CRITICAL: Fix REDIS_URL — reject localhost, always use Docker service name ──
    redis_url = existing.get("REDIS_URL", "")
    if not redis_url or is_localhost_redis(redis_url):
        logger.warning(
            f"⚠️  REDIS_URL={redis_url!r} is localhost or empty — "
            f"overriding with Docker service name: {DOCKER_REDIS_URL}"
        )
        existing["REDIS_URL"] = DOCKER_REDIS_URL
    else:
        logger.info(f"✅ REDIS_URL validated: {redis_url}")

    # Always write explicit host/port so ioredis has unambiguous resolution
    existing["REDIS_HOST"] = DOCKER_REDIS_HOST
    existing["REDIS_PORT"] = DOCKER_REDIS_PORT
    logger.info(f"✅ REDIS_HOST={DOCKER_REDIS_HOST}, REDIS_PORT={DOCKER_REDIS_PORT} written")

    # Enforce safe connection limits for PgBouncer pooler (max 15 clients in session mode)
    for db_key in ["DATABASE_URL", "DIRECT_URL"]:
        val = existing.get(db_key, "")
        if val and "connection_limit=" not in val:
            delimiter = "&" if "?" in val else "?"
            existing[db_key] = f"{val}{delimiter}connection_limit=3"
            logger.info(f"⚡ Appended connection_limit=3 to {db_key} for PgBouncer stability.")

    # 5. Atomic write operation
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write("# Auto-generated by merge-env.py — DO NOT EDIT MANUALLY\n")
            f.write(f"# Generated at: {__import__('datetime').datetime.utcnow().isoformat()}Z\n\n")
            for k, v in sorted(existing.items()):
                f.write(format_env_line(k, v))

        # POSIX atomic replace
        os.replace(temp_path, env_path)
        os.chmod(env_path, 0o600)

        logger.info(
            f"✅ Environment file merged → {env_path} "
            f"(Updated: {updated_count}, Preserved: {preserved_count}, "
            f"Total keys: {len(existing)})"
        )
    except Exception as e:
        logger.error(f"❌ Failed during atomic write/replace of .env file: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        sys.exit(1)


if __name__ == "__main__":
    main()
