# 🚀 Production DevOps & VPS Deployment Guide

## 1. Executive Summary & Architecture Overview

This document outlines the production-ready DevOps architecture, containerization strategy, reverse proxy setup, and automated GitHub Actions CI/CD pipeline for the **Rapto API Backend Service**.

### Key Architectural Pillars
- **Zero-Downtime Rolling Deployment**: Seamless container updates using Docker Compose without dropping active API requests.
- **Multi-Stage Containerization**: Minimal Node.js 22 Alpine runtime with non-root security context (`USER node`) and `tini` signal handling.
- **SSL Termination & NGINX Reverse Proxy**: HTTP/2 support, TLS 1.2/1.3, rate limiting, security headers, and dedicated WebSocket upgrading for Socket.io.
- **Automated Health & Readiness Probes**: `/health` (Liveness) and `/ready` (Database + Cache Readiness) verification before and after deployments.
- **Automated Rollback Engine**: Automatic failure detection and instant rollback to previous stable image tags if health checks fail post-deployment.
- **Centralized Environment & Secrets Management**: Automated secret injection via GitHub Actions into protected VPS environment files.

---

## 2. Infrastructure System Architecture

```mermaid
graph TD
    Client["🌐 Internet / Web & Mobile Clients"] -->|HTTPS / Port 443| NGINX["🛡️ NGINX Reverse Proxy & SSL"]
    NGINX -->|HTTP / Port 5000| API["⚡ Rapto API Service (Node.js/Express)"]
    NGINX -->|WSS / WebSocket| API
    
    API -->|Prisma ORM| Postgres[("🐘 PostgreSQL 16")]
    API -->|BullMQ & Socket.io Adapter| Redis[("⚡ Redis 7")]
    API -->|Mongoose Document Store| Mongo[("🍃 MongoDB 7")]
    API -->|HTTP REST| AIPipeline["🤖 AI Pipeline Microservice"]

    Worker["⚙️ Background Worker (BullMQ)"] --> Postgres
    Worker --> Redis
    Worker --> Mongo
    Worker --> AIPipeline

    subgraph VPS ["🖥️ Production VPS (Ubuntu 22.04 LTS)"]
        NGINX
        API
        Worker
        Postgres
        Redis
        Mongo
    end

    subgraph CICD ["⚙️ GitHub Actions CI/CD Pipeline"]
        GitPush["Push to main branch"] --> RunTests["🧪 Unit & Integration Tests"]
        RunTests --> BuildDocker["🐳 Docker Multi-Stage Build"]
        BuildDocker --> PushGHCR["📦 Push to GHCR (ghcr.io)"]
        PushGHCR --> SSHDeploy["📡 Zero-Downtime SSH Deploy"]
        SSHDeploy --> Migration["🗄️ Prisma DB Migration"]
        Migration --> HealthCheck["🔍 Health Probe (/health & /ready)"]
        HealthCheck -- Pass --> Success["✅ Deployment Successful"]
        HealthCheck -- Fail --> Rollback["⏪ Auto Rollback to Previous Image"]
    end
```

---

## 3. Directory Structure & Key Files

```
rapto-system/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # PR integration test workflow
│       └── deploy.yml             # Production Build, GHCR Push & VPS Deploy
├── nginx/
│   ├── nginx.conf                 # Main NGINX config (gzip, rate limits, JSON logging)
│   ├── conf.d/
│   │   └── api.conf               # Site config (SSL, proxy, WebSockets, headers)
│   └── ssl/                       # SSL Certificate mount directory
├── scripts/
│   ├── deploy.sh                  # Zero-downtime deployment runner script
│   ├── rollback.sh                # Emergency rollback script
│   ├── health-check.sh            # /health and /ready probe script
│   └── setup-vps.sh               # One-click Ubuntu VPS provisioner
├── services/
│   └── api/
│       ├── Dockerfile             # Production multi-stage Alpine Dockerfile
│       ├── .dockerignore          # Docker context exclusion file
│       └── package.json           # API dependencies & scripts
├── docker-compose.yml             # Main production Compose stack definition
├── docker-compose.override.yml    # Development environment compose override
└── .env.production.example        # Environment variable template
```

---

## 4. Multi-Stage Containerization Strategy

The API Dockerfile utilizes a 2-stage multi-stage build:
1. **Builder Stage (`node:22-alpine`)**:
   - Installs build tools and OpenSSL required by Prisma Engine.
   - Executes `npm ci`, `npx prisma generate`, and `npm run build`.
   - Runs `npm prune --omit=dev` to generate minimal production `node_modules`.
2. **Runner Stage (`node:22-alpine`)**:
   - Copies pre-compiled JavaScript artifacts (`dist/`), Prisma schema, and pruned dependencies.
   - Installs `tini` as init process (`PID 1`) to correctly handle UNIX process signals (`SIGTERM`, `SIGINT`).
   - Switches to non-privileged user (`USER node`).
   - Declares container-level `HEALTHCHECK` probing `http://localhost:5000/health`.

---

## 5. Reverse Proxy & SSL Configuration

### Security & Header Protections
- **SSL Protocols**: TLS 1.2 and TLS 1.3 with modern cipher suites.
- **HSTS**: `Strict-Transport-Security` set to 2 years with subdomains and preload.
- **Frame & Content Protection**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and custom `Content-Security-Policy`.

### WebSocket Support (`/socket.io/`)
```nginx
location /socket.io/ {
    proxy_pass http://api_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
}
```

### Rate Limiting Rules
- General API routes: `30 requests/sec` (burst 50).
- Authentication routes (`/api/v1/auth/`): `5 requests/sec` (burst 10).

