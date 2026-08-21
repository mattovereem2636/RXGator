require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const rateLimit = require('express-rate-limit');
const vaFss = require('./va-fss');
const iraNegotiated = require('./ira-negotiated');
const texasWac = require('./texas-wac');
const rxOutreach = require('./rxoutreach');
const rxsaver = require('./rxsaver');
const fuzzySearch = require('./fuzzy-search');
fuzzySearch.init(path.join(__dirname, 'data'));

// Global error handlers — log and exit for clean PM2 restart
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

const blink = require('./blink');
// HTML escaping for safe rendering in admin views
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// PHASE A: Static Brand-to-Generic Mapping
// Fast O(1) lookup BEFORE any API calls
// ============================================
const brandGenericLookup = require('./brand-generic-lookup.json');

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
const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? true
    : ['https://rxgator.info', 'https://www.rxgator.info'],
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200,
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com", "https://cloud.umami.is"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cloud.umami.is"],
      frameSrc: ["https://googleads.g.doubleclick.net"],
    },
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
require("./health-report")(app);
require("./trumprx-prices")(app);
require("./nadac-prices")(app);
require("./healthwarehouse-prices")(app);

// Rate limiting for search API — 30 requests per minute per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many searches. Please wait a minute and try again.' },
  validate: false,
  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

// Rate limiting for feedback — 5 submissions per 15 minutes per IP
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please wait and try again.' },
  validate: false,
  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

const PORT = process.env.PORT || 3100;
const LOG_FILE = path.join(__dirname, 'search_log.csv');

// Initialize log file with headers if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, 'timestamp,ip,user,drug,quantity,zip,sources_hit,lowest_price,lowest_source,autocomplete,corrected_from,lang\n');
}

// ============================================================
// SINGLECARE DATA CACHE
// ============================================================
const SC_CACHE_FILE = path.join(__dirname, 'singlecare_cache.json');
let singleCareCache = {};

function loadSingleCareCache() {
  try {
    if (fs.existsSync(SC_CACHE_FILE)) {
      const raw = fs.readFileSync(SC_CACHE_FILE, 'utf8');
      singleCareCache = JSON.parse(raw);
      const drugCount = Object.keys(singleCareCache).length;
      console.log(`[SINGLECARE] Cache loaded: ${drugCount} drugs`);
    } else {
      singleCareCache = {};
      console.log('[SINGLECARE] No cache file found — starting empty');
    }
  } catch (err) {
    console.error('[SINGLECARE] Cache load error:', err.message);
    singleCareCache = {};
  }
}

function saveSingleCareCache() {
  try {
    fs.writeFileSync(SC_CACHE_FILE, JSON.stringify(singleCareCache, null, 2));
  } catch (err) {
    console.error('[SINGLECARE] Cache save error:', err.message);
  }
}

function querySingleCare(drugName) {
  const key = drugName.toLowerCase().trim();
  const entry = singleCareCache[key];
  if (!entry || !entry.lowestPrice) return [];

  const results = [];

  // Add the lowest price entry
  results.push({
    source: 'SingleCare',
    sourceUrl: entry.url || `https://www.singlecare.com/prescription/${encodeURIComponent(key)}`,
    drugName: entry.drugName || drugName,
    ndc: entry.ndc || null,
    unitPrice: entry.quantity ? +(entry.lowestPrice / entry.quantity).toFixed(4) : null,
    priceFor30: entry.quantity === 90 ? +(entry.lowestPrice / 3).toFixed(2) : entry.lowestPrice,
    priceFor90: entry.quantity === 90 ? entry.lowestPrice : +(entry.lowestPrice * 3).toFixed(2),
    brandGeneric: entry.isGeneric ? 'Generic' : (entry.drugType || 'Generic'),
    note: `SingleCare coupon price. Lowest: $${entry.lowestPrice} at ${entry.lowestPricePharmacy || 'participating pharmacy'} (${entry.quantity || 30}-count). Prices vary by pharmacy and location.`,
    dataFreshness: entry.scrapedAt ? `Cached ${new Date(entry.scrapedAt).toLocaleDateString()}` : 'Cached',
    pharmacies: (entry.pharmacies || []).map(p => ({
      name: p.name,
      price: p.price,
      loyaltyPrice: p.loyaltyPrice,
      loyaltyBonusSavings: p.loyaltyBonusSavings,
    })),
    priceHistory: entry.priceHistory || [],
    sideEffects: entry.sideEffects || [],
  });

  return results;
}

// Load cache on startup
loadSingleCareCache();

// ============================================================
// GOODRX DATA CACHE
// ============================================================
const GRX_CACHE_FILE = path.join(__dirname, 'goodrx_cache.json');
let goodRxCache = {};

function loadGoodRxCache() {
  try {
    if (fs.existsSync(GRX_CACHE_FILE)) {
      const raw = fs.readFileSync(GRX_CACHE_FILE, 'utf8');
      goodRxCache = JSON.parse(raw);
      const drugCount = Object.keys(goodRxCache).length;
      console.log(`[GOODRX] Cache loaded: ${drugCount} drugs`);
    } else {
      goodRxCache = {};
      console.log('[GOODRX] No cache file found — starting empty');
    }
  } catch (err) {
    console.error('[GOODRX] Cache load error:', err.message);
    goodRxCache = {};
  }
}

function saveGoodRxCache() {
  try {
    fs.writeFileSync(GRX_CACHE_FILE, JSON.stringify(goodRxCache, null, 2));
  } catch (err) {
    console.error('[GOODRX] Cache save error:', err.message);
  }
}

function queryGoodRx(drugName) {
  const key = drugName.toLowerCase().trim();
  const entry = goodRxCache[key];
  if (!entry || !entry.pharmacies || entry.pharmacies.length === 0) return [];

  const results = [];

  // Find the lowest in-store pharmacy price (exclude mail-order/telehealth)
  const mailOrderNames = ['ro', 'goodrx care', 'alto', 'capsule', 'healthwarehouse', 'amazon pharmacy'];
  const inStorePharmacies = entry.pharmacies.filter(p =>
    !mailOrderNames.includes(p.name.toLowerCase())
  );
  const allPharmacies = entry.pharmacies;

  // Use lowest in-store price as the main result, or lowest overall
  const lowest = inStorePharmacies.length > 0
    ? inStorePharmacies.reduce((min, p) => p.goodrx_price < min.goodrx_price ? p : min)
    : allPharmacies.reduce((min, p) => p.goodrx_price < min.goodrx_price ? p : min);

  const qty = entry.quantity || 30;

  results.push({
    source: 'GoodRx',
    sourceUrl: `https://www.goodrx.com/${encodeURIComponent(key)}`,
    drugName: entry.drugName || drugName,
    dosage: entry.dosage || null,
    form: entry.form || null,
    unitPrice: +(lowest.goodrx_price / qty).toFixed(4),
    priceFor30: qty === 90 ? +(lowest.goodrx_price / 3).toFixed(2) : lowest.goodrx_price,
    priceFor90: qty === 90 ? lowest.goodrx_price : +(lowest.goodrx_price * 3).toFixed(2),
    brandGeneric: 'Generic',
    note: `GoodRx coupon price. Lowest: $${lowest.goodrx_price} at ${lowest.name} (${qty}-count). Show the coupon at the pharmacy counter.`,
    dataFreshness: entry.scrapedAt ? `Cached ${new Date(entry.scrapedAt).toLocaleDateString()}` : 'Cached',
    pharmacies: allPharmacies.map(p => ({
      name: p.name,
      price: p.goodrx_price,
      retailPrice: p.retail_price,
      discount: p.discount_percentage,
    })),
  });

  return results;
}

