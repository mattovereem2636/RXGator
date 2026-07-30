#!/bin/bash
# rxgator-ssl-check.sh — SSL certificate expiry monitor
# Install: crontab -e → 0 6 * * 1 /var/www/rxaggregator/scripts/rxgator-ssl-check.sh
# Runs every Monday at 6:00 AM UTC. Alerts when cert expires within 14 days.

set -uo pipefail

DOMAIN="rxgator.info"
WARN_DAYS=14
LOG_FILE="/var/www/rxaggregator/logs/ssl-check.log"
ALERT_EMAIL="mattovereem@ameritech.net"

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

# Get certificate expiry date
EXPIRY_DATE=$(echo | openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -z "${EXPIRY_DATE}" ]; then
  log "ERROR: Could not retrieve SSL certificate for ${DOMAIN}"
  send_alert "[RxGator] SSL CHECK FAILED" "Could not retrieve the SSL certificate for ${DOMAIN}. Check if the site is reachable and SSL is configured."
  exit 1
fi

# Calculate days until expiry
EXPIRY_EPOCH=$(date -d "${EXPIRY_DATE}" +%s 2>/dev/null)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

log "SSL cert for ${DOMAIN} expires: ${EXPIRY_DATE} (${DAYS_LEFT} days remaining)"

if [ "${DAYS_LEFT}" -le 0 ]; then
  send_alert "[RxGator] SSL CERTIFICATE EXPIRED" "The SSL certificate for ${DOMAIN} has EXPIRED!

Expired: ${EXPIRY_DATE}

Immediate action required:
  ssh root@74.208.32.197
  certbot renew --force-renewal
  systemctl reload nginx"

elif [ "${DAYS_LEFT}" -le "${WARN_DAYS}" ]; then
  send_alert "[RxGator] SSL EXPIRING IN ${DAYS_LEFT} DAYS" "The SSL certificate for ${DOMAIN} expires in ${DAYS_LEFT} days.

Expiry date: ${EXPIRY_DATE}

Renew now:
  ssh root@74.208.32.197
  certbot renew
  systemctl reload nginx

If auto-renewal is configured (certbot timer), check why it hasn't run:
  systemctl status certbot.timer
  certbot renew --dry-run"
fi
