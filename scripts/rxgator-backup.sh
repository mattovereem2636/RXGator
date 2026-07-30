#!/bin/bash
# rxgator-backup.sh — Automated weekly backup with 4-week rotation
# Install: crontab -e → 0 3 * * 0 /var/www/rxaggregator/scripts/rxgator-backup.sh
# Runs every Sunday at 3:00 AM UTC

set -euo pipefail

APP_DIR="/var/www/rxaggregator"
BACKUP_DIR="/var/www/backups/rxaggregator"
KEEP_WEEKS=4
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="rxaggregator-backup-${DATE}.tar.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"
ALERT_EMAIL="mattovereem@ameritech.net"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

send_alert() {
  local subject="$1"
  local body="$2"
  echo "${body}" | mail -s "${subject}" "${ALERT_EMAIL}" 2>/dev/null || \
  echo "${body}" | sendmail "${ALERT_EMAIL}" 2>/dev/null || \
  log "WARNING: Could not send email alert. Check mail setup."
}

log "=== Starting RxGator backup ==="

# Create the backup
cd /var/www
if tar czf "${BACKUP_DIR}/${BACKUP_FILE}" rxaggregator/ 2>>"${LOG_FILE}"; then
  SIZE=$(ls -lh "${BACKUP_DIR}/${BACKUP_FILE}" | awk '{print $5}')
  log "Backup created: ${BACKUP_FILE} (${SIZE})"
else
  log "ERROR: Backup failed!"
  send_alert "[RxGator] BACKUP FAILED" "Backup failed on ${DATE}. Check ${LOG_FILE} on the server."
  exit 1
fi

# Verify the backup is valid
if tar tzf "${BACKUP_DIR}/${BACKUP_FILE}" > /dev/null 2>&1; then
  FILE_COUNT=$(tar tzf "${BACKUP_DIR}/${BACKUP_FILE}" | wc -l)
  log "Backup verified: ${FILE_COUNT} files"
else
  log "ERROR: Backup file is corrupt!"
  send_alert "[RxGator] BACKUP CORRUPT" "Backup file ${BACKUP_FILE} failed verification on ${DATE}."
  exit 1
fi

# Rotate old backups — keep only the last N weeks
REMOVED=0
while IFS= read -r old_backup; do
  rm -f "${old_backup}"
  log "Rotated out: $(basename "${old_backup}")"
  REMOVED=$((REMOVED + 1))
done < <(ls -1t "${BACKUP_DIR}"/rxaggregator-backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP_WEEKS + 1)))

log "Rotation complete. Removed ${REMOVED} old backup(s). Keeping last ${KEEP_WEEKS}."

# List current backups
log "Current backups:"
ls -lh "${BACKUP_DIR}"/rxaggregator-backup-*.tar.gz 2>/dev/null | while read -r line; do
  log "  ${line}"
done

log "=== Backup complete ==="
