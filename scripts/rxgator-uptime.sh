#!/bin/bash
# rxgator-uptime.sh — Uptime monitor for rxgator.info
# Install: crontab -e → */5 * * * * /var/www/rxaggregator/scripts/rxgator-uptime.sh
# Checks every 5 minutes. Only alerts on state changes (down/recovered) to avoid spam.

set -uo pipefail

SITE_URL="https://rxgator.info"
SEARCH_URL="https://rxgator.info/api/health"
STATE_FILE="/var/www/rxaggregator/scripts/.uptime-state"
LOG_FILE="/var/www/rxaggregator/logs/uptime.log"
ALERT_EMAIL="mattovereem@ameritech.net"
TIMEOUT=15

# Create logs directory if needed
mkdir -p /var/www/rxaggregator/logs

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "${LOG_FILE}"
}

send_alert() {
  local subject="$1"
  local body="$2"
  echo "${body}" | mail -s "${subject}" "${ALERT_EMAIL}" 2>/dev/null || \
  echo "${body}" | sendmail "${ALERT_EMAIL}" 2>/dev/null || \
  log "WARNING: Could not send email alert."
}

# Get previous state (up/down), default to "up"
PREV_STATE="up"
if [ -f "${STATE_FILE}" ]; then
  PREV_STATE=$(cat "${STATE_FILE}")
fi

# Check 1: Homepage responds with 200
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT}" "${SITE_URL}" 2>/dev/null || echo "000")

# Check 2: API health endpoint responds
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT}" "${SEARCH_URL}" 2>/dev/null || echo "000")

# Determine current state
if [ "${HTTP_CODE}" = "200" ] && [ "${API_CODE}" = "200" ]; then
  CURRENT_STATE="up"
else
  CURRENT_STATE="down"
fi

# Only alert on state changes
if [ "${CURRENT_STATE}" = "down" ] && [ "${PREV_STATE}" = "up" ]; then
  # Site just went down
  log "ALERT: Site is DOWN! Homepage: ${HTTP_CODE}, API: ${API_CODE}"
  send_alert "[RxGator] SITE DOWN" "rxgator.info is not responding as of $(date).

Homepage HTTP status: ${HTTP_CODE} (expected 200)
API health status: ${API_CODE} (expected 200)

Check the server:
  ssh root@74.208.32.197
  pm2 status
  pm2 logs rxaggregator --lines 50
  systemctl status nginx"

elif [ "${CURRENT_STATE}" = "up" ] && [ "${PREV_STATE}" = "down" ]; then
  # Site recovered
  DOWNTIME_START=$(stat -c %Y "${STATE_FILE}" 2>/dev/null || echo "unknown")
  log "RECOVERED: Site is back up. Homepage: ${HTTP_CODE}, API: ${API_CODE}"
  send_alert "[RxGator] SITE RECOVERED" "rxgator.info is back online as of $(date).

Homepage HTTP status: ${HTTP_CODE}
API health status: ${API_CODE}"

elif [ "${CURRENT_STATE}" = "down" ]; then
  # Still down — log but don't re-alert
  log "STILL DOWN: Homepage: ${HTTP_CODE}, API: ${API_CODE}"
fi

# Save current state
echo "${CURRENT_STATE}" > "${STATE_FILE}"
