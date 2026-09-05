/**
 * RxGator Wave 3 Refactor Patch
 * Extracts govt-data and retail-source functions into modules.
 * Removes blocks bottom-to-top to avoid marker collisions.
 * Date: 2026-08-28
 *
 * Usage: node patch-wave3.js [path-to-server.js]
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
// 1. Add require lines at the top
// ============================================================
applyPatch(
  'Add require for govt-data.js and retail-sources.js',
  "const { loadDrugNamesDictionary, queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup } = require('./drug-info');",
  "const { loadDrugNamesDictionary, queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup } = require('./drug-info');\n" +
  "const { queryFUL, queryMfrAssist, queryMedicarePartD, checkDrugShortage, checkDrugRecall } = require('./govt-data');\n" +
  "const { lookupBrandGeneric, queryWalmart, estimateCostcoPrice, queryAmazonRxPass } = require('./retail-sources');"
);

// ============================================================
// 2. Remove brand-generic lookup
// ============================================================
applyPatch(
  'Remove inline brand-generic lookup',
  "// ============================================\n" +
  "// PHASE A: Static Brand-to-Generic Mapping\n" +
  "// Fast O(1) lookup BEFORE any API calls\n" +
  "// ============================================\n" +
  "const brandGenericLookup = require('./brand-generic-lookup.json');\n" +
  "\n" +
  "function lookupBrandGeneric(drugName) {\n" +
  "  const key = drugName.toLowerCase().trim();\n" +
  "  const match = brandGenericLookup[key];\n" +
  "  if (match) {\n" +
  "    return {\n" +
  "      isBrandName: true,\n" +
  "      brandName: match.brand,\n" +
  "      genericName: match.generic,\n" +
  "      drugClass: match.drugClass,\n" +
  "      primaryUse: match.primaryUse,\n" +
  "      hasGeneric: match.hasGeneric,\n" +
  "      typicalSavings: match.typicalSavings,\n" +
  "      source: 'static-map'\n" +
  "    };\n" +
  "  }\n" +
  "  return null;\n" +
  "}\n",
  ''
);

// ============================================================
// 3. Remove FUL cache block
// ============================================================
removeBlock(
  'Remove inline FUL cache',
  '// ============================================================\n// MEDICAID FEDERAL UPPER LIMIT (FUL) CACHE\n// ============================================================',
  'loadFulCache();\n'
);

// ============================================================
// 4. Remove MfrAssist block
// ============================================================
removeBlock(
  'Remove inline MfrAssist',
  '// ============================================================\n// MANUFACTURER ASSISTANCE DATABASE\n// ============================================================',
  'loadMfrAssist();\n'
);

// ============================================================
// 5. Remove WALMART_4_LIST data only (ends at closing };)
// ============================================================
removeBlock(
  'Remove inline WALMART_4_LIST',
  "// ============================================================\n// WALMART PRESCRIPTION PROGRAM",
  "'albuterol hfa': { strengths: ['90mcg'], form: 'Inhaler', price30: 24.00, price90: 24.00, category: 'Respiratory' },\n};\n"
);

// ============================================================
// 6. Remove Costco pricing function
// ============================================================
removeBlock(
  'Remove inline Costco pricing',
  "// ============================================================\n// COSTCO PHARMACY ESTIMATED PRICING",
  "  return null;\n}\n"
);

// ============================================================
// NOW REMOVE BOTTOM-TO-TOP to avoid marker collisions
// ============================================================

// 7. Remove Amazon RxPass (lowest block, before UNIFIED SEARCH)
removeBlock(
  'Remove inline Amazon RxPass',
  "// ============================================================\n// AMAZON RXPASS",
  "  }];\n}\n"
);

// 8. Remove checkDrugRecall (use unique end marker)
removeBlock(
  'Remove inline checkDrugRecall',
  "// ============================================================\n// FDA DRUG RECALL CHECK (openFDA Enforcement API)",
  "    console.error('FDA Recall check error:', err.message);\n    return null;\n  }\n}\n"
);

// 9. Remove checkDrugShortage (use unique end marker)
removeBlock(
  'Remove inline checkDrugShortage',
  "// ============================================================\n// FDA DRUG SHORTAGE CHECK",
  "console.error(\"FDA Shortage check error:\", err.message);\n\n\n    return null;\n  }\n}\n"
);

// 10. Remove Walmart query functions (walmartLabel, walmartNote, queryWalmart)
removeBlock(
  'Remove inline Walmart query functions',
  "// ============================================================\n// WALMART $4 LOOKUP\n// ============================================================",
  "    note: walmartNote(match),\n  }));\n}\n"
);

// 11. Remove Medicare Part D (use unique end marker)
removeBlock(
  'Remove inline queryMedicarePartD',
  "// ============================================================\n// MEDICARE PART D SPENDING DATA (CMS)",
  "    console.error('Medicare Part D API error:', err.message);\n    return null;\n  }\n}\n"
);

// ============================================================
// WRITE
// ============================================================
var backupFile = serverFile + '.pre-wave3-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

fs.writeFileSync(serverFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully to server.js');
console.log('\n[PATCH] Summary:');
console.log('  - Added require() for govt-data.js and retail-sources.js');
console.log('  - Removed brand-generic, FUL, MfrAssist, Walmart, Costco, Amazon, Medicare, shortage, recall');

var lines = src.split('\n').length;
console.log('  - server.js is now ' + lines + ' lines (was ' + original.split('\n').length + ')');
