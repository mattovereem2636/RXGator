/**
 * healthwarehouse.js — RxGator cache module for HealthWarehouse.com
 *
 * Loads healthwarehouse_cache.json at startup and exposes search(drugName),
 * stats(), reload() — same interface as optum.js/blink.js/trumprx.js so it
 * plugs into search-handler.js the same way.
 *
 * Unlike Optum/TrumpRx, HealthWarehouse's catalog is general pharmacy
 * product names (often combination drugs with dosage/form baked into the
 * name, e.g. "Dapagliflozin Metformin ER 10-1000mg Tablet"), not a clean
 * one-entry-per-generic index — so this does substring matching against
 * product names rather than an exact-key lookup. A broad query (e.g.
 * "metformin") can legitimately return several combination-drug products
 * alongside any plain-metformin listing; results are capped and sorted by
 * price so the cheapest/most relevant surface first.
 *
 * Cache at: /var/www/rxaggregator/data/healthwarehouse_cache.json
 * Raw-data browse endpoint: healthwarehouse-prices.js (/api/healthwarehouse-prices)
 * — this module is the search-index sibling used by the unified /api/search.
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'healthwarehouse_cache.json');
const MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 3;

let cache = null;

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    cache = JSON.parse(raw);
    console.log(`[HealthWarehouse] Loaded ${cache.totalProducts} products (data date: ${cache.dataDate})`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[HealthWarehouse] No cache file yet at ' + CACHE_PATH);
    } else {
      console.error(`[HealthWarehouse] Failed to load cache: ${err.message}`);
    }
    cache = null;
  }
}

loadCache();

/**
 * Search for a drug by name (substring match against product names).
 * @param {string} drugName
 * @returns {Array|null} normalized result objects for allPrices, or null if not found
 */
function search(drugName) {
  if (!cache || !cache.products || !drugName) return null;

  const query = drugName.trim().toUpperCase();
  if (query.length < MIN_QUERY_LENGTH) return null;

  const matches = cache.products
    .filter(p => p.inStock && p.name && p.name.toUpperCase().includes(query))
    .sort((a, b) => (a.price || 999999) - (b.price || 999999))
    .slice(0, MAX_RESULTS);

  if (matches.length === 0) return null;

  return matches.map(p => ({
    source: 'HealthWarehouse',
    sourceUrl: p.url,
    drugName: p.name,
    price: p.price,
    priceFor30: p.price,
    priceFor90: null,
    rxRequired: p.rxRequired,
    sku: p.sku,
    cached: true,
    cachedDate: cache.dataDate,
  }));
}

function stats() {
  return {
    loaded: !!cache,
    totalProducts: cache ? cache.totalProducts : 0,
    dataDate: cache ? cache.dataDate : null,
  };
}

function reload() {
  loadCache();
  return stats();
}

module.exports = { search, stats, reload };
