/**
 * RxGator — Coupon Cache Manager
 * Manages SingleCare and GoodRx scraped data caches.
 * Provides load, save, and query functions plus direct cache access
 * for the admin import routes.
 * @module cache-manager
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeUrl } = require('./utils');

// ============================================================
// SINGLECARE DATA CACHE
// ============================================================
const SC_CACHE_FILE = path.join(__dirname, 'singlecare_cache.json');
let singleCareCache = {};

/**
 * Load the SingleCare cache from disk on startup.
 */
function loadSingleCareCache() {
  try {
    if (fs.existsSync(SC_CACHE_FILE)) {
      const raw = fs.readFileSync(SC_CACHE_FILE, 'utf8');
      singleCareCache = JSON.parse(raw);
      const drugCount = Object.keys(singleCareCache).length;
      console.log(`[SINGLECARE] Cache loaded: ${drugCount} drugs`);
    } else {
      singleCareCache = {};
      console.log('[SINGLECARE] No cache file found — starting empty');
    }
  } catch (err) {
    console.error('[SINGLECARE] Cache load error:', err.message);
    singleCareCache = {};
  }
}

/**
 * Persist the current SingleCare cache to disk.
 */
function saveSingleCareCache() {
  try {
    fs.writeFileSync(SC_CACHE_FILE, JSON.stringify(singleCareCache, null, 2));
  } catch (err) {
    console.error('[SINGLECARE] Cache save error:', err.message);
  }
}

/**
 * Query the SingleCare cache for coupon pricing on a drug.
 * @param {string} drugName - The drug name to search.
 * @returns {Array<Object>} Array with one pricing result, or empty if not cached.
 */
function querySingleCare(drugName) {
  const key = drugName.toLowerCase().trim();
  const entry = singleCareCache[key];
  if (!entry || !entry.lowestPrice) return [];

  const results = [];

  results.push({
    source: 'SingleCare',
    sourceUrl: safeUrl(entry.url) || `https://www.singlecare.com/prescription/${encodeURIComponent(key)}`,
    drugName: entry.drugName || drugName,
    ndc: entry.ndc || null,
    unitPrice: entry.quantity ? +(entry.lowestPrice / entry.quantity).toFixed(4) : null,
    priceFor30: entry.quantity === 90 ? +(entry.lowestPrice / 3).toFixed(2) : entry.lowestPrice,
    priceFor90: entry.quantity === 90 ? entry.lowestPrice : +(entry.lowestPrice * 3).toFixed(2),
    brandGeneric: entry.isGeneric ? 'Generic' : (entry.drugType || 'Generic'),
    note: `SingleCare coupon price. Lowest: $${entry.lowestPrice} at ${entry.lowestPricePharmacy || 'participating pharmacy'} (${entry.quantity || 30}-count). Prices vary by pharmacy and location.`,
    dataFreshness: entry.scrapedAt ? `Cached ${new Date(entry.scrapedAt).toLocaleDateString()}` : 'Cached',
    pharmacies: (entry.pharmacies || []).map(p => ({
      name: p.name,
      price: p.price,
      loyaltyPrice: p.loyaltyPrice,
      loyaltyBonusSavings: p.loyaltyBonusSavings,
    })),
    priceHistory: entry.priceHistory || [],
    sideEffects: entry.sideEffects || [],
  });

  return results;
}

loadSingleCareCache();

// ============================================================
// GOODRX DATA CACHE
// ============================================================
const GRX_CACHE_FILE = path.join(__dirname, 'goodrx_cache.json');
let goodRxCache = {};

/**
 * Load the GoodRx cache from disk on startup.
 */
function loadGoodRxCache() {
  try {
    if (fs.existsSync(GRX_CACHE_FILE)) {
      const raw = fs.readFileSync(GRX_CACHE_FILE, 'utf8');
      goodRxCache = JSON.parse(raw);
      const drugCount = Object.keys(goodRxCache).length;
      console.log(`[GOODRX] Cache loaded: ${drugCount} drugs`);
    } else {
      goodRxCache = {};
      console.log('[GOODRX] No cache file found — starting empty');
    }
  } catch (err) {
    console.error('[GOODRX] Cache load error:', err.message);
    goodRxCache = {};
  }
}

/**
 * Persist the current GoodRx cache to disk.
 */
function saveGoodRxCache() {
  try {
    fs.writeFileSync(GRX_CACHE_FILE, JSON.stringify(goodRxCache, null, 2));
  } catch (err) {
    console.error('[GOODRX] Cache save error:', err.message);
  }
}

/**
 * Query the GoodRx cache for coupon pricing on a drug.
 * Prefers in-store pharmacy prices over mail-order.
 * @param {string} drugName - The drug name to search.
 * @returns {Array<Object>} Array with one pricing result, or empty if not cached.
 */
function queryGoodRx(drugName) {
  const key = drugName.toLowerCase().trim();
  const entry = goodRxCache[key];
  if (!entry || !entry.pharmacies || entry.pharmacies.length === 0) return [];

  const results = [];

  const mailOrderNames = ['ro', 'goodrx care', 'alto', 'capsule', 'healthwarehouse', 'amazon pharmacy'];
  const inStorePharmacies = entry.pharmacies.filter(p =>
    !mailOrderNames.includes(p.name.toLowerCase())
  );
  const allPharmacies = entry.pharmacies;

  const lowest = inStorePharmacies.length > 0
    ? inStorePharmacies.reduce((min, p) => p.goodrx_price < min.goodrx_price ? p : min)
    : allPharmacies.reduce((min, p) => p.goodrx_price < min.goodrx_price ? p : min);

  const qty = entry.quantity || 30;

  results.push({
    source: 'GoodRx',
    sourceUrl: `https://www.goodrx.com/${encodeURIComponent(key)}`,
    drugName: entry.drugName || drugName,
    dosage: entry.dosage || null,
    form: entry.form || null,
    unitPrice: +(lowest.goodrx_price / qty).toFixed(4),
    priceFor30: qty === 90 ? +(lowest.goodrx_price / 3).toFixed(2) : lowest.goodrx_price,
    priceFor90: qty === 90 ? lowest.goodrx_price : +(lowest.goodrx_price * 3).toFixed(2),
    brandGeneric: 'Generic',
    note: `GoodRx coupon price. Lowest: $${lowest.goodrx_price} at ${lowest.name} (${qty}-count). Show the coupon at the pharmacy counter.`,
    dataFreshness: entry.scrapedAt ? `Cached ${new Date(entry.scrapedAt).toLocaleDateString()}` : 'Cached',
    pharmacies: allPharmacies.map(p => ({
      name: p.name,
      price: p.goodrx_price,
      retailPrice: p.retail_price,
      discount: p.discount_percentage,
    })),
  });

  return results;
}

loadGoodRxCache();

/**
 * Get direct reference to the SingleCare cache object.
 * Used by admin import routes that need to mutate the cache.
 * @returns {Object} The SingleCare cache keyed by drug name.
 */
function getSingleCareCache() {
  return singleCareCache;
}

/**
 * Get direct reference to the GoodRx cache object.
 * Used by admin import routes that need to mutate the cache.
 * @returns {Object} The GoodRx cache keyed by drug name.
 */
function getGoodRxCache() {
  return goodRxCache;
}

module.exports = {
  querySingleCare,
  queryGoodRx,
  saveSingleCareCache,
  saveGoodRxCache,
  getSingleCareCache,
  getGoodRxCache,
};