loadGoodRxCache();

// ============================================================
// MEDICAID FEDERAL UPPER LIMIT (FUL) CACHE
// ============================================================
const FUL_CACHE_FILE = path.join(__dirname, 'ful_cache.json');
let fulCache = {};

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

function queryFUL(drugName) {
  const key = drugName.toLowerCase().trim();
  // Try exact match first, then partial
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

  // Find the most common dosage form (tablet preferred)
  const tablets = entries.filter(e => e.dosage.toLowerCase().includes('tablet'));
  const best = tablets.length > 0 ? tablets : entries;

  // Get the lowest FUL per unit
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

function queryMfrAssist(drugName) {
  const key = drugName.toLowerCase().trim();
  // Try exact match
  if (mfrAssistDB[key]) return mfrAssistDB[key];
  // Try partial match
  for (const [name, data] of Object.entries(mfrAssistDB)) {
    if (key.includes(name) || name.includes(key)) return data;
    // Check brand names
    if (data.brandNames && data.brandNames.some(b => b.toLowerCase() === key)) return data;
  }
  return null;
}

loadMfrAssist();

// CSV-escape a value: wrap in quotes and neutralize formula injection characters
function csvEscape(val) {
  let s = String(val || '');
  // Prevent CSV formula injection — prefix dangerous leading chars with a single quote
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Double any internal quotes, then wrap
  return '"' + s.replace(/"/g, '""') + '"';
}

async function logSearch(req, drug, quantity, zip, results, extras = {}) {
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
  // Diabetes $9/$24
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

// ============================================================
// COSTCO PHARMACY ESTIMATED PRICING
// Costco doesn't have a public API. Prices here are per-unit estimates
// derived from published reporting and spot-checks. No membership needed
// to use Costco pharmacy (federal law). These are ballpark — actual
// prices vary by location and may change without notice.
// ============================================================
function estimateCostcoPrice(genericName, strength, quantity) {
  const basePricePerUnit = {
    // Diabetes
    'metformin': 0.03, 'glipizide': 0.04, 'glimepiride': 0.06,
    // Heart & BP
    'lisinopril': 0.04, 'amlodipine': 0.04, 'losartan': 0.05,
    'atenolol': 0.04, 'metoprolol tartrate': 0.03, 'metoprolol er': 0.08,
    'hydrochlorothiazide': 0.03, 'furosemide': 0.03, 'ramipril': 0.06,
    'warfarin': 0.05, 'clonidine': 0.04, 'valsartan': 0.08,
    'irbesartan': 0.10, 'benazepril': 0.05, 'enalapril': 0.05,
    'spironolactone': 0.06, 'diltiazem': 0.06, 'verapamil er': 0.08,
    'carvedilol': 0.05, 'doxazosin': 0.05, 'chlorthalidone': 0.08,
    // Cholesterol
    'atorvastatin': 0.06, 'simvastatin': 0.04, 'rosuvastatin': 0.06,
    'pravastatin': 0.06, 'fenofibrate': 0.15, 'gemfibrozil': 0.08,
    // Mental Health
    'sertraline': 0.08, 'fluoxetine': 0.04, 'citalopram': 0.04,
    'escitalopram': 0.08, 'paroxetine': 0.06, 'trazodone': 0.04,
    'buspirone': 0.04, 'amitriptyline': 0.04, 'mirtazapine': 0.06,
    'bupropion': 0.10, 'venlafaxine': 0.08, 'quetiapine': 0.06,
    'lamotrigine': 0.06, 'risperidone': 0.05, 'donepezil': 0.05,
    'topiramate': 0.05, 'nortriptyline': 0.10,
    // GI / Digestion
    'omeprazole': 0.07, 'pantoprazole': 0.06, 'lansoprazole': 0.08,
    'famotidine': 0.03, 'metoclopramide': 0.04,
    // Thyroid
    'levothyroxine': 0.15,
    // Respiratory
    'montelukast': 0.10, 'cetirizine': 0.04, 'loratadine': 0.04,
    // Pain
    'gabapentin': 0.05, 'naproxen': 0.04, 'meloxicam': 0.04,
    'tizanidine': 0.06, 'methocarbamol': 0.06,
    // Other
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
// DRUG NAMES DICTIONARY (for client-side Fuse.js autocomplete)
// ============================================================
const DRUG_NAMES_FILE = path.join(__dirname, 'public', 'drug-names.json');
let drugNamesDictionary = [];

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

loadDrugNamesDictionary();

// ============================================================
// SERVER-SIDE FUZZY FALLBACK (RxNorm getApproximateMatch)
// ============================================================
async function fuzzyDrugLookup(query) {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=5`;
    const data = await fetchJSON(url);
    const candidates = (data?.approximateGroup?.candidate) || [];
    if (candidates.length === 0) return [];

    // Deduplicate by name and filter to meaningful results
    const seen = new Set();
    const results = [];
    for (const c of candidates) {
      // Get properties to find the actual drug name
      const name = c.name || '';
      const rxcui = c.rxcui;
      const score = parseInt(c.rank) || 0;
      const nameLC = name.toLowerCase().trim();

      if (!nameLC || seen.has(nameLC)) continue;
      seen.add(nameLC);

      // Only include results with reasonable confidence
      // RxNorm rank: lower = better match. Typically 0-100 for good matches
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

// ============================================================
// API HELPERS
// ============================================================

async function fetchJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ============================================================
// COST PLUS DRUGS API
// ============================================================
async function queryCostPlus(drugName) {
  try {
    const url = `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=${encodeURIComponent(drugName)}`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    return data.results.map(r => {
      const unitPrice = parseFloat(r.unit_price.replace('$', ''));
      return {
        source: 'Cost Plus Drugs',
        sourceUrl: r.url,
        drugName: r.medication_name,
        brandName: r.brand_name,
        strength: r.strength,
        form: r.form,
        ndc: r.ndc,
        unitPrice,
        brandGeneric: r.brand_generic || 'Generic',
        insuranceEligible: r.insurance_eligible === 'Yes',
        note: 'Mail-order only. Price = cost + 15% markup + $5 pharmacy fee + $5 shipping.',
        // Cost Plus formula: (unit cost × quantity) + $5 pharmacy fee + $5 shipping = +$10 flat
        priceFor30: +(unitPrice * 30 + 10).toFixed(2),
        priceFor90: +(unitPrice * 90 + 10).toFixed(2),
      };
    });
  } catch (err) {
    console.error('Cost Plus API error:', err.message);
    return [];
  }
}

// ============================================================
// NADAC (National Average Drug Acquisition Cost) API
// ============================================================
async function queryNADAC(drugName) {
  try {
    const searchTerm = drugName.toUpperCase();
    // Use 2025 dataset
    const url = `https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0?` +
      `conditions[0][property]=ndc_description&conditions[0][value]=%25${encodeURIComponent(searchTerm)}%25&conditions[0][operator]=LIKE` +
      `&sort[0][property]=as_of_date&sort[0][order]=desc&limit=30`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    // Deduplicate by description, keep most recent
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

// ============================================================
// openFDA DRUG NORMALIZATION
// ============================================================
async function queryOpenFDA(drugName) {
  try {
    const url = `https://api.fda.gov/drug/ndc.json?search=generic_name:"${encodeURIComponent(drugName)}"&limit=20`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return [];

    // Filter to finished products (not bulk/intermediate)
    const finished = data.results.filter(r =>
      r.product_type === 'HUMAN PRESCRIPTION DRUG' || r.product_type === 'HUMAN OTC DRUG'
    );

    // Deduplicate by generic_name + dosage_form + active strength
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

// ============================================================
// RxNorm API (National Library of Medicine) - Drug Normalization
// Free, no API key, 20 req/sec
// ============================================================
// Three-step resolution: (1) approximate match to get RxCUI,
// (2) check term type — if brand (BN/SBD/SBDF), resolve to ingredient,
// (3) look up brand names for the resolved generic ingredient.
// Returns { rxcui, name, brandNames[], isBrandSearch, originalBrandName }
async function queryRxNorm(drugName) {
  try {
    // Step 1: Get RxCUI via approximate match (handles misspellings)
    const searchUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=5`;
    const searchData = await fetchJSON(searchUrl);
    const candidates = (searchData.approximateGroup || {}).candidate || [];
    if (candidates.length === 0) return null;

    // Get the top-ranked RxCUI
    const rxcui = candidates[0].rxcui;
    const matchedName = candidates.find(c => c.name)?.name || drugName;

    // Step 2: Check if this is a brand name — if so, resolve to generic ingredient
    const propsData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`).catch(() => null);
    const tty = propsData?.properties?.tty || '';
    let genericName = matchedName;
    let genericRxcui = rxcui;
    let isBrandSearch = false;

    if (tty === 'BN' || tty === 'SBD' || tty === 'SBDF') {
      // This is a brand name — resolve to ingredient
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

    // Step 3: Get brand names for the generic ingredient
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

// ============================================================
// MedlinePlus API - Consumer Drug Information
// Free, no registration, 85 req/min
// ============================================================
async function queryMedlinePlus(rxcui) {
  if (!rxcui) return null;
  try {
    const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=${rxcui}&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json`;
    const data = await fetchJSON(url);
    const entries = (data.feed || {}).entry || [];
    if (entries.length === 0) return null;

    // Get the primary drug entry (first one is usually the drug monograph)
    const primary = entries[0];
    const title = (primary.title || {})._value || '';
    const summaryRaw = (primary.summary || {})._value || '';
    // Strip HTML tags for plain text summary
    const summary = summaryRaw.replace(/<[^>]*>/g, '').trim();
    const link = (primary.link || [{}])[0]?.href || '';

    // Get additional related topics
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

// ============================================================
// MEDICARE PART D SPENDING DATA (CMS) — Live API
// Free, no API key, open government data
// ============================================================
const CMS_PARTD_DATASET_ID = '7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b';

async function queryMedicarePartD(drugName) {
  try {
    const url = `https://data.cms.gov/data-api/v1/dataset/${CMS_PARTD_DATASET_ID}/data?keyword=${encodeURIComponent(drugName)}&size=50`;
    const data = await fetchJSON(url);
    if (!Array.isArray(data) || data.length === 0) return null;

    // Filter to "Overall" manufacturer rows (aggregate data) that match the drug
    // Exclude combo drugs (those with "/" in generic name) unless that's what was searched
    const nameLC = drugName.toLowerCase();
    const isComboSearch = drugName.includes('/') || drugName.includes('-');
    const overallRows = data.filter(d =>
      d.Mftr_Name === 'Overall' &&
      (d.Brnd_Name.toLowerCase().includes(nameLC) ||
       d.Gnrc_Name.toLowerCase().includes(nameLC))
    );

    if (overallRows.length === 0) return null;

    // Prefer non-combo drugs unless user searched for a combo
    let candidates = isComboSearch
      ? overallRows
      : overallRows.filter(d => !d.Gnrc_Name.includes('/'));

    // If filtering removed everything, fall back to all matches
    if (candidates.length === 0) candidates = overallRows;

    // Sort by most beneficiaries (2023 first, then 2022) — most popular = standard generic
    candidates.sort((a, b) => {
      const beneA = parseInt(a.Tot_Benes_2023) || parseInt(a.Tot_Benes_2022) || 0;
      const beneB = parseInt(b.Tot_Benes_2023) || parseInt(b.Tot_Benes_2022) || 0;
      return beneB - beneA;
    });

    const best = candidates[0];

    // Get most recent year data (fields are suffixed with year: Tot_Spndng_2023, etc.)
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

    // Build year-over-year trend
    const trend = [];
    for (const yr of years) {
      const avg = parseFloat(best[`Avg_Spnd_Per_Clm_${yr}`]);
      if (!isNaN(avg) && avg > 0) {
        trend.push({ year: parseInt(yr), avgCostPerClaim: avg });
      }
    }
    trend.reverse(); // oldest first

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

// ============================================================
// WALMART $4 LOOKUP
// ============================================================
function walmartLabel(price30) {
  if (price30 <= 4) return 'Walmart $4 Program';
  if (price30 <= 9) return 'Walmart $9 Program';
  if (price30 <= 15) return 'Walmart $15 Program';
  return 'Walmart Rx Program';
}

function walmartNote(m) {
  return `Walmart Rx Program: $${m.price30}/30-day, $${m.price90}/90-day. Generic only. In-store pickup. No membership, no coupon needed.${m.category ? ' Category: ' + m.category + '.' : ''}`;
}

function queryWalmart(drugName) {
  const key = drugName.toLowerCase().trim();
  const match = WALMART_4_LIST[key];
  if (!match) {
    // Try partial match
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
// FDA DRUG SHORTAGE CHECK — Live API
// ============================================================
async function checkDrugShortage(drugName) {
  try {
    const searchTerm = encodeURIComponent(drugName.toLowerCase());
    const url = `https://api.fda.gov/drug/shortages.json?search=generic_name:${searchTerm}&limit=10`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return null;

    // Filter to "Current" shortages only (active supply issues)
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
    // Don't let shortage check failure break the search
    console.error('FDA Shortage check error:', err.message);
    return null;
  }
}

// ============================================================
// FDA DRUG RECALL CHECK (openFDA Enforcement API)
// ============================================================
// Checks for active recalls on the searched drug. Uses the same
// openFDA infrastructure as the pricing queries. The enforcement
// endpoint covers recall data from 2004–present, updated weekly.
// Only returns "Ongoing" recalls (not terminated/completed ones).
// Filtering: many common drugs have dozens of "Ongoing" recalls that are
// years old (e.g., metformin has 23). To avoid cry-wolf alerts, we only
// surface recalls initiated within the last 6 months, OR any Class I
// recall (most serious — reasonable probability of serious health
// consequences or death) within the last 2 years.
async function checkDrugRecall(drugName) {
  try {
    const searchTerm = encodeURIComponent(drugName.toLowerCase());
    // Search both product_description and openfda.generic_name, filtered to Ongoing only
    const url = `https://api.fda.gov/drug/enforcement.json?search=(openfda.generic_name:"${searchTerm}"+product_description:"${searchTerm}")+AND+status:"Ongoing"&limit=25`;
    const data = await fetchJSON(url);
    if (!data.results || data.results.length === 0) return null;

    // Date cutoffs: 6 months for Class II/III, 2 years for Class I
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const parseRecallDate = (dateStr) => {
      if (!dateStr || dateStr.length !== 8) return null;
      // Format: YYYYMMDD
      return new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
    };

    const filtered = data.results.filter(r => {
      const rDate = parseRecallDate(r.recall_initiation_date);
      if (!rDate) return false;
      // Class I (most dangerous): show if within last 2 years
      if (r.classification === 'Class I') return rDate >= twoYearsAgo;
      // Class II/III: show only if within last 6 months
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
    // Don't let recall check failure break the search
    if (err.message && err.message.includes('404')) return null; // no results
    console.error('FDA Recall check error:', err.message);
    return null;
  }
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
  const originalInput = drugName; // preserve for logging

  // ── PHASE 0: Fuzzy spelling correction ──────────────────────
  // Local dictionary match (fuzzy-search.js) catches common misspellings
  // BEFORE any API calls. Example: "metforman" → "metformin"
  const fuzzyResolved = await fuzzySearch.resolve(drugName);
  if (fuzzyResolved.corrected) {
    console.log(`[FuzzySearch] Corrected "${drugName}" → "${fuzzyResolved.searchTerm}"`);
    drugName = fuzzyResolved.searchTerm;
  }
  const qty = parseInt(quantity) || 30;
  const zipCode = (zip || '').replace(/\D/g, '').substring(0, 5) || null;

  console.log(`[SEARCH] Drug: "${drugName}", Quantity: ${qty}, Zip: ${zipCode || 'not provided'}`);

  // ── PHASE 1: Brand → Generic resolution ─────────────────────
  // Two-tier lookup: static map first (instant O(1)), then RxNorm API.
  // This is critical because pricing sources index by generic name —
  // searching "Lipitor" won't find results unless we resolve to "atorvastatin".
  //
  // Phase A: brand-generic-lookup.json — instant, no API call
  const staticGenericInfo = lookupBrandGeneric(drugName);
  let genericInfo = staticGenericInfo || null;

  if (staticGenericInfo && staticGenericInfo.hasGeneric) {
    console.log(`[Static Map] Brand "${drugName}" → Generic "${staticGenericInfo.genericName}"`);
  } else if (staticGenericInfo) {
    console.log(`[Static Map] "${drugName}" — no generic available`);
  }

  // Phase B: RxNorm API — handles drugs not in the static map,
  // plus provides the RxCUI needed for MedlinePlus drug info lookup.
  // If we already resolved via static map, search RxNorm with the generic name.
  const rxnormResult = await queryRxNorm(staticGenericInfo && staticGenericInfo.hasGeneric ? staticGenericInfo.genericName : drugName);

  // pricingSearchName: the name ALL pricing queries use.
  // Priority: static map generic > RxNorm-resolved name > original input
  const pricingSearchName = (staticGenericInfo && staticGenericInfo.hasGeneric) ? staticGenericInfo.genericName : (rxnormResult?.name || drugName);
  if (rxnormResult?.isBrandSearch) {
    console.log(`[SEARCH] Brand "${drugName}" resolved to generic "${pricingSearchName}" via RxNorm`);
  }

  // ── PHASE 2: Parallel pricing queries ────────────────────────
  // Fire all live API calls concurrently. Sync cache lookups are
  // wrapped in Promise.resolve() to fit the Promise.all() pattern.
  // The five async calls (Cost Plus, NADAC, openFDA, Walmart, Medicare)
  // run simultaneously to minimize wall-clock time.
  const [costPlusResults, nadacResults, fdaResults, walmartResults, medicarePartDResult] = await Promise.all([
    queryCostPlus(pricingSearchName),
    queryNADAC(pricingSearchName),
    queryOpenFDA(pricingSearchName),
    Promise.resolve(queryWalmart(pricingSearchName)),
    queryMedicarePartD(pricingSearchName),
  ]);

  // Local cache lookups (sync — no await needed)
  const rxOutreachResults = rxOutreach.search(pricingSearchName);
  const vaFssResults = vaFss.search(pricingSearchName);
  const iraResults = iraNegotiated.search(pricingSearchName);
  const texasWacResults = texasWac.search(pricingSearchName);
  const rxsaverResults = rxsaver.search(pricingSearchName) || [];
  const blinkResults = blink.search(pricingSearchName) || [];

  // Drug shortage + recall checks — run after pricing queries so they
  // don't delay the main results if the FDA API is slow
  const [shortageResult, recallResult] = await Promise.all([
    checkDrugShortage(pricingSearchName),
    checkDrugRecall(pricingSearchName),
  ]);

  // ── PHASE 3: Drug information (requires RxCUI from Phase 1) ─
  const medlinePlusResult = rxnormResult ? await queryMedlinePlus(rxnormResult.rxcui) : null;

  // Build Costco estimates from FDA data
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
  // Every source returns data in its own format. This section normalizes
  // all results into a consistent schema: { source, drugName, unitPrice,
  // priceFor30, priceFor90, priceForQuantity, note, dataFreshness, ... }
  // so the frontend can display them in a single sorted table.
  const allPrices = [];

  // Cost Plus entries
  for (const cp of costPlusResults) {
    allPrices.push({
      source: cp.source,
      sourceUrl: cp.sourceUrl,
      drugName: cp.drugName,
      brandName: cp.brandName,
      strength: cp.strength,
      form: cp.form,
      ndc: cp.ndc,
      unitPrice: cp.unitPrice,
      priceForQuantity: +(cp.unitPrice * qty + 10).toFixed(2),
      priceFor30: cp.priceFor30,
      priceFor90: cp.priceFor90,
      brandGeneric: cp.brandGeneric,
      note: cp.note,
      dataFreshness: 'Real-time API',
    });
  }

  // Walmart entries
  for (const wm of walmartResults) {
    allPrices.push({
      source: wm.source,
      sourceUrl: wm.sourceUrl,
      drugName: wm.drugName,
      strength: wm.strength,
      form: wm.form,
      unitPrice: wm.unitPrice,
      priceForQuantity: qty <= 30 ? wm.priceFor30 : wm.priceFor90,
      priceFor30: wm.priceFor30,
      priceFor90: wm.priceFor90,
      brandGeneric: wm.brandGeneric,
      note: wm.note,
      dataFreshness: 'Published list',
    });
  }

  // Costco entries
  for (const co of costcoResults) {
    allPrices.push({
      source: co.source,
      sourceUrl: co.sourceUrl,
      drugName: co.drugName,
      unitPrice: co.unitPrice,
      priceForQuantity: +(co.unitPrice * qty).toFixed(2),
      priceFor30: co.priceFor30,
      priceFor90: co.priceFor90,
      brandGeneric: co.brandGeneric,
      note: co.note,
      dataFreshness: 'Estimated',
    });
  }

  // Amazon RxPass entries
  const amazonResults = queryAmazonRxPass(pricingSearchName);
  for (const am of amazonResults) {
    allPrices.push({
      source: am.source,
      sourceUrl: am.sourceUrl,
      drugName: am.drugName,
      unitPrice: am.unitPrice,
      priceForQuantity: 5.00,
      priceFor30: 5.00,
      priceFor90: 5.00,
      brandGeneric: am.brandGeneric,
      priceType: am.priceType,
      note: am.note,
      dataFreshness: 'Built-in list',
    });
  }

  // SingleCare entries (from cache)
  const singleCareResults = querySingleCare(pricingSearchName);
  for (const sc of singleCareResults) {
    allPrices.push({
      source: sc.source,
      sourceUrl: sc.sourceUrl,
      drugName: sc.drugName,
      ndc: sc.ndc,
      unitPrice: sc.unitPrice,
      priceForQuantity: qty <= 30 ? sc.priceFor30 : sc.priceFor90,
      priceFor30: sc.priceFor30,
      priceFor90: sc.priceFor90,
      brandGeneric: sc.brandGeneric,
      note: sc.note,
      dataFreshness: sc.dataFreshness,
      pharmacies: sc.pharmacies,
      priceHistory: sc.priceHistory,
    });
  }

  // GoodRx entries (from cache)
  const goodRxResults = queryGoodRx(pricingSearchName);
  for (const gr of goodRxResults) {
    allPrices.push({
      source: gr.source,
      sourceUrl: gr.sourceUrl,
      drugName: gr.drugName,
      dosage: gr.dosage,
      form: gr.form,
      unitPrice: gr.unitPrice,
      priceForQuantity: qty <= 30 ? gr.priceFor30 : gr.priceFor90,
      priceFor30: gr.priceFor30,
      priceFor90: gr.priceFor90,
      brandGeneric: gr.brandGeneric,
      note: gr.note,
      dataFreshness: gr.dataFreshness,
      pharmacies: gr.pharmacies,
    });
  }

  // RxSaver entries (from cache — Apify scraped)
  for (const rs of rxsaverResults) {
    allPrices.push({
      source: rs.source,
      sourceUrl: rs.sourceUrl,
      drugName: rs.drugName,
      strength: rs.strength,
      form: rs.form,
      unitPrice: rs.quantity ? +(rs.price / parseInt(rs.quantity)).toFixed(4) : null,
      priceForQuantity: rs.price,
      priceFor30: rs.price,
      priceFor90: +(rs.price * 3).toFixed(2),
      brandGeneric: 'Generic',
      pharmacy: rs.pharmacy,
      note: `RxSaver coupon: $${rs.priceFormatted.replace('$', '')} at ${rs.pharmacy} (${rs.quantity || 30}-count). Show coupon at pharmacy counter.`,
      dataFreshness: rs.cachedDate ? `Cached ${new Date(rs.cachedDate).toLocaleDateString()}` : 'Cached',
    });
  }

  // Blink Health entries (from cache — Apify scraped)
  for (const bl of blinkResults) {
    allPrices.push({
      source: bl.source,
      sourceUrl: bl.sourceUrl,
      drugName: bl.drugName,
      strength: bl.strength,
      form: bl.form,
      unitPrice: bl.quantity ? +(bl.price / parseInt(bl.quantity)).toFixed(4) : null,
      priceForQuantity: bl.price,
      priceFor30: bl.price,
      priceFor90: +(bl.price * 3).toFixed(2),
      brandGeneric: 'Generic',
      pharmacy: bl.pharmacy,
      note: `Blink Health: $${bl.price.toFixed(2)} via ${bl.type} at ${bl.pharmacy} (${bl.quantity || 30}-count). Order online at blinkhealth.com.`,
      dataFreshness: bl.cachedDate ? `Cached ${new Date(bl.cachedDate).toLocaleDateString()}` : 'Cached',
    });
  }

// Rx Outreach (nonprofit mail-order)
  for (const ro of rxOutreachResults) {
    if (ro.price30Day || ro.price90Day) {
      allPrices.push({
        source: 'Rx Outreach',
        sourceUrl: ro.sourceUrl,
        drugName: `${ro.drugName} ${ro.strength}`,
        dosage: ro.strength,
        form: ro.form,
        unitPrice: ro.pricePerUnit,
        priceForQuantity: qty <= 30 ? ro.price30Day : ro.price90Day,
        priceFor30: ro.price30Day,
        priceFor90: ro.price90Day,
        brandGeneric: 'Generic',
        note: 'Nonprofit mail-order pharmacy. Free shipping. No insurance required.',
        dataFreshness: 'Scraped formulary',
      });
    }
  }

  // ── PHASE 5: Sort and assemble response ──────────────────────
  // Sort consumer-actionable prices lowest-first so the best deal
  // appears at the top of results. Entries with no priceFor30 sort last.
  allPrices.sort((a, b) => (a.priceFor30 || 999) - (b.priceFor30 || 999));

  // NADAC benchmark: what pharmacies pay on average — used by the frontend
  // to show "you're paying X% above pharmacy cost" context
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

  // Federal Upper Limit benchmark
  const fulBenchmark = queryFUL(pricingSearchName);

  // Manufacturer assistance programs
  const mfrAssist = queryMfrAssist(pricingSearchName) || queryMfrAssist(drugName);

  // Drug normalization - merge FDA + RxNorm
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

  // MedlinePlus drug information
  const drugInformation = medlinePlusResult || null;

  // Fuzzy fallback: if no pricing sources matched, query RxNorm's
  // approximate match to suggest "did you mean...?" corrections.
  // This only fires on zero results — it's the last-resort safety net
  // after the Phase 0 dictionary correction already ran.
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
      source: 'Rx Outreach',
      sourceType: 'nonprofit_mail_order',
      description: 'Nonprofit mail-order pharmacy (free shipping, no insurance required)',
      data: rxOutreachResults
    } : null,
    vaFss: vaFssResults.length > 0 ? {
      source: 'VA Federal Supply Schedule',
      sourceType: 'government_benchmark',
      description: 'Federal government negotiated price (benchmark — not available to consumers)',
      data: vaFssResults
    } : null,
iraNegotiated: iraResults.length > 0 ? {
      source: 'Medicare Negotiated (IRA)',
      sourceType: 'government_negotiated',
      description: 'Maximum Fair Price under the Inflation Reduction Act (Medicare Part D)',
      data: iraResults
    } : null,
texasWac: texasWacResults.length > 0 ? {
      source: 'Texas DSHS (WAC)',
      sourceType: 'government_benchmark',
      description: 'Wholesale Acquisition Cost — manufacturer list price before any discounts',
      data: texasWacResults
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

  // Log the search for analytics
  logSearch(req, drugName, qty, zipCode, response, {
    autocomplete: ac === '1',
    correctedFrom: fuzzyResolved.corrected ? originalInput : '',
    lang: lang || 'en',
  });

  res.json(response);
});

// Search count (public — for social proof on landing page)
app.get('/api/search-count', async (req, res) => {
  try {
    const data = await fsPromises.readFile(LOG_FILE, 'utf8');
    const lines = data.split('\n').filter(l => l.trim());
    res.json({ count: Math.max(0, lines.length - 1) }); // minus header row
  } catch (err) {
    res.json({ count: 0 });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sources: ['Cost Plus Drugs API', 'NADAC 2026 (pharmacy costs, 6327 drugs)', 'Medicaid FUL', 'openFDA', 'RxNorm (NLM)', 'MedlinePlus (NLM)', 'Medicare Part D (CMS)', 'FDA Drug Shortages', 'SingleCare (cached)', 'GoodRx (cached)', 'Walmart Rx Program', 'Costco Pharmacy (est.)', 'Amazon RxPass', 'Rx Outreach (nonprofit)', 'VA FSS (govt benchmark)', 'IRA Negotiated (Medicare)', 'Texas WAC (mfr list price)', 'RxSaver (cached)', 'Blink Health (cached)', 'FedRx (govt deals, 841 drugs)', 'HealthWarehouse (online, 930 drugs)'] });
});

// Search log viewer (admin only - protected by Nginx Basic Auth)
app.get('/api/log', async (req, res) => {
  try {
    const log = await fsPromises.readFile(LOG_FILE, 'utf8');
    const lines = log.trim().split('\n');
    const entries = lines.slice(1).reverse(); // newest first

    // Parse CSV entries (handles both old 9-col and new 12-col format)
    const parsed = entries.filter(l => l.trim()).map(line => {
      const cols = line.split(',');
      if (cols.length < 8) return null;
      return {
        timestamp: cols[0],
        ip: (cols[1] || '').replace(/"/g, ''),
        user: (cols[2] || '').replace(/"/g, ''),
        drug: (cols[3] || '').replace(/"/g, ''),
        quantity: cols[4],
        zip: cols[5] || '',
        hits: cols[6],
        price: (cols[7] || '').replace(/"/g, ''),
        source: (cols[8] || '').replace(/"/g, ''),
        autocomplete: cols[9] === '1',
        correctedFrom: (cols[10] || '').replace(/"/g, ''),
        lang: cols[11] || 'en',
      };
    }).filter(Boolean);

    // Count top drugs
    const drugCounts = {};
    parsed.forEach(p => {
      const d = p.drug.toLowerCase();
      drugCounts[d] = (drugCounts[d] || 0) + 1;
    });
    const topDrugs = Object.entries(drugCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Count unique users and IPs
    const uniqueUsers = new Set(parsed.map(p => p.user));
    const uniqueIPs = new Set(parsed.map(p => p.ip));

    // New analytics: autocomplete rate, zero-result rate, correction rate
    const acCount = parsed.filter(p => p.autocomplete).length;
    const acRate = parsed.length > 0 ? ((acCount / parsed.length) * 100).toFixed(1) : '0.0';
    const zeroCount = parsed.filter(p => p.hits === '0' || p.hits === 0).length;
    const zeroRate = parsed.length > 0 ? ((zeroCount / parsed.length) * 100).toFixed(1) : '0.0';
    const correctedCount = parsed.filter(p => p.correctedFrom).length;

    res.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RxGator — Search Log</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F4F6F7; color: #2C3E50; }
  .header { background: linear-gradient(135deg, #1B4F72 0%, #2E75B6 100%); color: #fff; padding: 1.5rem; text-align: center; }
  .header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .header p { font-size: 0.85rem; opacity: 0.8; }
  .container { max-width: 1100px; margin: 1.5rem auto; padding: 0 1rem; }
  .stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .stat-card { background: #fff; border-radius: 8px; padding: 1rem 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); flex: 1; min-width: 140px; }
  .stat-card .num { font-size: 2rem; font-weight: 700; color: #1B4F72; }
  .stat-card .label { font-size: 0.78rem; color: #5D6D7E; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 1.5rem; overflow: hidden; }
  .section h2 { padding: 0.75rem 1.25rem; background: #F2F7FA; font-size: 0.95rem; color: #1B4F72; border-bottom: 1px solid #D6EAF8; }
  .top-drugs { padding: 0.75rem 1.25rem; }
  .top-drug { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #F4F6F7; font-size: 0.9rem; }
  .top-drug:last-child { border-bottom: none; }
  .top-drug .name { font-weight: 600; text-transform: capitalize; }
  .top-drug .count { color: #2E75B6; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th { background: #1B4F72; color: #fff; padding: 0.6rem 0.75rem; text-align: left; font-weight: 600; letter-spacing: 0.3px; position: sticky; top: 0; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #F4F6F7; }
  tr:nth-child(even) td { background: #F9FBFC; }
  tr:hover td { background: #EBF5FB; }
  .drug-name { font-weight: 600; text-transform: capitalize; }
  .price { font-weight: 700; color: #1E8449; }
  .time { color: #5D6D7E; font-size: 0.78rem; }
  .back-link { display: inline-block; margin: 1rem 0; color: #2E75B6; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  .back-link:hover { text-decoration: underline; }
  .empty { padding: 2rem; text-align: center; color: #5D6D7E; }
  .export-btn { float: right; padding: 0.4rem 0.8rem; background: #2E75B6; color: #fff; border: none; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer; text-decoration: none; }
  .export-btn:hover { background: #1B4F72; }
  @media (max-width: 600px) { .stats { flex-direction: column; } table { font-size: 0.75rem; } th, td { padding: 0.4rem; } }
</style>
</head>
<body>
<div class="header">
  <h1>RxGator — Search Log</h1>
  <p>Tester activity and search analytics</p>
</div>
<div class="container">
  <a class="back-link" href="/">&larr; Back to search</a>

  <div class="stats">
    <div class="stat-card"><div class="num">${parsed.length}</div><div class="label">Total Searches</div></div>
    <div class="stat-card"><div class="num">${uniqueIPs.size}</div><div class="label">Unique IPs</div></div>
    <div class="stat-card"><div class="num">${acRate}%</div><div class="label">Autocomplete Rate</div></div>
    <div class="stat-card"><div class="num">${zeroRate}%</div><div class="label">Zero-Result Rate</div></div>
    <div class="stat-card"><div class="num">${correctedCount}</div><div class="label">Fuzzy Corrections</div></div>
    <div class="stat-card"><div class="num">${topDrugs.length > 0 ? escapeHtml(topDrugs[0][0]) : '—'}</div><div class="label">Most Searched Drug</div></div>
  </div>

  <div class="section">
    <h2>Top Searched Drugs</h2>
    <div class="top-drugs">
      ${topDrugs.length > 0 ? topDrugs.map(([drug, count]) =>
        `<div class="top-drug"><span class="name">${escapeHtml(drug)}</span><span class="count">${count} search${count > 1 ? 'es' : ''}</span></div>`
      ).join('') : '<div class="empty">No searches yet</div>'}
    </div>
  </div>

  <div class="section">
    <h2>Search History <a class="export-btn" href="/api/log/csv" download="rxgator_search_log.csv">Export CSV</a></h2>
    ${parsed.length > 0 ? `<div style="max-height:500px; overflow-y:auto;">
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Drug</th><th>Qty</th><th>Results</th><th>Lowest Price</th><th>Best Source</th></tr></thead>
      <tbody>
        ${parsed.map(p => {
          const d = new Date(p.timestamp);
          const timeStr = d.toLocaleDateString('en-US', {month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
          return `<tr>
            <td class="time">${escapeHtml(timeStr)}</td>
            <td>${escapeHtml(p.user)}</td>
            <td class="drug-name">${escapeHtml(p.drug)}</td>
            <td>${escapeHtml(p.quantity)}-day</td>
            <td>${escapeHtml(p.hits)}</td>
            <td class="price">${p.price ? '$' + escapeHtml(p.price) : '—'}</td>
            <td>${escapeHtml(p.source)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>` : '<div class="empty">No searches recorded yet. Try searching for a drug on the main page.</div>'}
  </div>
</div>
</body>
</html>`);
  } catch (err) {
    res.type('text/html').send('<h1>No search log found</h1><p><a href="/">Back to search</a></p>');
  }
});

// CSV export endpoint
app.get('/api/log/csv', async (req, res) => {
  try {
    const log = await fsPromises.readFile(LOG_FILE, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=rxgator_search_log.csv');
    res.send(log);
  } catch (err) {
    res.status(404).send('No log file found');
  }
});

// ============================================================
// FEEDBACK SYSTEM
// ============================================================
const FEEDBACK_FILE = path.join(__dirname, 'feedback_log.csv');
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, 'timestamp,ip,user,helpful,drug,comment\n');
}

app.post('/api/feedback', feedbackLimiter, async (req, res) => {
  try {
    const { helpful, comment, drug } = req.body;
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    let user = 'unknown';
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Basic ')) {
      try { user = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':')[0]; } catch(e) {}
    }
    const line = `${timestamp},${csvEscape(ip)},${csvEscape(user)},${csvEscape(helpful || '')},${csvEscape(drug || '')},${csvEscape((comment || '').replace(/\n/g, ' '))}\n`;
    await fsPromises.appendFile(FEEDBACK_FILE, line);
    console.log(`[FEEDBACK] ${escapeHtml(user)} on "${escapeHtml(drug || '')}": helpful=${helpful}`);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Feedback error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// Feedback viewer (in admin log)
app.get('/api/feedback', async (req, res) => {
  try {
    const log = await fsPromises.readFile(FEEDBACK_FILE, 'utf8');
    const lines = log.trim().split('\n');
    const entries = lines.slice(1).reverse();
    const parsed = entries.filter(l => l.trim()).map(line => {
      const m = line.match(/^([^,]+),([^,]*),([^,]*),([^,]*),("?[^"]*"?),("?.*"?)$/);
      if (!m) return null;
      return { timestamp: m[1], ip: m[2], user: m[3], helpful: m[4], drug: m[5].replace(/^"|"$/g, ''), comment: m[6].replace(/^"|"$/g, '') };
    }).filter(Boolean);

    const yesCount = parsed.filter(p => p.helpful === 'yes').length;
    const noCount = parsed.filter(p => p.helpful === 'no').length;
    const somewhatCount = parsed.filter(p => p.helpful === 'somewhat').length;

    res.type('text/html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RxGator — Feedback</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#F4F6F7; color:#2C3E50; }
  .header { background:linear-gradient(135deg,#1B4F72,#2E75B6); color:#fff; padding:1.5rem; text-align:center; }
  .header h1 { font-size:1.5rem; margin-bottom:0.25rem; }
  .container { max-width:800px; margin:1.5rem auto; padding:0 1rem; }
  .stats { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; }
  .stat { background:#fff; border-radius:8px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.08); flex:1; min-width:120px; text-align:center; }
  .stat .num { font-size:2rem; font-weight:700; color:#1B4F72; }
  .stat .label { font-size:0.75rem; color:#5D6D7E; text-transform:uppercase; }
  .card { background:#fff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); margin-bottom:0.75rem; padding:1rem 1.25rem; }
  .card .meta { font-size:0.78rem; color:#5D6D7E; margin-bottom:0.3rem; }
  .card .helpful { display:inline-block; padding:0.15rem 0.5rem; border-radius:3px; font-size:0.75rem; font-weight:700; }
  .helpful-yes { background:#D5F5E3; color:#145A32; }
  .helpful-somewhat { background:#FDEBD0; color:#A04000; }
  .helpful-no { background:#FADBD8; color:#C0392B; }
  .card .comment { font-size:0.9rem; margin-top:0.3rem; }
  .back { display:inline-block; margin:1rem 0; color:#2E75B6; text-decoration:none; font-weight:600; }
  .back:hover { text-decoration:underline; }
  .empty { padding:2rem; text-align:center; color:#5D6D7E; }
</style></head><body>
<div class="header"><h1>Tester Feedback</h1><p>${parsed.length} responses collected</p></div>
<div class="container">
  <a class="back" href="/">&larr; Back to search</a> &nbsp; <a class="back" href="/api/log">Search log</a>
  <div class="stats">
    <div class="stat"><div class="num">${yesCount}</div><div class="label">Yes, helpful</div></div>
    <div class="stat"><div class="num">${somewhatCount}</div><div class="label">Somewhat</div></div>
    <div class="stat"><div class="num">${noCount}</div><div class="label">Not helpful</div></div>
    <div class="stat"><div class="num">${parsed.filter(p => p.comment).length}</div><div class="label">With comments</div></div>
  </div>
  ${parsed.length === 0 ? '<div class="empty">No feedback yet.</div>' : parsed.map(p => {
    const d = new Date(p.timestamp);
    const time = d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const hClass = p.helpful === 'yes' ? 'helpful-yes' : (p.helpful === 'no' ? 'helpful-no' : 'helpful-somewhat');
    return `<div class="card">
      <div class="meta">${escapeHtml(time)} &middot; ${escapeHtml(p.user)} ${p.drug ? `&middot; searched <strong>${escapeHtml(p.drug)}</strong>` : ''} ${p.helpful ? `&middot; <span class="helpful ${hClass}">${escapeHtml(p.helpful)}</span>` : ''}</div>
      ${p.comment ? `<div class="comment">${escapeHtml(p.comment)}</div>` : '<div class="comment" style="color:#AEB6BF; font-style:italic;">No comment</div>'}
    </div>`;
  }).join('')}
</div></body></html>`);
  } catch (err) {
    res.type('text/html').send('<h1>No feedback yet</h1><p><a href="/">Back</a></p>');
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin authentication middleware — defense in depth
// Nginx handles Basic Auth, but Express verifies too
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

// ============================================================
// SINGLECARE CACHE MANAGEMENT
// ============================================================

// Import Apify dataset JSON into the cache
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

// View cached drugs
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

// Import Apify dataset JSON into the GoodRx cache
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
        // Group by drug name — accumulate pharmacy entries
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
        // Add this pharmacy entry
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
    // Deduplicate pharmacies per drug
    for (const key of Object.keys(goodRxCache)) {
      const seen = new Set();
      goodRxCache[key].pharmacies = goodRxCache[key].pharmacies.filter(p => {
        const pk = `${p.name}|${p.goodrx_price}`;
        if (seen.has(pk)) return false;
        seen.add(pk);
        return true;
      });
      // Sort by price
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

// View cached GoodRx drugs
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
// Rx Outreach cache stats
app.get('/api/rxoutreach/cache', (req, res) => {
  res.json(rxOutreach.stats());
});

// VA FSS cache stats
app.get('/api/va-fss/cache', (req, res) => {
  res.json(vaFss.stats());
});

// VA FSS standalone search
app.get('/api/va-fss/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(vaFss.search(drug));
});
// Rx Outreach standalone search
app.get('/api/rxoutreach/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(rxOutreach.search(drug));
});
// IRA Negotiated Prices
app.get('/api/ira/cache', (req, res) => {
  res.json(iraNegotiated.stats());
});
app.get('/api/ira/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(iraNegotiated.search(drug));
});
// Texas WAC
app.get('/api/texas-wac/cache', (req, res) => {
  res.json(texasWac.stats());
});
app.get('/api/texas-wac/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(texasWac.search(drug));
});

// RxSaver cache stats
app.get('/api/rxsaver/cache', (req, res) => {
  if (req.query.full === 'true') {
    res.json(rxsaver.fullCache());
  } else {
    res.json(rxsaver.stats());
  }
});

// RxSaver standalone search
app.get('/api/rxsaver/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(rxsaver.search(drug));
});

// RxSaver cache reload (after SCP-ing new data)
app.post('/api/rxsaver/reload', requireAdmin, (req, res) => {
  res.json(rxsaver.reload());
});

// Blink Health cache stats
app.get('/api/blink/cache', (req, res) => {
  if (req.query.full === 'true') {
    res.json(blink.fullCache());
  } else {
    res.json(blink.stats());
  }
});

// Blink Health standalone search
app.get('/api/blink/search', (req, res) => {
  const drug = req.query.drug;
  if (!drug) return res.status(400).json({ error: 'Missing drug parameter' });
  res.json(blink.search(drug));
});

// Blink Health cache reload (after SCP-ing new data)
app.post('/api/blink/reload', requireAdmin, (req, res) => {
  res.json(blink.reload());
});

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   RxGator Prototype v0.5                 ║`);
  console.log(`  ║   http://localhost:${PORT}                  ║`);
  console.log(`  ║                                          ║`);
  console.log(`  ║   Data Sources (21):                     ║`);
  console.log(`  ║   ✓ Cost Plus Drugs (live API)           ║`);
  console.log(`  ║   ✓ NADAC 2026 (pharmacy costs, 6327 drugs)     ║`);
  console.log(`  ║   ✓ Medicaid FUL (federal upper limit)  ║`);
  console.log(`  ║   ✓ openFDA (drug normalization)        ║`);
  console.log(`  ║   ✓ RxNorm (NLM - drug matching)        ║`);
  console.log(`  ║   ✓ MedlinePlus (NLM - drug info)       ║`);
  console.log(`  ║   ✓ Medicare Part D (CMS - live API)    ║`);
  console.log(`  ║   ✓ SingleCare (Apify cache)            ║`);
  console.log(`  ║   ✓ GoodRx (Apify cache)                ║`);
  console.log(`  ║   ✓ Amazon RxPass (built-in, 55 drugs)  ║`);
  console.log(`  ║   ✓ Walmart Rx Program (built-in)       ║`);
  console.log(`  ║   ✓ Costco Pharmacy (estimated)         ║`);
  console.log(`  ║   ✓ Rx Outreach (nonprofit, 1189 drugs) ║`);
  console.log(`  ║   ✓ VA FSS (govt benchmark, 4660 drugs) ║`);
  console.log(`  ║   ✓ IRA Negotiated (Medicare, 40 drugs) ║`);
  console.log(`  ║   ✓ TX WAC (mfr list price, 16K drugs)  ║`);
  console.log(`  ║   ✓ RxSaver (Apify cache, 194 drugs)    ║`);
  console.log(`  ║   ✓ Blink Health (Apify cache, 69 drugs)║`);
  console.log(`  ║   ✓ FedRx (govt deals, 841 drugs)      ║`);
  console.log(`  ║   ✓ HealthWarehouse (online, 930 drugs) ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
