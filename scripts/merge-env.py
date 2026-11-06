#!/usr/bin/env python3
"""
Production Environment Variable Merger (safe, in-place).

Updates /opt/rapto-system/.env during deployment WITHOUT destroying server-side edits.

What was wrong with the old version (root cause of "manually added variables disappear / break"):
  - it parsed the whole file into a dict and REGENERATED it every deploy: comments dropped, multi-line values (PEM keys)
    shredded into bogus keys, quotes rewritten ('literal' -> "interpolated", `# note` folded into the value) and JSON
    values gained an extra layer of backslashes on every run until Docker Compose could no longer parse the file;
  - it overwrote server values with GitHub secrets on every deploy and force-set NODE_ENV/PORT/REDIS_HOST/...;
  - two workflows ran it at the same time on a shared `.env.tmp` (no lock);
  - it printed REDIS_URL / AI_PIPELINE_URL values into the CI log.

Rules now:
  1. Lossless: only the single line of a key this script sets is changed. Comments, ordering, quoting, JSON and
     multi-line values everywhere else stay byte-for-byte identical.
  2. No clobber: a GitHub secret only FILLS a key that is missing/empty. Existing server values are kept.
     To deliberately overwrite from GitHub secrets, run with SYNC_SECRETS=true.
  3. Deployment metadata (IMAGE_TAG, IMAGE_NAME, IMAGE_NAME_AI, DOCKER_REGISTRY) is always updated - that is its job.
  4. If nothing changes the file is not rewritten at all. Changes are atomic, under an exclusive lock, with a backup.
  5. A file it cannot parse safely is never modified. Values are never printed.
"""

import logging
import os
import re
import shutil
import stat
import sys
import tempfile
import time
from urllib.parse import urlparse

try:
    import fcntl
except ImportError:  # non-POSIX (local dev only)
    fcntl = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("merge-env")

DOCKER_REDIS_URL = "redis://rapto-redis:6379"
DOCKER_REDIS_HOST = "rapto-redis"
DOCKER_REDIS_PORT = "6379"
LOCALHOST_VARIANTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", ""}

KEY_RE = re.compile(r"^(?P<pre>\s*(?:export\s+)?)(?P<key>[A-Za-z_][A-Za-z0-9_.\-]*)(?P<eq>\s*=\s*)(?P<val>.*?)(?P<nl>\r?\n?)$", re.S)
SAFE_RAW = re.compile(r"^[A-Za-z0-9_@%+=:,./\-]*$")


# ── Lossless line model ──────────────────────────────────────────────────────────────────────────────────────────

def _closing_quote(text, quote):
    """Index of the closing quote in `text` (the part AFTER the opening quote), or -1."""
    i = 0
    while i < len(text):
        if quote == '"' and text[i] == "\\":
            i += 2
            continue
        if text[i] == quote:
            return i
        i += 1
    return -1


def parse_statements(lines):
    """Return [(start, end, key, raw_value, malformed)] — multi-line quoted values are ONE statement."""
    stmts = []
    i = 0
    while i < len(lines):
        m = KEY_RE.match(lines[i])
        if not m or lines[i].lstrip().startswith("#"):
            i += 1
            continue
        raw, end, bad = m.group("val"), i, False
        if raw[:1] in ("'", '"'):
            q, body, j = raw[0], raw[1:], i
            while _closing_quote(body, q) == -1:
                j += 1
                if j >= len(lines):
                    bad, j = True, len(lines) - 1
                    break
                body += lines[j]
            end = j
            raw = raw + "".join(lines[i + 1:j + 1]) if j > i else raw
        stmts.append((i, end, m.group("key"), raw, bad))
        i = end + 1
    return stmts


def decode(raw):
    """Approximate the value Docker Compose would read (for presence / localhost checks only)."""
    raw = raw.rstrip("\r\n")
    if raw[:1] == "'":
        end = raw.find("'", 1)
        return raw[1:end] if end != -1 else raw[1:]
    if raw[:1] == '"':
        end = _closing_quote(raw[1:], '"')
        return raw[1:1 + end] if end != -1 else raw[1:]
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()


def format_value(value):
    """Serialise so Compose reads back exactly `value`: raw if safe, else single-quoted (literal), else escaped double."""
    if SAFE_RAW.match(value):
        return value
    if "'" not in value and "\n" not in value and "\r" not in value:
        return f"'{value}'"
    esc = value.replace("\\", "\\\\").replace('"', '\\"').replace("$", "$$").replace("\n", "\\n").replace("\r", "\\r")
    return f'"{esc}"'


