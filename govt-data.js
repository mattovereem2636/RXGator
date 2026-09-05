/**
 * RxGator — Government & Safety Data Sources
 * Medicare Part D spending, FUL benchmarks, manufacturer assistance,
 * FDA shortage checks, and FDA recall checks.
 * @module govt-data
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJSON } = require('./utils');

// ============================================================
// MEDICAID FEDERAL UPPER LIMIT (FUL) CACHE
// ============================================================
const FUL_CACHE_FILE = path.join(__dirname, 'ful_cache.json');
let fulCache = {};

/**
 * Load the FUL cache from disk on startup.
 */
function loadFulCache() {
  try {
    if (fs.existsSync(FUL_CACHE_FILE)) {
      const raw = fs.readFileSync(FUL_CACHE_FILE, 'utf8');
      fulCache = JSON.parse(raw);
      console.log(`[FUL] Cache loaded: ${Object.keys(fulCache).length} drugs`);
    } else {
      fulCache = {};
      console.log('[FUL] No cache file found');
    }
  } catch (err) {
    console.error('[FUL] Cache load error:', err.message);
    fulCache = {};
  }
}

/**
 * Query the FUL cache for Medicaid reimbursement benchmarks.
 * Tries exact match first, then partial. Prefers tablet forms.
 * @param {string} drugName - The drug name to search.
 * @returns {Object|null} FUL pricing data or null if not found.
 */
function queryFUL(drugName) {
  const key = drugName.toLowerCase().trim();
  let entries = fulCache[key];
  if (!entries) {
    for (const [name, data] of Object.entries(fulCache)) {
      if (name.includes(key) || key.includes(name.split(' ')[0])) {
        entries = data;
        break;
      }
    }
  }
  if (!entries || entries.length === 0) return null;

  const tablets = entries.filter(e => e.dosage.toLowerCase().includes('tablet'));
  const best = tablets.length > 0 ? tablets : entries;
  const lowest = best.reduce((min, e) => e.ful < min.ful ? e : min);

  return {
    ingredient: lowest.ingredient,
    strength: lowest.strength,
    dosage: lowest.dosage,
    fulPerUnit: lowest.ful,
    wampPerUnit: lowest.wamp,
    fulFor30: +(lowest.ful * 30).toFixed(2),
    fulFor90: +(lowest.ful * 90).toFixed(2),
    dataDate: `${lowest.year}-${String(lowest.month).padStart(2, '0')}`,
    allStrengths: entries.map(e => ({
      strength: e.strength,
      dosage: e.dosage,
      ful: e.ful,
      wamp: e.wamp,
    })),
  };
}

loadFulCache();

// ============================================================
// MANUFACTURER ASSISTANCE DATABASE
// ============================================================
const MFR_ASSIST_FILE = path.join(__dirname, 'manufacturer_assistance.json');
let mfrAssistDB = {};

/**
 * Load the manufacturer assistance database from disk on startup.
 */
function loadMfrAssist() {
  try {
    if (fs.existsSync(MFR_ASSIST_FILE)) {
      const raw = fs.readFileSync(MFR_ASSIST_FILE, 'utf8');
      mfrAssistDB = JSON.parse(raw);
      console.log(`[MFR ASSIST] Loaded: ${Object.keys(mfrAssistDB).length} drugs`);
    }
  } catch (err) {
    console.error('[MFR ASSIST] Load error:', err.message);
  }
}

/**
 * Query the manufacturer assistance database for patient savings programs.
 * Tries exact match, then partial match, then brand name match.
 * @param {string} drugName - The drug name to search.
 * @returns {Object|null} Assistance program data or null if not found.
 */
function queryMfrAssist(drugName) {
  const key = drugName.toLowerCase().trim();
  if (mfrAssistDB[key]) return mfrAssistDB[key];
  for (const [name, data] of Object.entries(mfrAssistDB)) {
    if (key.includes(name) || name.includes(key)) return data;
    if (data.brandNames && data.brandNames.some(b => b.toLowerCase() === key)) return data;
  }
  return null;
}

loadMfrAssist();

// ============================================================
// MEDICARE PART D SPENDING DATA (CMS) — Live API
// ============================================================
const CMS_PARTD_DATASET_ID = '7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b';

/**
 * Query the CMS Medicare Part D spending dataset for a drug.
 * Returns aggregate spending, beneficiary count, avg cost per claim, and trend.
 * @param {string} drugName - The drug name to search.
 * @returns {Promise<Object|null>} Medicare spending data or null on error/no match.
 */
