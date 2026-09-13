/**
 * trumprx.js — RxGator cache module for TrumpRx.gov (federal drug pricing platform)
 *
 * Loads trumprx_cache.json at startup, builds a search index keyed on
 * normalized drug names (slug, generic name, cleaned brand name), and
 * exposes search(drugName), stats(), reload() — same pattern as
 * optum.js/blink.js/rxsaver.js so it plugs into search-handler.js the
 * same way.
 *
 * Cache at: /var/www/rxaggregator/data/trumprx_cache.json
 * Raw-data browse endpoint: trumprx-prices.js (/api/trumprx-prices) — this
 * module is the search-index sibling used by the unified /api/search.
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'trumprx_cache.json');
let cache = null;
let searchIndex = new Map();

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    cache = JSON.parse(raw);

    searchIndex.clear();
    for (const drug of cache.drugs || []) {
      if (drug.hidden) continue;

      const keys = new Set();
      if (drug.slug) {
        keys.add(drug.slug.toLowerCase());
        keys.add(normalize(drug.slug));
        keys.add(drug.slug.replace(/-/g, ' ').toLowerCase());
      }
      if (drug.drugName) keys.add(normalize(drug.drugName));
      if (drug.genericName) keys.add(normalize(drug.genericName));

      for (const key of keys) {
        if (key && !searchIndex.has(key)) searchIndex.set(key, drug);
      }
    }

    console.log(`[TrumpRx] Indexed ${cache.totalDrugs} drugs (${cache.brandDrugs} brand, ${cache.genericDrugs} generic) from cache generated ${cache.generatedAt}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[TrumpRx] No cache file yet at ' + CACHE_PATH);
    } else {
      console.error(`[TrumpRx] Failed to load cache: ${err.message}`);
    }
    cache = null;
  }
}

loadCache();

/**
 * Search for a drug by name.
 * @param {string} drugName
 * @returns {Array|null} normalized result objects for allPrices, or null if not found
 */
function search(drugName) {
  if (!cache || !drugName) return null;

  const query = normalize(drugName);
  let drug = searchIndex.get(query);
  if (!drug) drug = searchIndex.get(query.replace(/\s+/g, '-'));
  if (!drug) {
    const firstWord = query.split(/\s+/)[0];
    if (firstWord.length >= 4) drug = searchIndex.get(firstWord);
  }
  if (!drug) return null;

  const savings = drug.lowestBeforePrice > 0
    ? Math.round((1 - drug.lowestTrxPrice / drug.lowestBeforePrice) * 1000) / 10
    : null;

  return [{
    source: 'TrumpRx.gov',
    sourceUrl: `https://trumprx.gov/p/${drug.slug}`,
    drugName: drug.drugName,
    genericName: drug.genericName,
    company: drug.companyDisplayName,
    price: drug.lowestTrxPrice,
    priceFor30: drug.lowestTrxPrice,
    priceFor90: +(drug.lowestTrxPrice * 3).toFixed(2),
    originalPrice: drug.lowestBeforePrice > 0 ? drug.lowestBeforePrice : null,
    savingsPercent: savings,
    cached: true,
    cachedDate: cache.generatedAt,
  }];
}

function stats() {
  return {
    loaded: !!cache,
    totalDrugs: cache ? cache.totalDrugs : 0,
    indexedKeys: searchIndex.size,
    generatedAt: cache ? cache.generatedAt : null,
  };
}

function reload() {
  loadCache();
  return stats();
}

module.exports = { search, stats, reload };
