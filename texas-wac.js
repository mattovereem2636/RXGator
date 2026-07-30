// ============================================================
// TEXAS DSHS WAC PRICES — Source #16
// Wholesale Acquisition Cost (manufacturer list price)
// ============================================================

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'texas_wac_formulary.json');

let formulary = [];
let drugIndex = {};

function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('[TX-WAC] No data file found at', CACHE_FILE);
      return;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    formulary = data.medications || [];

    drugIndex = {};
    for (const med of formulary) {
      // Index by generic name
      const name = (med.generic_name || '').toLowerCase().trim();
      if (name) {
        if (!drugIndex[name]) drugIndex[name] = [];
        drugIndex[name].push(med);
        // First word
        const first = name.split(/\s+/)[0];
        if (first && first.length > 2 && first !== name) {
          if (!drugIndex[first]) drugIndex[first] = [];
          drugIndex[first].push(med);
        }
      }
      // Index by trade names
      if (med.trade_names) {
        for (const trade of med.trade_names) {
          const tKey = trade.toLowerCase().trim();
          if (tKey) {
            if (!drugIndex[tKey]) drugIndex[tKey] = [];
            drugIndex[tKey].push(med);
            const tFirst = tKey.split(/\s+/)[0];
            if (tFirst && tFirst.length > 2 && tFirst !== tKey) {
              if (!drugIndex[tFirst]) drugIndex[tFirst] = [];
              drugIndex[tFirst].push(med);
            }
          }
        }
      }
    }

    console.log(`[TX-WAC] Loaded: ${formulary.length} drugs, ${Object.keys(drugIndex).length} index keys`);
  } catch (err) {
    console.error('[TX-WAC] Load error:', err.message);
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

  // Deduplicate and limit
  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = `${m.generic_name}|${m.ndc}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }

  // Sort by WAC price ascending, limit to top 10
  unique.sort((a, b) => a.wac_price - b.wac_price);

  return unique.slice(0, 10).map(m => ({
    source: 'Texas DSHS (WAC)',
    sourceType: 'government_benchmark',
    sourceUrl: 'https://www.dshs.texas.gov/prescription-drug-price-disclosure-program/data-overview',
    drugName: m.generic_name,
    tradeNames: m.trade_names || [],
    manufacturers: m.manufacturers || [],
    wacPrice: m.wac_price,
    ndc: m.ndc,
    priceIncrease: m.price_increase,
    notes: 'Wholesale Acquisition Cost (manufacturer list price before discounts). Benchmark only — not what consumers pay.'
  }));
}

function stats() {
  return {
    source: 'Texas DSHS WAC Prices',
    totalDrugs: formulary.length,
    indexKeys: Object.keys(drugIndex).length,
    cacheFile: CACHE_FILE,
    lastModified: fs.existsSync(CACHE_FILE)
      ? fs.statSync(CACHE_FILE).mtime.toISOString()
      : null
  };
}

load();

module.exports = { search, stats, load };
