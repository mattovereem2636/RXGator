// refresh-caches.js
// Pulls freshly-scraped drug price data directly from Apify's API and merges it
// into the live goodrx_cache.json and singlecare_cache.json files.
//
// Usage:
//   node refresh-caches.js
//
// What it does:
//   1. Backs up both cache files (timestamped .bak copies, same directory).
//   2. Fetches each confirmed-good Apify run's dataset via HTTPS.
//   3. Reshapes the raw scraper output into the exact production schema
//      (verified against real sample entries from both live files).
//   4. Merges into the existing cache objects (only touches the drug keys
//      listed below; every other existing key is left untouched).
//   5. Writes the merged result back, pretty-printed.
//
// GoodRx: 23 of 30 drugs refreshed. 7 are still blocked by GoodRx's anti-bot
// protection as of this run and are NOT touched here, so they keep whatever
// data they already had:
//   apixaban, carvedilol, furosemide, gabapentin, levothyroxine, lisinopril, omeprazole
//
// SingleCare: all 32 drugs refreshed.

const https = require('https');

// Token comes from the environment or /var/www/rxaggregator/.env (APIFY_TOKEN_REFRESH_CACHES).
// Never hard-code secrets in source files.
function loadToken() {
  if (process.env.APIFY_TOKEN_REFRESH_CACHES) return process.env.APIFY_TOKEN_REFRESH_CACHES;
  const envText = require('fs').readFileSync('/var/www/rxaggregator/.env', 'utf8');
  const match = envText.match(/^APIFY_TOKEN_REFRESH_CACHES=(.+)$/m);
  return match ? match[1].trim() : null;
}
const TOKEN = loadToken();
if (!TOKEN) {
  console.error('[refresh-caches] APIFY_TOKEN_REFRESH_CACHES is not set in the environment or /var/www/rxaggregator/.env');
  process.exit(1);
}
const GOODRX_CACHE_PATH = '/var/www/rxaggregator/goodrx_cache.json';
const SINGLECARE_CACHE_PATH = '/var/www/rxaggregator/singlecare_cache.json';

// drug key -> Apify run ID (GoodRx, one drug per run)
const GOODRX_RUNS = {
  fluoxetine: '29ju6RWdJzXBvgTHt',
  amoxicillin: 'SdHBufEI10E4oXdfh',
  metoprolol: 'Xtfz0vrNxk4BbAQkn',
  sertraline: '9wfxJmqmp6CLNGOla',
  rosuvastatin: '0cldy4Vsr54JgQ1uJ',
  allopurinol: 'qOr8wS86EfxgwNVbl',
  escitalopram: 'QpqlqvHfT4unL6P3N',
  tramadol: '0Qr2whbQrquDUOl7k',
  montelukast: 'FQVF7OFhCJW2f1We1',
  pantoprazole: 'LwbaHRyBFqULqV97L',
  warfarin: 'YwO6X4RQFlgF2gt6Z',
  citalopram: 'wJxfHymdGa1LJ2Usc',
  duloxetine: 'NNY4P93FE9LwG7fTu',
  bupropion: 'dj6K0aOgMfZswbKgy',
  losartan: '1pkANCfh6U0ZZjidb',
  amlodipine: 'nuckhLnzkjhdo19ep',
  hydrochlorothiazide: 'rGXNoFGAC9skL0jwF',
  metformin: 'qRrLaNkLQa0BbMi1c',
  prednisone: 'jz2Scuk4HrhGuGUMl',
  simvastatin: 'ycSo17YOPguLfH59L',
  tamsulosin: 'bMtOi9Oj6M3cYeDnV',
  atorvastatin: 'h1tSLrwqEOs0DQIna',
  meloxicam: 'QhaZtURsXWp1xTQUZ',
};

