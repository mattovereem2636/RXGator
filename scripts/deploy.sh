#!/bin/bash
# deploy.sh — Pull latest from GitHub and restart
# Usage: /var/www/rxaggregator/scripts/deploy.sh

set -euo pipefail

APP_DIR="/var/www/rxaggregator"
cd "${APP_DIR}"

echo "=== RxGator Deploy ==="
echo "Pulling latest from GitHub..."
git pull origin main

echo "Checking for new dependencies..."
npm install --production 2>/dev/null && echo "Dependencies updated." || echo "No changes."

echo "Restarting app..."
pm2 restart rxaggregator

echo "Verifying..."
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://rxgator.info)
if [ "${HTTP_CODE}" = "200" ]; then
  echo "Site is live (HTTP ${HTTP_CODE})"
else
  echo "WARNING: Site returned HTTP ${HTTP_CODE} — check pm2 logs rxaggregator"
fi

echo "=== Deploy complete ==="
