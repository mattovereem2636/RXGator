/**
 * NADAC (National Average Drug Acquisition Cost) Pricing Module
 * Source #20 for RxGator
 *
 * Data: CMS/Medicaid NADAC — what pharmacies actually pay for drugs
 * Updated weekly by CMS. Current dataset: 6,327 drugs (4,459 generic, 1,868 brand)
 * Includes GLP-1/weight loss drugs (Ozempic, Wegovy, Mounjaro, Zepbound)
 *
 * Endpoint: GET /api/nadac-prices
 *   ?drug=metformin         — search by drug name (partial match)
 *   ?type=generic|brand     — filter by generic or brand
 *   ?otc=true|false         — filter OTC vs prescription
 *   ?maxPrice=5             — max NADAC per unit price
 *   ?limit=50               — max results (default 50, max 200)
 */

const path = require('path');

module.exports = function (app) {
  let nadacData = null;

  // Load cache on startup
  try {
    nadacData = require(path.join(__dirname, 'data', 'nadac_cache.json'));
    console.log(`  NADAC: loaded ${nadacData.totalDrugs} drugs (data date: ${nadacData.dataDate})`);
  } catch (err) {
    console.error('  NADAC: failed to load cache —', err.message);
    return;
  }

  app.get('/api/nadac-prices', (req, res) => {
    if (!nadacData || !nadacData.drugs) {
      return res.status(503).json({ error: 'NADAC data not available', code: 'NADAC_NOT_LOADED' });
    }

    const drugQuery = (req.query.drug || '').trim().toUpperCase();
    const typeFilter = (req.query.type || '').trim().toUpperCase();
    const otcFilter = req.query.otc;
    const maxPrice = parseFloat(req.query.maxPrice) || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let results = nadacData.drugs;

    // Filter by drug name (partial match)
    if (drugQuery) {
      results = results.filter(d => d.name.toUpperCase().includes(drugQuery));
    }

    // Filter by type
    if (typeFilter === 'GENERIC' || typeFilter === 'G') {
      results = results.filter(d => d.type === 'G');
    } else if (typeFilter === 'BRAND' || typeFilter === 'B') {
      results = results.filter(d => d.type === 'B');
    }

    // Filter by OTC
    if (otcFilter === 'true') {
      results = results.filter(d => d.otc === true);
    } else if (otcFilter === 'false') {
      results = results.filter(d => d.otc === false);
    }

    // Filter by max price
    if (maxPrice) {
      results = results.filter(d => d.nadacPerUnit <= maxPrice);
    }

    // Sort by price ascending
    results = results
      .sort((a, b) => a.nadacPerUnit - b.nadacPerUnit)
      .slice(0, limit);

    // Enrich results
    const enriched = results.map(d => ({
      drugName: d.name,
      nadacPerUnit: d.nadacPerUnit,
      pricingUnit: d.unit,
      effectiveDate: d.effectiveDate,
      drugType: d.type === 'G' ? 'Generic' : 'Brand',
      otc: d.otc,
      ndc: d.ndc,
      source: 'CMS NADAC',
      sourceNote: 'National average cost pharmacies pay for this drug',
      detailUrl: 'https://data.medicaid.gov/dataset/fbb83258-11c7-47f5-8b18-5f8e79f7e704'
    }));

    res.json({
      query: drugQuery || null,
      filters: {
        type: typeFilter || null,
        otc: otcFilter || null,
        maxPrice: maxPrice
      },
      resultCount: enriched.length,
      dataDate: nadacData.dataDate,
      source: 'CMS NADAC (National Average Drug Acquisition Cost)',
      results: enriched
    });
  });
};