class EnvFile:
    def __init__(self, text):
        self.original = text
        self.lines = text.splitlines(keepends=True)
        self.stmts = parse_statements(self.lines)

    def _last(self, key):
        found = [s for s in self.stmts if s[2] == key]
        return found[-1] if found else None  # Compose: the last definition wins

    def get(self, key):
        s = self._last(key)
        return None if s is None else decode(s[3])

    def malformed(self):
        return [s for s in self.stmts if s[4]]

    def set(self, key, value):
        """Replace the ONE statement for `key` (or append). Nothing else changes."""
        eol = "\r\n" if self.lines and self.lines[-1].endswith("\r\n") else "\n"
        s = self._last(key)
        if s:
            first = KEY_RE.match(self.lines[s[0]])
            pre, eq = (first.group("pre"), first.group("eq")) if first else ("", "=")
            trail = eol if self.lines[s[1]].endswith("\n") else ""
            self.lines[s[0]:s[1] + 1] = [f"{pre}{key}{eq}{format_value(value)}{trail}"]
        else:
            if self.lines and not self.lines[-1].endswith(("\n", "\r")):
                self.lines[-1] += eol
            self.lines.append(f"{key}={format_value(value)}{eol}")
        self.stmts = parse_statements(self.lines)

    def text(self):
        return "".join(self.lines)

    def fill(self, key, value):
        """Set only if missing/empty. Returns True if written."""
        if self.get(key):
            return False
        self.set(key, value)
        return True


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

def is_localhost(url):
    try:
        return (urlparse(url).hostname or "") in LOCALHOST_VARIANTS
    except ValueError:
        return True


def unwrap(v):
    """A pasted secret may be wrapped in one pair of matching quotes; strip exactly one layer."""
    v = v.strip()
    return v[1:-1] if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"" else v


class Lock:
    """Exclusive lock: the API and AI workflows can no longer interleave read-modify-write on the same file."""

    def __init__(self, path, timeout=90):
        self.path, self.timeout, self.fd = path + ".lock", timeout, None

    def __enter__(self):
        if fcntl is None:
            return self
        self.fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.monotonic() > deadline:
                    logger.error("❌ Another deployment is still writing .env (lock timeout)")
                    sys.exit(1)
                time.sleep(0.2)

    def __exit__(self, *exc):
        if self.fd is not None:
            os.close(self.fd)


