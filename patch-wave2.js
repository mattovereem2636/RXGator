/**
 * RxGator Wave 2 Refactor Patch
 * Replaces inline queryOpenFDA, queryRxNorm, queryMedlinePlus,
 * fuzzyDrugLookup, loadDrugNamesDictionary with require() from drug-info.js.
 * Date: 2026-08-28
 *
 * Usage: node patch-wave2.js [path-to-server.js]
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
// 1. Add require for drug-info.js after existing Wave 1 requires
// ============================================================
applyPatch(
  'Add require for drug-info.js',
  "const { queryCostPlus, queryNADAC } = require('./data-sources');",
  "const { queryCostPlus, queryNADAC } = require('./data-sources');\n" +
  "const { loadDrugNamesDictionary, queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup } = require('./drug-info');"
);

// ============================================================
// 2. Remove inline loadDrugNamesDictionary + drugNamesDictionary
// ============================================================
applyPatch(
  'Remove inline drug dictionary loader',
  "// ============================================================\n" +
  "// DRUG NAMES DICTIONARY (for client-side Fuse.js autocomplete)\n" +
  "// ============================================================\n" +
  "const DRUG_NAMES_FILE = path.join(__dirname, 'public', 'drug-names.json');\n" +
  "let drugNamesDictionary = [];\n" +
  "\n" +
  "function loadDrugNamesDictionary() {\n" +
  "  try {\n" +
  "    if (fs.existsSync(DRUG_NAMES_FILE)) {\n" +
  "      drugNamesDictionary = JSON.parse(fs.readFileSync(DRUG_NAMES_FILE, 'utf8'));\n" +
  "      console.log(`[DRUG DICT] Loaded: ${drugNamesDictionary.length} entries`);\n" +
  "    }\n" +
  "  } catch (err) {\n" +
  "    console.error('[DRUG DICT] Load error:', err.message);\n" +
  "  }\n" +
  "}\n" +
  "\n" +
  "loadDrugNamesDictionary();\n",
  "loadDrugNamesDictionary();\n"
);

// ============================================================
// 3. Remove inline fuzzyDrugLookup
// ============================================================
applyPatch(
  'Remove inline fuzzyDrugLookup',
  "// ============================================================\n" +
  "// SERVER-SIDE FUZZY FALLBACK (RxNorm getApproximateMatch)\n" +
  "// ============================================================\n" +
  "async function fuzzyDrugLookup(query) {\n" +
  "  try {\n" +
  "    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=5`;\n" +
  "    const data = await fetchJSON(url);\n" +
  "    const candidates = (data?.approximateGroup?.candidate) || [];\n" +
  "    if (candidates.length === 0) return [];\n" +
  "\n" +
  "    // Deduplicate by name and filter to meaningful results\n" +
  "    const seen = new Set();\n" +
  "    const results = [];\n" +
  "    for (const c of candidates) {\n" +
  "      // Get properties to find the actual drug name\n" +
  "      const name = c.name || '';\n" +
  "      const rxcui = c.rxcui;\n" +
  "      const score = parseInt(c.rank) || 0;\n" +
  "      const nameLC = name.toLowerCase().trim();\n" +
  "\n" +
  "      if (!nameLC || seen.has(nameLC)) continue;\n" +
  "      seen.add(nameLC);\n" +
  "\n" +
  "      // Only include results with reasonable confidence\n" +
  "      // RxNorm rank: lower = better match. Typically 0-100 for good matches\n" +
  "      results.push({\n" +
  "        name: name,\n" +
  "        rxcui: rxcui,\n" +
  "        rank: score,\n" +
  "      });\n" +
  "    }\n" +
  "\n" +
  "    return results.slice(0, 5);\n" +
  "  } catch (err) {\n" +
  "    console.error('[FUZZY] RxNorm approximate match error:', err.message);\n" +
  "    return [];\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// 4. Remove inline queryOpenFDA
// ============================================================
applyPatch(
  'Remove inline queryOpenFDA',
  "// ============================================================\n" +
  "// openFDA DRUG NORMALIZATION\n" +
  "// ============================================================\n" +
  "async function queryOpenFDA(drugName) {\n" +
  "  try {\n" +
  "    const url = `https://api.fda.gov/drug/ndc.json?search=generic_name:\"${encodeURIComponent(drugName)}\"&limit=20`;\n" +
  "    const data = await fetchJSON(url);\n" +
  "    if (!data.results || data.results.length === 0) return [];\n" +
  "\n" +
  "    // Filter to finished products (not bulk/intermediate)\n" +
  "    const finished = data.results.filter(r =>\n" +
  "      r.product_type === 'HUMAN PRESCRIPTION DRUG' || r.product_type === 'HUMAN OTC DRUG'\n" +
  "    );\n" +
  "\n" +
  "    // Deduplicate by generic_name + dosage_form + active strength\n" +
  "    const seen = new Map();\n" +
  "    for (const r of finished) {\n" +
  "      const strengths = (r.active_ingredients || []).map(i => i.strength).join(', ');\n" +
  "      const key = `${(r.generic_name || '').toLowerCase()}|${r.dosage_form}|${strengths}`;\n" +
  "      if (!seen.has(key)) {\n" +
  "        seen.set(key, {\n" +
  "          genericName: r.generic_name,\n" +
  "          brandName: r.brand_name || r.brand_name_base,\n" +
  "          dosageForm: r.dosage_form,\n" +
  "          activeIngredients: r.active_ingredients || [],\n" +
  "          ndc: r.product_ndc,\n" +
  "          labeler: r.labeler_name,\n" +
  "          productType: r.product_type,\n" +
  "          route: (r.route || []).join(', '),\n" +
  "        });\n" +
  "      }\n" +
  "    }\n" +
  "\n" +
  "    return Array.from(seen.values());\n" +
  "  } catch (err) {\n" +
  "    console.error('openFDA API error:', err.message);\n" +
  "    return [];\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// 5. Remove inline queryRxNorm
// ============================================================
applyPatch(
  'Remove inline queryRxNorm',
  "// ============================================================\n" +
  "// RxNorm API (National Library of Medicine) - Drug Normalization\n" +
  "// Free, no API key, 20 req/sec\n" +
  "// ============================================================\n" +
  "// Three-step resolution: (1) approximate match to get RxCUI,\n" +
  "// (2) check term type — if brand (BN/SBD/SBDF), resolve to ingredient,\n" +
  "// (3) look up brand names for the resolved generic ingredient.\n" +
  "// Returns { rxcui, name, brandNames[], isBrandSearch, originalBrandName }\n" +
  "async function queryRxNorm(drugName) {\n" +
  "  try {\n" +
  "    // Step 1: Get RxCUI via approximate match (handles misspellings)\n" +
  "    const searchUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=5`;\n" +
  "    const searchData = await fetchJSON(searchUrl);\n" +
  "    const candidates = (searchData.approximateGroup || {}).candidate || [];\n" +
  "    if (candidates.length === 0) return null;\n" +
  "\n" +
  "    // Get the top-ranked RxCUI\n" +
  "    const rxcui = candidates[0].rxcui;\n" +
  "    const matchedName = candidates.find(c => c.name)?.name || drugName;\n" +
  "\n" +
  "    // Step 2: Check if this is a brand name — if so, resolve to generic ingredient\n" +
  "    const propsData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`).catch(() => null);\n" +
  "    const tty = propsData?.properties?.tty || '';\n" +
  "    let genericName = matchedName;\n" +
  "    let genericRxcui = rxcui;\n" +
  "    let isBrandSearch = false;\n" +
  "\n" +
  "    if (tty === 'BN' || tty === 'SBD' || tty === 'SBDF') {\n" +
  "      // This is a brand name — resolve to ingredient\n" +
  "      isBrandSearch = true;\n" +
  "      const inData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`).catch(() => null);\n" +
  "      if (inData?.relatedGroup?.conceptGroup) {\n" +
  "        for (const group of inData.relatedGroup.conceptGroup) {\n" +
  "          if (group.conceptProperties && group.conceptProperties.length > 0) {\n" +
  "            genericName = group.conceptProperties[0].name;\n" +
  "            genericRxcui = group.conceptProperties[0].rxcui;\n" +
  "            break;\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }\n" +
  "\n" +
  "    // Step 3: Get brand names for the generic ingredient\n" +
  "    const lookupRxcui = genericRxcui || rxcui;\n" +
  "    const bnData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${lookupRxcui}/related.json?tty=BN`).catch(() => null);\n" +
  "\n" +
  "    const brandNames = [];\n" +
  "    if (bnData?.relatedGroup?.conceptGroup) {\n" +
  "      for (const group of bnData.relatedGroup.conceptGroup) {\n" +
  "        if (group.conceptProperties) {\n" +
  "          for (const cp of group.conceptProperties) {\n" +
  "            if (cp.name && !brandNames.includes(cp.name)) {\n" +
  "              brandNames.push(cp.name);\n" +
  "            }\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }\n" +
  "\n" +
  "    return {\n" +
  "      rxcui: lookupRxcui,\n" +
  "      name: genericName,\n" +
  "      brandNames: brandNames.slice(0, 8),\n" +
  "      isBrandSearch,\n" +
  "      originalBrandName: isBrandSearch ? matchedName : null,\n" +
  "      source: 'RxNorm (NLM)',\n" +
  "    };\n" +
  "  } catch (err) {\n" +
  "    console.error('RxNorm API error:', err.message);\n" +
  "    return null;\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// 6. Remove inline queryMedlinePlus
// ============================================================
applyPatch(
  'Remove inline queryMedlinePlus',
  "// ============================================================\n" +
  "// MedlinePlus API - Consumer Drug Information\n" +
  "// Free, no registration, 85 req/min\n" +
  "// ============================================================\n" +
  "async function queryMedlinePlus(rxcui) {\n" +
  "  if (!rxcui) return null;\n" +
  "  try {\n" +
  "    const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=${rxcui}&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json`;\n" +
  "    const data = await fetchJSON(url);\n" +
  "    const entries = (data.feed || {}).entry || [];\n" +
  "    if (entries.length === 0) return null;\n" +
  "\n" +
  "    // Get the primary drug entry (first one is usually the drug monograph)\n" +
  "    const primary = entries[0];\n" +
  "    const title = (primary.title || {})._value || '';\n" +
  "    const summaryRaw = (primary.summary || {})._value || '';\n" +
  "    // Strip HTML tags for plain text summary\n" +
  "    const summary = summaryRaw.replace(/<[^>]*>/g, '').trim();\n" +
  "    const link = (primary.link || [{}])[0]?.href || '';\n" +
  "\n" +
  "    // Get additional related topics\n" +
  "    const relatedTopics = entries.slice(1, 4).map(e => ({\n" +
  "      title: (e.title || {})._value || '',\n" +
  "      link: (e.link || [{}])[0]?.href || '',\n" +
  "    })).filter(t => t.title);\n" +
  "\n" +
  "    return {\n" +
  "      title,\n" +
  "      summary: summary.length > 500 ? summary.substring(0, 500) + '...' : summary,\n" +
  "      fullSummary: summary,\n" +
  "      link,\n" +
  "      relatedTopics,\n" +
  "      source: 'MedlinePlus (NLM)',\n" +
  "    };\n" +
  "  } catch (err) {\n" +
  "    console.error('MedlinePlus API error:', err.message);\n" +
  "    return null;\n" +
  "  }\n" +
  "}\n",
  ''
);

// ============================================================
// WRITE
// ============================================================
var backupFile = serverFile + '.pre-wave2-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

fs.writeFileSync(serverFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully to server.js');
console.log('\n[PATCH] Summary:');
console.log('  - Added require() for drug-info.js (queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup, loadDrugNamesDictionary)');
console.log('  - Removed 5 inline function definitions (~190 lines)');

var lines = src.split('\n').length;
console.log('  - server.js is now ' + lines + ' lines (was ' + original.split('\n').length + ')');