// SingleCare runs (3 total, covering all 32 drugs between them)
const SINGLECARE_RUNS = [
  'hdovhnPyFaddp84VA', // Metformin, Amoxicillin
  'Rp5Ys5HIQDHO8iFDM', // Prednisone, Azithromycin, Clopidogrel, Albuterol, Fluoxetine, Glipizide, Furosemide, Metoprolol, Pravastatin
  'Ur6Vw8fRvqVZRxDL8', // remaining 21
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function isoNoMillis(ts) {
  return new Date(ts).toISOString().replace(/\.\d+Z$/, 'Z');
}

function backup(path) {
  const fs = require('fs');
  if (!fs.existsSync(path)) {
    console.log(`  (no existing file at ${path}, skipping backup)`);
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.replace(/\.json$/, `.bak-${stamp}.json`);
  fs.copyFileSync(path, backupPath);
  console.log(`  Backed up ${path} -> ${backupPath}`);
}

async function refreshGoodRx() {
  const fs = require('fs');
  console.log('\n=== GoodRx ===');
  backup(GOODRX_CACHE_PATH);

  let cache = {};
  if (fs.existsSync(GOODRX_CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(GOODRX_CACHE_PATH, 'utf8'));
  }

  for (const [drugKey, runId] of Object.entries(GOODRX_RUNS)) {
    const url = `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${TOKEN}`;
    const items = await fetchJson(url);
    if (!Array.isArray(items) || items.length === 0) {
      console.log(`  SKIP ${drugKey}: no items returned`);
      continue;
    }
    const first = items[0];
    cache[drugKey] = {
      drugName: first.drug_name,
      dosage: first.dosage,
      form: first.form,
      quantity: first.quantity,
      scrapedAt: isoNoMillis(first.scraped_at),
      pharmacies: items.map((it) => ({
        name: it.pharmacy_name,
        goodrx_price: it.goodrx_price,
        retail_price: it.retail_price,
        discount_percentage: it.discount_percentage,
        city: it.pharmacy_city,
        state: it.pharmacy_state,
      })),
    };
    console.log(`  Updated ${drugKey} (${items.length} pharmacies)`);
  }

  fs.writeFileSync(GOODRX_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  console.log(`  Wrote ${GOODRX_CACHE_PATH} (${Object.keys(cache).length} total drugs)`);
  console.log('  NOT refreshed (still blocked by GoodRx anti-bot, left as-is):');
  console.log('    apixaban, carvedilol, furosemide, gabapentin, levothyroxine, lisinopril, omeprazole');
}

async function refreshSingleCare() {
  const fs = require('fs');
  console.log('\n=== SingleCare ===');
  backup(SINGLECARE_CACHE_PATH);

  let cache = {};
  if (fs.existsSync(SINGLECARE_CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(SINGLECARE_CACHE_PATH, 'utf8'));
  }

  let count = 0;
  for (const runId of SINGLECARE_RUNS) {
    const url = `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${TOKEN}`;
    const items = await fetchJson(url);
    for (const it of items) {
      const drugKey = (it.drugName || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!drugKey) continue;
      cache[drugKey] = {
        drugName: it.drugName,
        drugType: it.drugType,
        lowestPrice: it.lowestPrice,
        lowestPricePharmacy: it.lowestPricePharmacy,
        quantity: it.quantity,
        ndc: it.ndc,
        pharmacyCount: it.pharmacyCount,
        url: it.url,
        scrapedAt: isoNoMillis(it.scrapedAt),
      };
      count++;
      console.log(`  Updated ${drugKey}`);
    }
  }

  fs.writeFileSync(SINGLECARE_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  console.log(`  Wrote ${SINGLECARE_CACHE_PATH} (${count} drugs refreshed, ${Object.keys(cache).length} total in file)`);
}

(async () => {
  try {
    await refreshGoodRx();
    await refreshSingleCare();
    console.log('\nDone. Verify with:');
    console.log(`  node -e "const d=require('${GOODRX_CACHE_PATH}'); console.log('GoodRx entries:', Object.keys(d).length)"`);
    console.log(`  node -e "const d=require('${SINGLECARE_CACHE_PATH}'); console.log('SingleCare entries:', Object.keys(d).length)"`);
    console.log('  curl -s "https://rxgator.info/api/health/report" | python3 -m json.tool | grep -A5 caches');
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
})();
