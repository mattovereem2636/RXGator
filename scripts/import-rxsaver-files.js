#!/usr/bin/env node
/**
 * import-rxsaver-files.js — imports downloaded RxSaver Apify datasets (JSON files)
 * into data/rxsaver_cache.json without calling the Apify API.
 *
 * WHY: import-apify-data.js only pulls the latest SUCCEEDED run from Apify. Matt
 * sometimes downloads datasets from the console instead, and on 2026-10-29 he ran
 * the RxSaver scrape twice. Each run lost ~57 drugs to blank pages, but mostly
 * different drugs, so merging the runs recovers coverage that either run alone loses.
 *
 * Merge rules (in order):
 *  1. Datasets are read in the order given. The first dataset with prices for a
 *     drug wins. Later datasets only fill drugs that earlier ones left blank.
 *  2. Drugs in the live cache that no dataset priced are KEPT with their old
 *     scrapedAt (a blank page is a scrape failure, not a discontinued drug).
 *     Use --drop-missing to remove them instead.
 *  3. Output uses the same shape as import-apify-data.js transformRxSaver, so
 *     rxsaver.js and validate-apify-caches.js read it unchanged.
 *
 * Usage:
 *   node import-rxsaver-files.js <dataset1.json> [dataset2.json ...]   # dry run
 *   node import-rxsaver-files.js <files...> --apply                     # write
 * Options:
 *   --cache=<path>        live cache (default /var/www/rxaggregator/data/rxsaver_cache.json)
 *   --scraped-at=<ISO>    scrape time; default = time in the first filename (UTC)
 *   --drop-missing        do not carry over drugs the datasets did not price
 *   --max-move=<pct>      flag lowest-price moves above this percent (default 60)
 * Exit codes: 0 ok, 1 error, 2 held (shrink guard tripped; nothing written).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_CACHE = '/var/www/rxaggregator/data/rxsaver_cache.json';
const BACKUP_PREFIX = 'rxsaver_cache_backup';
const MIN_KEEP_RATIO = 0.5;      // same guard as import-apify-data.js
const DEFAULT_MAX_MOVE_PCT = 60;
const FILENAME_STAMP = /_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/;

const args = process.argv.slice(2);
const opt = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const APPLY = args.includes('--apply');
const DROP_MISSING = args.includes('--drop-missing');
const CACHE_PATH = opt('cache') || DEFAULT_CACHE;
const MAX_MOVE = Number(opt('max-move') || DEFAULT_MAX_MOVE_PCT) / 100;
const FILES = args.filter((a) => !a.startsWith('--'));

/* ---------- transforms (mirror import-apify-data.js) ---------- */
const cleanDrugName = (raw) => raw.replace(/\s*Coupon\s*Options?\s*$/i, '')
  .replace(/\s*Coupons?\s*$/i, '').replace(/\s*Prices?\s*$/i, '').trim();
