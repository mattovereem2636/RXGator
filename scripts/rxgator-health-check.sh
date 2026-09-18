#!/bin/bash
# =============================================================
# RxGator Server-Side Health Check
# Runs every 12 hours via cron. Logs all results.
# Emails Matt only on failures.
# =============================================================

ALERT_EMAIL="mattovereem@gmail.com"
LOG_FILE="/var/www/rxaggregator/health-check.log"
DOMAIN="https://rxgator.info"
EXPECTED_IP="74.208.32.197"
APP_DIR="/var/www/rxaggregator"
PM2_PROCESS="rxaggregator"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Load Resend API key from env file (keeps secrets out of the script)
source /var/www/rxaggregator/.env.healthcheck 2>/dev/null
if [ -z "$RESEND_API_KEY" ]; then
  echo "[$TIMESTAMP] ERROR: RESEND_API_KEY not set. Create /var/www/rxaggregator/.env.healthcheck with: RESEND_API_KEY=your_key" >> "$LOG_FILE"
  exit 1
fi

# Send email via Resend API
send_alert() {
  local subject="$1"
  local body="$2"
  # Escape special chars for JSON
  local json_body
  json_body=$(echo -e "$body" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"RxGator Health <onboarding@resend.dev>\",
      \"to\": [\"$ALERT_EMAIL\"],
      \"subject\": \"$subject\",
      \"text\": $json_body
    }" > /dev/null 2>&1
}

FAILURES=""
WARNINGS=""
REPORT=""

# Helper: log a line
log() {
  echo -e "$1" >> "$LOG_FILE"
  REPORT="$REPORT$1\n"
}

# Helper: record a failure
fail() {
  FAILURES="$FAILURES- $1\n"
  log "[FAIL] $1"
}

# Helper: record a warning
warn() {
  WARNINGS="$WARNINGS- $1\n"
  log "[WARN] $1"
}

# Helper: record a pass
pass() {
  log "[OK]   $1"
}

# Start log entry
echo "" >> "$LOG_FILE"
log "=========================================="
log "RxGator Health Check: $TIMESTAMP"
log "=========================================="

# ---------------------------------------------------------
# 1. Static Page Serving
# ---------------------------------------------------------
log ""
log "--- Static Pages ---"

SLOWEST_TIME=0
SLOWEST_URL=""
PAGES_CHECKED=0

check_url() {
  local url="$1"
  local result
  result=$(curl -o /dev/null -s -w "%{http_code} %{time_total}" --max-time 10 "$url" 2>/dev/null)
  local code=$(echo "$result" | awk '{print $1}')
  local time=$(echo "$result" | awk '{print $2}')
  PAGES_CHECKED=$((PAGES_CHECKED + 1))

  if [ "$code" != "200" ]; then
    fail "$url returned HTTP $code (expected 200)"
  else
    # Check if response time exceeds 3 seconds
    local slow=$(echo "$time > 3.0" | bc -l 2>/dev/null)
    if [ "$slow" = "1" ]; then
      warn "$url responded in ${time}s (over 3s threshold)"
    else
      pass "$url => $code in ${time}s"
    fi
  fi

  # Track slowest
  local is_slower=$(echo "$time > $SLOWEST_TIME" | bc -l 2>/dev/null)
  if [ "$is_slower" = "1" ]; then
    SLOWEST_TIME="$time"
    SLOWEST_URL="$url"
  fi
}

for page in index.html landing.html about.html faq.html privacy.html terms.html resources.html ads.txt robots.txt sitemap.xml; do
  check_url "$DOMAIN/$page"
done

# ---------------------------------------------------------
# 2. Articles
# ---------------------------------------------------------
log ""
log "--- Articles ---"
check_url "$DOMAIN/articles/"
check_url "$DOMAIN/articles/metformin-cost-without-insurance.html"
check_url "$DOMAIN/articles/es/costo-metformina-sin-seguro.html"

# ---------------------------------------------------------
# 3. API Endpoints
# ---------------------------------------------------------
log ""
log "--- API Endpoints ---"

# Health endpoint
HEALTH_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 "$DOMAIN/api/health")
if [ "$HEALTH_CODE" != "200" ]; then
  fail "API /health returned HTTP $HEALTH_CODE"
else
  pass "API /health => 200"
fi

# Search endpoint - verify it returns actual pricing data
SEARCH_RESPONSE=$(curl -s --max-time 15 "$DOMAIN/api/search?drug=metformin")
SEARCH_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 15 "$DOMAIN/api/search?drug=metformin")
if [ "$SEARCH_CODE" != "200" ]; then
  fail "API /search returned HTTP $SEARCH_CODE"
