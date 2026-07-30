// ============================================================
// RX OUTREACH — Source #13
// Nonprofit mail-order pharmacy formulary integration
// ============================================================
// Loads the scraped formulary JSON at startup and provides
// a search function matching RxGator's existing source pattern.
// ============================================================

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'rxoutreach_formulary.json');

let formulary = [];
let drugIndex = {};  // lowercase drug name → array of matching entries

// ── Load & Index ─────────────────────────────────────────────

function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('[RX-OUTREACH] No formulary file found at', CACHE_FILE);
      return;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    formulary = data.medications || [];

    // Build search index: map generic name keywords → entries
    drugIndex = {};
    for (const med of formulary) {
      // Index by full cleaned name (lowercase)
      const fullName = med.name.toLowerCase().trim();
      if (!drugIndex[fullName]) drugIndex[fullName] = [];
      drugIndex[fullName].push(med);

      // Also index by first word (the generic name without form)
      // e.g. "Atorvastatin Calcium Tablet" → index under "atorvastatin"
      const firstWord = fullName.split(/\s+/)[0];
      if (firstWord && firstWord !== fullName) {
        if (!drugIndex[firstWord]) drugIndex[firstWord] = [];
        drugIndex[firstWord].push(med);
      }

      // Index by brand equivalents
      if (med.brand_equivalents && med.brand_equivalents.length > 0) {
        for (const brand of med.brand_equivalents) {
          const brandKey = brand.toLowerCase().trim();
          if (brandKey) {
            if (!drugIndex[brandKey]) drugIndex[brandKey] = [];
            drugIndex[brandKey].push(med);
          }
          // Also index by first word of brand name
          const brandFirst = brandKey.split(/\s+/)[0];
          if (brandFirst && brandFirst !== brandKey) {
            if (!drugIndex[brandFirst]) drugIndex[brandFirst] = [];
            drugIndex[brandFirst].push(med);
          }
        }
      }
    }

    const uniqueDrugs = new Set(formulary.map(m => m.name.toLowerCase().split(/\s+/)[0]));
    console.log(`[RX-OUTREACH] Formulary loaded: ${formulary.length} entries, ${uniqueDrugs.size} unique drugs, ${Object.keys(drugIndex).length} index keys`);
  } catch (err) {
    console.error('[RX-OUTREACH] Load error:', err.message);
    formulary = [];
    drugIndex = {};
  }
}

// ── Search ───────────────────────────────────────────────────

function search(drugName) {
  if (!drugName) return [];

  const query = drugName.toLowerCase().trim();
  let matches = [];

  // Exact match on full name or first word
  if (drugIndex[query]) {
    matches = drugIndex[query];
  } else {
    // Fuzzy: check if query is a substring of any indexed key
    for (const [key, entries] of Object.entries(drugIndex)) {
      if (key.includes(query) || query.includes(key)) {
        matches.push(...entries);
      }
    }
  }

  // Deduplicate by name + strength
  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = `${m.name}|${m.strength}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }

  // Format for RxGator results
  return unique.map(m => ({
    source: 'Rx Outreach',
    sourceType: 'nonprofit_mail_order',
    sourceUrl: 'https://rxoutreach.org/find-your-medication/',
    drugName: m.name,
    strength: m.strength,
    form: m.form,
    brandEquivalents: m.brand_equivalents || [],
    condition: m.condition,
    price30Day: m.price_30day,
    price90Day: m.price_90day,
    pricePerUnit: m.price_per_unit,
    includesShipping: true,
    isControlled: m.is_controlled,
    isOTC: m.is_otc,
    notes: 'Nonprofit mail-order pharmacy. Free standard shipping. No insurance or membership required.'
  }));
}

// ── Cache Stats ──────────────────────────────────────────────

function stats() {
  const withPrice30 = formulary.filter(m => m.price_30day !== null).length;
  const withPrice90 = formulary.filter(m => m.price_90day !== null).length;
  const freeItems = formulary.filter(m => m.price_30day === 0).length;

  return {
    source: 'Rx Outreach',
    totalEntries: formulary.length,
    indexKeys: Object.keys(drugIndex).length,
    withPrice30Day: withPrice30,
    withPrice90Day: withPrice90,
    freePartnership: freeItems,
    cacheFile: CACHE_FILE,
    lastModified: fs.existsSync(CACHE_FILE)
      ? fs.statSync(CACHE_FILE).mtime.toISOString()
      : null
  };
}

// Load on require
load();

module.exports = { search, stats, load };
