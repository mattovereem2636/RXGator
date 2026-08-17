/**
 * HealthWarehouse Pricing Module
 * Source #21 for RxGator (when data is available)
 *
 * Data: Scraped from healthwarehouse.com via standalone Puppeteer scraper
 * Run: node scrape-healthwarehouse.js  (generates healthwarehouse_cache.json)
 *
 * Endpoint: GET /api/healthwarehouse-prices
 *   ?drug=metformin         — search by product name (partial match)
 *   ?inStock=true           — only in-stock products
 *   ?maxPrice=50            — max sale price
 *   ?rx=true                — pharmacy/prescription products only
 *   ?otc=true               — OTC products only
 *   ?limit=50               — max results (default 50, max 200)
 */

const path = require('path');
const fs = require('fs');

module.exports = function (app) {
  let hwData = null;
  const cacheFile = path.join(__dirname, 'data', 'healthwarehouse_cache.json');

  // Load cache on startup (optional — won't crash if file doesn't exist yet)
  try {
    if (fs.existsSync(cacheFile)) {
      hwData = require(cacheFile);
      console.log(`  HealthWarehouse: loaded ${hwData.totalProducts} products (data date: ${hwData.dataDate})`);
    } else {
      console.log('  HealthWarehouse: no cache file yet — run scrape-healthwarehouse.js to populate');
    }
  } catch (err) {
    console.error('  HealthWarehouse: failed to load cache —', err.message);
  }

  app.get('/api/healthwarehouse-prices', (req, res) => {
    if (!hwData || !hwData.products) {
      return res.status(503).json({
        error: 'HealthWarehouse data not available. Run scrape-healthwarehouse.js to populate.',
        code: 'HW_NOT_LOADED'
      });
    }

    const drugQuery = (req.query.drug || '').trim().toUpperCase();
    const inStockFilter = req.query.inStock;
    const maxPrice = parseFloat(req.query.maxPrice) || null;
    const rxFilter = req.query.rx;
    const otcFilter = req.query.otc;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let results = hwData.products;

    // Filter by drug name
    if (drugQuery) {
      results = results.filter(d => d.name.toUpperCase().includes(drugQuery));
    }

    // Filter by stock status
    if (inStockFilter === 'true') {
      results = results.filter(d => d.inStock === true);
    }

    // Filter by Rx / OTC
    if (rxFilter === 'true') {
      results = results.filter(d => d.rxRequired === true);
    }
    if (otcFilter === 'true') {
      results = results.filter(d => d.rxRequired === false);
    }

    // Filter by max price
    if (maxPrice) {
      results = results.filter(d => d.price && d.price <= maxPrice);
    }

    // Sort by price ascending
    results = results
      .sort((a, b) => (a.price || 999999) - (b.price || 999999))
      .slice(0, limit);

    // Enrich results
    const enriched = results.map(d => ({
      productName: d.name,
      price: d.price,
      inStock: d.inStock,
      rxRequired: d.rxRequired,
      url: d.url,
      sku: d.sku,
      source: 'HealthWarehouse',
      sourceNote: 'NABP-accredited online pharmacy, licensed in all 50 states'
    }));

    res.json({
      query: drugQuery || null,
      resultCount: enriched.length,
      dataDate: hwData.dataDate,
      source: 'HealthWarehouse (healthwarehouse.com)',
      results: enriched
    });
  });
};