---

## 6. GitHub Actions CI/CD Pipeline

The `.github/workflows/deploy.yml` pipeline automates end-to-end delivery:

```
[ Push to main ] 
       │
       ▼
 1. 🧪 Test Stage (PostgreSQL & Redis service containers, Prisma generate, Jest tests)
       │
       ▼
 2. 🐳 Build & Push Stage (Buildx multi-stage build, cache via GitHub Actions, push to GHCR with git SHA & latest tags)
       │
       ▼
 3. 📡 Deploy Stage (SSH to VPS, sync secrets to .env, run db migrations, swap containers, probe health)
       │
       ├── Pass ──> 🧹 Prune old Docker images & Complete
       └── Fail ──> ⏪ Run scripts/rollback.sh & Alert operator
```

### Required GitHub Secrets Matrix
To configure the deployment, set the following secrets in your GitHub Repository under **Settings > Secrets and variables > Actions**:

| Secret Name | Description | Example / Format |
|---|---|---|
| `VPS_HOST` | Public IP or Hostname of VPS | `198.51.100.42` or `api.rapto.cloud` |
| `VPS_USERNAME` | SSH User on VPS | `ubuntu` or `deploy` |
| `VPS_SSH_KEY` | Ed25519 / RSA Private Key for VPS access | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_SSH_PORT` | (Optional) SSH Port | `22` |
| `PROD_DATABASE_URL` | Production PostgreSQL connection string | `postgresql://user:pass@postgres:5432/vocaply_prod?schema=public` |
| `PROD_DIRECT_URL` | Direct connection URL for Prisma migrations | `postgresql://user:pass@postgres:5432/vocaply_prod?schema=public` |
| `PROD_MONGODB_URL` | Production MongoDB connection string | `mongodb://root:pass@mongodb:27017/vocaply?authSource=admin` |
| `PROD_REDIS_URL` | Production Redis connection string | `redis://:pass@redis:6379` |
| `PROD_JWT_ACCESS_SECRET` | 32+ character JWT Access signing key | `secure_access_secret_32_characters_min` |
| `PROD_JWT_REFRESH_SECRET` | 32+ character JWT Refresh signing key | `secure_refresh_secret_32_characters_min` |
| `PROD_APP_URL` | Frontend Application Domain | `https://app.rapto.cloud` |
| `PROD_API_URL` | Backend API Domain | `https://api.rapto.cloud` |
| `PROD_JIRA_CLIENT_ID` | Atlassian Jira OAuth App Client ID | `jira_client_id` |
| `PROD_JIRA_CLIENT_SECRET` | Atlassian Jira OAuth App Client Secret | `jira_client_secret` |
| `PROD_JIRA_CALLBACK_URL` | Atlassian Jira OAuth Redirect URI | `https://api.rapto.cloud/api/v1/integrations/jira/callback` |
| `PROD_JIRA_WEBHOOK_SECRET` | Atlassian Jira Webhook Signing Secret | `jira_webhook_secret` |
| `PROD_PADDLE_API_KEY` | Paddle API Key (Server-side) | `pdl_live_apikey_...` |
| `PROD_PADDLE_CLIENT_TOKEN` | Paddle Client Token (Public) | `live_...` |
| `PROD_PADDLE_WEBHOOK_SECRET` | Paddle Webhook Signing Secret | `pdl_ntfset_...` |
| `PROD_PADDLE_ENVIRONMENT` | Paddle Environment (`production` or `sandbox`) | `production` |

---

## 7. Zero-Downtime & Rollback Mechanics

### Zero-Downtime Flow
1. The deployment script (`scripts/deploy.sh`) saves the active container image tag to `/tmp/previous_image_tag.txt`.
2. New Docker images are pulled from GHCR (`docker compose pull`).
3. Database migrations run in an isolated temporary container (`docker compose run --rm api npx prisma migrate deploy`).
4. Containers update with `--no-deps` to preserve active network connections (`docker compose up -d --no-deps api worker nginx`).
5. Health script (`scripts/health-check.sh`) probes `/health` (Liveness) and `/ready` (Readiness).

### Automatic Rollback Trigger
If the health check fails within 60 seconds:
1. `deploy.sh` automatically invokes `scripts/rollback.sh`.
2. `rollback.sh` reads `/tmp/previous_image_tag.txt`.
3. Re-deploys the previous image tag via `docker compose up -d --no-deps api worker nginx`.
4. Re-probes health checks to confirm recovery.
5. Fails the GitHub Actions workflow to notify DevOps engineers.

---

## 8. Step-by-Step Production Setup Manual

### Step 1: Bootstrap fresh Ubuntu VPS
Run the provisioner script on your target server:
```bash
curl -sSL https://raw.githubusercontent.com/uzairsarwar3423/rapto-ai/main/scripts/setup-vps.sh | bash -s api.rapto.cloud devops@rapto.cloud
```

### Step 2: Configure Environment Variables
Copy `.env.production.example` to `/opt/rapto-system/.env` on the VPS and populate with production values:
```bash
cp .env.production.example /opt/rapto-system/.env
nano /opt/rapto-system/.env
```

### Step 3: Trigger GitHub Actions Deployment
Push your changes to the `main` branch or trigger manually via **GitHub Actions > Production CI/CD & Automated VPS Deployment > Run workflow**.

### Step 4: Verify Deployment Status
Probe status endpoints from any workstation:
```bash
# Check Liveness Endpoint
curl -i https://api.rapto.cloud/health

# Check Database & Cache Readiness Status
curl -i https://api.rapto.cloud/ready
```
