#!/usr/bin/env node
/**
 * import-singlecare-womens-health.js — merges one SingleCare scrape (Apify actor
 * parseforge/singlecare-scraper, mode "search") for five brand-only women's health
 * drugs into singlecare_cache.json.
 *
 * WHY: the Oct 9 zero-result searches showed real demand for these drugs, and no
 * consumer price source carried them. SingleCare lists all of them.
 *
 * WHY THE EXTRA KEYS: querySingleCare() matches the cache key exactly against the name
 * RxNorm returns. RxNorm turns "Addyi" into "flibanserin", so each drug is written under
 * its brand AND the name RxNorm returns (checked against RxNav 2026-10-14).
 * Myfembree gets its brand key only: RxNorm returns "relugolix", which is also Orgovyx
 * (a prostate cancer drug). A "relugolix" key would show Myfembree prices on Orgovyx searches.
 *
 * The actor returns one lowest price per drug, no quantity, and no strength. The quantity
 * and strength below come from the SingleCare drug pages (read 2026-10-14). A price that
 * differs from the page price by more than 25% is held back unless you pass --accept-drift.
 *
 * USAGE:  node /var/www/rxaggregator/import-singlecare-womens-health.js <dataset.json> --dry-run
 *         node /var/www/rxaggregator/import-singlecare-womens-health.js <dataset.json>
 * Restart after a write: pm2 restart rxaggregator
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const CACHE = path.join(BASE, 'singlecare_cache.json');
const BACKUP_DIR = path.join(BASE, 'data', 'backups');
const MAX_DRIFT = 0.25;
const DRY_RUN = process.argv.includes('--dry-run');
const ACCEPT_DRIFT = process.argv.includes('--accept-drift');

// pagePrice = SingleCare page price with the free signup, read 2026-10-14 (null = page not read).
const DRUGS = [
  { brand: 'Addyi', keys: ['addyi', 'flibanserin'], quantity: 30, strength: '100 mg tablet', pagePrice: 1957.02 },
  { brand: 'Vyleesi', keys: ['vyleesi', 'bremelanotide'], quantity: 4, strength: '1.75 mg/0.3 mL auto-injector', pagePrice: 983.62 },
  { brand: 'Osphena', keys: ['osphena', 'ospemifene'], quantity: 30, strength: '60 mg tablet', pagePrice: 252.37 },
  { brand: 'Myfembree', keys: ['myfembree'], quantity: 28, strength: '40 mg/1 mg/0.5 mg tablet', pagePrice: 1233.38 },
  { brand: 'Menest', keys: ['menest', 'estrogens, esterified (usp)', 'esterified estrogens'], quantity: 30, strength: 'tablet (strength not confirmed)', pagePrice: null },
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return abort('Cannot read ' + file + ': ' + err.message); }
}
const lc = s => String(s || '').toLowerCase().trim();
const money = n => (typeof n === 'number' ? '$' + n.toFixed(2) : '-');

/** Finds the scraped row for one brand. Exact name first, then a name that starts with the brand. */
function findItem(items, brand) {
  const b = lc(brand);
  return items.find(i => lc(i.drugName) === b) || items.find(i => lc(i.drugName).startsWith(b + ' '));
}

/** Keeps only pharmacy rows that have a name and a numeric price. */
function cleanPharmacies(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(p => p && p.name && typeof p.price === 'number').map(p => ({
    name: p.name, price: p.price,
    loyaltyPrice: typeof p.loyaltyPrice === 'number' ? p.loyaltyPrice : p.price,
    loyaltyBonusSavings: typeof p.loyaltyBonusSavings === 'number' ? p.loyaltyBonusSavings : null,
  }));
}

