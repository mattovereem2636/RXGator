/**
 * RxGator Wave 1 Refactor Patch
 * Replaces inline escapeHtml, safeUrl, csvEscape, fetchJSON, queryCostPlus, queryNADAC
 * with require() calls to utils.js and data-sources.js.
 * Date: 2026-08-28
 *
 * Usage: node patch-wave1.js [path-to-server.js]
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
    console.error('[PATCH] Searched for: ' + search.substring(0, 100) + '...');
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

// ============================================================
// 1. Add require lines for utils.js and data-sources.js
//    Insert after: const optum = require('./optum');
// ============================================================
applyPatch(
  'Add require for utils.js and data-sources.js',
  "const optum = require('./optum');",
  "const optum = require('./optum');\n" +
  "const { escapeHtml, safeUrl, csvEscape, fetchJSON } = require('./utils');\n" +
  "const { queryCostPlus, queryNADAC } = require('./data-sources');"
);

// ============================================================
// 2. Remove inline escapeHtml function
// ============================================================
applyPatch(
  'Remove inline escapeHtml',
  "// HTML escaping for safe rendering in admin views\n" +
  "function escapeHtml(str) {\n" +
  "  if (!str) return '';\n" +
  "  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');\n" +
  "}\n",
  ''
);

// ============================================================
// 3. Remove inline safeUrl function
// ============================================================
applyPatch(
  'Remove inline safeUrl',
  "/**\n" +
  " * Validate a URL scheme. Returns the URL if it starts with http: or https:.\n" +
  " * Returns empty string for javascript:, data:, vbscript:, or any other scheme.\n" +
  " * @param {string} url - The URL to validate.\n" +
  " * @returns {string} The safe URL or empty string.\n" +
  " */\n" +
  "function safeUrl(url) {\n" +
  "  if (!url) return '';\n" +
  "  const trimmed = String(url).trim();\n" +
  "  if (/^https?:\\/\\//i.test(trimmed)) return trimmed;\n" +
  "  return '';\n" +
  "}\n",
  ''
);

// ============================================================
// 4. Remove inline csvEscape function
// ============================================================
applyPatch(
  'Remove inline csvEscape',
  "// CSV-escape a value: wrap in quotes and neutralize formula injection characters\n" +
  "function csvEscape(val) {\n" +
  "  let s = String(val || '');\n" +
  "  // Prevent CSV formula injection — prefix dangerous leading chars with a single quote\n" +
  "  if (/^[=+\\-@\\t\\r]/.test(s)) s = \"'\" + s;\n" +
  "  // Double any internal quotes, then wrap\n" +
  "  return '\"' + s.replace(/\"/g, '\"\"') + '\"';\n" +
  "}\n",
  ''
);

