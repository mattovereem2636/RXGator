// medicare-partd.js — Medicare Part D Spending Data (Source #9)
// Provides average Medicare cost-per-claim from CMS Part D spending data
// Data: CMS Medicare Part D Drug Spending Dashboard (via Apify pink_comic scraper)

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'medicare_partd_cache.json');

let cache = {};

// Load cache from disk on startup
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(raw);
      const brandCount = Object.values(cache).reduce((sum, g) => sum + Object.keys(g.brands).length, 0);
      console.log(`[MEDICARE-PARTD] Cache loaded: ${Object.keys(cache).length} generics, ${brandCount} brands`);
    } else {
      console.log('[MEDICARE-PARTD] No cache file found — run import to populate');
    }
  } catch (err) {
    console.error('[MEDICARE-PARTD] Cache load error:', err.message);
  }
}

// Save cache to disk
function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    const brandCount = Object.values(cache).reduce((sum, g) => sum + Object.keys(g.brands).length, 0);
    console.log(`[MEDICARE-PARTD] Cache saved: ${Object.keys(cache).length} generics, ${brandCount} brands`);
  } catch (err) {
    console.error('[MEDICARE-PARTD] Cache save error:', err.message);
  }
}

// Import raw scraped data (array of {brandName, genericName, manufacturerName, totalSpending, totalBeneficiaries, avgSpendPerClaim})
function importData(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, error: 'No records provided' };
  }

  // Deduplicate: keep highest beneficiary count for each brand+generic+manufacturer key
  const grouped = {};
  for (const r of records) {
    if (!r.brandName || !r.genericName || !r.manufacturerName) continue;
    const key = `${r.brandName}|||${r.genericName}|||${r.manufacturerName}`;
    const beneficiaries = parseInt(r.totalBeneficiaries) || 0;
    if (!grouped[key] || beneficiaries > (parseInt(grouped[key].totalBeneficiaries) || 0)) {
      grouped[key] = r;
    }
  }

  const deduped = Object.values(grouped);
  let importedCount = 0;

  // Merge into existing cache (don't reset)
  for (const r of deduped) {
    const genericKey = r.genericName.toLowerCase().trim();

    if (!cache[genericKey]) {
      cache[genericKey] = {
        genericName: r.genericName,
        brands: {}
      };
    }

    const brand = r.brandName;
    if (!cache[genericKey].brands[brand]) {
      cache[genericKey].brands[brand] = {
        brandName: brand,
        genericName: r.genericName,
        overall: null,
        manufacturers: []
      };
    }

    const entry = {
      manufacturerName: r.manufacturerName,
      totalSpending: parseFloat(r.totalSpending) || 0,
      totalBeneficiaries: parseInt(r.totalBeneficiaries) || 0,
      avgSpendPerClaim: parseFloat(r.avgSpendPerClaim) || 0
    };

    if (r.manufacturerName === 'Overall') {
      cache[genericKey].brands[brand].overall = entry;
    } else {
      cache[genericKey].brands[brand].manufacturers.push(entry);
    }

    importedCount++;
  }

  // Sort manufacturers by spending within each brand
  for (const genData of Object.values(cache)) {
    for (const brandData of Object.values(genData.brands)) {
      brandData.manufacturers.sort((a, b) => b.totalSpending - a.totalSpending);
    }
  }

  saveCache();

  const brandCount = Object.values(cache).reduce((sum, g) => sum + Object.keys(g.brands).length, 0);

  return {
    success: true,
    imported: importedCount,
    dedupedFrom: records.length,
    generics: Object.keys(cache).length,
    brands: brandCount
  };
}

// Search for a drug in the cache
// Returns formatted results matching RxGator's search result pattern
function search(drugName) {
  if (!drugName) return null;

  const query = drugName.toLowerCase().trim();
  const results = [];

  for (const [genericKey, genData] of Object.entries(cache)) {
    for (const [brandKey, brandData] of Object.entries(genData.brands)) {
      const brandLower = brandKey.toLowerCase();
      const genericLower = genericKey.toLowerCase();

      // Match on generic name, brand name, or partial match
      const isMatch =
        genericLower.includes(query) ||
        brandLower.includes(query) ||
        query.includes(genericLower.split('/')[0]) ||
        query.includes(brandLower.split(' ')[0]);

      if (isMatch && brandData.overall) {
        results.push({
          source: 'Medicare Part D',
          sourceType: 'government',
          brandName: brandData.brandName,
          genericName: brandData.genericName,
          avgCostPerClaim: brandData.overall.avgSpendPerClaim,
          totalBeneficiaries: brandData.overall.totalBeneficiaries,
          totalSpending: brandData.overall.totalSpending,
          manufacturers: brandData.manufacturers.map(m => ({
            name: m.manufacturerName,
            avgCostPerClaim: m.avgSpendPerClaim,
            beneficiaries: m.totalBeneficiaries
          })),
          note: 'Average Medicare cost per claim (includes copay + plan payment). Actual out-of-pocket cost depends on your plan.',
          howToUse: 'This is the average total cost when filled through Medicare Part D. Your copay depends on your specific plan\'s formulary tier and deductible status. Check Medicare.gov or call your plan for your exact copay.'
        });
      }
    }
  }

  // Sort by beneficiary count (most common formulation first)
  results.sort((a, b) => b.totalBeneficiaries - a.totalBeneficiaries);

  return results.length > 0 ? results : null;
}

// Get cache stats
function getStats() {
  const brandCount = Object.values(cache).reduce((sum, g) => sum + Object.keys(g.brands).length, 0);
  const totalBeneficiaries = Object.values(cache).reduce((sum, g) => {
    return sum + Object.values(g.brands).reduce((bSum, b) => {
      return bSum + (b.overall ? b.overall.totalBeneficiaries : 0);
    }, 0);
  }, 0);

  return {
    source: 'Medicare Part D',
    generics: Object.keys(cache).length,
    brands: brandCount,
    totalBeneficiaries: totalBeneficiaries,
    cacheFile: CACHE_FILE
  };
}

// Initialize on require
loadCache();

module.exports = { search, importData, getStats, loadCache };
