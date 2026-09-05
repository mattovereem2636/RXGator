/**
 * RxGator — Live API Data Sources
 * Queries Cost Plus Drugs and NADAC (National Average Drug Acquisition Cost).
 * @module data-sources
 */

'use strict';

const { fetchJSON, safeUrl } = require('./utils');

/**
 * Query the Cost Plus Drugs API for pricing on a given drug.
 * Returns an array of pricing results with source, price, and drug details.
 * Cost Plus formula: (unit cost x quantity) + $5 pharmacy fee + $5 shipping = +$10 flat.
 * @param {string} drugName - The drug name to search.
 * @returns {Promise<Array<Object>>} Array of pricing result objects, empty on error.
 */
async function queryCostPlus(drugName) {
  try {
    const url = `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=${encodeURIComponent(drugName)}`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    return data.results.map(r => {
      const unitPrice = parseFloat(r.unit_price.replace('$', ''));
      return {
        source: 'Cost Plus Drugs',
        sourceUrl: safeUrl(r.url),
        drugName: r.medication_name,
        brandName: r.brand_name,
        strength: r.strength,
        form: r.form,
        ndc: r.ndc,
        unitPrice,
        brandGeneric: r.brand_generic || 'Generic',
        insuranceEligible: r.insurance_eligible === 'Yes',
        note: 'Mail-order only. Price = cost + 15% markup + $5 pharmacy fee + $5 shipping.',
        priceFor30: +(unitPrice * 30 + 10).toFixed(2),
        priceFor90: +(unitPrice * 90 + 10).toFixed(2),
      };
    });
  } catch (err) {
    console.error('Cost Plus API error:', err.message);
    return [];
  }
}

/**
 * Query the NADAC API for pharmacy acquisition costs.
 * NADAC = National Average Drug Acquisition Cost (what pharmacies pay).
 * Deduplicates by description and keeps the most recent entry.
 * @param {string} drugName - The drug name to search.
 * @returns {Promise<Array<Object>>} Array of NADAC pricing objects, empty on error.
 */
async function queryNADAC(drugName) {
  try {
    const searchTerm = drugName.toUpperCase();
    const url = `https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0?` +
      `conditions[0][property]=ndc_description&conditions[0][value]=%25${encodeURIComponent(searchTerm)}%25&conditions[0][operator]=LIKE` +
      `&sort[0][property]=as_of_date&sort[0][order]=desc&limit=30`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    const seen = new Map();
    for (const r of data.results) {
      const key = r.ndc_description;
      if (!seen.has(key) || r.as_of_date > seen.get(key).as_of_date) {
        seen.set(key, r);
      }
    }

    return Array.from(seen.values()).map(r => ({
      source: 'NADAC Benchmark',
      drugDescription: r.ndc_description,
      ndc: r.ndc,
      nadacPerUnit: parseFloat(r.nadac_per_unit),
      pricingUnit: r.pricing_unit,
      effectiveDate: r.effective_date,
      asOfDate: r.as_of_date,
      classification: r.classification_for_rate_setting === 'G' ? 'Generic' : 'Brand',
      otc: r.otc === 'Y',
      note: 'NADAC = National Average Drug Acquisition Cost. This is what pharmacies pay on average — retail price will be higher.',
      priceFor30: +(parseFloat(r.nadac_per_unit) * 30).toFixed(2),
      priceFor90: +(parseFloat(r.nadac_per_unit) * 90).toFixed(2),
    }));
  } catch (err) {
    console.error('NADAC API error:', err.message);
    return [];
  }
}

module.exports = {
  queryCostPlus,
  queryNADAC,
};
