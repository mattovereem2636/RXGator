/**
 * RxGator — Admin & Cache Management Routes
 * Authentication middleware, cache import/view endpoints,
 * and data source stats/search/reload routes.
 * @module admin-routes
 */

'use strict';

const { getSingleCareCache, getGoodRxCache, saveSingleCareCache, saveGoodRxCache } = require('./cache-manager');
const vaFss = require('./va-fss');
const iraNegotiated = require('./ira-negotiated');
const texasWac = require('./texas-wac');
const rxOutreach = require('./rxoutreach');
const rxsaver = require('./rxsaver');
const blink = require('./blink');
const optum = require('./optum');

/**
 * Admin authentication middleware — defense in depth.
 * Nginx handles Basic Auth, but Express verifies too.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @param {Function} next - Express next middleware.
 */
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (!user || !pass) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.adminUser = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }
}

/**
 * Mount all admin and cache management routes on the Express app.
 * @param {Object} app - Express application instance.
 */
module.exports = function(app) {
  const singleCareCache = getSingleCareCache();
  const goodRxCache = getGoodRxCache();

  // ============================================================
  // SINGLECARE CACHE MANAGEMENT
  // ============================================================

  app.post('/api/singlecare/import', requireAdmin, (req, res) => {
    try {
      const data = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Expected a JSON array of drug records' });
      }
      let imported = 0;
      for (const record of data) {
        if (record.drugName && record.lowestPrice) {
          const key = record.drugName.toLowerCase().trim();
          singleCareCache[key] = record;
          imported++;
        }
      }
      saveSingleCareCache();
      console.log(`[SINGLECARE] Imported ${imported} drugs from Apify data`);
      res.json({ status: 'ok', imported, totalCached: Object.keys(singleCareCache).length });
    } catch (err) {
      console.error('[SINGLECARE] Import error:', err.message);
      res.status(500).json({ error: 'Import failed' });
    }
  });

  app.get('/api/singlecare/cache', (req, res) => {
    const drugs = Object.entries(singleCareCache).map(([key, val]) => ({
      drug: key,
      lowestPrice: val.lowestPrice,
      lowestPharmacy: val.lowestPricePharmacy,
      quantity: val.quantity,
      pharmacyCount: (val.pharmacies || []).length,
      scrapedAt: val.scrapedAt,
    }));
    res.json({ totalDrugs: drugs.length, drugs });
  });

  // ============================================================
  // GOODRX CACHE MANAGEMENT
  // ============================================================

  app.post('/api/goodrx/import', requireAdmin, (req, res) => {
    try {
      const data = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Expected a JSON array of drug records' });
      }
      let imported = 0;
      for (const record of data) {
        if (record.drug_name && record.goodrx_price != null) {
          const key = record.drug_name.toLowerCase().trim();
          if (!goodRxCache[key]) {
            goodRxCache[key] = {
              drugName: record.drug_name,
              dosage: record.dosage,
              form: record.form,
              quantity: record.quantity || 30,
              scrapedAt: record.scraped_at || new Date().toISOString(),
              pharmacies: [],
            };
          }
          goodRxCache[key].pharmacies.push({
            name: record.pharmacy_name,
            goodrx_price: record.goodrx_price,
            retail_price: record.retail_price,
            discount_percentage: record.discount_percentage,
            city: record.pharmacy_city,
            state: record.pharmacy_state,
          });
          imported++;
        }
      }
      for (const key of Object.keys(goodRxCache)) {
        const seen = new Set();
        goodRxCache[key].pharmacies = goodRxCache[key].pharmacies.filter(p => {
          const pk = `${p.name}|${p.goodrx_price}`;
          if (seen.has(pk)) return false;
          seen.add(pk);
          return true;
        });
        goodRxCache[key].pharmacies.sort((a, b) => a.goodrx_price - b.goodrx_price);
      }
      saveGoodRxCache();
      console.log(`[GOODRX] Imported ${imported} pharmacy entries across ${Object.keys(goodRxCache).length} drugs`);
      res.json({ status: 'ok', imported, totalDrugs: Object.keys(goodRxCache).length });
    } catch (err) {
      console.error('[GOODRX] Import error:', err.message);
      res.status(500).json({ error: 'Import failed' });
    }
  });

  app.get('/api/goodrx/cache', (req, res) => {
    const drugs = Object.entries(goodRxCache).map(([key, val]) => ({
      drug: key,
      dosage: val.dosage,
      form: val.form,
      quantity: val.quantity,
      pharmacyCount: val.pharmacies.length,
      lowestPrice: val.pharmacies.length > 0 ? val.pharmacies[0].goodrx_price : null,
      lowestPharmacy: val.pharmacies.length > 0 ? val.pharmacies[0].name : null,
      scrapedAt: val.scrapedAt,
    }));
    res.json({ totalDrugs: drugs.length, drugs });
  });

  // ============================================================
  // DATA SOURCE CACHE STATS, SEARCH, AND RELOAD
  // ============================================================

  app.get('/api/rxoutreach/cache', (req, res) => { res.json(rxOutreach.stats()); });
  app.get('/api/rxoutreach/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(rxOutreach.search(drug));
  });

  app.get('/api/va-fss/cache', (req, res) => { res.json(vaFss.stats()); });
  app.get('/api/va-fss/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(vaFss.search(drug));
  });

  app.get('/api/ira/cache', (req, res) => { res.json(iraNegotiated.stats()); });
  app.get('/api/ira/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(iraNegotiated.search(drug));
  });

  app.get('/api/texas-wac/cache', (req, res) => { res.json(texasWac.stats()); });
  app.get('/api/texas-wac/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(texasWac.search(drug));
  });

  app.get('/api/rxsaver/cache', (req, res) => {
    if (req.query.full === 'true') return res.json(rxsaver.fullCache());
    res.json(rxsaver.stats());
  });
  app.get('/api/rxsaver/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(rxsaver.search(drug));
  });
  app.post('/api/rxsaver/reload', requireAdmin, (req, res) => { res.json(rxsaver.reload()); });

  app.get('/api/blink/cache', (req, res) => {
    if (req.query.full === 'true') return res.json(blink.fullCache());
    res.json(blink.stats());
  });
  app.get('/api/blink/search', (req, res) => {
    const drug = req.query.drug;
    if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
    res.json(blink.search(drug));
  });
  app.post('/api/blink/reload', requireAdmin, (req, res) => { res.json(blink.reload()); });

  app.get('/api/optum/cache', (req, res) => {
    if (req.query.full === 'true') return res.json(optum.fullCache());
    res.json(optum.stats());
  });
  app.get('/api/optum/search', (req, res) => {
    const { drug } = req.query;
    if (!drug) return res.status(400).json({ error: 'drug parameter required' });
    const results = optum.search(drug);
    res.json({ drug, results: results || [], count: results ? results.length : 0 });
  });
  app.post('/api/optum/reload', requireAdmin, (req, res) => { res.json(optum.reload()); });
};
