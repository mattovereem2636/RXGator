#!/bin/bash
# fix-permissions.sh — Ensure correct permissions on RxGator public files
# Run after any deployment to prevent nginx 403 errors.
# Called automatically by deploy.sh; can also be run standalone.
#
# Root cause: tar extracts as root with --same-permissions by default,
# preserving whatever permissions the archive was built with. If the
# archive was created with umask 077, directories get 700 (owner-only),
# which locks out nginx's www-data user.

APP_DIR="/var/www/rxaggregator"
PUBLIC_DIR="$APP_DIR/public"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fixing permissions on $PUBLIC_DIR ..."

# Directories need 755 (rwxr-xr-x) so nginx can traverse them
find "$PUBLIC_DIR" -type d -exec chmod 755 {} \;

# Files need 644 (rw-r--r--) so nginx can read them
find "$PUBLIC_DIR" -type f -exec chmod 644 {} \;

# Ensure ownership is root:root (nginx only needs read access)
chown -R root:root "$PUBLIC_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Permissions fixed. Verifying..."

# Quick smoke test — check that nginx can serve the homepage
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://rxgator.info/index.html 2>/dev/null)
if [ "$STATUS" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verified: index.html returns 200. Site is up."
elif [ "$STATUS" = "403" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: index.html still returns 403! Check nginx config."
    exit 1
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Note: search.html returned $STATUS (server may still be restarting)."
fi
