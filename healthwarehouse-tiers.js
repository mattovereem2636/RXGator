/**
 * healthwarehouse-tiers.js — reads real quantity prices from HealthWarehouse product pages.
 *
 * WHY: the search card's "Prices as low as" figure is the lowest cost per unit at the
 * largest quantity, so it cannot price a 30-day supply. Each product page publishes
 * schema.org Offer data with one price per quantity (1, 30, 45, 60, 90, 180).
 * The scraper calls addPriceTiers() after it collects the product list.
 */
'use strict';

const DELAY_MS = 1200;
const MAX_CONSECUTIVE_FAILURES = 8;
/** Below this share of products with tiers, the scrape must not replace the live cache. */
const MIN_TIER_COVERAGE = 0.9;
const LD_JSON = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Pulls the quantity prices from a product page.
 * @param {string} html
 * @returns {Object<string, number>|null} quantity -> total price, or null if the page has none
 */
function parseOfferTiers(html) {
  const tiers = {};
  let match;
  LD_JSON.lastIndex = 0;
  while ((match = LD_JSON.exec(html))) {
    let data;
    try { data = JSON.parse(match[1]); } catch (err) { continue; }
    const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const node of nodes) {
      if (node['@type'] !== 'Product') continue;
      for (const offer of [].concat(node.offers || [])) {
        const quantity = offer.eligibleQuantity && Number(offer.eligibleQuantity.value);
        const price = Number(offer.price);
        if (!(quantity > 0) || !(price > 0)) continue;
        if (!tiers[quantity] || price < tiers[quantity]) tiers[quantity] = price;
      }
    }
  }
  return Object.keys(tiers).length > 0 ? tiers : null;
}

/**
 * Adds priceTiers to each product. Uses the open page so requests stay on the
 * browser session that already loaded the site.
 * @param {import('puppeteer').Page} page - a page on healthwarehouse.com
 * @param {Array<{url: string, priceTiers?: Object}>} products
 * @returns {Promise<{withTiers: number, coverage: number}>}
 */
async function addPriceTiers(page, products) {
  let withTiers = 0;
  let consecutiveFailures = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const pagePath = new URL(product.url).pathname;
    try {
      const result = await page.evaluate(async p => {
        const res = await fetch(p);
        return { status: res.status, html: res.status === 200 ? await res.text() : '' };
      }, pagePath);
      const tiers = result.status === 200 ? parseOfferTiers(result.html) : null;
      if (tiers) { product.priceTiers = tiers; withTiers++; consecutiveFailures = 0; }
      else if (result.status !== 404) consecutiveFailures++;
    } catch (err) {
      consecutiveFailures++;
      console.log(`  [addPriceTiers] ${pagePath}: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  Quantity prices: ${i + 1}/${products.length} (${withTiers} found)`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`  [addPriceTiers] stopped at ${i + 1}: ${MAX_CONSECUTIVE_FAILURES} failures in a row`);
      break;
    }
    await sleep(DELAY_MS);
  }
  return { withTiers, coverage: products.length ? withTiers / products.length : 0 };
}

module.exports = { parseOfferTiers, addPriceTiers, MIN_TIER_COVERAGE };
