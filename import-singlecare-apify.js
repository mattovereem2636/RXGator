#!/usr/bin/env node
/**
 * import-singlecare-apify.js — merges a full SingleCare scrape (Apify actor
 * parseforge/singlecare-scraper, mode "search") into singlecare_cache.json.
 *
 * WHY: import-apify-data.js covers RxSaver and Blink only, and refresh-caches.js is
 * pinned to three September run IDs. This script takes any exported dataset file, so a
 * new SingleCare run can go live without editing code.
 *
 * RULES (each one protects data that is already live):
 *  - Merge only. Drugs absent from the scrape keep their current entry.
 *  - Never overwrite an entry that carries a real quantity (curated entries such as the
 *    women's health brands). The actor always returns quantity null, so it would downgrade them.
 *  - Never overwrite a newer entry with an older scrape.
 *  - Skip a key that already belongs to a different drug.
 *  - Hold a price that moves more than MAX_DRIFT from the live price (--accept-drift releases).
 *  - Hold a generic priced over HIGH_GENERIC_PRICE (--accept-high releases). SingleCare
 *    sometimes reports a brand-only or extended-release price under a generic name.
 *
 * KEYS: querySingleCare() looks up the cache by drug name. SingleCare names carry salts
 * ("Atorvastatin Calcium") that RxNorm search terms omit, so each drug is written under its
 * full name and under the name without trailing salt words ("atorvastatin").
 *
 * USAGE:  node /var/www/rxaggregator/import-singlecare-apify.js <dataset.json> --dry-run
 *         node /var/www/rxaggregator/import-singlecare-apify.js <dataset.json> [--run=RUN_ID]
 *         Add --verbose to print every key. Restart after a write: pm2 restart rxaggregator
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const CACHE = path.join(BASE, 'singlecare_cache.json');
const BACKUP_DIR = path.join(BASE, 'data', 'backups');
const IMPORTER = 'import-singlecare-apify.js';
const MAX_DRIFT = 0.5;
const HIGH_GENERIC_PRICE = 75;
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const ACCEPT_DRIFT = ARGS.includes('--accept-drift');
const ACCEPT_HIGH = ARGS.includes('--accept-high');
const VERBOSE = ARGS.includes('--verbose');
const RUN_ARG = ARGS.find(a => a.startsWith('--run='));
const RUN_ID = RUN_ARG ? RUN_ARG.slice('--run='.length) : null;

// Trailing salt words that SingleCare appends and RxNorm search terms leave out.
// "dm" is NOT here: "promethazine dm" is a different product from promethazine.
const SALT_WORDS = new Set([
  'hcl', 'hydrochloride', 'sodium', 'potassium', 'calcium', 'magnesium', 'besylate',
  'maleate', 'fumarate', 'tartrate', 'succinate', 'mesylate', 'bisulfate', 'hydrobromide',
  'oxalate', 'citrate', 'sulfate', 'medoxomil', 'etexilate', 'carbonate', 'acetate',
  'propionate', 'monohydrate', 'dihydrate',
]);

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
const lc = s => String(s || '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const money = n => (typeof n === 'number' ? '$' + n.toFixed(2) : '-');

/** Removes trailing salt words. Keeps the name whole if its first word is a salt ("sodium bicarbonate"). */
function stripSalts(name) {
  const words = lc(name).split(' ');
  if (words.length < 2 || SALT_WORDS.has(words[0])) return words.join(' ');
  while (words.length > 1 && SALT_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}

/** Candidate cache keys for one scraped row: full name, URL slug, salt-free name. */
function keysFor(item) {
  const slug = item.url ? lc(String(item.url).split('/').filter(Boolean).pop()) : '';
  const out = [lc(item.drugName), slug, stripSalts(item.drugName), slug ? stripSalts(slug) : ''];
  return [...new Set(out.filter(Boolean))];
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return abort('Cannot read ' + file + ': ' + err.message); }
}

function buildEntry(item) {
  const entry = {
    drugName: item.drugName,
    drugType: item.drugType || null,
    lowestPrice: item.lowestPrice,
    lowestPricePharmacy: item.lowestPricePharmacy || null,
    quantity: item.quantity == null ? null : item.quantity,
    ndc: item.ndc || null,
    pharmacyCount: item.pharmacyCount || null,
    url: item.url || null,
    scrapedAt: item.scrapedAt || new Date().toISOString(),
    importedBy: IMPORTER,
  };
  if (RUN_ID) entry.sourceRun = RUN_ID;
  return entry;
}

/** Decides what happens to one key. Returns { action, reason }. */
function judge(key, item, old) {
  if (!old) return { action: 'add' };
  if (old.quantity != null) return { action: 'protect', reason: 'curated entry with quantity ' + old.quantity };
  if (stripSalts(old.drugName) !== stripSalts(item.drugName)) return { action: 'conflict', reason: 'holds ' + old.drugName };
  const oldTime = Date.parse(old.scrapedAt || '');
  const newTime = Date.parse(item.scrapedAt || '');
  if (oldTime && newTime && oldTime > newTime) return { action: 'stale', reason: 'live entry is newer (' + old.scrapedAt + ')' };
  if (typeof old.lowestPrice === 'number' && old.lowestPrice > 0) {
    const drift = Math.abs(item.lowestPrice - old.lowestPrice) / old.lowestPrice;
    if (drift > MAX_DRIFT && !ACCEPT_DRIFT) return { action: 'hold', reason: money(old.lowestPrice) + ' -> ' + money(item.lowestPrice) };
  }
  return { action: 'update', reason: money(old.lowestPrice) + ' -> ' + money(item.lowestPrice) };
}

