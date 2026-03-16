#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.production ]]; then
  echo ".env.production is missing"
  echo "Create it from .env.production.example before running this script."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required"
  exit 1
fi

COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)

echo "[1/4] Building and starting infrastructure"
"${COMPOSE[@]}" up -d --build postgres redis

echo "[2/4] Starting API and web"
"${COMPOSE[@]}" up -d --build api web

echo "[3/4] Running seed"
"${COMPOSE[@]}" run --rm -e DEV_MODE=true api node apps/api/dist/database/seed.js

echo "[4/4] Refreshing services after seed"
"${COMPOSE[@]}" up -d api web

cat >/usr/local/bin/task-exchange-maintenance.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

docker image prune -f --filter "until=240h" >/dev/null 2>&1 || true
docker builder prune -af --filter "until=240h" >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
EOF

chmod +x /usr/local/bin/task-exchange-maintenance.sh

cat >/etc/cron.d/task-exchange-maintenance <<'EOF'
17 4 * * * root /usr/local/bin/task-exchange-maintenance.sh >/var/log/task-exchange-maintenance.log 2>&1
EOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart cron >/dev/null 2>&1 || systemctl restart crond >/dev/null 2>&1 || true
fi

echo "Deployment is up."
echo "HTTPS: https://$(grep '^PUBLIC_HOST=' .env.production | cut -d '=' -f2)"
echo "Fallback HTTP: http://$(grep '^PUBLIC_HOST=' .env.production | cut -d '=' -f2):8081"
