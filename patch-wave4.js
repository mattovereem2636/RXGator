/**
 * RxGator Wave 4 Refactor Patch
 * Extracts SingleCare and GoodRx cache functions into cache-manager.js.
 * Admin import routes keep working via shared object references.
 * Date: 2026-08-28
 *
 * Usage: node patch-wave4.js [path-to-server.js]
 */

const fs = require('fs');
const path = require('path');

const serverFile = process.argv[2] || path.join(__dirname, 'server.js');

if (!fs.existsSync(serverFile)) {
  console.error('[PATCH] File not found: ' + serverFile);
  process.exit(1);
}

let src = fs.readFileSync(serverFile, 'utf8');
const original = src;
let patchCount = 0;

function applyPatch(label, search, replacement) {
  var idx = src.indexOf(search);
  if (idx === -1) {
    console.error('[PATCH] FAILED — could not find marker for: ' + label);
    console.error('[PATCH] Searched for: ' + search.substring(0, 120) + '...');
    process.exit(1);
  }
  var second = src.indexOf(search, idx + 1);
  if (second !== -1) {
    console.error('[PATCH] FAILED — marker is not unique for: ' + label);
    process.exit(1);
  }
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
  patchCount++;
  console.log('[PATCH] Applied: ' + label);
}

function removeBlock(label, startMarker, endMarker) {
  var startIdx = src.indexOf(startMarker);
  if (startIdx === -1) {
    console.error('[PATCH] FAILED — could not find start marker for: ' + label);
    console.error('[PATCH] Searched for: ' + startMarker.substring(0, 120));
    process.exit(1);
  }
  var endIdx = src.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx === -1) {
    console.error('[PATCH] FAILED — could not find end marker for: ' + label);
    console.error('[PATCH] Searched for: ' + endMarker.substring(0, 120));
    process.exit(1);
  }
  src = src.slice(0, startIdx) + src.slice(endIdx + endMarker.length);
  patchCount++;
  console.log('[PATCH] Applied: ' + label);
}

// ============================================================
// 1. Add require line for cache-manager.js
// ============================================================
applyPatch(
  'Add require for cache-manager.js',
  "const { lookupBrandGeneric, queryWalmart, estimateCostcoPrice, queryAmazonRxPass } = require('./retail-sources');",
  "const { lookupBrandGeneric, queryWalmart, estimateCostcoPrice, queryAmazonRxPass } = require('./retail-sources');\n" +
  "const { querySingleCare, queryGoodRx, saveSingleCareCache, saveGoodRxCache, getSingleCareCache, getGoodRxCache } = require('./cache-manager');\n" +
  "const singleCareCache = getSingleCareCache();\n" +
  "const goodRxCache = getGoodRxCache();"
);

// ============================================================
// 2. Remove SingleCare cache block (top to loadSingleCareCache() call)
// ============================================================
removeBlock(
  'Remove inline SingleCare cache',
  "// ============================================================\n// SINGLECARE DATA CACHE\n// ============================================================",
  "// Load cache on startup\nloadSingleCareCache();\n"
);

// ============================================================
// 3. Remove GoodRx cache block
// ============================================================
removeBlock(
  'Remove inline GoodRx cache',
  "// ============================================================\n// GOODRX DATA CACHE\n// ============================================================",
  "loadGoodRxCache();\n"
);

// ============================================================
// WRITE
// ============================================================
var backupFile = serverFile + '.pre-wave4-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

fs.writeFileSync(serverFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully to server.js');
console.log('\n[PATCH] Summary:');
console.log('  - Added require() for cache-manager.js with getter aliases');
console.log('  - Removed inline SingleCare cache (load/save/query)');
console.log('  - Removed inline GoodRx cache (load/save/query)');

var lines = src.split('\n').length;
console.log('  - server.js is now ' + lines + ' lines (was ' + original.split('\n').length + ')');
