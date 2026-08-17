/**
 * TrumpRx Pricing Module
 * Source: TrumpRx.gov
 * 
 * Serves drug pricing data from the federal TrumpRx platform,
 * including Presidential Deals (brand-name) and generic drug prices.
 * 841 medications: 93 brand-name + 748 generics.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'trumprx_cache.json');

let cache = null;

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    cache = JSON.parse(raw);
    console.log(`[TrumpRx] Loaded ${cache.totalDrugs} drugs (${cache.brandDrugs} brand, ${cache.genericDrugs} generic)`);
  } catch (err) {
    console.error('[TrumpRx] Failed to load TrumpRx prices:', err.message);
    cache = { drugs: [], totalDrugs: 0 };
  }
}

module.exports = function (app) {
  loadData();

  /**
   * GET /api/trumprx-prices
   * Query params:
   *   ?drug=ozempic     — search by drug name (partial match)
   *   ?type=brand       — filter: "brand" or "generic"
   *   ?maxPrice=100     — filter by max TrumpRx price (dollars)
   *   ?minSavings=50    — filter by minimum savings percentage
   */
  app.get('/api/trumprx-prices', (req, res) => {
    const { drug, type, maxPrice, minSavings } = req.query;

    if (!drug && !type && !maxPrice && !minSavings) {
      return res.json({
        source: cache.source,
        generatedAt: cache.generatedAt,
        totalDrugs: cache.totalDrugs,
        brandDrugs: cache.brandDrugs,
        genericDrugs: cache.genericDrugs,
        usage: 'Add ?drug=ozempic or ?type=brand to filter results'
      });
    }

    let results = cache.drugs.filter(d => !d.hidden);

    if (drug) {
      const q = drug.toLowerCase();
      results = results.filter(d =>
        d.drugName.toLowerCase().includes(q) ||
        (d.genericName && d.genericName.toLowerCase().includes(q)) ||
        d.slug.toLowerCase().includes(q)
      );
    }

    if (type === 'brand') {
      results = results.filter(d => d.companyDisplayName !== null);
    } else if (type === 'generic') {
      results = results.filter(d => d.companyDisplayName === null);
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      results = results.filter(d => d.lowestTrxPrice <= max);
    }

    if (minSavings) {
      const min = parseFloat(minSavings);
      results = results.filter(d => {
        if (d.lowestBeforePrice <= 0) return false;
        const savings = (1 - d.lowestTrxPrice / d.lowestBeforePrice) * 100;
        return savings >= min;
      });
    }

    // Add computed savings to results
    const enriched = results.map(d => {
      const savings = d.lowestBeforePrice > 0
        ? Math.round((1 - d.lowestTrxPrice / d.lowestBeforePrice) * 1000) / 10
        : null;
      return {
        drugName: d.drugName,
        genericName: d.genericName,
        company: d.companyDisplayName,
        trumpRxPrice: d.lowestTrxPrice,
        originalPrice: d.lowestBeforePrice > 0 ? d.lowestBeforePrice : null,
        savingsPercent: savings,
        slug: d.slug,
        detailUrl: `https://trumprx.gov/p/${d.slug}`
      };
    });

    res.json({
      source: 'TrumpRx.gov',
      count: enriched.length,
      data: enriched
    });
  });
};
