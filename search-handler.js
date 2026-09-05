/**
 * RxGator — Unified Search Endpoint
 * Main /api/search route: resolves drug names, queries all pricing sources
 * in parallel, normalizes results, and returns a sorted response.
 * Also includes /api/search-count and /api/health.
 *
 * NOTE: This file is ~460 lines. The /api/search handler is a single
 * cohesive function that cannot be meaningfully split further. Flagged
 * for future decomposition of the price normalization section.
 *
 * @module search-handler
 */

'use strict';

const path = require('path');
const fsPromises = require('fs').promises;
const { safeUrl, csvEscape, escapeHtml } = require('./utils');
const { queryCostPlus, queryNADAC } = require('./data-sources');
const { loadDrugNamesDictionary, queryOpenFDA, queryRxNorm, queryMedlinePlus, fuzzyDrugLookup } = require('./drug-info');
const { queryFUL, queryMfrAssist, queryMedicarePartD, checkDrugShortage, checkDrugRecall } = require('./govt-data');
const { lookupBrandGeneric, queryWalmart, estimateCostcoPrice, queryAmazonRxPass } = require('./retail-sources');
const { querySingleCare, queryGoodRx } = require('./cache-manager');
const vaFss = require('./va-fss');
const iraNegotiated = require('./ira-negotiated');
const texasWac = require('./texas-wac');
const rxOutreach = require('./rxoutreach');
const rxsaver = require('./rxsaver');
const blink = require('./blink');
const optum = require('./optum');
const fuzzySearch = require('./fuzzy-search');

/**
 * Log a search to the analytics CSV file.
 * @param {Object} req - Express request object.
 * @param {string} drug - Drug name searched.
 * @param {number} quantity - Quantity requested.
 * @param {string|null} zip - Zip code or null.
 * @param {Object} results - Search response object.
 * @param {Object} extras - Additional log fields.
 * @param {string} LOG_FILE - Path to the log CSV.
 */
async function logSearch(req, drug, quantity, zip, results, extras, LOG_FILE) {
  try {
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    let user = 'unknown';
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
        user = decoded.split(':')[0];
      } catch(e) {}
    }
    const lowest = results.pricingResults && results.pricingResults.length > 0 ? results.pricingResults[0] : null;
    const sourcesHit = results.pricingResults ? results.pricingResults.length : 0;
    const lowestPrice = lowest ? (lowest.priceFor30 || 0).toFixed(2) : '';
    const lowestSource = lowest ? lowest.source : '';
    const autocomplete = extras.autocomplete ? '1' : '0';
    const corrected = extras.correctedFrom || '';
    const lang = extras.lang || 'en';
    const line = `${timestamp},${csvEscape(ip)},${csvEscape(user)},${csvEscape(drug)},${quantity},${zip || ''},${sourcesHit},${csvEscape(lowestPrice)},${csvEscape(lowestSource)},${autocomplete},${csvEscape(corrected)},${lang}\n`;
    await fsPromises.appendFile(LOG_FILE, line);
  } catch (err) {
    console.error('Log error:', err.message);
  }
}

/**
 * Mount the search, search-count, and health routes on the Express app.
 * @param {Object} app - Express application instance.
 * @param {Object} deps - Dependencies from server.js.
 * @param {Function} deps.searchLimiter - Rate limiter middleware.
 * @param {string} deps.LOG_FILE - Path to the search log CSV.
 */