function buildEntry(drug, item) {
  return {
    drugName: drug.brand,
    drugType: 'Brand',
    isGeneric: false,
    url: item.url || 'https://www.singlecare.com/prescription/' + lc(drug.brand),
    ndc: item.ndc || null,
    quantity: drug.quantity,
    strength: drug.strength,
    lowestPrice: item.lowestPrice,
    lowestPricePharmacy: item.lowestPricePharmacy || null,
    pharmacyCount: item.pharmacyCount || null,
    pharmacies: cleanPharmacies(item.pharmacies),
    scrapedAt: item.scrapedAt || new Date().toISOString(),
    importedBy: 'import-singlecare-womens-health.js',
  };
}

function main() {
  const input = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!input) abort('Usage: node import-singlecare-womens-health.js <dataset.json> [--dry-run] [--accept-drift]');
  if (!fs.existsSync(CACHE)) abort('Cache not found: ' + CACHE);
  const raw = readJson(input);
  const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
  if (!items) abort(input + ' must be a JSON array (Apify dataset export) or an object with an "items" array.');

  const srcCache = fs.readFileSync(CACHE, 'utf8');
  let cache;
  try { cache = JSON.parse(srcCache); } catch (err) { return abort(CACHE + ' is not valid JSON.'); }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) abort(CACHE + ' is not a key-to-entry object.');

  const plan = []; const held = []; const missing = []; const conflicts = [];
  for (const drug of DRUGS) {
    const item = findItem(items, drug.brand);
    if (!item || typeof item.lowestPrice !== 'number' || item.lowestPrice <= 0) { missing.push(drug.brand); continue; }
    const drift = drug.pagePrice ? Math.abs(item.lowestPrice - drug.pagePrice) / drug.pagePrice : null;
    if (drift !== null && drift > MAX_DRIFT && !ACCEPT_DRIFT) { held.push(drug.brand + ': scraped ' + money(item.lowestPrice) + ' vs page ' + money(drug.pagePrice)); continue; }
    for (const key of drug.keys) {
      const old = cache[key];
      if (old && lc(old.drugName) !== lc(drug.brand)) { conflicts.push('"' + key + '" already holds ' + old.drugName); continue; }
      plan.push({ key, drug, item, action: old ? 'update (was ' + money(old.lowestPrice) + ')' : 'add' });
    }
  }

  console.log('--- PLAN (' + CACHE + ', ' + Object.keys(cache).length + ' entries now) ---');
  for (const p of plan) console.log('  ' + p.key.padEnd(30) + money(p.item.lowestPrice).padStart(10) + '  ' + p.drug.quantity + ' x ' + p.drug.strength + '  at ' + (p.item.lowestPricePharmacy || '?') + '  [' + p.action + ']');
  if (missing.length) console.log('Not in the scrape (no price): ' + missing.join(', '));
  if (held.length) console.log('HELD (price drift over ' + MAX_DRIFT * 100 + '%; check the SingleCare page, then rerun with --accept-drift):\n  ' + held.join('\n  '));
  if (conflicts.length) console.log('SKIPPED (key belongs to another drug):\n  ' + conflicts.join('\n  '));
  if (plan.length === 0) abort('Nothing to import.');
  if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, 'singlecare_cache_backup_' + stamp + '.json');
  fs.writeFileSync(backup, srcCache, 'utf8');
  for (const p of plan) cache[p.key] = buildEntry(p.drug, p.item);
  const expected = Object.keys(cache).length;
  const tmp = CACHE + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, CACHE);
    const check = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (Object.keys(check).length !== expected) throw new Error('entry count differs after write');
    for (const p of plan) if (!check[p.key] || check[p.key].lowestPrice !== p.item.lowestPrice) throw new Error('key ' + p.key + ' did not verify');
  } catch (err) {
    fs.writeFileSync(CACHE, srcCache, 'utf8');
    try { fs.unlinkSync(tmp); } catch (e) { /* tmp already renamed or never written */ }
    abort('Write failed, cache restored from memory: ' + err.message + ' (backup also at ' + backup + ')');
  }
  console.log('[OK] Wrote ' + plan.length + ' keys. Cache now has ' + expected + ' entries. Backup: ' + backup);
  console.log('NEXT: pm2 restart rxaggregator, then run the browser checks in SINGLECARE-RUN.md.');
}

main();
