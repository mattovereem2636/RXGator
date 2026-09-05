/**
 * RxGator Tier 1 Security Patch
 * Fixes: S-1 (input validation + prototype pollution), S-4 (admin auth on log routes)
 * Date: 2026-08-28
 *
 * Usage: node patch-tier1-security.js
 * Run from the rxaggregator directory (or pass path as arg)
 */

const fs = require('fs');
const path = require('path');

const serverFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'server.js');

if (!fs.existsSync(serverFile)) {
  console.error(`[PATCH] File not found: ${serverFile}`);
  process.exit(1);
}

let src = fs.readFileSync(serverFile, 'utf8');
const original = src;
let patchCount = 0;

function applyPatch(label, search, replacement) {
  const idx = src.indexOf(search);
  if (idx === -1) {
    console.error(`[PATCH] FAILED — could not find marker for: ${label}`);
    console.error(`[PATCH] Searched for: ${search.substring(0, 80)}...`);
    process.exit(1);
  }
  // Verify unique
  const second = src.indexOf(search, idx + 1);
  if (second !== -1) {
    console.error(`[PATCH] FAILED — marker is not unique for: ${label}`);
    process.exit(1);
  }
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
  patchCount++;
  console.log(`[PATCH] Applied: ${label}`);
}

// ============================================================
// PATCH 1: Add sanitizeImportRecord helper after requireAdmin
// ============================================================
const AFTER_REQUIRE_ADMIN = `  }
}

// ============================================================
// SINGLECARE CACHE MANAGEMENT`;

const SANITIZE_HELPER = `  }
}

// ============================================================
// IMPORT DATA VALIDATION
// ============================================================
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeImportRecord(record) {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return null;
  }
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return null;
    }
  }
  return record;
}

function safeCacheKey(name) {
  if (typeof name !== 'string') return null;
  const key = name.toLowerCase().trim();
  if (key.length === 0 || key.length > 200) return null;
  if (FORBIDDEN_KEYS.has(key)) return null;
  return key;
}

// ============================================================
// SINGLECARE CACHE MANAGEMENT`;

applyPatch('Add sanitizeImportRecord helper', AFTER_REQUIRE_ADMIN, SANITIZE_HELPER);

// ============================================================
// PATCH 2: Fix SingleCare cache init — Object.create(null)
// ============================================================
applyPatch(
  'SingleCare cache init — Object.create(null)',
  'let singleCareCache = {};',
  'let singleCareCache = Object.create(null);'
);

applyPatch(
  'SingleCare cache reset on empty — Object.create(null)',
  `      singleCareCache = {};
      console.log('[SINGLECARE] No cache file found — starting empty');`,
  `      singleCareCache = Object.create(null);
      console.log('[SINGLECARE] No cache file found — starting empty');`
);

// ============================================================
// PATCH 3: Fix GoodRx cache init — Object.create(null)
// ============================================================
applyPatch(
  'GoodRx cache init — Object.create(null)',
  'let goodRxCache = {};',
  'let goodRxCache = Object.create(null);'
);

applyPatch(
  'GoodRx cache reset on empty — Object.create(null)',
  `      goodRxCache = {};
      console.log('[GOODRX] No cache file found — starting empty');`,
  `      goodRxCache = Object.create(null);
      console.log('[GOODRX] No cache file found — starting empty');`
);

// ============================================================
// PATCH 4: SingleCare import — add validation
// ============================================================
const SC_IMPORT_LOOP = `    let imported = 0;
    for (const record of data) {
      if (record.drugName && record.lowestPrice) {
        const key = record.drugName.toLowerCase().trim();
        singleCareCache[key] = record;
        imported++;
      }
    }`;

const SC_IMPORT_LOOP_FIXED = `    let imported = 0;
    let skipped = 0;
    for (const record of data) {
      const clean = sanitizeImportRecord(record);
      if (!clean) { skipped++; continue; }
      if (clean.drugName && clean.lowestPrice) {
        const key = safeCacheKey(clean.drugName);
        if (!key) { skipped++; continue; }
        singleCareCache[key] = clean;
        imported++;
      }
    }`;

applyPatch('SingleCare import validation', SC_IMPORT_LOOP, SC_IMPORT_LOOP_FIXED);

// ============================================================
// PATCH 5: GoodRx import — add validation
// ============================================================
const GRX_IMPORT_LOOP_START = `    let imported = 0;
    for (const record of data) {
      if (record.drug_name && record.goodrx_price != null) {
        const key = record.drug_name.toLowerCase().trim();`;

const GRX_IMPORT_LOOP_START_FIXED = `    let imported = 0;
    let skipped = 0;
    for (const record of data) {
      const clean = sanitizeImportRecord(record);
      if (!clean) { skipped++; continue; }
      if (clean.drug_name && clean.goodrx_price != null) {
        const key = safeCacheKey(clean.drug_name);
        if (!key) { skipped++; continue; }`;

applyPatch('GoodRx import validation', GRX_IMPORT_LOOP_START, GRX_IMPORT_LOOP_START_FIXED);

// ============================================================
// PATCH 6: S-4 — Add requireAdmin to /api/log
// ============================================================
applyPatch(
  'S-4: Add requireAdmin to /api/log',
  "app.get('/api/log', async (req, res) => {",
  "app.get('/api/log', requireAdmin, async (req, res) => {"
);

// ============================================================
// PATCH 7: S-4 — Add requireAdmin to /api/log/csv
// ============================================================
applyPatch(
  'S-4: Add requireAdmin to /api/log/csv',
  "app.get('/api/log/csv', async (req, res) => {",
  "app.get('/api/log/csv', requireAdmin, async (req, res) => {"
);

// ============================================================
// PATCH 8: S-4 — Add requireAdmin to GET /api/feedback
// ============================================================
applyPatch(
  'S-4: Add requireAdmin to GET /api/feedback',
  "// Feedback viewer (in admin log)\napp.get('/api/feedback', async (req, res) => {",
  "// Feedback viewer (in admin log)\napp.get('/api/feedback', requireAdmin, async (req, res) => {"
);

// ============================================================
// WRITE PATCHED FILE
// ============================================================
const backupFile = serverFile + '.pre-tier1-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(serverFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully to ${serverFile}`);
console.log('\n[PATCH] Summary:');
console.log('  - Added sanitizeImportRecord() and safeCacheKey() helpers');
console.log('  - SingleCare + GoodRx caches now use Object.create(null)');
console.log('  - SingleCare + GoodRx import loops now validate records and keys');
console.log('  - /api/log, /api/log/csv, GET /api/feedback now require admin auth');
