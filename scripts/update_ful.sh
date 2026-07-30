#!/bin/bash
# update_ful.sh — Monthly FUL cache update for RXGator
# Cron: 0 3 16 * * /var/www/rxaggregator/scripts/update_ful.sh >> /var/log/rxgator_ful.log 2>&1

WORKDIR="/var/www/rxaggregator"
CACHE_FILE="$WORKDIR/ful_cache.json"
BACKUP_FILE="$WORKDIR/ful_cache.json.bak"
TEMP_CSV="/tmp/ful_download.csv"

echo "$(date): FUL update starting"

# Find the latest CSV URL — CMS uses date-stamped filenames
# Try current month first, then previous month
YEAR=$(date +%Y)
MONTH=$(date +%m)
PREV_MONTH=$(date -d "last month" +%m 2>/dev/null || date -v-1m +%m)
PREV_YEAR=$(date -d "last month" +%Y 2>/dev/null || date -v-1m +%Y)

# CMS date format in URL: mmddyyyy
for try_date in "$(date +%m)$(date +%d)${YEAR}" "$(date +%m)01${YEAR}" "${PREV_MONTH}28${PREV_YEAR}" "${PREV_MONTH}15${PREV_YEAR}"; do
    URL="https://download.medicaid.gov/data/aca-federal-upper-limits-${try_date}.csv"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "$(date): Found FUL CSV at $URL"
        break
    fi
done

# If none of the guessed URLs work, try the catalog
if [ "$HTTP_CODE" != "200" ]; then
    echo "$(date): Searching data.medicaid.gov catalog for latest FUL URL..."
    URL=$(curl -s "https://data.medicaid.gov/data.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for ds in data.get('dataset', []):
    if 'upper limit' in ds.get('title','').lower():
        for d in ds.get('distribution', []):
            url = d.get('downloadURL', '')
            if url.endswith('.csv'):
                print(url)
                break
        break
" 2>/dev/null)
    if [ -n "$URL" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
        echo "$(date): Catalog URL: $URL (HTTP $HTTP_CODE)"
    fi
fi

if [ "$HTTP_CODE" != "200" ]; then
    echo "$(date): ERROR — Could not find FUL CSV. Keeping existing cache."
    exit 1
fi

# Download CSV
curl -s "$URL" -o "$TEMP_CSV"
LINES=$(wc -l < "$TEMP_CSV")
echo "$(date): Downloaded $LINES lines"

if [ "$LINES" -lt 1000 ]; then
    echo "$(date): ERROR — CSV too small ($LINES lines). Keeping existing cache."
    rm -f "$TEMP_CSV"
    exit 1
fi

# Backup existing cache
if [ -f "$CACHE_FILE" ]; then
    cp "$CACHE_FILE" "$BACKUP_FILE"
fi

# Process CSV into JSON cache
python3 -c "
import csv, json, sys

drugs = {}
with open('$TEMP_CSV', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        yr = int(row.get('Year', 0))
        if yr < 2025:
            continue
        ingredient = row.get('Ingredient', '').strip()
        strength = row.get('Strength', '').strip()
        dosage = row.get('Dosage', '').strip()
        route = row.get('Route', '').strip()
        ful = row.get('ACA FUL', '')
        wamp = row.get('Weighted Average of AMPs', '')
        if not ingredient or not ful:
            continue
        try:
            ful_price = float(ful)
            wamp_price = float(wamp) if wamp else None
        except:
            continue
        mo = int(row.get('Month', 0))
        key = f'{ingredient}|{strength}|{dosage}'.lower()
        if key not in drugs or ful_price < drugs[key]['ful']:
            drugs[key] = {
                'ingredient': ingredient,
                'strength': strength,
                'dosage': dosage,
                'route': route,
                'ful': ful_price,
                'wamp': wamp_price,
                'year': yr,
                'month': mo,
            }

by_name = {}
for key, val in drugs.items():
    name = val['ingredient'].lower()
    if name not in by_name:
        by_name[name] = []
    by_name[name].append(val)
for name in by_name:
    by_name[name].sort(key=lambda x: x['strength'])

with open('$CACHE_FILE', 'w') as f:
    json.dump(by_name, f, indent=2)
print(f'Processed: {len(by_name)} drugs, {len(drugs)} combos')
"

if [ $? -eq 0 ]; then
    echo "$(date): FUL cache updated successfully"
    # Restart app to reload cache
    pm2 restart rxaggregator --silent
    echo "$(date): App restarted"
else
    echo "$(date): ERROR — Processing failed. Restoring backup."
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$CACHE_FILE"
    fi
fi

rm -f "$TEMP_CSV"
echo "$(date): FUL update complete"
