// ============================================================
// IRA NEGOTIATED PRICES — Source #15
// Medicare Maximum Fair Prices (Inflation Reduction Act)
// ============================================================

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'ira_negotiated_prices.json');

let drugs = [];
let drugIndex = {};

function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('[IRA-MFP] No data file found at', CACHE_FILE);
      return;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    drugs = data.medications || [];

    drugIndex = {};
    for (const drug of drugs) {
      // Index by each drug name (some entries have multiple: "OZEMPIC; RYBELSUS; WEGOVY")
      const names = drug.drug_name.split(';').map(n => n.trim().toLowerCase());
      for (const name of names) {
        if (!drugIndex[name]) drugIndex[name] = [];
        drugIndex[name].push(drug);
        // Also index first word
        const first = name.split(/\s+/)[0];
        if (first && first !== name) {
          if (!drugIndex[first]) drugIndex[first] = [];
          drugIndex[first].push(drug);
        }
      }
      // Index by active ingredient
      if (drug.active_ingredient) {
        const ai = drug.active_ingredient.toLowerCase().trim();
        if (!drugIndex[ai]) drugIndex[ai] = [];
        drugIndex[ai].push(drug);
        const aiFirst = ai.split(/\s+/)[0];
        if (aiFirst && aiFirst !== ai) {
          if (!drugIndex[aiFirst]) drugIndex[aiFirst] = [];
          drugIndex[aiFirst].push(drug);
        }
      }
    }

    const priced = drugs.filter(d => d.mfp_30day).length;
    const pending = drugs.filter(d => d.status === 'selected_pending').length;
    console.log(`[IRA-MFP] Loaded: ${drugs.length} drugs (${priced} priced, ${pending} pending), ${Object.keys(drugIndex).length} index keys`);
  } catch (err) {
    console.error('[IRA-MFP] Load error:', err.message);
    drugs = [];
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
    if (!seen.has(m.drug_name)) {
      seen.add(m.drug_name);
      unique.push(m);
    }
  }

  return unique.map(m => ({
    source: 'Medicare Negotiated (IRA)',
    sourceType: 'government_negotiated',
    sourceUrl: 'https://www.cms.gov/initiatives/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program/selected-drugs-negotiated-prices',
    drugName: m.drug_name,
    activeIngredient: m.active_ingredient,
    ipay: m.ipay,
    mfp30Day: m.mfp_30day,
    mfp90Day: m.mfp_90day || null,
    perUnit: m.per_unit,
    status: m.status,
    effectiveDate: m.effective_date || null,
    notes: m.mfp_30day
      ? `Medicare Maximum Fair Price effective ${m.effective_date || 'Jan ' + m.ipay}. Applies to Medicare Part D beneficiaries.`
      : `Selected for negotiation (IPAY ${m.ipay}). Price not yet finalized.`
  }));
}

function stats() {
  return {
    source: 'Medicare Drug Price Negotiation (IRA)',
    totalDrugs: drugs.length,
    withPrices: drugs.filter(d => d.mfp_30day).length,
    pending: drugs.filter(d => d.status === 'selected_pending').length,
    indexKeys: Object.keys(drugIndex).length,
    cacheFile: CACHE_FILE,
    lastModified: fs.existsSync(CACHE_FILE)
      ? fs.statSync(CACHE_FILE).mtime.toISOString()
      : null
  };
}

load();

module.exports = { search, stats, load };
