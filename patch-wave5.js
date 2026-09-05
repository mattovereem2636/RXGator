/**
 * RxGator Wave 5 Refactor Patch
 * Extracts search handler, log viewer, and admin routes into modules.
 * Leaves server.js as a clean orchestrator.
 * Date: 2026-08-28
 *
 * Usage: node patch-wave5.js [path-to-server.js]
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

/**
 * Remove a section of the file between a unique start anchor and a unique
 * end anchor. Searches for endAnchor AFTER startAnchor. Both anchors and
 * everything between them are removed.
 */
function removeSection(label, startAnchor, endAnchor) {
  var startIdx = src.indexOf(startAnchor);
  if (startIdx === -1) {
    console.error('[PATCH] FAILED — could not find start anchor for: ' + label);
    console.error('[PATCH] Searched for: ' + startAnchor.substring(0, 120));
    process.exit(1);
  }
  var endIdx = src.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx === -1) {
    console.error('[PATCH] FAILED — could not find end anchor for: ' + label);
    console.error('[PATCH] Searched for: ' + endAnchor.substring(0, 120));
    process.exit(1);
  }
  src = src.slice(0, startIdx) + src.slice(endIdx + endAnchor.length);
  patchCount++;
  console.log('[PATCH] Applied: ' + label);
}

// ============================================================
// 1. Remove logSearch through feedback viewer
//    Start: async function logSearch(...)
//    End: closing of GET /api/feedback handler
// ============================================================
removeSection(
  'Remove logSearch through feedback viewer',
  'async function logSearch(req, drug, quantity, zip, results, extras = {}) {',
  "<h1>No feedback yet</h1><p><a href=\"/\">Back</a></p>');\n  }\n});\n"
);

// ============================================================
// 2. Remove requireAdmin through optum/reload
// ============================================================
removeSection(
  'Remove requireAdmin through optum/reload',
  '// Admin authentication middleware',
  "app.post('/api/optum/reload', requireAdmin, (req, res) => {\n  res.json(optum.reload());\n});\n"
);

// ============================================================
// 3. Insert module mount lines before "// Serve frontend"
// ============================================================
applyPatch(
  'Add module mount lines',
  '// Serve frontend',
  "// Mount route modules\n" +
  "require('./search-handler')(app, { searchLimiter, LOG_FILE });\n" +
  "require('./log-viewer')(app, { feedbackLimiter, LOG_FILE });\n" +
  "require('./admin-routes')(app);\n\n" +
  '// Serve frontend'
);

// ============================================================
// 4. Remove unused require lines (data sources now in modules)
// ============================================================
applyPatch(
  'Remove unused vaFss require',
  "const vaFss = require('./va-fss');\n",
  ''
);
applyPatch(
  'Remove unused iraNegotiated require',
  "const iraNegotiated = require('./ira-negotiated');\n",
  ''
);
applyPatch(
  'Remove unused texasWac require',
  "const texasWac = require('./texas-wac');\n",
  ''
);
applyPatch(
  'Remove unused rxOutreach require',
  "const rxOutreach = require('./rxoutreach');\n",
  ''
);
applyPatch(
  'Remove unused rxsaver require',
  "const rxsaver = require('./rxsaver');\n",
  ''
);
applyPatch(
  'Remove unused blink require',
  "const blink = require('./blink');\n",
  ''
);
applyPatch(
  'Remove unused optum require',
  "const optum = require('./optum');\n",
  ''
);
applyPatch(
  'Remove unused utils require',
  "const { escapeHtml, safeUrl, csvEscape, fetchJSON } = require('./utils');\n",
  ''
);
applyPatch(
  'Remove unused data-sources require',
  "const { queryCostPlus, queryNADAC } = require('./data-sources');\n",
  ''
);
applyPatch(
  'Remove unused drug-info require',
  "const { loadDrugNamesDictionary, queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup } = require('./drug-info');\n",
  ''
);
applyPatch(
  'Remove unused govt-data require',
  "const { queryFUL, queryMfrAssist, queryMedicarePartD, checkDrugShortage, checkDrugRecall } = require('./govt-data');\n",
  ''
);
applyPatch(
  'Remove unused retail-sources require',
  "const { lookupBrandGeneric, queryWalmart, estimateCostcoPrice, queryAmazonRxPass } = require('./retail-sources');\n",
  ''
);
applyPatch(
  'Remove unused cache-manager require and aliases',
  "const { querySingleCare, queryGoodRx, saveSingleCareCache, saveGoodRxCache, getSingleCareCache, getGoodRxCache } = require('./cache-manager');\n" +
  "const singleCareCache = getSingleCareCache();\n" +
  "const goodRxCache = getGoodRxCache();\n",
  ''
);
applyPatch(
  'Remove unused fsPromises require',
  "const fsPromises = require('fs').promises;\n",
  ''
);

// ============================================================
// WRITE
// ============================================================
var backupFile = serverFile + '.pre-wave5-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

// Clean up excessive blank lines (more than 2 consecutive)
src = src.replace(/\n{4,}/g, '\n\n\n');

fs.writeFileSync(serverFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully to server.js');
console.log('\n[PATCH] Summary:');
console.log('  - Added require() mounts for search-handler, log-viewer, admin-routes');
console.log('  - Removed logSearch, /api/search, /api/search-count, /api/health');
console.log('  - Removed /api/log, /api/log/csv, feedback routes');
console.log('  - Removed requireAdmin, all cache management and stats routes');
console.log('  - Removed 14 unused require lines');

var lines = src.split('\n').length;
console.log('  - server.js is now ' + lines + ' lines (was ' + original.split('\n').length + ')');
