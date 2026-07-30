#!/bin/bash
# backup_rxgator.sh — Daily backup for RXGator
# Cron: 0 2 * * * /var/www/rxaggregator/scripts/backup_rxgator.sh >> /var/log/rxgator_backup.log 2>&1

BACKUP_DIR="/var/backups/rxgator"
APP_DIR="/var/www/rxaggregator"
DATE=$(date +%Y%m%d_%H%M%S)
ARCHIVE="$BACKUP_DIR/rxgator_$DATE.tar.gz"
RETENTION_DAYS=30

echo "$(date): RXGator backup starting"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Build file list for backup
FILES=(
    "$APP_DIR/server.js"
    "$APP_DIR/package.json"
    "$APP_DIR/singlecare_cache.json"
    "$APP_DIR/goodrx_cache.json"
    "$APP_DIR/ful_cache.json"
    "$APP_DIR/search_log.csv"
    "$APP_DIR/feedback_log.csv"
    "$APP_DIR/public/"
    "/etc/nginx/sites-available/rxgator"
    "/etc/nginx/.rxaggregator_htpasswd"
)

# Filter to only existing files
EXISTING=()
for f in "${FILES[@]}"; do
    if [ -e "$f" ]; then
        EXISTING+=("$f")
    fi
done

# Create compressed archive
tar -czf "$ARCHIVE" "${EXISTING[@]}" 2>/dev/null

if [ $? -eq 0 ]; then
    SIZE=$(du -sh "$ARCHIVE" | cut -f1)
    echo "$(date): Backup created: $ARCHIVE ($SIZE)"
    
    # Count files in archive
    COUNT=$(tar -tzf "$ARCHIVE" | wc -l)
    echo "$(date): Files backed up: $COUNT"
else
    echo "$(date): ERROR — Backup failed"
    exit 1
fi

# Clean up old backups
DELETED=$(find "$BACKUP_DIR" -name "rxgator_*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "$(date): Cleaned up $DELETED old backups (>$RETENTION_DAYS days)"
fi

# Report backup directory status
TOTAL=$(ls -1 "$BACKUP_DIR"/rxgator_*.tar.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "$(date): Backup complete — $TOTAL backups, $TOTAL_SIZE total"