def atomic_write(env_path, text):
    """Backup, then unique temp file in the same dir + fsync + rename (keeps mode/owner)."""
    directory = os.path.dirname(env_path) or "."
    if os.path.exists(env_path):
        backup = f"{env_path}.bak.{time.strftime('%Y%m%d%H%M%S')}"
        shutil.copy2(env_path, backup)
        os.chmod(backup, 0o600)
        baks = sorted(p for p in os.listdir(directory) if p.startswith(os.path.basename(env_path) + ".bak."))
        for old in baks[:-5]:
            os.unlink(os.path.join(directory, old))
        st = os.stat(env_path)
        mode, uid, gid = stat.S_IMODE(st.st_mode), st.st_uid, st.st_gid
    else:
        mode, uid, gid = 0o600, None, None
    fd, tmp = tempfile.mkstemp(prefix=".env.", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, mode)
        if uid is not None:
            try:
                os.chown(tmp, uid, gid)
            except (PermissionError, AttributeError):
                pass
        os.replace(tmp, env_path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# CI secret (process env) -> key in .env
SECRET_MAP = {
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
    "PROD_GOOGLE_CALENDAR_CALLBACK_URL": "GOOGLE_CALENDAR_CALLBACK_URL",
    # AI Pipeline
    "PROD_OPENAI_API_KEY": "OPENAI_API_KEY",
    "PROD_OPENAI_ORG_ID": "OPENAI_ORG_ID",
    "PROD_OPENAI_GPT41_MINI_MODEL_NAME": "OPENAI_GPT41_MINI_MODEL_NAME",
    "PROD_OPENAI_GPT41_MODEL_NAME": "OPENAI_GPT41_MODEL_NAME",
    "PROD_OPENAI_EMBEDDING_MODEL_NAME": "OPENAI_EMBEDDING_MODEL_NAME",
    "PROD_MONGODB_DATABASE": "MONGODB_DATABASE",
    "PROD_API_SHARED_SECRET": "API_SHARED_SECRET",
    "PROD_NODE_API_INTERNAL_ORIGIN": "NODE_API_INTERNAL_ORIGIN",
    "PROD_LOG_LEVEL": "LOG_LEVEL",
}


def main():
    deploy_dir = os.environ.get("DEPLOY_DIR", "/opt/rapto-system")
    env_path = os.path.join(deploy_dir, ".env")
    sync_secrets = os.environ.get("SYNC_SECRETS", "").strip().lower() in ("1", "true", "yes")
    logger.info(f"Target deployment directory: {deploy_dir}")

    with Lock(env_path):
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8", newline="") as f:
                env = EnvFile(f.read())
            bad = env.malformed()
            if bad:
                logger.error(f"❌ .env has an unterminated quoted value near line {bad[0][0] + 1}; refusing to modify a file "
                             "that cannot be parsed safely. Fix it on the server and re-run.")
                sys.exit(1)
        else:
            logger.warning("⚠️  .env does not exist yet — creating it (first-time setup only)")
            env = EnvFile("")

        filled, overwritten, kept, defaults = [], [], 0, []

        # 1. Deployment metadata — owned by this script, always current
        for key, value in (
            ("DOCKER_REGISTRY", "ghcr.io"),
            ("IMAGE_NAME", f"{os.environ['REPO_NAME']}/api" if os.environ.get("REPO_NAME") else None),
            ("IMAGE_NAME_AI", f"{os.environ['REPO_NAME']}/ai-pipeline" if os.environ.get("REPO_NAME") else None),
            ("IMAGE_TAG", os.environ.get("TARGET_TAG", "").strip() or None),
        ):
            if value and env.get(key) != value:
                env.set(key, value)
        if not os.environ.get("TARGET_TAG", "").strip():
            logger.warning("⚠️  TARGET_TAG not set — IMAGE_TAG will not be updated.")

        # 2. CI secrets: FILL missing/empty keys. Existing server values win unless SYNC_SECRETS=true.
        for env_var, key in SECRET_MAP.items():
            value = unwrap(os.environ.get(env_var, ""))
            if not value:
                continue
            if key in ("REDIS_URL", "AI_PIPELINE_URL") and is_localhost(value):
                logger.warning(f"⚠️  {env_var} points at localhost (unusable inside Docker) — ignored")
                continue
            if key in ("DATABASE_URL", "DIRECT_URL") and "connection_limit=" not in value:
                value += ("&" if "?" in value else "?") + "connection_limit=3"  # PgBouncer limit, only for values we write
            current = env.get(key)
            if not current:
                env.set(key, value)
                filled.append(key)
            elif sync_secrets and current != value:
                env.set(key, value)
                overwritten.append(key)
            else:
                kept += 1

        # 3. Safe defaults — only for keys that are missing/empty (operator choices are never replaced)
        for key, value in (
            ("API_HOST_PORT", "5010"), ("NGINX_HTTP_PORT", "8080"), ("NGINX_HTTPS_PORT", "8443"),
            ("REDIS_HOST", DOCKER_REDIS_HOST), ("REDIS_PORT", DOCKER_REDIS_PORT),
            ("FRONTEND_URL", "https://app.rapto.cloud"), ("APP_URL", "https://app.rapto.cloud"),
            ("API_URL", "https://api.rapto.cloud"),
            ("GOOGLE_CALENDAR_CALLBACK_URL", "https://api.rapto.cloud/api/v1/auth/google-calendar/callback"),
        ):
            if env.fill(key, value):
                defaults.append(key)

        # 4. Docker-network fixes: touch ONLY a missing/empty/localhost value (unusable otherwise)
        for key, docker_value in (("REDIS_URL", DOCKER_REDIS_URL), ("AI_PIPELINE_URL", "http://ai-pipeline:8001")):
            current = env.get(key)
            if not current or is_localhost(current):
                logger.warning(f"⚠️  {key} is missing or points at localhost — set to Docker service default")
                env.set(key, docker_value)
                defaults.append(key)

        # 5. Keep the two shared-secret names consistent by filling the missing one (never overwriting)
        shared = env.get("AI_PIPELINE_SECRET") or env.get("API_SHARED_SECRET")
        if shared:
            env.fill("AI_PIPELINE_SECRET", shared)
            env.fill("API_SHARED_SECRET", shared)

        new_text = env.text()
        if new_text == env.original:
            logger.info(f"✅ .env already up to date — not modified ({kept} server values kept)")
            return
        try:
            atomic_write(env_path, new_text)
        except Exception as e:
            logger.error(f"❌ Failed to write .env: {type(e).__name__}")
            sys.exit(1)
        logger.info(
            f"✅ .env updated (filled: {', '.join(filled) or '-'} | defaults: {', '.join(defaults) or '-'} | "
            f"OVERWRITTEN via SYNC_SECRETS: {', '.join(overwritten) or '-'} | server values kept: {kept})"
        )


if __name__ == "__main__":
    main()
