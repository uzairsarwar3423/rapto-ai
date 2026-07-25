#!/usr/bin/env bash
# ==============================================================================
# One-Click VPS Provisioning Script (Ubuntu 22.04 / 24.04 LTS)
# ==============================================================================
set -euo pipefail

DOMAIN="${1:-api.rapto.cloud}"
EMAIL="${2:-devops@rapto.cloud}"
DEPLOY_DIR="/opt/rapto-system"

echo "================================================================="
echo "🛠️ Initializing VPS Environment for Rapto API Production Stack"
echo "🌐 Domain: ${DOMAIN}"
echo "📧 Email: ${EMAIL}"
echo "================================================================="

# 1. Update System & Install Base Utilities
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl wget git ufw ca-certificates gnupg lsb-release certbot

# 2. Install Docker & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker Engine..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Add current user to docker group
sudo usermod -aG docker "$USER" || true

# 3. Configure Security & UFW Firewall Rules
echo "🔒 Configuring UFW Firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

# 4. Prepare Deployment Directory
echo "📁 Setting up deployment directory at ${DEPLOY_DIR}..."
sudo mkdir -p "${DEPLOY_DIR}"
sudo chown -R "$USER:$USER" "${DEPLOY_DIR}"

# 5. Provision Initial SSL Certificate via Let's Encrypt Certbot
echo "🔐 Provisioning SSL Certificate for ${DOMAIN}..."
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    sudo certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" || {
        echo "⚠️ Certbot standalone failed (DNS might not be pointing yet). Creating self-signed fallback certs..."
        sudo mkdir -p /etc/letsencrypt/live/"${DOMAIN}"
        sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout /etc/letsencrypt/live/"${DOMAIN}"/privkey.pem \
          -out /etc/letsencrypt/live/"${DOMAIN}"/fullchain.pem \
          -subj "/CN=${DOMAIN}"
    }
fi

echo "================================================================="
echo "✅ VPS Bootstrapping Complete!"
echo "📌 Next Steps:"
echo " 1. Clone repository or sync docker-compose.yml to ${DEPLOY_DIR}"
echo " 2. Create ${DEPLOY_DIR}/.env file with production secrets"
echo " 3. Run: cd ${DEPLOY_DIR} && docker compose up -d"
echo "================================================================="
