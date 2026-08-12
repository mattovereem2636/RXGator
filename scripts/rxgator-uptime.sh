#!/bin/bash
# rxgator-uptime.sh — Enhanced uptime monitor for RxGator
# Runs every 5 minutes via cron. Checks both connectivity AND content serving.
# Replaces the original uptime script that only checked if the server responded.
#
# Catches: server down, nginx errors, 403 permission issues, 404 missing pages,
#          PM2/Node crash (API unreachable), SSL failures.
#
# Alert-on-change design: only logs when state transitions (up→down or down→up),
# not every 5 minutes. Prevents log spam.

LOGFILE="/var/www/rxaggregator/logs/uptime.log"
STATEFILE="/var/www/rxaggregator/logs/.uptime-state"
TIMEOUT=10

# Ensure log directory exists
mkdir -p "$(dirname "$LOGFILE")"

# Track previous state
PREV_STATE="up"
if [ -f "$STATEFILE" ]; then
    PREV_STATE=$(cat "$STATEFILE")
fi

ERRORS=""

# Check 1: Can nginx serve a static page? (catches 403 permission issues)
STATIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT https://rxgator.info/index.html 2>/dev/null)
if [ "$STATIC_STATUS" != "200" ]; then
    ERRORS="${ERRORS}Static page returned $STATIC_STATUS (expected 200). "
fi

# Check 2: Can the Node.js API respond? (catches PM2/app crash)
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT https://rxgator.info/api/health 2>/dev/null)
if [ "$API_STATUS" != "200" ]; then
    ERRORS="${ERRORS}API /api/health returned $API_STATUS (expected 200). "
fi

# Check 3: Does the homepage load? (catches nginx root config issues)
HOME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT https://rxgator.info/ 2>/dev/null)
if [ "$HOME_STATUS" != "200" ] && [ "$HOME_STATUS" != "301" ] && [ "$HOME_STATUS" != "302" ]; then
    ERRORS="${ERRORS}Homepage returned $HOME_STATUS (expected 200/301/302). "
fi

# Check 4: Is the articles directory accessible? (catches subdirectory permission issues)
ART_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT https://rxgator.info/articles/ 2>/dev/null)
if [ "$ART_STATUS" != "200" ] && [ "$ART_STATUS" != "301" ] && [ "$ART_STATUS" != "302" ]; then
    ERRORS="${ERRORS}Articles returned $ART_STATUS. "
fi

# Determine current state
if [ -z "$ERRORS" ]; then
    CURR_STATE="up"
else
    CURR_STATE="down"
fi

# Log on state change
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ "$CURR_STATE" != "$PREV_STATE" ]; then
    if [ "$CURR_STATE" = "down" ]; then
        echo "[$TIMESTAMP] DOWN — $ERRORS" >> "$LOGFILE"

        # Attempt automatic fix if it's a permissions issue (403 on static, API still up)
        if echo "$ERRORS" | grep -q "403" && [ "$API_STATUS" = "200" ]; then
            echo "[$TIMESTAMP] AUTO-FIX — Detected 403 with API healthy. Running fix-permissions.sh ..." >> "$LOGFILE"
            if [ -x "/var/www/rxaggregator/scripts/fix-permissions.sh" ]; then
                /var/www/rxaggregator/scripts/fix-permissions.sh >> "$LOGFILE" 2>&1
                # Re-check after fix
                sleep 2
                RECHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT https://rxgator.info/search.html 2>/dev/null)
                if [ "$RECHECK" = "200" ]; then
                    echo "[$TIMESTAMP] AUTO-FIX — Success! Site restored." >> "$LOGFILE"
                    CURR_STATE="up"
                else
                    echo "[$TIMESTAMP] AUTO-FIX — Still failing ($RECHECK). Manual intervention needed." >> "$LOGFILE"
                fi
            else
                echo "[$TIMESTAMP] AUTO-FIX — fix-permissions.sh not found or not executable." >> "$LOGFILE"
            fi
        fi
    else
        echo "[$TIMESTAMP] UP — Site recovered." >> "$LOGFILE"
    fi
fi

# Save current state
echo "$CURR_STATE" > "$STATEFILE"

exit 0
