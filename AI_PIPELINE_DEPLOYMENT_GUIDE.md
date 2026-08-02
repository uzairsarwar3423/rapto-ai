# 🚀 AI-Pipeline Production CI/CD & VPS Deployment Guide

This document provides a step-by-step, production-grade DevOps guide for the **AI-Pipeline Microservice** (`services/ai-pipeline`). It covers the GitHub Actions CI/CD pipeline, Docker multi-stage build, GitHub Container Registry (GHCR) integration, zero-downtime VPS deployment, automated health checks, and emergency rollback procedures.

---

## 📌 Table of Contents
1. [Architecture Overview](#-architecture-overview)
2. [Prerequisites & Server Setup](#-prerequisites--server-setup)
3. [GitHub Secrets Setup](#-github-secrets-setup)
4. [Docker Setup & Optimization](#-docker-setup--optimization)
5. [CI/CD Workflow Details](#-cicd-workflow-details)
6. [VPS Deployment Configuration & Scripts](#-vps-deployment-configuration--scripts)
7. [Step-by-Step Deployment Commands (Tareeqa & Manual Setup)](#-step-by-step-deployment-commands-tareeqa--manual-setup)
8. [Health Check & Automatic Rollback Mechanism](#-health-check--automatic-rollback-mechanism)
9. [Troubleshooting & Handy Commands](#-troubleshooting--handy-commands)

---

## 🏗️ Architecture Overview

The CI/CD pipeline automates testing, container image building, pushing to GHCR, zero-downtime deployment to VPS via SSH, container health checking, and automatic rollback on failure.

```
┌─────────────────────────┐
│     Developer Push      │  (Push to main branch / services/ai-pipeline/**)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Stage 1: Automated Test │  (Setup Python 3.12, install deps, execute Pytest suite)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Stage 2: Docker Build   │  (Multi-stage build, tag with SHA & latest, push to GHCR)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Stage 3: Deploy to VPS  │  (SSH into VPS, sync scripts, merge secrets into .env)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Zero-Downtime Deploy   │  (docker compose pull & up -d --no-deps ai-pipeline)
└────────────┬────────────┘
             │
             ├─── HEALTH CHECK PASSED ───► 🎉 Live in Production
             │
             └─── HEALTH CHECK FAILED ───► ⚠️ Auto-Rollback to previous image tag
```

---

## 🖥️ Prerequisites & Server Setup

### 1. VPS Requirements
- **OS**: Ubuntu 22.04 LTS or higher
- **RAM**: 2GB+ (4GB recommended for ML/Python workers)
- **Disk**: 20GB+ SSD
- **Docker**: Docker Engine 24.0+ and `docker compose` plugin installed

### 2. Initial VPS Configuration Commands (Run once on VPS)

Connect to your VPS:
```bash
ssh root@YOUR_VPS_IP
```

Install Docker & Docker Compose (if not already installed):
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git python3 python3-pip ca-certificates curl gnupg

# Install Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify Docker installation
docker --version
docker compose version
```

Create Deployment Directory Structure:
```bash
sudo mkdir -p /opt/rapto-system/scripts
sudo chown -R $USER:$USER /opt/rapto-system
cd /opt/rapto-system
```

---

## 🔑 GitHub Secrets Setup

Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.

Add the following required production secrets:

### 1. SSH & VPS Access Secrets
| Secret Name | Description | Example / Value |
| :--- | :--- | :--- |
| `VPS_HOST` | Public IP address or domain of VPS | `192.168.1.100` or `deploy.rapto.cloud` |
| `VPS_USERNAME` | SSH User on VPS | `root` or `deploy` |
| `VPS_SSH_KEY` | Private SSH Key (OpenSSH format) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_SSH_PORT` | SSH Port (Optional, default 22) | `22` |

### 2. AI-Pipeline Application Secrets
| Secret Name | Description | Example / Value |
| :--- | :--- | :--- |
| `PROD_OPENAI_API_KEY` | OpenAI API Key for AI extraction/processing | `sk-proj-...` |
| `PROD_OPENAI_ORG_ID` | Optional OpenAI Organization ID | `org-...` |
| `PROD_AI_PIPELINE_SECRET` | Internal API Secret shared between Node.js API & AI service | `minimum-32-character-random-secure-string` |
| `PROD_MONGODB_URL` | MongoDB Connection URL | `mongodb://root:password@mongodb:27017/vocaply` |
| `PROD_REDIS_URL` | Redis Connection URL | `redis://rapto-redis:6379/0` |
| `PROD_LOG_LEVEL` | Application logging level | `INFO` |

---

## 🐳 Docker Setup & Optimization

The AI Pipeline uses a multi-stage `Dockerfile` (`services/ai-pipeline/Dockerfile`) for maximum performance and minimal footprint:

1. **Stage 1 (Builder)**: Uses `python:3.12-slim`, compiles dependencies, installs requirements into `/opt/venv`, and pre-compiles Python bytecode.
2. **Stage 2 (Runtime)**: Copies `/opt/venv` and `/app` source code into a clean `python:3.12-slim` image. Runs as non-root user (`appuser`, UID 1001), drops linux capabilities, and includes a built-in healthcheck (`HEALTHCHECK`).

### Docker Service Definition (`docker-compose.yml` snippet)

```yaml
  ai-pipeline:
    image: ghcr.io/${IMAGE_NAME_AI:-vocaply/ai-pipeline}:${IMAGE_TAG:-latest}
    container_name: rapto-ai-pipeline
    restart: unless-stopped
    user: "1001:1001"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      - ENVIRONMENT=production
      - SERVICE_NAME=ai-pipeline
      - PORT=8001
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MONGODB_URL=${MONGODB_URL}
      - REDIS_URL=${REDIS_URL:-redis://rapto-redis:6379}
      - API_SHARED_SECRET=${API_SHARED_SECRET}
    ports:
      - "8001:8001"
    depends_on:
      redis:
        condition: service_healthy
      mongodb:
        condition: service_healthy
    networks:
      - app-network
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2048M
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')\" || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 15s
```

---

## ⚙️ CI/CD Workflow Details

The workflow is defined in `.github/workflows/deploy-ai-pipeline.yml` and consists of 3 stages:

1. **`test` Stage**:
   - Sets up Python 3.12.
   - Installs production and dev dependencies (`requirements.txt`, `requirements-dev.txt`).
   - Runs `pytest tests` to verify all unit tests, schemas, model routers, and parsers pass before building.

2. **`build-and-push` Stage**:
   - Authenticates to GitHub Container Registry (`ghcr.io`).
   - Resolves deployment tag (`git commit SHA` or custom tag from `workflow_dispatch`).
   - Builds multi-stage Docker image and pushes tags: `ghcr.io/<repo>/ai-pipeline:<sha>` and `latest`.
   - Utilizes GitHub Actions cache (`type=gha`) for fast builds.

3. **`deploy` Stage**:
   - Syncs `docker-compose.yml` and `scripts/` to VPS path `/opt/rapto-system` using SCP.
   - Executes remote SSH commands:
     - Authenticates VPS Docker to GHCR.
     - Runs `scripts/merge-env.py` to write/update environment variables in `/opt/rapto-system/.env` atomically.
     - Calls `scripts/deploy-ai.sh` to update container with zero downtime.
     - Runs `scripts/health-check-ai.sh` to probe `/health` endpoint.
     - Triggers `scripts/rollback-ai.sh` automatically if health check fails.

---

## 📜 VPS Deployment Configuration & Scripts

All deployment helper scripts are located in `scripts/`:

1. [`merge-env.py`](file:///home/uzair/vocaply-system/scripts/merge-env.py): Reads current `/opt/rapto-system/.env`, merges environment variables passed from CI secrets, ensures `REDIS_URL` uses Docker service name (`redis://rapto-redis:6379`), and performs an atomic POSIX file replace.
2. [`deploy-ai.sh`](file:///home/uzair/vocaply-system/scripts/deploy-ai.sh): Handles zero-downtime container pull, updates `rapto-ai-pipeline` container without stopping backing databases, triggers health check, and initiates rollback on failure.
3. [`health-check-ai.sh`](file:///home/uzair/vocaply-system/scripts/health-check-ai.sh): Probes GET `/health` on port `8001` inside container using Python's stdlib `urllib.request`.
4. [`rollback-ai.sh`](file:///home/uzair/vocaply-system/scripts/rollback-ai.sh): Restores the previous stable Docker image tag saved in `/tmp/previous_ai_pipeline_image_tag.txt`.

---

## 🛠️ Step-by-Step Deployment Commands (Tareeqa & Manual Setup)

### Automated Deployment (Recommended)

1. **Automatic Trigger on Push**:
   ```bash
   git add .
   git commit -m "feat(ai-pipeline): production enhancement"
   git push origin main
   ```
   *GitHub Actions will automatically run tests, build the image, push to GHCR, and deploy to your VPS.*

2. **Manual Trigger via GitHub UI**:
   - Go to GitHub -> **Actions** -> **AI-Pipeline Production CI/CD & Automated VPS Deployment**.
   - Click **Run workflow**, select branch `main`, optionally enter a custom image tag, and click **Run workflow**.

---

### Manual Deployment via CLI on VPS (Step-by-Step / Tareeqa)

If you need to manually deploy or test on VPS without GitHub Actions, follow these steps:

#### Step 1: Login to GHCR on VPS
```bash
echo "YOUR_GITHUB_PAT_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

#### Step 2: Navigate to deployment directory
```bash
cd /opt/rapto-system
```

#### Step 3: Set environment variables and run merge script
```bash
export TARGET_TAG="latest"
export REPO_NAME="uzairsarwar3423/rapto-ai"
export PROD_OPENAI_API_KEY="sk-proj-your-openai-key"
export PROD_AI_PIPELINE_SECRET="your-32-character-api-shared-secret"

python3 scripts/merge-env.py
```

#### Step 4: Execute zero-downtime deployment script
```bash
IMAGE_TAG="latest" bash ./scripts/deploy-ai.sh
```

#### Step 5: Verify running container
```bash
docker ps --filter "name=rapto-ai-pipeline"
```

---

## 🩺 Health Check & Automatic Rollback Mechanism

### Liveness Probe (`GET /health`)
- Path: `http://127.0.0.1:8001/health`
- Response: `{"status": "ok"}` (HTTP 200)
- Execution: Non-blocking, light probe executed inside container via `python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')"`.

### Automated Rollback Trigger
During deployment:
1. `deploy-ai.sh` saves running image tag to `/tmp/previous_ai_pipeline_image_tag.txt`.
2. New container image is started via `docker compose up -d --no-deps ai-pipeline`.
3. `health-check-ai.sh` probes `/health` up to 15 times (every 4 seconds).
4. If `/health` returns HTTP 200, deployment succeeds and old images are pruned.
5. If `/health` fails after retries, `deploy-ai.sh` automatically invokes `rollback-ai.sh`, which redeploys the previous image tag and preserves uptime.

---

## 🔍 Troubleshooting & Handy Commands

### Inspect AI-Pipeline Container Logs
```bash
docker logs rapto-ai-pipeline --tail=100 -f
```

### Manual Healthcheck Test inside VPS
```bash
docker exec rapto-ai-pipeline python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8001/health').read().decode())"
```

### Manually Trigger Rollback on VPS
```bash
cd /opt/rapto-system
./scripts/rollback-ai.sh
```

### Check Container Resource Usage
```bash
docker stats rapto-ai-pipeline
```

### Inspect Generated Production Environment File
```bash
cat /opt/rapto-system/.env | grep -E "OPENAI|AI_PIPELINE|REDIS_URL|MONGODB"
```

---
> [!TIP]
> **Production Best Practice**: Always store production credentials securely in GitHub Repository Secrets (`PROD_OPENAI_API_KEY`, `PROD_AI_PIPELINE_SECRET`, `VPS_SSH_KEY`). Never commit raw credentials into `.env` files or git repositories.
