// ============================================================
// VA FEDERAL SUPPLY SCHEDULE — Source #14
// Government benchmark pricing (what the federal govt pays)
// ============================================================

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'va_fss_formulary.json');

let formulary = [];
let drugIndex = {};

function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('[VA-FSS] No formulary file found at', CACHE_FILE);
      return;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    formulary = data.medications || [];

    drugIndex = {};
    for (const med of formulary) {
      // Index by parsed drug name (lowercase)
      const name = (med.name || '').toLowerCase().trim();
      if (name) {
        if (!drugIndex[name]) drugIndex[name] = [];
        drugIndex[name].push(med);
      }

      // Index by first word
      const firstWord = name.split(/\s+/)[0];
      if (firstWord && firstWord !== name) {
        if (!drugIndex[firstWord]) drugIndex[firstWord] = [];
        drugIndex[firstWord].push(med);
      }

      // Index by trade names
      if (med.trade_names) {
        for (const trade of med.trade_names) {
          const tKey = trade.toLowerCase().trim();
          if (tKey) {
            if (!drugIndex[tKey]) drugIndex[tKey] = [];
            drugIndex[tKey].push(med);
            const tFirst = tKey.split(/\s+/)[0];
            if (tFirst && tFirst !== tKey) {
              if (!drugIndex[tFirst]) drugIndex[tFirst] = [];
              drugIndex[tFirst].push(med);
            }
          }
        }
      }
    }

    const uniqueDrugs = new Set(formulary.map(m => (m.name || '').toLowerCase().split(/\s+/)[0]));
    console.log(`[VA-FSS] Formulary loaded: ${formulary.length} entries, ${uniqueDrugs.size} unique drugs, ${Object.keys(drugIndex).length} index keys`);
  } catch (err) {
    console.error('[VA-FSS] Load error:', err.message);
    formulary = [];
    drugIndex = {};
  }
}

function search(drugName) {
  if (!drugName) return [];

  const query = drugName.toLowerCase().trim();
  let matches = [];

  if (drugIndex[query]) {
    matches = drugIndex[query];
  } else {
    for (const [key, entries] of Object.entries(drugIndex)) {
      if (key.includes(query) || query.includes(key)) {
        matches.push(...entries);
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = `${m.generic_full}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }

  return unique.map(m => ({
    source: 'VA Federal Supply Schedule',
    sourceType: 'government_benchmark',
    sourceUrl: 'https://www.va.gov/opal/nac/fss/pharmPrices.asp',
    drugName: m.generic_full,
    strength: m.strength,
    form: m.form,
    tradeNames: m.trade_names || [],
    perUnit: m.best_per_unit,
    priceType: m.best_price_type,
    fssPerUnit: m.fss_per_unit,
    price30Day: m.price_30day,
    price90Day: m.price_90day,
    ndc: m.ndc,
    notes: 'Federal government negotiated price. Consumers cannot buy at this price — shown as a benchmark for comparison.'
  }));
}

function stats() {
  const oral = formulary.filter(m => m.is_oral_solid).length;
  return {
    source: 'VA Federal Supply Schedule',
    totalEntries: formulary.length,
    oralSolids: oral,
    indexKeys: Object.keys(drugIndex).length,
    cacheFile: CACHE_FILE,
    lastModified: fs.existsSync(CACHE_FILE)
      ? fs.statSync(CACHE_FILE).mtime.toISOString()
      : null
  };
}

load();

module.exports = { search, stats, load };