async function queryMedicarePartD(drugName) {
  try {
    const url = `https://data.cms.gov/data-api/v1/dataset/${CMS_PARTD_DATASET_ID}/data?keyword=${encodeURIComponent(drugName)}&size=50`;
    const data = await fetchJSON(url);
    if (!Array.isArray(data) || data.length === 0) return null;

    const nameLC = drugName.toLowerCase();
    const isComboSearch = drugName.includes('/') || drugName.includes('-');
    const overallRows = data.filter(d =>
      d.Mftr_Name === 'Overall' &&
      (d.Brnd_Name.toLowerCase().includes(nameLC) ||
       d.Gnrc_Name.toLowerCase().includes(nameLC))
    );

    if (overallRows.length === 0) return null;

    let candidates = isComboSearch
      ? overallRows
      : overallRows.filter(d => !d.Gnrc_Name.includes('/'));

    if (candidates.length === 0) candidates = overallRows;

    candidates.sort((a, b) => {
      const beneA = parseInt(a.Tot_Benes_2023) || parseInt(a.Tot_Benes_2022) || 0;
      const beneB = parseInt(b.Tot_Benes_2023) || parseInt(b.Tot_Benes_2022) || 0;
      return beneB - beneA;
    });

    const best = candidates[0];

    const years = ['2023', '2022', '2021', '2020'];
    let latestYear = null;
    let spending = null;
    let beneficiaries = null;
    let avgCostPerClaim = null;
    let totalClaims = null;

    for (const yr of years) {
      const s = parseFloat(best[`Tot_Spndng_${yr}`]);
      if (!isNaN(s) && s > 0) {
        latestYear = yr;
        spending = s;
        beneficiaries = parseInt(best[`Tot_Benes_${yr}`]) || 0;
        avgCostPerClaim = parseFloat(best[`Avg_Spnd_Per_Clm_${yr}`]) || 0;
        totalClaims = parseInt(best[`Tot_Clms_${yr}`]) || 0;
        break;
      }
    }

    if (!latestYear) return null;

    const trend = [];
    for (const yr of years) {
      const avg = parseFloat(best[`Avg_Spnd_Per_Clm_${yr}`]);
      if (!isNaN(avg) && avg > 0) {
        trend.push({ year: parseInt(yr), avgCostPerClaim: avg });
      }
    }
    trend.reverse();

    return {
      source: 'Medicare Part D (CMS)',
      brandName: best.Brnd_Name,
      genericName: best.Gnrc_Name,
      dataYear: latestYear,
      totalSpending: spending,
      totalBeneficiaries: beneficiaries,
      totalClaims,
      avgCostPerClaim,
      trend,
      note: `In ${latestYear}, ${beneficiaries.toLocaleString()} Medicare beneficiaries filled this prescription at an average cost of $${avgCostPerClaim.toFixed(2)} per claim. Total Medicare spending: $${(spending / 1e6).toFixed(1)}M.`,
    };
  } catch (err) {
    console.error('Medicare Part D API error:', err.message);
    return null;
  }
}

/**
 * Check the FDA Drug Shortages API for active supply issues.
 * Only returns shortages with status "Current" or "Ongoing".
 * @param {string} drugName - The drug name to check.
 * @returns {Promise<Array<Object>|null>} Active shortage records or null if none.
 */
async function checkDrugShortage(drugName) {
  try {
    const searchTerm = encodeURIComponent(drugName.toLowerCase());
    const url = `https://api.fda.gov/drug/shortages.json?search=generic_name:${searchTerm}&limit=10`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return null;

    const active = data.results.filter(r =>
      r.status === 'Current' || r.status === 'Ongoing'
    );

    if (active.length === 0) return null;

    return active.map(s => ({
      drugName: s.generic_name,
      status: s.status,
      reason: s.related_info || 'No details available',
      company: s.company_name || null,
      dosageForm: s.dosage_form || null,
      initialDate: s.initial_posting_date || null,
      updateDate: s.update_date || null,
    }));
  } catch (err) {
    if (!err.message.includes("404")) console.error("FDA Shortage check error:", err.message);
    return null;
  }
}

/**
 * Check the openFDA Enforcement API for active drug recalls.
 * Only surfaces recent recalls: Class I within 2 years, Class II/III within 6 months.
 * @param {string} drugName - The drug name to check.
 * @returns {Promise<Array<Object>|null>} Active recall records or null if none.
 */
async function checkDrugRecall(drugName) {
  try {
    const searchTerm = encodeURIComponent(drugName.toLowerCase());
    const url = `https://api.fda.gov/drug/enforcement.json?search=(openfda.generic_name:"${searchTerm}"+product_description:"${searchTerm}")+AND+status:"Ongoing"&limit=25`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return null;

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const parseRecallDate = (dateStr) => {
      if (!dateStr || dateStr.length !== 8) return null;
      return new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
    };

    const filtered = data.results.filter(r => {
      const rDate = parseRecallDate(r.recall_initiation_date);
      if (!rDate) return false;
      if (r.classification === 'Class I') return rDate >= twoYearsAgo;
      return rDate >= sixMonthsAgo;
    });

    if (filtered.length === 0) return null;

    return filtered.map(r => ({
      recallNumber: r.recall_number || null,
      classification: r.classification || null,
      product: r.product_description || null,
      reason: r.reason_for_recall || 'No details available',
      company: r.recalling_firm || null,
      recallDate: r.recall_initiation_date || null,
      city: r.city || null,
      state: r.state || null,
      distribution: r.distribution_pattern || null,
      quantity: r.product_quantity || null,
      lotNumbers: r.code_info || null,
      voluntaryMandated: r.voluntary_mandated || null,
    }));
  } catch (err) {
    if (err.message && err.message.includes('404')) return null;
    console.error('FDA Recall check error:', err.message);
    return null;
  }
}

module.exports = {
  queryFUL,
  queryMfrAssist,
  queryMedicarePartD,
  checkDrugShortage,
  checkDrugRecall,
};
