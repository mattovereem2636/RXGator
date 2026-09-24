// add-gap-drugs.js
// Adds the 3 newly-covered "zero-result" drugs (Mounjaro, Gemtesa, Nubeqa)
// into the live rxsaver_cache.json and singlecare_cache.json caches.
//
// These were NOT pulled via Apify actors (no dedicated RxSaver/Blink Health
// actors exist on Apify — confirmed via store search). RxSaver pricing was
// scraped directly from the live coupon pages; SingleCare pricing came from
// the SingleCare Apify actor (run p3RPT7rb7ULpdCprw, 2026-09-18).
//
// Coverage found:
//   - Mounjaro:  RxSaver only (10 pharmacies, $1,087.84–$1,386.42)
//   - Gemtesa:   RxSaver (9 pharmacies, $478.36–$577.92) AND SingleCare ($473.42 lowest)
//   - Nubeqa:    SingleCare only ($14,184.10 lowest) — RxSaver has a page but
//                genuinely has no coupon prices for it at any ZIP (checked
//                two different ZIPs); this looks like a real network gap for
//                this specialty oncology drug, not a scraping bug.
//   - Vibegron / Darolutamide: NOT added. These are the generic-substance
//     names for Gemtesa / Nubeqa respectively, neither of which has a generic
//     on the market yet. Users searching "vibegron" or "darolutamide" should
//     be pointed to the Gemtesa/Nubeqa brand entries, not given their own
//     cache rows with no data.
//
// Usage: node add-gap-drugs.js

const fs = require('fs');

const RXSAVER_CACHE_PATH = '/var/www/rxaggregator/data/rxsaver_cache.json';
const SINGLECARE_CACHE_PATH = '/var/www/rxaggregator/singlecare_cache.json';

function backup(path) {
  if (!fs.existsSync(path)) {
    console.log(`  (no existing file at ${path}, skipping backup)`);
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.replace(/\.json$/, `.bak-${stamp}.json`);
  fs.copyFileSync(path, backupPath);
  console.log(`  Backed up ${path} -> ${backupPath}`);
}

function refreshRxSaver() {
  console.log('\n=== RxSaver ===');
  backup(RXSAVER_CACHE_PATH);

  let cache = {};
  if (fs.existsSync(RXSAVER_CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(RXSAVER_CACHE_PATH, 'utf8'));
  }

  cache['mounjaro'] = {
    name: 'Mounjaro',
    slug: 'mounjaro',
    strength: '4 pens of 2.5mg/0.5ml',
    form: 'carton',
    quantity: '1 carton',
    lowestPrice: 1087.84,
    highestPrice: 1386.42,
    pharmacyCount: 10,
    prices: [
      { pharmacy: 'Meijer Pharmacy', price: 1087.84, type: 'coupon' },
      { pharmacy: 'D&W Pharmacy', price: 1089.59, type: 'coupon' },
      { pharmacy: 'Family Fare Pharmacy', price: 1089.59, type: 'coupon' },
      { pharmacy: 'Target (CVS)', price: 1150.50, type: 'coupon' },
      { pharmacy: 'CVS Pharmacy', price: 1150.50, type: 'coupon' },
      { pharmacy: 'Sams Club', price: 1158.43, type: 'coupon' },
      { pharmacy: 'Walmart', price: 1161.15, type: 'coupon' },
      { pharmacy: 'Walgreens', price: 1197.79, type: 'coupon' },
      { pharmacy: 'Walgreens Specialty Pharmacy', price: 1197.79, type: 'coupon' },
      { pharmacy: 'Costco', price: 1386.42, type: 'coupon' },
    ],
    url: 'https://www.rxsaver.com/drugs/mounjaro/coupons',
    scrapedAt: '2026-09-18T20:09:38.591Z',
  };

  cache['gemtesa'] = {
    name: 'Gemtesa',
    slug: 'gemtesa',
    strength: '75mg',
    form: 'tablet',
    quantity: '30 tablets',
    lowestPrice: 478.36,
    highestPrice: 577.92,
    pharmacyCount: 9,
    prices: [
      { pharmacy: 'Hy-Vee', price: 478.36, type: 'coupon' },
      { pharmacy: 'Kroger Pharmacy', price: 512.76, type: 'coupon' },
      { pharmacy: 'Walgreens', price: 529.09, type: 'coupon' },
      { pharmacy: 'Walgreens Specialty Pharmacy', price: 529.09, type: 'coupon' },
      { pharmacy: 'Target (CVS)', price: 532.46, type: 'coupon' },
      { pharmacy: 'CVS Pharmacy', price: 532.47, type: 'coupon' },
      { pharmacy: 'Sams Club', price: 539.53, type: 'coupon' },
      { pharmacy: 'Walmart', price: 541.03, type: 'coupon' },
      { pharmacy: 'Costco', price: 577.92, type: 'coupon' },
    ],
    url: 'https://www.rxsaver.com/drugs/gemtesa/coupons',
    scrapedAt: '2026-09-18T20:09:38.591Z',
  };

  fs.writeFileSync(RXSAVER_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  console.log(`  Wrote ${RXSAVER_CACHE_PATH} (${Object.keys(cache).length} total drugs)`);
  console.log('  Added: mounjaro, gemtesa');
  console.log('  Skipped (no coupon prices exist at any ZIP): nubeqa');
}

function refreshSingleCare() {
  console.log('\n=== SingleCare ===');
  backup(SINGLECARE_CACHE_PATH);

  let cache = {};
  if (fs.existsSync(SINGLECARE_CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(SINGLECARE_CACHE_PATH, 'utf8'));
  }

  cache['nubeqa'] = {
    drugName: 'Nubeqa',
    drugType: 'Brand',
    lowestPrice: 14184.1,
    lowestPricePharmacy: 'Kroger Pharmacy',
    quantity: null,
    ndc: null,
    pharmacyCount: 8,
    url: 'https://www.singlecare.com/prescription/nubeqa',
    scrapedAt: '2026-09-18T20:04:28.689Z',
  };

  cache['gemtesa'] = {
    drugName: 'Gemtesa',
    drugType: 'Brand',
    lowestPrice: 473.42,
    lowestPricePharmacy: 'Kroger Pharmacy',
    quantity: null,
    ndc: null,
    pharmacyCount: 9,
    url: 'https://www.singlecare.com/prescription/gemtesa',
    scrapedAt: '2026-09-18T20:05:14.589Z',
  };

  fs.writeFileSync(SINGLECARE_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  console.log(`  Wrote ${SINGLECARE_CACHE_PATH} (${Object.keys(cache).length} total drugs)`);
  console.log('  Added: nubeqa, gemtesa');
}

(async () => {
  try {
    refreshRxSaver();
    refreshSingleCare();
    console.log('\nDone. Verify with:');
    console.log(`  node -e "const d=require('${RXSAVER_CACHE_PATH}'); console.log(d.mounjaro, d.gemtesa)"`);
    console.log(`  node -e "const d=require('${SINGLECARE_CACHE_PATH}'); console.log(d.nubeqa, d.gemtesa)"`);
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
})();
