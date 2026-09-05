/**
 * RxGator — Drug Information APIs
 * Queries openFDA, RxNorm, MedlinePlus, and provides fuzzy drug lookup.
 * @module drug-info
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJSON } = require('./utils');

// ============================================================
// DRUG NAMES DICTIONARY (for client-side Fuse.js autocomplete)
// ============================================================
const DRUG_NAMES_FILE = path.join(__dirname, 'public', 'drug-names.json');
let drugNamesDictionary = [];

/**
 * Load the drug names dictionary from the public JSON file.
 * Populates the in-memory array and logs the entry count.
 */
function loadDrugNamesDictionary() {
  try {
    if (fs.existsSync(DRUG_NAMES_FILE)) {
      drugNamesDictionary = JSON.parse(fs.readFileSync(DRUG_NAMES_FILE, 'utf8'));
      console.log(`[DRUG DICT] Loaded: ${drugNamesDictionary.length} entries`);
    }
  } catch (err) {
    console.error('[DRUG DICT] Load error:', err.message);
  }
}

/**
 * Query the openFDA NDC database for drug normalization data.
 * Filters to finished human products and deduplicates by generic name + form + strength.
 * @param {string} drugName - The drug name to search.
 * @returns {Promise<Array<Object>>} Array of normalized drug product objects, empty on error.
 */
async function queryOpenFDA(drugName) {
  try {
    const url = `https://api.fda.gov/drug/ndc.json?search=generic_name:"${encodeURIComponent(drugName)}"&limit=20`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    const finished = data.results.filter(r =>
      r.product_type === 'HUMAN PRESCRIPTION DRUG' || r.product_type === 'HUMAN OTC DRUG'
    );

    const seen = new Map();
    for (const r of finished) {
      const strengths = (r.active_ingredients || []).map(i => i.strength).join(', ');
      const key = `${(r.generic_name || '').toLowerCase()}|${r.dosage_form}|${strengths}`;
      if (!seen.has(key)) {
        seen.set(key, {
          genericName: r.generic_name,
          brandName: r.brand_name || r.brand_name_base,
          dosageForm: r.dosage_form,
          activeIngredients: r.active_ingredients || [],
          ndc: r.product_ndc,
          labeler: r.labeler_name,
          productType: r.product_type,
          route: (r.route || []).join(', '),
        });
      }
    }

    return Array.from(seen.values());
  } catch (err) {
    console.error('openFDA API error:', err.message);
    return [];
  }
}

/**
 * Query the RxNorm API for drug normalization and brand-generic resolution.
 * Three-step resolution: (1) approximate match to get RxCUI,
 * (2) check term type — if brand (BN/SBD/SBDF), resolve to ingredient,
 * (3) look up brand names for the resolved generic ingredient.
 * @param {string} drugName - The drug name to search.
 * @returns {Promise<Object|null>} Resolved drug info with rxcui, name, brandNames, or null on error.
 */
async function queryRxNorm(drugName) {
  try {
    const searchUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=5`;
    const searchData = await fetchJSON(searchUrl);
    const candidates = (searchData.approximateGroup || {}).candidate || [];
    if (candidates.length === 0) return null;

    const rxcui = candidates[0].rxcui;
    const matchedName = candidates.find(c => c.name)?.name || drugName;

    const propsData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`).catch(() => null);
    const tty = propsData?.properties?.tty || '';
    let genericName = matchedName;
    let genericRxcui = rxcui;
    let isBrandSearch = false;

    if (tty === 'BN' || tty === 'SBD' || tty === 'SBDF') {
      isBrandSearch = true;
      const inData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`).catch(() => null);
      if (inData?.relatedGroup?.conceptGroup) {
        for (const group of inData.relatedGroup.conceptGroup) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            genericName = group.conceptProperties[0].name;
            genericRxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
    }

    const lookupRxcui = genericRxcui || rxcui;
    const bnData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${lookupRxcui}/related.json?tty=BN`).catch(() => null);

    const brandNames = [];
    if (bnData?.relatedGroup?.conceptGroup) {
      for (const group of bnData.relatedGroup.conceptGroup) {
        if (group.conceptProperties) {
          for (const cp of group.conceptProperties) {
            if (cp.name && !brandNames.includes(cp.name)) {
              brandNames.push(cp.name);
            }
          }
        }
      }
    }

    return {
      rxcui: lookupRxcui,
      name: genericName,
      brandNames: brandNames.slice(0, 8),
      isBrandSearch,
      originalBrandName: isBrandSearch ? matchedName : null,
      source: 'RxNorm (NLM)',
    };
  } catch (err) {
    console.error('RxNorm API error:', err.message);
    return null;
  }
}

/**
 * Query MedlinePlus for consumer drug information using an RxCUI.
 * Returns the primary drug monograph title, summary, link, and related topics.
 * @param {string} rxcui - The RxNorm Concept Unique Identifier.
 * @returns {Promise<Object|null>} Drug info with title, summary, link, or null on error.
 */
async function queryMedlinePlus(rxcui) {
  if (!rxcui) return null;
  try {
    const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=${rxcui}&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json`;
    const data = await fetchJSON(url);
    const entries = (data.feed || {}).entry || [];
    if (entries.length === 0) return null;

    const primary = entries[0];
    const title = (primary.title || {})._value || '';
    const summaryRaw = (primary.summary || {})._value || '';
    const summary = summaryRaw.replace(/<[^>]*>/g, '').trim();
    const link = (primary.link || [{}])[0]?.href || '';

    const relatedTopics = entries.slice(1, 4).map(e => ({
      title: (e.title || {})._value || '',
      link: (e.link || [{}])[0]?.href || '',
    })).filter(t => t.title);

    return {
      title,
      summary: summary.length > 500 ? summary.substring(0, 500) + '...' : summary,
      fullSummary: summary,
      link,
      relatedTopics,
      source: 'MedlinePlus (NLM)',
    };
  } catch (err) {
    console.error('MedlinePlus API error:', err.message);
    return null;
  }
}

/**
 * Fuzzy drug name lookup via RxNorm approximate match API.
 * Deduplicates by name and returns up to 5 ranked suggestions.
 * @param {string} query - The misspelled or partial drug name.
 * @returns {Promise<Array<Object>>} Array of {name, rxcui, rank} suggestions, empty on error.
 */
async function fuzzyDrugLookup(query) {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=5`;
    const data = await fetchJSON(url);
    const candidates = (data?.approximateGroup?.candidate) || [];
    if (candidates.length === 0) return [];

    const seen = new Set();
    const results = [];
    for (const c of candidates) {
      const name = c.name || '';
      const rxcui = c.rxcui;
      const score = parseInt(c.rank) || 0;
      const nameLC = name.toLowerCase().trim();

      if (!nameLC || seen.has(nameLC)) continue;
      seen.add(nameLC);

      results.push({
        name: name,
        rxcui: rxcui,
        rank: score,
      });
    }

    return results.slice(0, 5);
  } catch (err) {
    console.error('[FUZZY] RxNorm approximate match error:', err.message);
    return [];
  }
}

module.exports = {
  loadDrugNamesDictionary,
  queryOpenFDA,
  queryRxNorm,
  queryMedlinePlus,
  fuzzyDrugLookup,
};
