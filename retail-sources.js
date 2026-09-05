/**
 * RxGator — Retail Pharmacy Data Sources
 * Static pricing data for Walmart $4 Program, Costco Pharmacy,
 * Amazon RxPass, and brand-to-generic lookups.
 * @module retail-sources
 */

'use strict';

// ============================================================
// BRAND-TO-GENERIC STATIC LOOKUP
// ============================================================
const brandGenericLookup = require('./brand-generic-lookup.json');

/**
 * Look up brand-to-generic mapping from the static JSON database.
 * @param {string} drugName - The drug name to look up.
 * @returns {Object|null} Brand/generic info or null if not found.
 */
function lookupBrandGeneric(drugName) {
  const key = drugName.toLowerCase().trim();
  const match = brandGenericLookup[key];
  if (match) {
    return {
      isBrandName: true,
      brandName: match.brand,
      genericName: match.generic,
      drugClass: match.drugClass,
      primaryUse: match.primaryUse,
      hasGeneric: match.hasGeneric,
      typicalSavings: match.typicalSavings,
      source: 'static-map'
    };
  }
  return null;
}

// ============================================================
// WALMART PRESCRIPTION PROGRAM — Complete list from official PDF (eff. 9/16/2024)
// Three tiers: $4/$10 (30/90-day), $9/$24, $15/$38
// ============================================================
const WALMART_4_LIST = {
  // === DIABETES ($4/$10) ===
  'glimepiride': { strengths: ['1mg', '2mg', '4mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Diabetes' },
  'glipizide': { strengths: ['5mg', '10mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Diabetes' },
  'metformin': { strengths: ['500mg', '850mg', '1000mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Diabetes' },
  'metformin er': { strengths: ['500mg', '750mg'], form: 'ER Tablet', price30: 4.00, price90: 10.00, category: 'Diabetes' },
  'glipizide er': { strengths: ['2.5mg', '5mg', '10mg'], form: 'ER Tablet', price30: 9.00, price90: 24.00, category: 'Diabetes' },
  'glyburide/metformin': { strengths: ['2.5/500mg', '5/500mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Diabetes' },

  // === CHOLESTEROL ($9/$24) ===
  'fenofibrate': { strengths: ['145mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Cholesterol' },
  'gemfibrozil': { strengths: ['600mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Cholesterol' },
  'simvastatin': { strengths: ['10mg', '20mg', '40mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Cholesterol' },

  // === HEART & BLOOD PRESSURE ($4/$10) ===
  'atenolol': { strengths: ['25mg', '50mg', '100mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'benazepril': { strengths: ['20mg', '40mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'clonidine': { strengths: ['0.1mg', '0.2mg', '0.3mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'furosemide': { strengths: ['20mg', '40mg', '80mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'hydralazine': { strengths: ['10mg', '25mg', '50mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'hydrochlorothiazide': { strengths: ['12.5mg', '25mg', '50mg'], form: 'Tablet/Capsule', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'indapamide': { strengths: ['1.25mg', '2.5mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'isosorbide mononitrate er': { strengths: ['30mg', '60mg'], form: 'ER Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'lisinopril': { strengths: ['2.5mg', '5mg', '10mg', '20mg', '30mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'lisinopril/hctz': { strengths: ['20/25mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'losartan/hctz': { strengths: ['50/12.5mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'metoprolol tartrate': { strengths: ['25mg', '50mg', '100mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'ramipril': { strengths: ['2.5mg', '5mg', '10mg'], form: 'Capsule', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'triamterene/hctz': { strengths: ['37.5/25mg', '75/50mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  'warfarin': { strengths: ['1mg', '2mg', '2.5mg', '3mg', '4mg', '5mg', '6mg', '7.5mg', '10mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Heart & Blood Pressure' },
  // Heart & BP $9/$24
  'amiodarone': { strengths: ['200mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'amlodipine': { strengths: ['2.5mg', '5mg', '10mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'bisoprolol': { strengths: ['5mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'cilostazol': { strengths: ['50mg', '100mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'digoxin': { strengths: ['0.125mg', '0.25mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'diltiazem': { strengths: ['30mg', '60mg', '120mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'diltiazem er': { strengths: ['120mg'], form: 'ER Capsule', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'doxazosin': { strengths: ['1mg', '2mg', '4mg', '8mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'enalapril': { strengths: ['2.5mg', '10mg', '20mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'irbesartan': { strengths: ['150mg', '300mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'losartan': { strengths: ['25mg', '50mg', '100mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'metoprolol er': { strengths: ['25mg', '50mg'], form: 'ER Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'minoxidil': { strengths: ['10mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'torsemide': { strengths: ['20mg', '100mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'valsartan/hctz': { strengths: ['160/12.5mg', '160/25mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'verapamil er': { strengths: ['120mg', '180mg', '240mg'], form: 'ER Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'spironolactone': { strengths: ['50mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'chlorthalidone': { strengths: ['25mg', '50mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },
  'nitroglycerin': { strengths: ['0.4mg'], form: 'SL Tablet', price30: 9.00, price90: 24.00, category: 'Heart & Blood Pressure' },

  // === MENTAL HEALTH ($4/$10) ===
  'amitriptyline': { strengths: ['10mg', '25mg', '50mg', '75mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'buspirone': { strengths: ['5mg', '10mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'citalopram': { strengths: ['10mg', '20mg', '40mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'fluoxetine': { strengths: ['10mg', '20mg', '40mg'], form: 'Tablet/Capsule', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'lithium carbonate': { strengths: ['300mg'], form: 'Capsule', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'nortriptyline': { strengths: ['10mg', '25mg', '50mg'], form: 'Capsule', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'paroxetine': { strengths: ['20mg', '30mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'risperidone': { strengths: ['0.25mg', '0.5mg', '1mg', '2mg', '3mg', '4mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'trazodone': { strengths: ['50mg', '100mg', '150mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  'trihexyphenidyl': { strengths: ['2mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Mental Health' },
  // Mental Health $9/$24
  'amantadine': { strengths: ['100mg'], form: 'Capsule', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'carbidopa/levodopa': { strengths: ['10/100mg', '25/100mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'divalproex dr': { strengths: ['250mg'], form: 'DR Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'donepezil': { strengths: ['5mg', '10mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'lamotrigine': { strengths: ['25mg', '100mg', '150mg', '200mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'levetiracetam': { strengths: ['500mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'lithium carbonate er': { strengths: ['300mg', '450mg'], form: 'ER Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'mirtazapine': { strengths: ['15mg', '30mg', '45mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'oxcarbazepine': { strengths: ['300mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'pramipexole': { strengths: ['0.125mg', '0.25mg', '0.5mg', '1mg', '1.5mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'primidone': { strengths: ['50mg', '250mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'quetiapine': { strengths: ['25mg', '50mg', '100mg', '200mg', '300mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'ropinirole': { strengths: ['0.25mg', '0.5mg', '1mg', '2mg', '3mg', '4mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'sertraline': { strengths: ['25mg', '50mg', '100mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'topiramate': { strengths: ['25mg', '50mg', '100mg', '200mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  'zonisamide': { strengths: ['50mg'], form: 'Capsule', price30: 9.00, price90: 24.00, category: 'Mental Health' },
  // Mental Health $15/$38
  'bupropion': { strengths: ['75mg', '100mg'], form: 'Tablet', price30: 15.00, price90: 38.00, category: 'Mental Health' },
  'bupropion sr': { strengths: ['100mg', '150mg', '200mg'], form: 'SR Tablet', price30: 15.00, price90: 38.00, category: 'Mental Health' },
  'bupropion xl': { strengths: ['150mg'], form: 'XL Tablet', price30: 15.00, price90: 38.00, category: 'Mental Health' },
  'venlafaxine': { strengths: ['37.5mg', '75mg', '100mg'], form: 'Tablet', price30: 15.00, price90: 38.00, category: 'Mental Health' },
  'venlafaxine er': { strengths: ['37.5mg', '75mg', '150mg'], form: 'ER Capsule', price30: 15.00, price90: 38.00, category: 'Mental Health' },

  // === DIGESTION ===
  'metoclopramide': { strengths: ['5mg', '10mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Digestion' },
  'meclizine': { strengths: ['12.5mg', '25mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Digestion' },
  'promethazine': { strengths: ['12.5mg', '25mg'], form: 'Tablet', price30: 15.00, price90: 38.00, category: 'Digestion' },

  // === PAIN MANAGEMENT ===
  'tizanidine': { strengths: ['2mg', '4mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Pain' },
  'methocarbamol': { strengths: ['750mg'], form: 'Tablet', price30: 15.00, price90: 38.00, category: 'Pain' },

  // === THYROID ($4/$10) ===
  'levothyroxine': { strengths: ['25mcg', '50mcg', '75mcg', '88mcg', '100mcg', '112mcg', '125mcg', '137mcg', '150mcg', '175mcg', '200mcg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Thyroid' },

  // === VITAMIN & NUTRITION ===
  'folic acid': { strengths: ['1mg'], form: 'Tablet', price30: 4.00, price90: 10.00, category: 'Vitamin' },

  // === FAMILY PLANNING ($9/$24) ===
  'norethindrone': { strengths: ['0.35mg'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Family Planning' },
  'sprintec': { strengths: ['28-day'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Family Planning' },
  'tri-sprintec': { strengths: ['28-day'], form: 'Tablet', price30: 9.00, price90: 24.00, category: 'Family Planning' },

  // === RESPIRATORY ($24 only) ===
  'albuterol hfa': { strengths: ['90mcg'], form: 'Inhaler', price30: 24.00, price90: 24.00, category: 'Respiratory' },
};

/**
 * Get the Walmart program label based on 30-day price tier.
 * @param {number} price30 - The 30-day price.
 * @returns {string} The program tier label.
 */
function walmartLabel(price30) {
  if (price30 <= 4) return 'Walmart $4 Program';
  if (price30 <= 9) return 'Walmart $9 Program';
  if (price30 <= 15) return 'Walmart $15 Program';
  return 'Walmart Rx Program';
}

/**
 * Build a Walmart pricing note string.
 * @param {Object} m - The Walmart drug entry.
 * @returns {string} The formatted note.
 */
function walmartNote(m) {
  return `Walmart Rx Program: $${m.price30}/30-day, $${m.price90}/90-day. Generic only. In-store pickup. No membership, no coupon needed.${m.category ? ' Category: ' + m.category + '.' : ''}`;
}

/**
 * Query the Walmart $4 prescription list for a drug.
 * Tries exact match first, then partial match.
 * @param {string} drugName - The drug name to search.
 * @returns {Array<Object>} Array of Walmart pricing results, empty if not found.
 */
function queryWalmart(drugName) {
  const key = drugName.toLowerCase().trim();
  const match = WALMART_4_LIST[key];
  if (!match) {
    const partialKey = Object.keys(WALMART_4_LIST).find(k => k.includes(key) || key.includes(k));
    if (partialKey) {
      const m = WALMART_4_LIST[partialKey];
      return m.strengths.map(s => ({
        source: walmartLabel(m.price30),
        sourceUrl: 'https://www.walmart.com/cp/4-dollar-prescriptions/1078664',
        drugName: partialKey.charAt(0).toUpperCase() + partialKey.slice(1),
        strength: s,
        form: m.form,
        unitPrice: +(m.price30 / 30).toFixed(4),
        priceFor30: m.price30,
        priceFor90: m.price90,
        brandGeneric: 'Generic',
        note: walmartNote(m),
      }));
    }
    return [];
  }
  return match.strengths.map(s => ({
    source: walmartLabel(match.price30),
    sourceUrl: 'https://www.walmart.com/cp/4-dollar-prescriptions/1078664',
    drugName: key.charAt(0).toUpperCase() + key.slice(1),
    strength: s,
    form: match.form,
    unitPrice: +(match.price30 / 30).toFixed(4),
    priceFor30: match.price30,
    priceFor90: match.price90,
    brandGeneric: 'Generic',
    note: walmartNote(match),
  }));
}

// ============================================================
// COSTCO PHARMACY ESTIMATED PRICING
// No public API. Per-unit estimates from published reporting.
// No membership needed for Costco pharmacy (federal law).
// ============================================================

/**
 * Estimate Costco pharmacy pricing for a generic drug.
 * @param {string} genericName - The generic drug name.
 * @param {string} strength - The strength (unused in calculation, for context).
 * @param {number} quantity - The quantity to price.
 * @returns {Object|null} Estimated pricing or null if drug not in database.
 */
function estimateCostcoPrice(genericName, strength, quantity) {
  const basePricePerUnit = {
    'metformin': 0.03, 'glipizide': 0.04, 'glimepiride': 0.06,
    'lisinopril': 0.04, 'amlodipine': 0.04, 'losartan': 0.05,
    'atenolol': 0.04, 'metoprolol tartrate': 0.03, 'metoprolol er': 0.08,
    'hydrochlorothiazide': 0.03, 'furosemide': 0.03, 'ramipril': 0.06,
    'warfarin': 0.05, 'clonidine': 0.04, 'valsartan': 0.08,
    'irbesartan': 0.10, 'benazepril': 0.05, 'enalapril': 0.05,
    'spironolactone': 0.06, 'diltiazem': 0.06, 'verapamil er': 0.08,
    'carvedilol': 0.05, 'doxazosin': 0.05, 'chlorthalidone': 0.08,
    'atorvastatin': 0.06, 'simvastatin': 0.04, 'rosuvastatin': 0.06,
    'pravastatin': 0.06, 'fenofibrate': 0.15, 'gemfibrozil': 0.08,
    'sertraline': 0.08, 'fluoxetine': 0.04, 'citalopram': 0.04,
    'escitalopram': 0.08, 'paroxetine': 0.06, 'trazodone': 0.04,
    'buspirone': 0.04, 'amitriptyline': 0.04, 'mirtazapine': 0.06,
    'bupropion': 0.10, 'venlafaxine': 0.08, 'quetiapine': 0.06,
    'lamotrigine': 0.06, 'risperidone': 0.05, 'donepezil': 0.05,
    'topiramate': 0.05, 'nortriptyline': 0.10,
    'omeprazole': 0.07, 'pantoprazole': 0.06, 'lansoprazole': 0.08,
    'famotidine': 0.03, 'metoclopramide': 0.04,
    'levothyroxine': 0.15,
    'montelukast': 0.10, 'cetirizine': 0.04, 'loratadine': 0.04,
    'gabapentin': 0.05, 'naproxen': 0.04, 'meloxicam': 0.04,
    'tizanidine': 0.06, 'methocarbamol': 0.06,
    'tamsulosin': 0.06, 'finasteride': 0.08, 'allopurinol': 0.04,
    'methotrexate': 0.30, 'prednisone': 0.05, 'colchicine': 0.40,
    'doxycycline': 0.08, 'amoxicillin': 0.06, 'ciprofloxacin': 0.10,
  };
  const key = genericName.toLowerCase();
  if (basePricePerUnit[key]) {
    return {
      unitPrice: basePricePerUnit[key],
      totalPrice: +(basePricePerUnit[key] * quantity).toFixed(2),
      source: 'Costco Pharmacy (estimated)',
      note: 'No membership required to use Costco pharmacy (federal law). Prices are estimates based on published reporting.'
    };
  }
  return null;
}

// ============================================================
// AMAZON RXPASS ($5/month — Prime members, 55+ generics)
// ============================================================
const AMAZON_RXPASS_DRUGS = {
  'allopurinol':1,'amlodipine':1,'amoxicillin':1,'atorvastatin':1,'azelastine':1,
  'benztropine':1,'biotin':1,'bupropion':1,'cephalexin':1,'cyclobenzaprine':1,
  'cyanocobalamin':1,'cyproheptadine':1,'donepezil':1,'doxazosin':1,'doxepin':1,
  'doxycycline':1,'dutasteride':1,'escitalopram':1,'estradiol':1,'finasteride':1,
  'fluticasone':1,'folic acid':1,'furosemide':1,'glipizide':1,'glyburide':1,
  'hyoscyamine':1,'lamotrigine':1,'lisinopril':1,'losartan':1,'methimazole':1,
  'metformin':1,'mometasone':1,'naproxen':1,'nystatin':1,'omeprazole':1,
  'ondansetron':1,'oxybutynin':1,'phenytoin':1,'piroxicam':1,'pramipexole':1,
  'quetiapine':1,'ramipril':1,'risperidone':1,'rizatriptan':1,'ropinirole':1,
  'rosuvastatin':1,'sertraline':1,'sildenafil':1,'simvastatin':1,'sotalol':1,
  'tamoxifen':1,'terazosin':1,'tizanidine':1,'venlafaxine':1,
};

/**
 * Check if a drug is covered by Amazon RxPass ($5/month subscription).
 * @param {string} drugName - The drug name to check.
 * @returns {Array<Object>} Single-element array with RxPass pricing, or empty if not covered.
 */
function queryAmazonRxPass(drugName) {
  const key = drugName.toLowerCase().trim();
  const found = Object.keys(AMAZON_RXPASS_DRUGS).some(d => key.includes(d) || d.includes(key));
  if (!found) return [];

  return [{
    source: 'Amazon RxPass',
    sourceUrl: 'https://pharmacy.amazon.com/rxpass',
    drugName: drugName,
    unitPrice: 0.17,
    priceFor30: 5.00,
    priceFor90: 5.00,
    brandGeneric: 'Generic',
    priceType: 'Mail-Order Subscription',
    note: 'Amazon RxPass: $5/month covers ALL eligible generics (55+ drugs) — not per drug. Requires Amazon Prime ($139/year). Mail-order delivery, 2–5 business days. Not available in all states.',
  }];
}

module.exports = {
  lookupBrandGeneric,
  queryWalmart,
  estimateCostcoPrice,
  queryAmazonRxPass,
};
