/**
 * RxGator Inside Rx Integration Patch (Source #22)
 * Wires insiderx.js into search-handler.js's unified /api/search endpoint
 * and bumps the server.js startup banner. Follows the same patch-script
 * convention as patch-wave1.js through patch-wave5.js.
 *
 * Run this AFTER insiderx.js and data/insiderx_cache.json are already in
 * place (both deployed alongside this script).
 *
 * Usage: node patch-insiderx.js [path-to-search-handler.js] [path-to-server.js]
 * Date: 2026-09-17
 */

const fs = require('fs');
const path = require('path');

const searchHandlerFile = process.argv[2] || path.join(__dirname, 'search-handler.js');
const serverFile = process.argv[3] || path.join(__dirname, 'server.js');

function loadOrExit(file) {
  if (!fs.existsSync(file)) {
    console.error('[PATCH] File not found: ' + file);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

function makeApplyPatch(getSrc, setSrc, counterRef) {
  return function applyPatch(label, search, replacement) {
    var src = getSrc();
    var idx = src.indexOf(search);
    if (idx === -1) {
      console.error('[PATCH] FAILED — could not find marker for: ' + label);
      console.error('[PATCH] Searched for: ' + search.substring(0, 160) + '...');
      process.exit(1);
    }
    var second = src.indexOf(search, idx + 1);
    if (second !== -1) {
      console.error('[PATCH] FAILED — marker is not unique for: ' + label);
      process.exit(1);
    }
    setSrc(src.slice(0, idx) + replacement + src.slice(idx + search.length));
    counterRef.count++;
    console.log('[PATCH] Applied: ' + label);
  };
}

// ============================================================
// FILE 1: search-handler.js
// ============================================================
var shOriginal = loadOrExit(searchHandlerFile);
var shSrc = shOriginal;
var shCounter = { count: 0 };
var applySh = makeApplyPatch(
  function () { return shSrc; },
  function (next) { shSrc = next; },
  shCounter
);

// 1. Require the new module, right after healthwarehouse
applySh(
  'Add require for insiderx.js',
  "const healthwarehouse = require('./healthwarehouse');",
  "const healthwarehouse = require('./healthwarehouse');\n" +
  "const insiderx = require('./insiderx');"
);

// 2. Query it in the same fallback-search block as the other discount cards
applySh(
  'Add insiderx searchSourceWithFallback call',
  "const healthwarehouseResults = searchSourceWithFallback(healthwarehouse, pricingSearchName, drugName);",
  "const healthwarehouseResults = searchSourceWithFallback(healthwarehouse, pricingSearchName, drugName);\n" +
  "    const insiderxResults = searchSourceWithFallback(insiderx, pricingSearchName, drugName);"
);

// 3. Normalize results into allPrices — insert right before the Rx Outreach loop,
//    so it sits with the other discount-card sources (RxSaver, Blink, Optum).
applySh(
  'Add insiderx normalization loop into allPrices',
  "    for (const ro of rxOutreachResults) {",
  "    for (const ix of insiderxResults) {\n" +
  "      allPrices.push({\n" +
  "        source: ix.source, sourceUrl: ix.sourceUrl, drugName: ix.drugName,\n" +
  "        strength: ix.strength, form: ix.form,\n" +
  "        unitPrice: ix.quantity ? +(ix.price / parseInt(ix.quantity)).toFixed(4) : null,\n" +
  "        priceForQuantity: ix.price, priceFor30: ix.price,\n" +
  "        priceFor90: +(ix.price * 3).toFixed(2),\n" +
  "        brandGeneric: 'Generic', pharmacy: ix.pharmacy,\n" +
  "        note: `Inside Rx discount card: \\$${ix.price.toFixed(2)} at ${ix.pharmacy} (${ix.quantity || 30}-count). NOT INSURANCE — cannot be combined with insurance, copay assistance, Medicare, Medicaid, or TRICARE. Show the card at the pharmacy counter.`,\n" +
  "        dataFreshness: ix.cachedDate ? `Cached ${new Date(ix.cachedDate).toLocaleDateString()}` : 'Cached',\n" +
  "      });\n" +
  "    }\n\n" +
  "    for (const ro of rxOutreachResults) {"
);

// 4. Add to sourcesQueried report
applySh(
  'Add insideRx to sourcesQueried',
  "        healthWarehouse: { status: healthwarehouseResults.length > 0 ? 'found' : 'no_match', count: healthwarehouseResults.length },",
  "        healthWarehouse: { status: healthwarehouseResults.length > 0 ? 'found' : 'no_match', count: healthwarehouseResults.length },\n" +
  "        insideRx: { status: insiderxResults.length > 0 ? 'found' : 'no_match', count: insiderxResults.length },"
);

// 5. Add to the /api/health sources list
applySh(
  'Add Inside Rx to /api/health sources list',
  "'HealthWarehouse (online, 930 drugs)']",
  "'HealthWarehouse (online, 930 drugs)', 'Inside Rx (cached)']"
);

// ============================================================
// FILE 2: server.js — startup banner only
// ============================================================
var srvOriginal = loadOrExit(serverFile);
var srvSrc = srvOriginal;
var srvCounter = { count: 0 };
var applySrv = makeApplyPatch(
  function () { return srvSrc; },
  function (next) { srvSrc = next; },
  srvCounter
);

applySrv(
  'Bump banner source count 21 -> 22',
  'Data Sources (21):',
  'Data Sources (22):'
);

applySrv(
  'Add Inside Rx banner line',
  "  console.log(`  ║   ✓ HealthWarehouse (online, 930 drugs) ║`);",
  "  console.log(`  ║   ✓ HealthWarehouse (online, 930 drugs) ║`);\n" +
  "  console.log(`  ║   ✓ Inside Rx (Apify cache)              ║`);"
);

// ============================================================
// WRITE — backup then save both files
// ============================================================
var shBackup = searchHandlerFile + '.pre-insiderx-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(shBackup, shOriginal);
console.log('[PATCH] Backup saved: ' + shBackup);
fs.writeFileSync(searchHandlerFile, shSrc);
console.log('[PATCH] ' + shCounter.count + ' patches applied to ' + searchHandlerFile);

var srvBackup = serverFile + '.pre-insiderx-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(srvBackup, srvOriginal);
console.log('[PATCH] Backup saved: ' + srvBackup);
fs.writeFileSync(serverFile, srvSrc);
console.log('[PATCH] ' + srvCounter.count + ' patches applied to ' + serverFile);

console.log('\n[PATCH] Summary:');
console.log('  - search-handler.js: require, fallback-search call, allPrices loop, sourcesQueried entry, /api/health entry');
console.log('  - server.js: banner count bumped to 22, Inside Rx line added');
console.log('  - Restart with: pm2 restart rxaggregator');