const cleanPharmacyName = (raw) => String(raw || '').replace(/\s+/g, ' ').replace(/\s*logo\s*$/i, '').trim();
function cleanForm(raw) {
  if (!raw) return 'tablet';
  const f = raw.toLowerCase().trim();
  const forms = ['capsule', 'tablet', 'solution', 'cream', 'ointment', 'suspension', 'inhaler', 'spray'];
  const hit = forms.find((x) => f.includes(x));
  if (hit) return hit;
  if (f.includes('oral')) return 'tablet';
  if (f.includes('liquid')) return 'solution';
  return f;
}
function parsePrice(raw) {
  if (typeof raw === 'number') return raw;
  const m = String(raw || '').replace(/[$,]/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** Builds one cache entry from a raw dataset item, or null if it has no usable price. */
function toEntry(item, scrapedAt) {
  const slug = String(item.drugSlug || '').toLowerCase();
  const prices = (item.pharmacyResults || [])
    .map((p) => ({ pharmacy: cleanPharmacyName(p.pharmacyName), price: parsePrice(p.priceNumeric || p.price), type: 'coupon' }))
    .filter((p) => p.pharmacy && p.price > 0)
    .sort((a, b) => a.price - b.price);
  if (!slug || !prices.length) return null;
  return {
    name: cleanDrugName(item.drugName || slug),
    slug,
    strength: (item.strength || '').trim(),
    form: cleanForm(item.form),
    quantity: (String(item.quantity || '').match(/\d+/) || [''])[0],
    lowestPrice: prices[0].price,
    highestPrice: prices[prices.length - 1].price,
    pharmacyCount: prices.length,
    prices,
    url: item.url,
    scrapedAt,
  };
}

/** Same normalization rxsaver.js uses for its name index. */
const nameKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

function stampFromFilename(file) {
  const m = path.basename(file).match(FILENAME_STAMP);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`).toISOString() : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

/* ---------- main ---------- */
function main() {
  if (!FILES.length) {
    console.error('Usage: node import-rxsaver-files.js <dataset.json> [more.json] [--apply] [--cache=path]');
    return 1;
  }
  const scrapedAt = opt('scraped-at') || stampFromFilename(FILES[0]) || new Date().toISOString();
  if (Number.isNaN(Date.parse(scrapedAt))) throw new Error(`bad --scraped-at value: ${scrapedAt}`);

  const fresh = new Map();          // slug -> entry
  const seen = new Set();           // every slug any dataset listed
  for (const file of FILES) {
    const items = readJson(file);
    if (!Array.isArray(items)) throw new Error(`${file} is not a JSON array of dataset items`);
    const stamp = opt('scraped-at') || stampFromFilename(file) || scrapedAt;
    let added = 0;
    let blank = 0;
    for (const item of items) {
      const slug = String(item.drugSlug || '').toLowerCase();
      if (!slug) continue;
      seen.add(slug);
      if (fresh.has(slug)) continue;
      const entry = toEntry(item, stamp);
      if (entry) { fresh.set(slug, entry); added++; } else { blank++; }
    }
    console.log(`  ${path.basename(file)}: ${items.length} items, ${added} drugs taken, ${blank} blank or already filled`);
  }

  const live = fs.existsSync(CACHE_PATH) ? readJson(CACHE_PATH) : null;
  const liveDrugs = (live && live.drugs && !Array.isArray(live.drugs)) ? live.drugs : {};
  const liveCount = Object.keys(liveDrugs).length;

  const drugs = {};
  const moves = [];
  let updated = 0;
  let added = 0;
  for (const [slug, entry] of fresh) {
    const old = liveDrugs[slug];
    if (old) {
      updated++;
      const change = old.lowestPrice > 0 ? (entry.lowestPrice - old.lowestPrice) / old.lowestPrice : 0;
      if (Math.abs(change) > MAX_MOVE) moves.push(`${slug}: $${old.lowestPrice} -> $${entry.lowestPrice} (${(change * 100).toFixed(0)}%)`);
    } else {
      added++;
    }
    drugs[slug] = entry;
  }
  // rxsaver.js indexes each drug by slug AND by cleaned name, last write wins. An old
  // entry under another slug with the same name (July: "atorvastatin-calcium" named
  // "Atorvastatin") would shadow the fresh "atorvastatin" price, so it is superseded.
  const freshNames = new Set();
  for (const [slug, e] of fresh) { freshNames.add(slug); freshNames.add(nameKey(e.name)); }
  const carried = [];
  const dropped = [];
  const superseded = [];
  for (const [slug, old] of Object.entries(liveDrugs)) {
    if (drugs[slug]) continue;
    if (freshNames.has(nameKey(old.name || ''))) superseded.push(`${slug} (same name as fresh "${nameKey(old.name)}")`);
    else if (DROP_MISSING) dropped.push(slug);
    else { drugs[slug] = old; carried.push(slug); }
  }

  const sorted = {};
  for (const slug of Object.keys(drugs).sort()) sorted[slug] = drugs[slug];
  const priceCount = Object.values(sorted).reduce((n, d) => n + (d.prices ? d.prices.length : 0), 0);
  const cache = {
    source: 'RxSaver',
    sourceUrl: 'https://www.rxsaver.com',
    description: 'RxSaver discount card coupon prices at major pharmacies',
    generatedAt: new Date().toISOString(),
    drugCount: Object.keys(sorted).length,
    priceCount,
    importNote: `import-rxsaver-files.js from ${FILES.map((f) => path.basename(f)).join(', ')}`,
    drugs: sorted,
  };

  console.log('\n=== RxSaver file import plan ===');
  console.log(`  Mode:        ${APPLY ? 'APPLY' : 'DRY RUN (add --apply to write)'}`);
  console.log(`  Live cache:  ${CACHE_PATH} (${liveCount} drugs, generated ${live ? live.generatedAt : 'n/a'})`);
  console.log(`  scrapedAt:   ${scrapedAt}`);
  console.log(`  Fresh drugs: ${fresh.size} (updated ${updated}, new ${added})`);
  console.log(`  Carried over with old prices: ${carried.length}${carried.length ? ' -> ' + carried.join(', ') : ''}`);
  if (superseded.length) console.log(`  Superseded old duplicates (removed): ${superseded.length} -> ${superseded.join(', ')}`);
  if (dropped.length) console.log(`  Dropped (--drop-missing): ${dropped.length} -> ${dropped.join(', ')}`);
  const neverPriced = [...seen].filter((s) => !drugs[s]);
  console.log(`  Listed but blank in every dataset and not in live cache: ${neverPriced.length}${neverPriced.length ? ' -> ' + neverPriced.join(', ') : ''}`);
  console.log(`  Result:      ${cache.drugCount} drugs, ${priceCount} prices`);
  console.log(`  Lowest-price moves over ${(MAX_MOVE * 100).toFixed(0)}%: ${moves.length}`);
  moves.forEach((m) => console.log(`    ${m}`));

  if (liveCount && cache.drugCount / liveCount < MIN_KEEP_RATIO) {
    console.error(`\n  HELD: result has ${cache.drugCount} drugs vs ${liveCount} live. Nothing written.`);
    return 2;
  }
  if (!APPLY) return 0;

  const backupDir = path.join(path.dirname(CACHE_PATH), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  if (live) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(backupDir, `${BACKUP_PREFIX}_${stamp}.json`);
    fs.copyFileSync(CACHE_PATH, backup);
    console.log(`\n  Backed up live cache to ${backup}`);
  }
  const tmp = `${CACHE_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, CACHE_PATH);   // atomic swap; rxsaver.js never reads a half-written file
  console.log(`  Wrote ${CACHE_PATH} (${(fs.statSync(CACHE_PATH).size / 1024).toFixed(1)} KB)`);
  console.log('  Next: pm2 restart rxaggregator, then node scripts/validate-apify-caches.js');
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`[import-rxsaver-files] ERROR ${err.message}`);
  process.exitCode = 1;
}
