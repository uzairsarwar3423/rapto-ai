# Vocaply AI Pipeline — Production Deployment & Dockerization Guide

This document provides complete instructions for building, running, scaling, and deploying the **Vocaply AI Pipeline microservice** using Docker and Docker Compose on a Virtual Private Server (VPS) or cloud host.

---

## 🏗️ Architecture Overview

The Python AI Pipeline is built as a high-performance, asynchronous ASGI service powered by **FastAPI** and **Uvicorn**.

```
                           ┌──────────────────────────┐
                           │      Nginx Proxy         │
                           │   (Port 80 / 443 SSL)    │
                           └────────────┬─────────────┘
                                        │ (Internal Bridge Network)
                                        ▼
                           ┌──────────────────────────┐
                           │  Node.js API / Backend   │
                           └────────────┬─────────────┘
                                        │  X-Internal-Service-Key
                                        ▼
                  ┌──────────────────────────────────────────────┐
                  │    Vocaply AI Pipeline (FastAPI)             │
                  │         Port 8001 (Non-root 1001)            │
                  └──────┬──────────────┬──────────────┬─────────┘
                         │              │              │
                         ▼              ▼              ▼
                   ┌───────────┐  ┌───────────┐  ┌───────────┐
                   │  Redis    │  │  MongoDB  │  │ PostgreSQL│
                   │ (Caching) │  │(Transcripts)│ │ (Metadata)│
                   └───────────┘  └───────────┘  └───────────┘
```

---

## 🔒 Security Best Practices Implemented

1. **Multi-Stage Build**: Isolates build tools (`gcc`, `g++`, `libssl-dev`) in the `builder` stage, copying only pre-built wheels and virtualenv to the minimal `runtime` image.
2. **Non-Root Execution**: Runs under a dedicated `appuser` (UID/GID `1001`) with no login shell (`/sbin/nologin`).
3. **Minimal Attack Surface**: Uses Python stdlib `urllib` for container health checks—no `curl` or `wget` binary required in runtime image.
4. **Security Hardening**:
   - `security_opt: ["no-new-privileges:true"]`
   - `cap_drop: ["ALL"]`
5. **Secret Protection**: All sensitive keys use Pydantic `SecretStr` (redacted in logs/repr). Secrets are passed via `.env` or system environment, never baked into container images.
6. **Graceful Shutdown**: Listens for `STOPSIGNAL SIGTERM` with a 30-second grace period for in-flight LLM completions to terminate cleanly.

---

## 📋 Environment Variables Inventory

| Variable Name | Type | Default | Required? | Description |
|---|---|---|---|---|
| `ENVIRONMENT` | String | `production` | No | Environment (`development`, `staging`, `production`) |
| `SERVICE_NAME` | String | `ai-pipeline` | No | Service identity identifier |
| `PORT` | Integer | `8001` | No | ASGI server binding port |
| `LOG_LEVEL` | String | `INFO` | No | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `OPENAI_API_KEY` | Secret | *None* | **YES** | OpenRouter / OpenAI API key |
| `OPENAI_ORG_ID` | String | `None` | No | Optional OpenAI organization ID |
| `OPENAI_GPT41_MINI_MODEL_NAME` | String | `gpt-4o-mini` | No | Fast model for extraction/preprocessing |
| `OPENAI_GPT41_MODEL_NAME` | String | `gpt-4o` | No | Full model for complex resolution |
| `OPENAI_EMBEDDING_MODEL_NAME` | String | `text-embedding-3-small` | No | Vector embedding model |
| `OPENAI_MAX_RETRIES` | Integer | `3` | No | Maximum API call retries |
| `OPENAI_TIMEOUT_SECONDS` | Float | `30.0` | No | Request timeout per LLM request |
| `OPENAI_MAX_CONCURRENT_CALLS` | Integer | `10` | No | Semaphore limit per container instance |
| `MONGODB_URL` | String | *None* | **YES** | Connection string for MongoDB |
| `MONGODB_DATABASE` | String | `vocaply` | No | MongoDB target database name |
| `REDIS_URL` | String | *None* | **YES** | Connection string for Redis |
| `API_SHARED_SECRET` | Secret | *None* | **YES** | Inter-service auth secret (`X-Internal-Service-Key`) |
| `NODE_API_INTERNAL_ORIGIN` | String | `http://api:5000` | No | Node.js API origin for internal CORS scoping |

