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
 * WHY priceTiers (1.5.6): the "price" field holds the search card's "Prices as
 * low as" figure. That is the lowest cost per unit at the LARGEST quantity, not
 * a package price. Lisinopril 10mg: price 0.11, which is $19.80 / 180 tablets;
 * 30 tablets cost $9.30. Multiplying it by 30 gives a wrong price too, so only
 * the quantity prices from the product page (priceTiers) may reach a shopper.
 * A product with no tiers at all is left out rather than guessed.
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
const THIRTY_DAY_QTY = 30;
const NINETY_DAY_QTY = 90;
const SINGLE_PACKAGE_QTY = 1;
/** Forms sold by the piece. Everything else (tube, bottle, vial, inhaler) sells as a package. */
const COUNT_FORM = /\b(tablets?|capsules?|tabs?|caps?)\b/i;

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
 * Turns a product's quantity prices into the prices RxGator may show.
 * @param {{name: string, priceTiers?: Object<string, number>}} product
 * @returns {{priceFor30: number, priceFor90: number|null, packQuantity: number|null, unitPrice: number}|null}
 *   null when no honest price exists for the product.
 */
function priceFromTiers(product) {
  const tiers = product.priceTiers;
  if (!tiers) return null;
  const quantities = Object.keys(tiers).map(Number).filter(q => q > 0 && tiers[q] > 0).sort((a, b) => a - b);
  if (quantities.length === 0) return null;

  if (COUNT_FORM.test(product.name)) {
    if (tiers[THIRTY_DAY_QTY]) {
      const thirty = tiers[THIRTY_DAY_QTY];
      // No 90-count listed: three 30-counts is a price the shopper can really pay.
      const ninety = tiers[NINETY_DAY_QTY] || +(thirty * 3).toFixed(2);
      return { priceFor30: thirty, priceFor90: ninety, packQuantity: null, unitPrice: +(thirty / THIRTY_DAY_QTY).toFixed(4) };
    }
    // Quantities 1, 2, 3 (or 1 alone) mean bottles or packs, as in "Advil 50 Tablets" or "Sumatriptan (9 Tablet Pack)".
    const soldByPackage = tiers[SINGLE_PACKAGE_QTY] && (tiers[2] || quantities.length === 1);
    if (soldByPackage) {
      return { priceFor30: tiers[SINGLE_PACKAGE_QTY], priceFor90: null, packQuantity: SINGLE_PACKAGE_QTY, unitPrice: null };
    }
    // Otherwise quantity 1 is a per-tablet rate, not a sale. Use the smallest real fill (4 azithromycin, 60 metformin).
    const pack = quantities.find(q => q > SINGLE_PACKAGE_QTY);
    if (!pack) return null;
    return { priceFor30: tiers[pack], priceFor90: null, packQuantity: pack, unitPrice: +(tiers[pack] / pack).toFixed(4) };
  }

  const first = quantities[0];
  return { priceFor30: tiers[first], priceFor90: null, packQuantity: first, unitPrice: null };
}

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
    .map(p => ({ product: p, prices: priceFromTiers(p) }))
    .filter(m => m.prices)
    .sort((a, b) => a.prices.priceFor30 - b.prices.priceFor30)
    .slice(0, MAX_RESULTS);

  if (matches.length === 0) return null;

  return matches.map(({ product: p, prices }) => ({
    source: 'HealthWarehouse',
    sourceUrl: p.url,
    drugName: p.name,
    price: prices.priceFor30,
    priceFor30: prices.priceFor30,
    priceFor90: prices.priceFor90,
    packQuantity: prices.packQuantity,
    unitPrice: prices.unitPrice,
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

module.exports = { search, stats, reload, priceFromTiers };