function buildPlan(items, cache) {
  const plan = { add: [], update: [], hold: [], high: [], protect: [], conflict: [], stale: [], bad: [], dupe: [] };
  const claimed = new Map();
  for (const item of items) {
    if (!item || !item.drugName || typeof item.lowestPrice !== 'number' || item.lowestPrice <= 0) {
      plan.bad.push(item && item.drugName ? item.drugName : '(unnamed row)');
      continue;
    }
    if (item.drugType === 'Generic' && item.lowestPrice > HIGH_GENERIC_PRICE && !ACCEPT_HIGH) {
      plan.high.push(item.drugName + ' ' + money(item.lowestPrice) + ' at ' + (item.lowestPricePharmacy || '?'));
      continue;
    }
    for (const key of keysFor(item)) {
      if (claimed.has(key)) {
        if (claimed.get(key) !== item.drugName) plan.dupe.push('"' + key + '": ' + claimed.get(key) + ' kept, ' + item.drugName + ' skipped');
        continue;
      }
      claimed.set(key, item.drugName);
      const verdict = judge(key, item, cache[key]);
      plan[verdict.action].push({ key, item, reason: verdict.reason });
    }
  }
  return plan;
}

function printPlan(plan, before) {
  const show = (label, list, fmt) => {
    if (!list.length) return;
    console.log('\n' + label + ' (' + list.length + '):');
    const rows = VERBOSE || list.length <= 25 ? list : list.slice(0, 25);
    rows.forEach(r => console.log('  ' + fmt(r)));
    if (rows.length < list.length) console.log('  ... ' + (list.length - rows.length) + ' more (use --verbose)');
  };
  const line = p => p.key.padEnd(32) + money(p.item.lowestPrice).padStart(10) + '  ' + (p.item.lowestPricePharmacy || '?') + (p.reason ? '  [' + p.reason + ']' : '');
  console.log('--- PLAN for ' + CACHE + ' (' + before + ' entries now) ---');
  show('ADD', plan.add, line);
  show('UPDATE', plan.update, line);
  show('HELD: price moved over ' + MAX_DRIFT * 100 + '% (rerun with --accept-drift after checking)', plan.hold, line);
  show('HELD: generic over $' + HIGH_GENERIC_PRICE + ' (rerun with --accept-high after checking)', plan.high, s => s);
  show('PROTECTED: curated entry, left alone', plan.protect, line);
  show('SKIPPED: key belongs to another drug', plan.conflict, line);
  show('SKIPPED: live entry is newer', plan.stale, line);
  show('SKIPPED: two scraped drugs want the same key', plan.dupe, s => s);
  show('SKIPPED: row has no usable price', plan.bad, s => s);
}

function writeCache(srcCache, cache, changes) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, 'singlecare_cache_backup_' + stamp + '.json');
  fs.writeFileSync(backup, srcCache, 'utf8');
  for (const c of changes) cache[c.key] = buildEntry(c.item);
  const expected = Object.keys(cache).length;
  const tmp = CACHE + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, CACHE);
    const check = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (Object.keys(check).length !== expected) throw new Error('entry count differs after write');
    for (const c of changes) {
      if (!check[c.key] || check[c.key].lowestPrice !== c.item.lowestPrice) throw new Error('key ' + c.key + ' did not verify');
    }
  } catch (err) {
    fs.writeFileSync(CACHE, srcCache, 'utf8');
    try { fs.unlinkSync(tmp); } catch (e) { /* tmp already renamed or never written */ }
    abort('Write failed, cache restored: ' + err.message + ' (backup also at ' + backup + ')');
  }
  return { backup, expected };
}

function main() {
  const input = ARGS.find(a => !a.startsWith('--'));
  if (!input) abort('Usage: node ' + IMPORTER + ' <dataset.json> [--dry-run] [--run=ID] [--accept-drift] [--accept-high] [--verbose]');
  if (!fs.existsSync(CACHE)) abort('Cache not found: ' + CACHE);
  const raw = readJson(input);
  const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
  if (!items || !items.length) abort(input + ' must be a non-empty JSON array (Apify dataset export).');

  const srcCache = fs.readFileSync(CACHE, 'utf8');
  let cache;
  try { cache = JSON.parse(srcCache); } catch (err) { return abort(CACHE + ' is not valid JSON.'); }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) abort(CACHE + ' is not a key-to-entry object.');

  const before = Object.keys(cache).length;
  const plan = buildPlan(items, cache);
  printPlan(plan, before);
  const changes = plan.add.concat(plan.update);
  console.log('\nSUMMARY: ' + items.length + ' scraped rows -> ' + plan.add.length + ' keys added, ' + plan.update.length +
    ' updated, ' + (plan.hold.length + plan.high.length) + ' held, ' + plan.protect.length + ' protected.');
  if (!changes.length) abort('Nothing to import.');
  if (DRY_RUN) { console.log('DRY RUN: nothing written.'); return; }

  const result = writeCache(srcCache, cache, changes);
  console.log('[OK] Wrote ' + changes.length + ' keys. Cache: ' + before + ' -> ' + result.expected + ' entries. Backup: ' + result.backup);
  console.log('NEXT: pm2 restart rxaggregator, then check /api/search for lisinopril, atorvastatin, and a newly added drug.');
}

main();
