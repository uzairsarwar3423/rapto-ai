# ==============================================================================
# Vocaply AI Pipeline — Production Multi-Stage Dockerfile
# ==============================================================================
# Architecture:
#   Stage 1 (builder): Compiles C-extensions, installs dependencies into /opt/venv
#   Stage 2 (runtime): Minimal production base, non-root user, zero build tools
# ==============================================================================

# ─── STAGE 1: Builder ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Install OS-level build dependencies (required for scikit-learn, numpy, tiktoken wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create isolated virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy dependency specifications first to leverage Docker layer caching
COPY requirements.txt pyproject.toml ./

# Install wheels into virtual environment
RUN pip install --no-cache-dir --default-timeout=1000 --retries 10 --prefer-binary -r requirements.txt

# Pre-compile Python bytecode for faster startup times
RUN python -m compileall /opt/venv


# ─── STAGE 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Environment configuration
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8001 \
    ENVIRONMENT=production

# Security: Create non-root system user and group (UID/GID 1001)
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid 1001 --no-create-home --shell /sbin/nologin appuser

WORKDIR /app

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy application source code with proper ownership
COPY --chown=appuser:appgroup src/ ./src/

# Set owner for the app directory
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Document exposed container port
EXPOSE 8001

# Container Healthcheck (Uses Python stdlib urllib — no external curl/wget binary needed)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')" || exit 1

# Graceful shutdown signal (Uvicorn handles SIGTERM gracefully)
STOPSIGNAL SIGTERM

# Production entrypoint: Uvicorn ASGI server with factory pattern
CMD ["uvicorn", "src.api.main:create_app", "--factory", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--no-access-log"]
