
#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================
# Dairy Backend Deployment
# ==============================

APP_NAME="dairy-backend"
APP_DIR="/var/www/dairy-backend"
BRANCH="main"
PORT="3000"
LOG_FILE="/var/log/dairy-backend-deploy.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================="
echo "Starting deployment: $(date)"
echo "=================================="

cd "$APP_DIR"

# Prevent concurrent deployments
exec 9>/tmp/dairy-backend-deploy.lock
if ! flock -n 9; then
    echo "Another deployment is already running."
    exit 1
fi

# Ensure .env exists
if [[ ! -f .env ]]; then
    echo "ERROR: .env file is missing!"
    exit 1
fi

# Update source code
echo "[1/5] Fetching latest code..."
git fetch origin "$BRANCH"

git reset --hard "origin/$BRANCH"

# Install dependencies
echo "[2/5] Installing dependencies..."
npm ci

# Build NestJS application
echo "[3/5] Building application..."
npm run build

# Restart application
echo "[4/5] Restarting PM2..."

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
else
    pm2 start npm --name "$APP_NAME" -- start
fi

pm2 save

# Health check
echo "[5/5] Checking application health..."

HEALTHY=false

for i in {1..15}; do
    if curl --fail --silent \
        "http://127.0.0.1:${PORT}/" >/dev/null; then
        HEALTHY=true
        break
    fi

    sleep 2
done

if [[ "$HEALTHY" != "true" ]]; then
    echo "ERROR: Health check failed!"
    pm2 logs "$APP_NAME" --lines 50 --nostream || true
    exit 1
fi

echo "=================================="
echo "DEPLOYMENT SUCCESSFUL!"
echo "Application: $APP_NAME"
echo "Port: $PORT"
echo "Time: $(date)"
echo "=================================="