module.exports = function(app, { searchLimiter, LOG_FILE }) {

  loadDrugNamesDictionary();

  // ============================================================
  // UNIFIED SEARCH ENDPOINT
  // ============================================================
  app.get('/api/search', searchLimiter, async (req, res) => {
    const { drug, quantity, zip, ac, lang } = req.query;
    if (!drug || drug.trim().length < 2) {
      return res.status(400).json({ error: 'Please provide a drug name (min 2 characters)' });
    }
    if (drug.trim().length > 100) {
      return res.status(400).json({ error: 'Drug name too long (max 100 characters)' });
    }
    if (!/^[a-zA-Z0-9 \-\/\.,']+$/.test(drug.trim())) {
      return res.status(400).json({ error: 'Drug name contains invalid characters' });
    }
    let drugName = drug.trim();
    const originalInput = drugName;

    // ── PHASE 0: Fuzzy spelling correction ──────────────────────
    const fuzzyResolved = await fuzzySearch.resolve(drugName);
    if (fuzzyResolved.corrected) {
      console.log(`[FuzzySearch] Corrected "${drugName}" → "${fuzzyResolved.searchTerm}"`);
      drugName = fuzzyResolved.searchTerm;
    }
    const qty = parseInt(quantity) || 30;
    const zipCode = (zip || '').replace(/\D/g, '').substring(0, 5) || null;

    console.log(`[SEARCH] Drug: "${drugName}", Quantity: ${qty}, Zip: ${zipCode || 'not provided'}`);

    // ── PHASE 1: Brand → Generic resolution ─────────────────────
    const staticGenericInfo = lookupBrandGeneric(drugName);
    let genericInfo = staticGenericInfo || null;

    if (staticGenericInfo && staticGenericInfo.hasGeneric) {
      console.log(`[Static Map] Brand "${drugName}" → Generic "${staticGenericInfo.genericName}"`);
    } else if (staticGenericInfo) {
      console.log(`[Static Map] "${drugName}" — no generic available`);
    }

    const rxnormResult = await queryRxNorm(staticGenericInfo && staticGenericInfo.hasGeneric ? staticGenericInfo.genericName : drugName);
    const pricingSearchName = (staticGenericInfo && staticGenericInfo.hasGeneric) ? staticGenericInfo.genericName : (rxnormResult?.name || drugName);
    if (rxnormResult?.isBrandSearch) {
      console.log(`[SEARCH] Brand "${drugName}" resolved to generic "${pricingSearchName}" via RxNorm`);
    }

    // ── PHASE 2: Parallel pricing queries ────────────────────────
    const [costPlusResults, nadacResults, fdaResults, walmartResults, medicarePartDResult] = await Promise.all([
      queryCostPlus(pricingSearchName),
      queryNADAC(pricingSearchName),
      queryOpenFDA(pricingSearchName),
      Promise.resolve(queryWalmart(pricingSearchName)),
      queryMedicarePartD(pricingSearchName),
    ]);

    const rxOutreachResults = rxOutreach.search(pricingSearchName);
    const vaFssResults = vaFss.search(pricingSearchName);
    const iraResults = iraNegotiated.search(pricingSearchName);
    const texasWacResults = texasWac.search(pricingSearchName);
    const rxsaverResults = rxsaver.search(pricingSearchName) || [];
    const blinkResults = blink.search(pricingSearchName) || [];
    const optumResults = optum.search(pricingSearchName) || [];

    const [shortageResult, recallResult] = await Promise.all([
      checkDrugShortage(pricingSearchName),
      checkDrugRecall(pricingSearchName),
    ]);

    // ── PHASE 3: Drug information ────────────────────────────────
    const medlinePlusResult = rxnormResult ? await queryMedlinePlus(rxnormResult.rxcui) : null;

    const costcoResults = [];
    const costcoEst = estimateCostcoPrice(drugName, null, qty);
    if (costcoEst) {
      costcoResults.push({
        source: 'Costco Pharmacy (est.)',
        sourceUrl: 'https://www.costco.com/pharmacy/',
        drugName: drugName.charAt(0).toUpperCase() + drugName.slice(1),
        unitPrice: costcoEst.unitPrice,
        priceFor30: +(costcoEst.unitPrice * 30).toFixed(2),
        priceFor90: +(costcoEst.unitPrice * 90).toFixed(2),
        brandGeneric: 'Generic',
        note: costcoEst.note,
      });
    }

    // ── PHASE 4: Price normalization ──────────────────────────────
    const allPrices = [];

    for (const cp of costPlusResults) {
      allPrices.push({
        source: cp.source, sourceUrl: cp.sourceUrl, drugName: cp.drugName,
        brandName: cp.brandName, strength: cp.strength, form: cp.form, ndc: cp.ndc,
        unitPrice: cp.unitPrice,
        priceForQuantity: +(cp.unitPrice * qty + 10).toFixed(2),
        priceFor30: cp.priceFor30, priceFor90: cp.priceFor90,
        brandGeneric: cp.brandGeneric, note: cp.note, dataFreshness: 'Real-time API',
      });
    }

    for (const wm of walmartResults) {
      allPrices.push({
        source: wm.source, sourceUrl: wm.sourceUrl, drugName: wm.drugName,
        strength: wm.strength, form: wm.form, unitPrice: wm.unitPrice,
        priceForQuantity: qty <= 30 ? wm.priceFor30 : wm.priceFor90,
        priceFor30: wm.priceFor30, priceFor90: wm.priceFor90,
        brandGeneric: wm.brandGeneric, note: wm.note, dataFreshness: 'Published list',
      });
    }

    for (const co of costcoResults) {
      allPrices.push({
        source: co.source, sourceUrl: co.sourceUrl, drugName: co.drugName,
        unitPrice: co.unitPrice,
        priceForQuantity: +(co.unitPrice * qty).toFixed(2),
        priceFor30: co.priceFor30, priceFor90: co.priceFor90,
        brandGeneric: co.brandGeneric, note: co.note, dataFreshness: 'Estimated',
      });
    }

    const amazonResults = queryAmazonRxPass(pricingSearchName);
    for (const am of amazonResults) {
      allPrices.push({
        source: am.source, sourceUrl: am.sourceUrl, drugName: am.drugName,
        unitPrice: am.unitPrice,
        priceForQuantity: 5.00, priceFor30: 5.00, priceFor90: 5.00,
        brandGeneric: am.brandGeneric, priceType: am.priceType,
        note: am.note, dataFreshness: 'Built-in list',
      });
    }

    const singleCareResults = querySingleCare(pricingSearchName);
    for (const sc of singleCareResults) {
      allPrices.push({
        source: sc.source, sourceUrl: sc.sourceUrl, drugName: sc.drugName,
        ndc: sc.ndc, unitPrice: sc.unitPrice,
        priceForQuantity: qty <= 30 ? sc.priceFor30 : sc.priceFor90,
        priceFor30: sc.priceFor30, priceFor90: sc.priceFor90,
        brandGeneric: sc.brandGeneric, note: sc.note,
        dataFreshness: sc.dataFreshness, pharmacies: sc.pharmacies,
        priceHistory: sc.priceHistory,
      });
    }

    const goodRxResults = queryGoodRx(pricingSearchName);
    for (const gr of goodRxResults) {
      allPrices.push({
        source: gr.source, sourceUrl: gr.sourceUrl, drugName: gr.drugName,
        dosage: gr.dosage, form: gr.form, unitPrice: gr.unitPrice,
        priceForQuantity: qty <= 30 ? gr.priceFor30 : gr.priceFor90,
        priceFor30: gr.priceFor30, priceFor90: gr.priceFor90,
        brandGeneric: gr.brandGeneric, note: gr.note,
        dataFreshness: gr.dataFreshness, pharmacies: gr.pharmacies,
      });
    }

    for (const rs of rxsaverResults) {
      allPrices.push({
        source: rs.source, sourceUrl: rs.sourceUrl, drugName: rs.drugName,
        strength: rs.strength, form: rs.form,
        unitPrice: rs.quantity ? +(rs.price / parseInt(rs.quantity)).toFixed(4) : null,
        priceForQuantity: rs.price, priceFor30: rs.price,
        priceFor90: +(rs.price * 3).toFixed(2),
        brandGeneric: 'Generic', pharmacy: rs.pharmacy,
        note: `RxSaver coupon: $${rs.priceFormatted.replace('$', '')} at ${rs.pharmacy} (${rs.quantity || 30}-count). Show coupon at pharmacy counter.`,
        dataFreshness: rs.cachedDate ? `Cached ${new Date(rs.cachedDate).toLocaleDateString()}` : 'Cached',
      });
    }

    for (const bl of blinkResults) {
      allPrices.push({
        source: bl.source, sourceUrl: bl.sourceUrl, drugName: bl.drugName,
        strength: bl.strength, form: bl.form,
        unitPrice: bl.quantity ? +(bl.price / parseInt(bl.quantity)).toFixed(4) : null,
        priceForQuantity: bl.price, priceFor30: bl.price,
        priceFor90: +(bl.price * 3).toFixed(2),
        brandGeneric: 'Generic', pharmacy: bl.pharmacy,
        note: `Blink Health: $${bl.price.toFixed(2)} via ${bl.type} at ${bl.pharmacy} (${bl.quantity || 30}-count). Order online at blinkhealth.com.`,
        dataFreshness: bl.cachedDate ? `Cached ${new Date(bl.cachedDate).toLocaleDateString()}` : 'Cached',
      });
    }

    for (const op of optumResults) {
      allPrices.push({
        source: op.source, sourceUrl: op.sourceUrl, drugName: op.drugName,
        strength: op.strength, form: op.form,
        unitPrice: op.quantity ? +(op.price / parseInt(op.quantity)).toFixed(4) : null,
        priceForQuantity: op.price, priceFor30: op.price,
        priceFor90: +(op.price * 3).toFixed(2),
        brandGeneric: 'Generic', pharmacy: op.pharmacy,
        note: `Optum Perks: $${op.price.toFixed(2)} coupon at ${op.pharmacy}. Show coupon at pharmacy counter.`,
        dataFreshness: op.cachedDate ? `Cached ${new Date(op.cachedDate).toLocaleDateString()}` : 'Cached',
      });
    }

    for (const ro of rxOutreachResults) {
      if (ro.price30Day || ro.price90Day) {
        allPrices.push({
          source: 'Rx Outreach', sourceUrl: safeUrl(ro.sourceUrl),
          drugName: `${ro.drugName} ${ro.strength}`,
          dosage: ro.strength, form: ro.form, unitPrice: ro.pricePerUnit,
          priceForQuantity: qty <= 30 ? ro.price30Day : ro.price90Day,
          priceFor30: ro.price30Day, priceFor90: ro.price90Day,
          brandGeneric: 'Generic',
          note: 'Nonprofit mail-order pharmacy. Free shipping. No insurance required.',
          dataFreshness: 'Scraped formulary',
        });
      }
    }

    // ── PHASE 5: Sort and assemble response ──────────────────────
    allPrices.sort((a, b) => (a.priceFor30 || 999) - (b.priceFor30 || 999));

    const nadacBenchmark = nadacResults.length > 0
      ? {
          lowestNadacPerUnit: Math.min(...nadacResults.map(n => n.nadacPerUnit)),
          averageNadacPerUnit: +(nadacResults.reduce((s, n) => s + n.nadacPerUnit, 0) / nadacResults.length).toFixed(5),
          nadacFor30: +(Math.min(...nadacResults.map(n => n.nadacPerUnit)) * 30).toFixed(2),
          nadacFor90: +(Math.min(...nadacResults.map(n => n.nadacPerUnit)) * 90).toFixed(2),
          note: 'NADAC = what pharmacies actually pay. Any consumer price should be compared against this benchmark.',
          details: nadacResults.slice(0, 5),
        }
      : null;

    const fulBenchmark = queryFUL(pricingSearchName);
    const mfrAssist = queryMfrAssist(pricingSearchName) || queryMfrAssist(drugName);

    const drugInfo = (fdaResults.length > 0 || rxnormResult)
      ? {
          genericName: rxnormResult?.name || (fdaResults[0]?.genericName) || drugName,
          rxcui: rxnormResult?.rxcui || null,
          brandNames: rxnormResult?.brandNames?.length > 0
            ? rxnormResult.brandNames
            : [...new Set(fdaResults.map(f => f.brandName).filter(Boolean))],
          dosageForms: [...new Set(fdaResults.map(f => f.dosageForm).filter(Boolean))],
          availableStrengths: [...new Set(fdaResults.flatMap(f => f.activeIngredients.map(i => i.strength)))],
          route: fdaResults[0]?.route || '',
          productType: fdaResults[0]?.productType || '',
          totalNDCsRegistered: fdaResults.length,
          normalizationSource: rxnormResult ? 'RxNorm + openFDA' : 'openFDA',
          brandSearchResolved: rxnormResult?.isBrandSearch ? `Searched "${rxnormResult.originalBrandName}" → resolved to generic "${rxnormResult.name}"` : null,
        }
      : null;

    const drugInformation = medlinePlusResult || null;

    let fuzzySuggestions = null;
    if (allPrices.length === 0) {
      fuzzySuggestions = await fuzzyDrugLookup(drugName);
    }

    const response = {
      query: { drug: drugName, quantity: qty, zip: zipCode },
      timestamp: new Date().toISOString(),
      drugNormalization: drugInfo,
      drugInformation,
      drugShortage: shortageResult,
      drugRecall: recallResult,
      medicarePartD: medicarePartDResult,
      rxOutreach: rxOutreachResults.length > 0 ? {
        source: 'Rx Outreach', sourceType: 'nonprofit_mail_order',
        description: 'Nonprofit mail-order pharmacy (free shipping, no insurance required)',
        data: rxOutreachResults,
      } : null,
      vaFss: vaFssResults.length > 0 ? {
        source: 'VA Federal Supply Schedule', sourceType: 'government_benchmark',
        description: 'Federal government negotiated price (benchmark — not available to consumers)',
        data: vaFssResults,
      } : null,
      iraNegotiated: iraResults.length > 0 ? {
        source: 'Medicare Negotiated (IRA)', sourceType: 'government_negotiated',
        description: 'Maximum Fair Price under the Inflation Reduction Act (Medicare Part D)',
        data: iraResults,
      } : null,
      texasWac: texasWacResults.length > 0 ? {
        source: 'Texas DSHS (WAC)', sourceType: 'government_benchmark',
        description: 'Wholesale Acquisition Cost — manufacturer list price before any discounts',
        data: texasWacResults,
      } : null,
      pricingResults: allPrices,
      fuzzySuggestions,
      nadacBenchmark,
      fulBenchmark,
      manufacturerAssistance: mfrAssist,
      sourcesQueried: {
        costPlusDrugs: { status: costPlusResults.length > 0 ? 'found' : 'no_match', count: costPlusResults.length },
        walmart4: { status: walmartResults.length > 0 ? 'found' : 'no_match', count: walmartResults.length },
        costco: { status: costcoResults.length > 0 ? 'found' : 'no_match', count: costcoResults.length },
        amazonRxPass: { status: amazonResults.length > 0 ? 'found' : 'no_match', count: amazonResults.length },
        nadac: { status: nadacResults.length > 0 ? 'found' : 'no_match', count: nadacResults.length },
        openFDA: { status: fdaResults.length > 0 ? 'found' : 'no_match', count: fdaResults.length },
        rxNorm: { status: rxnormResult ? 'found' : 'no_match', count: rxnormResult ? 1 : 0 },
        medlinePlus: { status: medlinePlusResult ? 'found' : 'no_match', count: medlinePlusResult ? 1 : 0 },
        singleCare: { status: singleCareResults.length > 0 ? 'found' : 'no_match', count: singleCareResults.length },
        goodRx: { status: goodRxResults.length > 0 ? 'found' : 'no_match', count: goodRxResults.length },
        medicarePartD: { status: medicarePartDResult ? 'found' : 'no_match', count: medicarePartDResult ? 1 : 0 },
        rxOutreach: { status: rxOutreachResults.length > 0 ? 'found' : 'no_match', count: rxOutreachResults.length },
        iraNegotiated: { status: iraResults.length > 0 ? 'found' : 'no_match', count: iraResults.length },
        texasWac: { status: texasWacResults.length > 0 ? 'found' : 'no_match', count: texasWacResults.length },
        vaFss: { status: vaFssResults.length > 0 ? 'found' : 'no_match', count: vaFssResults.length },
        rxSaver: { status: rxsaverResults.length > 0 ? 'found' : 'no_match', count: rxsaverResults.length },
        blinkHealth: { status: blinkResults.length > 0 ? 'found' : 'no_match', count: blinkResults.length },
        fdaRecall: { status: recallResult ? 'found' : 'no_match', count: recallResult ? recallResult.length : 0 },
      },
      genericInfo: genericInfo || null,
      disclaimer: 'Prices shown are estimates from open data sources. Always verify the current price with your pharmacist before filling. This is not medical advice.',
    };

    logSearch(req, drugName, qty, zipCode, response, {
      autocomplete: ac === '1',
      correctedFrom: fuzzyResolved.corrected ? originalInput : '',
      lang: lang || 'en',
    }, LOG_FILE);

    res.json(response);
  });

  // Search count (public — for social proof on landing page)
  app.get('/api/search-count', async (req, res) => {
    try {
      const data = await fsPromises.readFile(LOG_FILE, 'utf8');
      const lines = data.split('\n').filter(l => l.trim());
      res.json({ count: Math.max(0, lines.length - 1) });
    } catch (err) {
      res.json({ count: 0 });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', sources: ['Cost Plus Drugs API', 'NADAC 2026 (pharmacy costs, 6327 drugs)', 'Medicaid FUL', 'openFDA', 'RxNorm (NLM)', 'MedlinePlus (NLM)', 'Medicare Part D (CMS)', 'FDA Drug Shortages', 'SingleCare (cached)', 'GoodRx (cached)', 'Walmart Rx Program', 'Costco Pharmacy (est.)', 'Amazon RxPass', 'Rx Outreach (nonprofit)', 'VA FSS (govt benchmark)', 'IRA Negotiated (Medicare)', 'Texas WAC (mfr list price)', 'RxSaver (cached)', 'Blink Health (cached)', 'FedRx (govt deals, 841 drugs)', 'HealthWarehouse (online, 930 drugs)'] });
  });
};