---

## 🛠️ Local & Production Docker Usage

### 1. Build Production Image

```bash
cd services/ai-pipeline

# Build image using multi-stage Dockerfile
docker build -t vocaply/ai-pipeline:latest .
```

### 2. Run Standalone Container

```bash
docker run -d \
  --name vocaply-ai-pipeline \
  --user 1001:1001 \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -p 8001:8001 \
  -e ENVIRONMENT=production \
  -e OPENAI_API_KEY="sk-or-v1-your-key-here" \
  -e MONGODB_URL="mongodb://user:pass@mongo-host:27017/vocaply" \
  -e REDIS_URL="redis://redis-host:6379/0" \
  -e API_SHARED_SECRET="your-super-secret-at-least-32-chars-long" \
  vocaply/ai-pipeline:latest
```

---

## 🚀 Docker Compose Operations

### 1. Start the Full Stack (AI Pipeline + Redis + MongoDB + Postgres)

From `services/ai-pipeline/`:

```bash
# Copy env template and set credentials
cp .env.example .env
nano .env

# Launch all services in detached mode
docker compose up -d
```

From Root Workspace (`/home/uzair/vocaply-system`):

```bash
# Launch entire system including Nginx, Node API, Worker, and AI Pipeline
docker compose up -d
```

### 2. Check Service Health & Logs

```bash
# Check container status
docker compose ps

# Stream structured JSON logs
docker compose logs -f ai-pipeline
```

### 3. Horizontal Scaling

To handle higher throughput on a multi-core VPS, scale the `ai-pipeline` containers behind a load balancer:

```bash
# Scale to 3 replicas
docker compose up -d --scale ai-pipeline=3
```

---

## 🖥️ VPS Deployment Guide (Ubuntu / Debian)

### Step 1: System Preparation

```bash
# Update OS packages
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose plugin
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable and start Docker service
sudo systemctl enable --now docker
```

### Step 2: Configure Systemd Daemon Service

Create a systemd unit file at `/etc/systemd/system/vocaply-stack.service`:

```ini
[Unit]
Description=Vocaply Production Stack (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/uzair/vocaply-system
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable auto-start on VPS reboot:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vocaply-stack
```

### Step 3: Nginx Reverse Proxy Scoping

In your `/etc/nginx/conf.d/vocaply.conf` or `./nginx/conf.d/default.conf`:

```nginx
# Internal AI Pipeline Scoping (Protect from public access)
location /ai-internal/ {
    # Block public access if served on main domain
    allow 127.0.0.1;
    allow 172.16.0.0/12; # Docker internal subnet
    deny all;

    proxy_pass http://ai-pipeline:8001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
}
```

---

## 📊 Health Probes & Monitoring

### Liveness Probe (`GET /health`)
- **Purpose**: Verifies process responsiveness.
- **Auth**: Exempt (no API key required).
- **Response**: `{"status": "ok"}` HTTP 200.

```bash
curl -i http://localhost:8001/health
```

### Readiness Probe (`GET /ready`)
- **Purpose**: Deep verification of MongoDB, Redis, and OpenAI API connectivity.
- **Auth**: Requires `X-Internal-Service-Key`.
- **Response**: HTTP 200 (`status: ready`) or HTTP 503 (`status: not_ready`).

```bash
curl -i http://localhost:8001/ready \
  -H "X-Internal-Service-Key: your-super-secret-at-least-32-chars-long"
```

---

## 🧹 Log Management & Rotation

The `docker-compose.yml` configures Docker's `json-file` log driver with automatic log rotation:

- **Max log file size**: 10 MB
- **Max log files stored**: 3 files per container

View realtime logs filtered by level:

```bash
docker compose logs -f ai-pipeline | grep "WARNING\|ERROR"
```
