/**
 * CMS IRA Negotiated Prices (Maximum Fair Prices) Module
 * Source: CMS Medicare Drug Price Negotiation Program
 * https://www.cms.gov/initiatives/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program/selected-drugs-negotiated-prices
 * 
 * Serves negotiated Medicare prices for drugs selected under the
 * Inflation Reduction Act. IPAY 2026 (10 drugs) and IPAY 2027 (15 drugs)
 * have published Maximum Fair Prices. IPAY 2028 (15 drugs) selected but
 * prices not yet negotiated.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'cms_ira_negotiated_prices.json');

let cache = null;

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    cache = JSON.parse(raw);
    console.log(`[IRA] Loaded ${cache.totalDrugs} IRA negotiated drug entries`);
  } catch (err) {
    console.error('[IRA] Failed to load IRA negotiated prices:', err.message);
    cache = { drugs: [], totalDrugs: 0 };
  }
}

module.exports = function (app) {
  loadData();

  /**
   * GET /api/ira-prices
   * Query params:
   *   ?drug=eliquis       — search by drug name (partial match)
   *   ?ingredient=apixaban — search by active ingredient
   *   ?ipay=2026          — filter by initial price applicability year
   *   ?ndc=00003-0893-21  — search by NDC code
   */
  app.get('/api/ira-prices', (req, res) => {
    const { drug, ingredient, ipay, ndc } = req.query;

    if (!drug && !ingredient && !ipay && !ndc) {
      return res.json({
        source: cache.source,
        sourceUrl: cache.sourceUrl,
        generatedAt: cache.generatedAt,
        totalDrugs: cache.totalDrugs,
        ipay2026: cache.drugs.filter(d => d.ipay === '2026').length,
        ipay2027: cache.drugs.filter(d => d.ipay === '2027').length,
        ipay2028: cache.drugs.filter(d => d.ipay === '2028').length,
        usage: 'Add ?drug=eliquis or ?ipay=2026 to filter results'
      });
    }

    let results = cache.drugs;

    if (drug) {
      const q = drug.toLowerCase();
      results = results.filter(d =>
        d.drugName.toLowerCase().includes(q) ||
        (d.activeIngredient && d.activeIngredient.toLowerCase().includes(q))
      );
    }

    if (ingredient) {
      const q = ingredient.toLowerCase();
      results = results.filter(d =>
        d.activeIngredient && d.activeIngredient.toLowerCase().includes(q)
      );
    }

    if (ipay) {
      results = results.filter(d => d.ipay === ipay);
    }

    if (ndc) {
      results = results.filter(d =>
        d.sampleNDCs && d.sampleNDCs.some(n => n.includes(ndc))
      );
    }

    res.json({
      source: 'CMS IRA Negotiated Prices',
      count: results.length,
      data: results
    });
  });
};