// ============================================================
// 5. Remove inline fetchJSON function
// ============================================================
applyPatch(
  'Remove inline fetchJSON',
  "// ============================================================\n" +
  "// API HELPERS\n" +
  "// ============================================================\n" +
  "\n" +
  "async function fetchJSON(url, timeoutMs = 15000) {\n" +
  "  const controller = new AbortController();\n" +
  "  const timer = setTimeout(() => controller.abort(), timeoutMs);\n" +
  "  try {\n" +
  "    const res = await fetch(url, { signal: controller.signal });\n" +
  "    clearTimeout(timer);\n" +
  "    if (!res.ok) throw new Error(`HTTP ${res.status}`);\n" +
  "    return await res.json();\n" +
  "  } catch (err) {\n" +
  "    clearTimeout(timer);\n" +
  "    throw err;\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// 6. Remove inline queryCostPlus function
// ============================================================
applyPatch(
  'Remove inline queryCostPlus',
  "// ============================================================\n" +
  "// COST PLUS DRUGS API\n" +
  "// ============================================================\n" +
  "async function queryCostPlus(drugName) {\n" +
  "  try {\n" +
  "    const url = `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=${encodeURIComponent(drugName)}`;\n" +
  "    const data = await fetchJSON(url);\n" +
  "    if (!data.results || data.results.length === 0) return [];\n" +
  "\n" +
  "    return data.results.map(r => {\n" +
  "      const unitPrice = parseFloat(r.unit_price.replace('$', ''));\n" +
  "      return {\n" +
  "        source: 'Cost Plus Drugs',\n" +
  "        sourceUrl: safeUrl(r.url),\n" +
  "        drugName: r.medication_name,\n" +
  "        brandName: r.brand_name,\n" +
  "        strength: r.strength,\n" +
  "        form: r.form,\n" +
  "        ndc: r.ndc,\n" +
  "        unitPrice,\n" +
  "        brandGeneric: r.brand_generic || 'Generic',\n" +
  "        insuranceEligible: r.insurance_eligible === 'Yes',\n" +
  "        note: 'Mail-order only. Price = cost + 15% markup + $5 pharmacy fee + $5 shipping.',\n" +
  "        // Cost Plus formula: (unit cost × quantity) + $5 pharmacy fee + $5 shipping = +$10 flat\n" +
  "        priceFor30: +(unitPrice * 30 + 10).toFixed(2),\n" +
  "        priceFor90: +(unitPrice * 90 + 10).toFixed(2),\n" +
  "      };\n" +
  "    });\n" +
  "  } catch (err) {\n" +
  "    console.error('Cost Plus API error:', err.message);\n" +
  "    return [];\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// 7. Remove inline queryNADAC function
// ============================================================
applyPatch(
  'Remove inline queryNADAC',
  "// ============================================================\n" +
  "// NADAC (National Average Drug Acquisition Cost) API\n" +
  "// ============================================================\n" +
  "async function queryNADAC(drugName) {\n" +
  "  try {\n" +
  "    const searchTerm = drugName.toUpperCase();\n" +
  "    // Use 2025 dataset\n" +
  "    const url = `https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0?` +\n" +
  "      `conditions[0][property]=ndc_description&conditions[0][value]=%25${encodeURIComponent(searchTerm)}%25&conditions[0][operator]=LIKE` +\n" +
  "      `&sort[0][property]=as_of_date&sort[0][order]=desc&limit=30`;\n" +
  "    const data = await fetchJSON(url);\n" +
  "    if (!data.results || data.results.length === 0) return [];\n" +
  "\n" +
  "    // Deduplicate by description, keep most recent\n" +
  "    const seen = new Map();\n" +
  "    for (const r of data.results) {\n" +
  "      const key = r.ndc_description;\n" +
  "      if (!seen.has(key) || r.as_of_date > seen.get(key).as_of_date) {\n" +
  "        seen.set(key, r);\n" +
  "      }\n" +
  "    }\n" +
  "\n" +
  "    return Array.from(seen.values()).map(r => ({\n" +
  "      source: 'NADAC Benchmark',\n" +
  "      drugDescription: r.ndc_description,\n" +
  "      ndc: r.ndc,\n" +
  "      nadacPerUnit: parseFloat(r.nadac_per_unit),\n" +
  "      pricingUnit: r.pricing_unit,\n" +
  "      effectiveDate: r.effective_date,\n" +
  "      asOfDate: r.as_of_date,\n" +
  "      classification: r.classification_for_rate_setting === 'G' ? 'Generic' : 'Brand',\n" +
  "      otc: r.otc === 'Y',\n" +
  "      note: 'NADAC = National Average Drug Acquisition Cost. This is what pharmacies pay on average — retail price will be higher.',\n" +
  "      priceFor30: +(parseFloat(r.nadac_per_unit) * 30).toFixed(2),\n" +
  "      priceFor90: +(parseFloat(r.nadac_per_unit) * 90).toFixed(2),\n" +
  "    }));\n" +
  "  } catch (err) {\n" +
  "    console.error('NADAC API error:', err.message);\n" +
  "    return [];\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// WRITE
// ============================================================
var backupFile = serverFile + '.pre-wave1-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

fs.writeFileSync(serverFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully to server.js');
console.log('\n[PATCH] Summary:');
console.log('  - Added require() for utils.js (escapeHtml, safeUrl, csvEscape, fetchJSON)');
console.log('  - Added require() for data-sources.js (queryCostPlus, queryNADAC)');
console.log('  - Removed 6 inline function definitions (~96 lines)');

// Quick line count
var lines = src.split('\n').length;
console.log('  - server.js is now ' + lines + ' lines (was ' + original.split('\n').length + ')');
