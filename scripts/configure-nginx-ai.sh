#!/usr/bin/env bash
# ==============================================================================
# Host NGINX ingress for the AI pipeline chat API  (ai.rapto.cloud -> 127.0.0.1:8001)
#
# Called by the Vercel BFF (AI_CHAT_URL=https://ai.rapto.cloud). Only /chat/* and /health are exposed;
# every other AI-service path (extract, embeddings, cleanup ...) answers 404 at the edge.
#
# Usage (idempotent, run on the VPS as root or a sudoer):
#   bash scripts/configure-nginx-ai.sh                 # first run: HTTP-only (ACME), no proxying
#   sudo certbot certonly --webroot -w /var/www/certbot -d ai.rapto.cloud
#   bash scripts/configure-nginx-ai.sh                 # second run: HTTPS reverse proxy
# ==============================================================================
set -euo pipefail

DOMAIN="${1:-ai.rapto.cloud}"
TARGET_PORT="${2:-8001}"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
CONF_FILE="${NGINX_CONF_DIR}/${DOMAIN}.conf"
SSL_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

echo "Configuring host NGINX: ${DOMAIN} -> 127.0.0.1:${TARGET_PORT}"

if ! command -v nginx &>/dev/null || [ ! -d "/etc/nginx" ]; then
    echo "Host NGINX is not installed; nothing to do." >&2
    exit 1
fi

sudo mkdir -p "${NGINX_CONF_DIR}" "${NGINX_ENABLED_DIR}" /var/www/certbot

if [ -f "${SSL_CERT}" ] && [ -f "${SSL_KEY}" ]; then
    echo "Certificate found -> writing HTTPS reverse proxy."
    cat <<EOF | sudo tee "${CONF_FILE}" > /dev/null
# Managed by scripts/configure-nginx-ai.sh — ${DOMAIN}
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Chat bodies are tiny (message + filters).
    client_max_body_size 256k;

    # No limit_req here on purpose: all Vercel traffic shares a few egress IPs, so a per-IP limit would throttle every
    # user at once. The AI service enforces per-user / per-team rate limits itself.

    location = /health {
        proxy_pass http://127.0.0.1:${TARGET_PORT}/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Connection "";
        access_log off;
    }

    # Chat API (JSON + SSE). Buffering and compression must be off or the token stream arrives all at once.
    location /chat/ {
        proxy_pass http://127.0.0.1:${TARGET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_buffering off;
        proxy_cache off;
        gzip off;
        add_header X-Accel-Buffering "no" always;

        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 120s;   # BFF aborts streams at 75 s
    }

    # Everything else on the AI service stays private.
    location / {
        return 404;
    }
}
EOF
else
    echo "No certificate yet -> writing HTTP-only config (ACME challenge only, nothing is proxied)."
    cat <<EOF | sudo tee "${CONF_FILE}" > /dev/null
# Managed by scripts/configure-nginx-ai.sh — ${DOMAIN} (bootstrap, no certificate yet)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    location / {
        return 404;
    }
}
EOF
fi

sudo ln -sf "${CONF_FILE}" "${NGINX_ENABLED_DIR}/${DOMAIN}.conf"

if sudo nginx -t; then
    sudo systemctl reload nginx || sudo systemctl restart nginx
    echo "NGINX reloaded."
    if [ ! -f "${SSL_CERT}" ]; then
        echo
        echo "Next: sudo certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"
        echo "Then re-run: bash scripts/configure-nginx-ai.sh"
    fi
else
    echo "nginx -t failed; check ${CONF_FILE}" >&2
    exit 1
fi