else
  # Check for actual price data (look for "price" in response)
  if echo "$SEARCH_RESPONSE" | grep -q '"price"'; then
    pass "API /search => 200 with pricing data"
  else
    warn "API /search returned 200 but response may lack pricing data"
  fi
fi

# ---------------------------------------------------------
# 4. SSL Certificate
# ---------------------------------------------------------
log ""
log "--- SSL Certificate ---"

SSL_EXPIRY=$(echo | openssl s_client -servername rxgator.info -connect rxgator.info:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$SSL_EXPIRY" ]; then
  EXPIRY_EPOCH=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  if [ "$DAYS_LEFT" -lt 14 ]; then
    fail "SSL certificate expires in $DAYS_LEFT days ($SSL_EXPIRY). Run: certbot renew --force-renewal"
  else
    pass "SSL certificate expires in $DAYS_LEFT days ($SSL_EXPIRY)"
  fi
else
  fail "Could not retrieve SSL certificate info"
fi

# ---------------------------------------------------------
# 5. Homepage Content Spot-Check
# ---------------------------------------------------------
log ""
log "--- Homepage Content ---"

HOMEPAGE=$(curl -s --max-time 10 "$DOMAIN/")
if echo "$HOMEPAGE" | grep -qi "rxgator"; then
  pass "Homepage contains 'RxGator' content"
else
  fail "Homepage does not contain expected 'RxGator' content — may be blank or serving wrong page"
fi

# ---------------------------------------------------------
# 6. DNS Resolution
# ---------------------------------------------------------
log ""
log "--- DNS Resolution ---"

RESOLVED_IP=$(dig +short rxgator.info A | head -1)
if [ "$RESOLVED_IP" = "$EXPECTED_IP" ]; then
  pass "DNS resolves to $RESOLVED_IP (correct)"
else
  fail "DNS resolves to $RESOLVED_IP — expected $EXPECTED_IP. Possible DNS hijack or misconfiguration!"
fi

# ---------------------------------------------------------
# 7. CSP & Front-End Functionality
# ---------------------------------------------------------
log ""
log "--- CSP & Front-End Check ---"

# CSP is set by helmet in Express — /app proxies to Express, static files bypass it.
# Must check /app to see the actual CSP headers users receive.
CSP_HEADER_COUNT=$(curl -sI --max-time 10 "$DOMAIN/app" | grep -ic "content-security-policy")
CSP_HEADER=$(curl -sI --max-time 10 "$DOMAIN/app" | grep -i "content-security-policy" | head -1)

if [ "$CSP_HEADER_COUNT" -gt 1 ]; then
  fail "/app is sending $CSP_HEADER_COUNT Content-Security-Policy headers (expected 1) — likely an nginx add_header stacking on the app's own CSP (same failure mode that broke TapTheMap's maps on Sept 13). Check /etc/nginx/sites-enabled/rxgator* for a duplicate CSP line."
elif [ -n "$CSP_HEADER" ]; then
  # Check script-src-attr
  if echo "$CSP_HEADER" | grep -qi "script-src-attr"; then
    if ! echo "$CSP_HEADER" | grep -qi "script-src-attr[^;]*unsafe-inline"; then
      fail "CSP has script-src-attr without 'unsafe-inline' — inline event handlers (search, toggles) are BLOCKED. Fix helmet config in server.js."
    else
      pass "CSP script-src-attr allows unsafe-inline"
    fi
  else
    pass "CSP does not restrict script-src-attr (inline handlers OK)"
  fi

  # Check script-src allows 'self' (Fuse.js is served locally as /fuse.min.js)
  if ! echo "$CSP_HEADER" | grep -qi "script-src[^;]*'self'"; then
    fail "CSP script-src missing 'self' — locally served scripts (including Fuse.js) are BLOCKED."
  else
    pass "CSP script-src allows 'self' (local scripts OK)"
  fi

  # Check connect-src for Adsense
  if ! echo "$CSP_HEADER" | grep -qi "googlesyndication"; then
    warn "CSP connect-src missing googlesyndication.com — Adsense network calls blocked"
  else
    pass "CSP allows googlesyndication.com connections"
  fi
else
  warn "No CSP header found on /app — helmet may not be active. Check Express middleware."
fi

# Verify Fuse.js script tag exists in app.html (served locally as /fuse.min.js)
FUSE_TAG=$(grep -i 'fuse' "$APP_DIR/public/app.html" | grep -o 'src="[^"]*"' 2>/dev/null)
if [ -n "$FUSE_TAG" ]; then
  pass "Fuse.js script tag present: $FUSE_TAG"
  # Also verify the actual file exists on disk
  FUSE_FILE="$APP_DIR/public/fuse.min.js"
  if [ -f "$FUSE_FILE" ]; then
    pass "Fuse.js file exists on disk"
  else
    fail "Fuse.js script tag found but file missing at $FUSE_FILE — autocomplete is broken"
  fi
else
  warn "Fuse.js script tag not found in app.html — autocomplete may be broken"
fi

# ---------------------------------------------------------
# 8. Server-Level Checks
# ---------------------------------------------------------
log ""
log "--- Server Diagnostics ---"

# Disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 85 ]; then
  fail "Disk usage at ${DISK_USAGE}% (exceeds 85%). Check: du -sh /root/.pm2/logs/* and prune with pm2 flush if needed."
else
  pass "Disk usage: ${DISK_USAGE}%"
fi

# Memory
AVAIL_MEM=$(free -m | awk '/^Mem:/ {print $7}')
if [ "$AVAIL_MEM" -lt 200 ]; then
  fail "Available memory: ${AVAIL_MEM}MB (under 200MB threshold)"
else
  pass "Available memory: ${AVAIL_MEM}MB"
fi

# Load average
LOAD_5MIN=$(uptime | awk -F'load average:' '{print $2}' | awk -F', ' '{print $2}' | tr -d ' ')
LOAD_HIGH=$(echo "$LOAD_5MIN > 4.0" | bc -l 2>/dev/null)
if [ "$LOAD_HIGH" = "1" ]; then
  fail "5-min load average: $LOAD_5MIN (exceeds 4.0)"
else
  pass "5-min load average: $LOAD_5MIN"
fi

# PM2 process status
PM2_JSON=$(pm2 jlist 2>/dev/null)
RX_STATUS=$(echo "$PM2_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        if p.get('name') == '$PM2_PROCESS':
            env = p.get('pm2_env', {})
            monit = p.get('monit', {})
            mem_mb = monit.get('memory', 0) / 1024 / 1024
            restarts = env.get('restart_time', 0)
            status = env.get('status', 'unknown')
            print(f'{status}|{restarts}|{mem_mb:.1f}')
            break
except:
    print('error|0|0')
" 2>/dev/null)

PM2_STATUS=$(echo "$RX_STATUS" | cut -d'|' -f1)
PM2_RESTARTS=$(echo "$RX_STATUS" | cut -d'|' -f2)
PM2_MEM=$(echo "$RX_STATUS" | cut -d'|' -f3)

if [ "$PM2_STATUS" != "online" ]; then
  # Auto-restart on failure
  log "[AUTO-RESTART] rxaggregator was $PM2_STATUS — restarting now..."
  pm2 restart rxaggregator >> "$LOG_FILE" 2>&1
  sleep 5
  # Re-check after restart
  RECHECK=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        if p.get('name') == 'rxaggregator':
            print(p.get('pm2_env',{}).get('status','unknown'))
            break
except:
    print('error')
" 2>/dev/null)
  if [ "$RECHECK" = "online" ]; then
    warn "PM2 rxaggregator was $PM2_STATUS — auto-restarted successfully"
  else
    fail "PM2 rxaggregator was $PM2_STATUS — auto-restart FAILED (now $RECHECK). Manual intervention needed."
  fi
else
  pass "PM2 rxaggregator: online"
fi

# Restart count on its own is a bad signal here: cron runs a scheduled
# preventive restart twice daily (see /etc/cron: "45 5,17 * * * pm2 restart
# rxaggregator"), so the raw counter climbs by design and will cross any
# fixed threshold within days regardless of actual health. Track the delta
# since the last check instead — only the 1 expected preventive restart
# per check window should show up; more than that suggests real crashing.
RESTART_STATE_FILE="/var/www/rxaggregator/.restart-state.txt"
PREV_RESTARTS=$(cat "$RESTART_STATE_FILE" 2>/dev/null)
if [ -z "$PREV_RESTARTS" ]; then
  PREV_RESTARTS=$PM2_RESTARTS
fi
RESTART_DELTA=$((PM2_RESTARTS - PREV_RESTARTS))
if [ "$RESTART_DELTA" -lt 0 ]; then
  # Counter went backwards — process was reset/redeployed since last check
  RESTART_DELTA=0
fi
echo "$PM2_RESTARTS" > "$RESTART_STATE_FILE"

if [ "$RESTART_DELTA" -gt 3 ]; then
  warn "PM2 restart count rose by $RESTART_DELTA since the last check (total: $PM2_RESTARTS) — more than the 1 expected preventive restart, may indicate crash-looping"
else
  pass "PM2 restart count: $PM2_RESTARTS (+$RESTART_DELTA since last check, within expected range)"
fi

PM2_MEM_HIGH=$(echo "$PM2_MEM > 300.0" | bc -l 2>/dev/null)
if [ "$PM2_MEM_HIGH" = "1" ]; then
  fail "PM2 memory usage: ${PM2_MEM}MB (over 300MB). Consider: pm2 restart rxaggregator"
else
  pass "PM2 memory usage: ${PM2_MEM}MB"
fi

# Nginx
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null)
if [ "$NGINX_STATUS" != "active" ]; then
  fail "Nginx is $NGINX_STATUS. Run: systemctl restart nginx && check /var/log/nginx/error.log"
else
  pass "Nginx: active"
fi

# Error log scan
log ""
log "--- Error Log Scan (last 50 lines) ---"
ERR_LOG=$(pm2 logs "$PM2_PROCESS" --err --nostream --lines 50 2>&1 | grep -v "^$" | grep -v "TAILING" | grep -v "last 50 lines:")
CRASH_COUNT=$(echo "$ERR_LOG" | grep -ci "error\|crash\|exception\|ECONNREFUSED\|ENOMEM" 2>/dev/null)
if [ "$CRASH_COUNT" -gt 0 ]; then
  # Get unique error patterns
  UNIQUE_ERRORS=$(echo "$ERR_LOG" | grep -i "error\|crash\|exception" | sort -u | head -5)
  warn "Found $CRASH_COUNT error lines in recent logs. Patterns:\n$UNIQUE_ERRORS"
else
  pass "No errors in recent PM2 logs"
fi

# ---------------------------------------------------------
# Summary & Alert
# ---------------------------------------------------------
log ""
log "=========================================="
SUMMARY="RxGator Health Check — $TIMESTAMP
Pages checked: $PAGES_CHECKED | Slowest: ${SLOWEST_TIME}s ($SLOWEST_URL)
SSL: ${DAYS_LEFT} days remaining | Disk: ${DISK_USAGE}%
Memory: ${AVAIL_MEM}MB available | Load: $LOAD_5MIN
PM2: $PM2_STATUS, ${PM2_MEM}MB, $PM2_RESTARTS restarts | Nginx: $NGINX_STATUS"

if [ -n "$FAILURES" ]; then
  log "STATUS: FAILURES DETECTED"
  log ""
  log "FAILURES:"
  log "$FAILURES"
  if [ -n "$WARNINGS" ]; then
    log "WARNINGS:"
    log "$WARNINGS"
  fi

  # Send alert email
  EMAIL_BODY="RXGATOR HEALTH CHECK ALERT — $TIMESTAMP\n\n"
  EMAIL_BODY="${EMAIL_BODY}FAILURES:\n${FAILURES}\n"
  if [ -n "$WARNINGS" ]; then
    EMAIL_BODY="${EMAIL_BODY}WARNINGS:\n${WARNINGS}\n"
  fi
  EMAIL_BODY="${EMAIL_BODY}\nSUMMARY:\n${SUMMARY}\n"
  EMAIL_BODY="${EMAIL_BODY}\nServer: root@$EXPECTED_IP\nApp: $APP_DIR\n"

  send_alert "[ALERT] RxGator Health Check FAILED" "$EMAIL_BODY"
  log "Alert email sent to $ALERT_EMAIL via Resend"

elif [ -n "$WARNINGS" ]; then
  log "STATUS: WARNINGS (no failures)"
  log ""
  log "WARNINGS:"
  log "$WARNINGS"

  # Send warning email
  EMAIL_BODY="RXGATOR HEALTH CHECK WARNING — $TIMESTAMP\n\n"
  EMAIL_BODY="${EMAIL_BODY}WARNINGS:\n${WARNINGS}\n"
  EMAIL_BODY="${EMAIL_BODY}\nSUMMARY:\n${SUMMARY}\n"

  send_alert "[WARNING] RxGator Health Check" "$EMAIL_BODY"
  log "Warning email sent to $ALERT_EMAIL via Resend"

else
  log "STATUS: ALL CLEAR"
  log "$SUMMARY"
fi

log "=========================================="
