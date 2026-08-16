#!/usr/bin/env node
/**
 * import-apify-data.js
 *
 * Pulls the latest scraper results from Apify API, transforms them into
 * RxGator's normalized cache format, and writes the cache files.
 *
 * Usage:
 *   node import-apify-data.js                  # Import both sources
 *   node import-apify-data.js --source rxsaver # Import RxSaver only
 *   node import-apify-data.js --source blink   # Import Blink only
 *   node import-apify-data.js --dry-run        # Preview without writing files
 *
 * Environment:
 *   APIFY_TOKEN  — Apify API token (required)
 *
 * Deployment:
 *   Place in /var/www/rxaggregator/
 *   Cache files write to /var/www/rxaggregator/data/
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const CONFIG = {
  apifyBaseUrl: 'https://api.apify.com/v2',
  actors: {
    rxsaver: {
      // Web Scraper actor ID (RxSaver)
      actorId: 'apify~web-scraper',
      cacheFile: 'rxsaver_cache.json',
      backupPrefix: 'rxsaver_cache_backup'
    },
    blink: {
      // Playwright Scraper actor ID (Blink Health)
      actorId: 'apify~playwright-scraper',
      cacheFile: 'blink_cache.json',
      backupPrefix: 'blink_cache_backup'
    }
  },
  dataDir: path.join(__dirname, 'data'),
  backupDir: path.join(__dirname, 'data', 'backups')
};

// --- Parse CLI args ---
const args = process.argv.slice(2);
let sourceFilter = null;  // null = both
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) {
    sourceFilter = args[++i].toLowerCase();
  }
  if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

// --- HTTP helper (no external deps) ---
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// --- Get the latest successful run for an actor ---
async function getLatestRun(actorId, token) {
  const url = `${CONFIG.apifyBaseUrl}/acts/${actorId}/runs?token=${token}&status=SUCCEEDED&desc=true&limit=1`;
  const result = await httpsGet(url);
  if (!result.data || !result.data.items || result.data.items.length === 0) {
    throw new Error(`No successful runs found for actor ${actorId}`);
  }
  return result.data.items[0];
}

// --- Get dataset items from a run ---
async function getDatasetItems(datasetId, token) {
  const url = `${CONFIG.apifyBaseUrl}/datasets/${datasetId}/items?token=${token}&format=json&clean=true`;
  return await httpsGet(url);
}

// =====================================================
// RxSaver Transform (mirrors parse-rxsaver-apify.js)
// =====================================================
function cleanDrugName(rawName) {
  return rawName
    .replace(/\s*Coupon\s*Options?\s*$/i, '')
    .replace(/\s*Coupons?\s*$/i, '')
    .replace(/\s*Prices?\s*$/i, '')
    .trim();
}

function cleanStrength(raw) {
  if (!raw) return '';
  return raw.trim();
}

function cleanQuantity(raw) {
  if (!raw) return '';
  const match = raw.match(/(\d+)/);
  return match ? match[1] : raw.trim();
}

function cleanForm(raw) {
  if (!raw) return 'tablet';
  const f = raw.toLowerCase().trim();
  if (f.includes('capsule')) return 'capsule';
  if (f.includes('tablet') || f === 'tablet') return 'tablet';
  if (f.includes('oral')) return 'tablet';
  if (f.includes('solution') || f.includes('liquid')) return 'solution';
  if (f.includes('cream')) return 'cream';
  if (f.includes('ointment')) return 'ointment';
  if (f.includes('suspension')) return 'suspension';
  if (f.includes('inhaler')) return 'inhaler';
  if (f.includes('spray')) return 'spray';
  return f || 'tablet';
}

function cleanPharmacyName(raw) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*logo\s*$/i, '')
    .trim();
}

// Parse price from string "$29.23" or numeric 29.23
function parsePrice(raw) {
  if (typeof raw === 'number') return raw;
  if (!raw) return null;
  const match = String(raw).replace(/[$,]/g, '').match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function transformRxSaver(rawEntries) {
  // Deduplicate by drugSlug
  const bySlug = new Map();
  for (const entry of rawEntries) {
    if (entry.drugSlug) {
      bySlug.set(entry.drugSlug.toLowerCase(), entry);
    }
  }

  const cache = {
    source: 'RxSaver',
    sourceUrl: 'https://www.rxsaver.com',
    description: 'RxSaver discount card coupon prices at major pharmacies',
    generatedAt: new Date().toISOString(),
    drugCount: 0,
    priceCount: 0,
    drugs: {}
  };

  let totalPrices = 0;
  let drugsWithPrices = 0;
  let drugsSkipped = 0;

  for (const [slug, entry] of bySlug) {
    const pharmacyResults = entry.pharmacyResults || [];
    if (pharmacyResults.length === 0) {
      drugsSkipped++;
      continue;
    }

    const drugName = cleanDrugName(entry.drugName || slug);
    const strength = cleanStrength(entry.strength);
    const form = cleanForm(entry.form);
    const quantity = cleanQuantity(entry.quantity);

    const prices = pharmacyResults
      .map(p => {
        const numPrice = parsePrice(p.priceNumeric || p.price);
        return numPrice && numPrice > 0 ? {
          pharmacy: cleanPharmacyName(p.pharmacyName),
          price: numPrice,
          type: 'coupon'
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);

    if (prices.length === 0) {
      drugsSkipped++;
      continue;
    }

    cache.drugs[slug.toLowerCase()] = {
      name: drugName,
      slug: slug,
      strength: strength,
      form: form,
      quantity: quantity,
      lowestPrice: prices[0].price,
      highestPrice: prices[prices.length - 1].price,
      pharmacyCount: prices.length,
      prices: prices,
      url: entry.url,
      scrapedAt: new Date().toISOString()
    };

    totalPrices += prices.length;
    drugsWithPrices++;
  }

  cache.drugCount = drugsWithPrices;
  cache.priceCount = totalPrices;
  return { cache, stats: { drugsWithPrices, drugsSkipped, totalPrices } };
}

// =====================================================
// Blink Health Transform
// =====================================================
function transformBlink(rawEntries) {
  const bySlug = new Map();
  for (const entry of rawEntries) {
    if (entry.drugSlug) {
      bySlug.set(entry.drugSlug.toLowerCase(), entry);
    }
  }

  const cache = {
    source: 'Blink Health',
    sourceUrl: 'https://www.blinkhealth.com',
    description: 'Blink Health discounted prescription prices with home delivery and pharmacy pickup',
    generatedAt: new Date().toISOString(),
    drugCount: 0,
    priceCount: 0,
    drugs: {}
  };

  let totalPrices = 0;
  let drugsWithPrices = 0;
  let drugsSkipped = 0;

  for (const [slug, entry] of bySlug) {
    // Extract price from blinkPrice field
    let price = null;
    if (entry.blinkPrice) {
      if (typeof entry.blinkPrice === 'number') {
        price = entry.blinkPrice;
      } else {
        const match = String(entry.blinkPrice).replace(/[$,]/g, '').match(/([\d.]+)/);
        if (match) price = parseFloat(match[1]);
      }
    }

    if (!price || price <= 0) {
      drugsSkipped++;
      continue;
    }

    const drugName = entry.drugName || slug;

    cache.drugs[slug.toLowerCase()] = {
      name: drugName,
      slug: slug,
      strength: '',
      form: entry.form || '',
      quantity: '',
      lowestPrice: price,
      highestPrice: price,
      pharmacyCount: 1,
      prices: [{
        pharmacy: 'Blink Health',
        price: price,
        type: 'Home Delivery'
      }],
      url: entry.finalUrl || entry.url || `https://www.blinkhealth.com/${slug}`,
      scrapedAt: new Date().toISOString()
    };

    totalPrices++;
    drugsWithPrices++;
  }

  cache.drugCount = drugsWithPrices;
  cache.priceCount = totalPrices;
  return { cache, stats: { drugsWithPrices, drugsSkipped, totalPrices } };
}

// --- Backup existing cache file ---
function backupCache(cacheFilePath, backupPrefix) {
  if (!fs.existsSync(cacheFilePath)) return null;

  if (!fs.existsSync(CONFIG.backupDir)) {
    fs.mkdirSync(CONFIG.backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFile = path.join(CONFIG.backupDir, `${backupPrefix}_${timestamp}.json`);
  fs.copyFileSync(cacheFilePath, backupFile);

  // Keep only the 3 most recent backups
  const backups = fs.readdirSync(CONFIG.backupDir)
    .filter(f => f.startsWith(backupPrefix))
    .sort()
    .reverse();

  for (let i = 3; i < backups.length; i++) {
    fs.unlinkSync(path.join(CONFIG.backupDir, backups[i]));
  }

  return backupFile;
}

// --- Main ---
async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('ERROR: APIFY_TOKEN environment variable is required.');
    console.error('  Set it with: export APIFY_TOKEN="your-token-here"');
    process.exit(1);
  }

  console.log('=== RxGator Apify Data Import ===');
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no files written)' : 'LIVE'}`);
  console.log(`  Source: ${sourceFilter || 'both'}\n`);

  const sources = [
    { key: 'rxsaver', label: 'RxSaver', transform: transformRxSaver },
    { key: 'blink', label: 'Blink Health', transform: transformBlink }
  ];

  let anyError = false;

  for (const source of sources) {
    if (sourceFilter && sourceFilter !== source.key) continue;

    console.log(`--- ${source.label} ---`);
    const actorConfig = CONFIG.actors[source.key];

    try {
      // 1. Get the latest successful run
      console.log('  Fetching latest successful run...');
      const run = await getLatestRun(actorConfig.actorId, token);
      console.log(`  Run ID: ${run.id}`);
      console.log(`  Started: ${run.startedAt}`);
      console.log(`  Finished: ${run.finishedAt}`);
      console.log(`  Results: ${run.stats.itemCount || 'unknown'}`);

      // 2. Download dataset
      console.log('  Downloading dataset...');
      const items = await getDatasetItems(run.defaultDatasetId, token);
      console.log(`  Downloaded ${items.length} items`);

      if (items.length === 0) {
        console.error(`  WARNING: No items in dataset. Skipping ${source.label}.`);
        continue;
      }

      // 3. Transform
      console.log('  Transforming data...');
      const { cache, stats } = source.transform(items);
      console.log(`  Drugs with prices: ${stats.drugsWithPrices}`);
      console.log(`  Drugs skipped: ${stats.drugsSkipped}`);
      console.log(`  Total price entries: ${stats.totalPrices}`);

      if (stats.drugsWithPrices === 0) {
        console.error(`  WARNING: Zero drugs after transform. Skipping ${source.label}.`);
        continue;
      }

      // 4. Safety check — don't replace a good cache with a much smaller one
      const cacheFilePath = path.join(CONFIG.dataDir, actorConfig.cacheFile);
      if (fs.existsSync(cacheFilePath)) {
        const existing = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        const ratio = stats.drugsWithPrices / existing.drugCount;
        if (ratio < 0.5) {
          console.error(`  WARNING: New data has ${stats.drugsWithPrices} drugs vs existing ${existing.drugCount}.`);
          console.error(`  That is a ${(ratio * 100).toFixed(0)}% drop. Aborting to prevent data loss.`);
          console.error(`  Use --force to override this check.`);
          anyError = true;
          continue;
        }
      }

      // 5. Write
      if (dryRun) {
        console.log('  [DRY RUN] Would write cache file. Skipping.');
      } else {
        // Backup existing file
        const backupFile = backupCache(cacheFilePath, actorConfig.backupPrefix);
        if (backupFile) {
          console.log(`  Backed up to: ${path.basename(backupFile)}`);
        }

        // Write new cache
        fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
        console.log(`  Cache written: ${actorConfig.cacheFile}`);
        console.log(`  Size: ${(fs.statSync(cacheFilePath).size / 1024).toFixed(1)} KB`);
      }

      console.log(`  ${source.label} import complete.\n`);

    } catch (err) {
      console.error(`  ERROR importing ${source.label}: ${err.message}`);
      anyError = true;
    }
  }

  // Summary
  console.log('=== Import Complete ===');
  if (anyError) {
    console.log('  Some sources had errors. Check output above.');
    process.exit(1);
  }
  if (!dryRun) {
    console.log('  Restart PM2 to pick up new data:');
    console.log('    pm2 restart rxaggregator');
  }
  console.log('');
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
