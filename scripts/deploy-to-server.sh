#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-185.71.65.209}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PATH="${SERVER_PATH:-/opt/task-exchange}"
PUBLIC_HOST="${PUBLIC_HOST:-185.71.65.209.sslip.io}"
SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo ".env is missing in $ROOT_DIR"
  exit 1
fi

if [[ ! -f .env.production ]]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  JWT_SECRET="$(openssl rand -hex 32)"
  WEBHOOK_SECRET="$(openssl rand -hex 24)"
  ADMIN_PASSWORD="$(openssl rand -hex 16)"
  BOT_TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d '=' -f2-)"
  BOT_USERNAME="$(grep '^TELEGRAM_BOT_USERNAME=' .env | cut -d '=' -f2-)"

  cat >.env.production <<EOF
NODE_ENV=production
PORT=3000

POSTGRES_DB=task_exchange
POSTGRES_USER=task_exchange
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgres://task_exchange:${POSTGRES_PASSWORD}@postgres:5432/task_exchange

REDIS_HOST=redis
REDIS_PORT=6379

JWT_SECRET=${JWT_SECRET}

WEB_APP_URL=https://${PUBLIC_HOST}
ADMIN_APP_URL=https://${PUBLIC_HOST}/admin/
WEB_APP_PUBLIC_URL=https://${PUBLIC_HOST}

TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_BOT_USERNAME=${BOT_USERNAME}
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://${PUBLIC_HOST}/api/bot/webhook
TELEGRAM_WEBHOOK_SECRET=${WEBHOOK_SECRET}

ADMIN_LOGIN=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}

PUBLIC_HOST=${PUBLIC_HOST}
DEV_MODE=false
EOF

  chmod 600 .env.production
  echo "Created .env.production for ${PUBLIC_HOST}"
fi

ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p '$SERVER_PATH'"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/*/node_modules' \
  --exclude 'apps/*/dist' \
  --exclude '.env' \
  "$ROOT_DIR"/ "$SSH_TARGET:$SERVER_PATH/"

rsync -az .env.production "$SSH_TARGET:$SERVER_PATH/.env.production"

ssh "$SSH_TARGET" "cd '$SERVER_PATH' && chmod +x scripts/server-up.sh scripts/deploy-to-server.sh 2>/dev/null || true && ./scripts/server-up.sh"
