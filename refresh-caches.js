#!/usr/bin/env node
/**
 * refresh-caches.js — Monthly Apify scraper trigger for RxGator
 *
 * Triggers RxSaver and Blink Health scraper runs on Apify,
 * waits for completion, downloads results, parses into cache format,
 * writes to /var/www/rxaggregator/data/, and reloads the modules.
 *
 * Usage:
 *   node refresh-caches.js              # refresh both
 *   node refresh-caches.js --rxsaver    # refresh RxSaver only
 *   node refresh-caches.js --blink      # refresh Blink only
 *   node refresh-caches.js --dry-run    # show what would happen
 *
 * Requires: APIFY_TOKEN environment variable
 * Deploy to: /var/www/rxaggregator/refresh-caches.js
 * Crontab:   0 3 1 * * cd /var/www/rxaggregator && node refresh-caches.js >> /var/log/rxgator-refresh.log 2>&1
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const BASE_DIR = path.dirname(require.main.filename);
const DATA_DIR = path.join(BASE_DIR, 'data');
const SERVER_PORT = 3100;

// Apify Web Scraper actor ID
const WEB_SCRAPER_ACTOR = 'apify/web-scraper';

// How long to wait for a run to finish (ms)
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 15 * 1000;  // check every 15 seconds

// ============================================================
// DRUG LISTS — these are the URLs to scrape
// ============================================================

// Top 100 RxSaver drugs (expandable — add more slugs to scrape more drugs)
const RXSAVER_SLUGS = [
  'metformin','lisinopril','atorvastatin-calcium','amlodipine','levothyroxine',
  'omeprazole','losartan','gabapentin','sertraline','montelukast',
  'escitalopram','trazodone','pantoprazole','rosuvastatin','duloxetine',
  'bupropion','meloxicam','carvedilol','tamsulosin','hydrochlorothiazide',
  'fluoxetine','amoxicillin','azithromycin','albuterol','prednisone',
  'clopidogrel','furosemide','metoprolol','glipizide','pravastatin',
  'warfarin','ibuprofen','naproxen','cyclobenzaprine','acetaminophen-codeine',
  'ciprofloxacin','doxycycline','cephalexin','clonidine','propranolol',
  'spironolactone','famotidine','ondansetron','methylprednisolone',
  'hydroxyzine','amitriptyline','doxazosin','finasteride','benzonatate',
  'clonazepam','alprazolam','lorazepam','diazepam','tramadol',
  'sulfamethoxazole-trimethoprim','nitrofurantoin','metronidazole',
  'fluconazole','valacyclovir','acyclovir','cetirizine','loratadine',
  'mometasone','fluticasone','triamcinolone','nystatin','clotrimazole',
  'mupirocin','methotrexate','colchicine','allopurinol','febuxostat',
  'sumatriptan','rizatriptan','topiramate','lamotrigine','levetiracetam',
  'oxcarbazepine','phenytoin','primidone','zonisamide','lithium-carbonate',
  'aripiprazole','olanzapine','quetiapine','risperidone','haloperidol',
  'buspirone','mirtazapine','venlafaxine','paroxetine','citalopram',
  'nortriptyline','donepezil','memantine','ropinirole','pramipexole',
  'rivaroxaban','apixaban','sildenafil','tadalafil',
];

// Blink Health drugs — use the correct salt-name slugs
const BLINK_SLUGS = [
  'sertraline','montelukast','metformin','lisinopril','atorvastatin',
  'amlodipine','omeprazole','losartan','trazodone','pantoprazole',
  'rosuvastatin','duloxetine','meloxicam','tamsulosin','hydrochlorothiazide',
  'fluoxetine','amoxicillin','azithromycin','prednisone','clopidogrel',
  'furosemide','pravastatin','levothyroxine','escitalopram-oxalate',
  'bupropion-hcl','carvedilol','metoprolol-tartrate','albuterol-sulfate',
  'glipizide','ibuprofen','naproxen','cyclobenzaprine','doxycycline',
  'cephalexin','clonidine','propranolol','spironolactone','famotidine',
  'ondansetron','amitriptyline','doxazosin','finasteride','benzonatate',
  'nitrofurantoin','metronidazole','fluconazole','valacyclovir','acyclovir',
  'cetirizine','loratadine','mometasone','fluticasone','triamcinolone',
  'nystatin','mupirocin','allopurinol','sumatriptan','topiramate',
  'lamotrigine','levetiracetam','aripiprazole','olanzapine','quetiapine',
  'risperidone','buspirone','mirtazapine','venlafaxine','paroxetine',
  'citalopram','nortriptyline','donepezil','ropinirole','pramipexole',
  'sildenafil','tadalafil','hydroxyzine','methylprednisolone',
  'vitamin-d3','magnesium-oxide','folic-acid','potassium-chloride',
  'warfarin','lisinopril-hctz','losartan-hctz',
];

// ============================================================
// APIFY API HELPERS
// ============================================================

async function apifyRequest(urlPath, method = 'GET', body = null) {
  const url = `https://api.apify.com/v2${urlPath}?token=${APIFY_TOKEN}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify API ${method} ${urlPath}: ${res.status} — ${text}`);
  }
  return res.json();
}

async function startActorRun(actorId, input) {
  const data = await apifyRequest(`/acts/${actorId}/runs`, 'POST', input);
  return data.data; // { id, status, ... }
}

async function waitForRun(runId) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const data = await apifyRequest(`/actor-runs/${runId}`);
    const status = data.data.status;
    log(`  Run ${runId}: ${status}`);
    if (status === 'SUCCEEDED') return data.data;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Apify run ${runId} timed out after ${MAX_WAIT_MS / 60000} minutes`);
}

async function getDatasetItems(datasetId) {
  const data = await apifyRequest(`/datasets/${datasetId}/items`);
  return data; // array of items
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ============================================================
// RXSAVER: SCRAPER INPUT & PARSER
// ============================================================

function buildRxSaverInput() {
  return {
    startUrls: RXSAVER_SLUGS.map(slug => ({
      url: `https://www.rxsaver.com/drugs/${slug}/coupons`
    })),
    linkSelector: '',
    globs: [],
    pageFunction: `async function pageFunction(context) {
      const { request, log, jQuery: $ } = context;
      log.info('Scraping ' + request.url);

      const drugName = $('h1').first().text().trim();
      const results = [];

      $('a[href*="coupon"], a[href*="show-coupon"], [class*="pharmacy"]').each(function() {
        const el = $(this);
        const href = el.attr('href') || '';
        const parent = el.closest('[class*="row"], [class*="item"], [class*="card"], li, tr');
        if (parent.length) {
          const parentText = parent.text().trim();
          const priceMatch = parentText.match(/\\$([\\d,]+\\.\\d{2})/);
          if (priceMatch) {
            results.push({
              pharmacyText: parentText,
              price: priceMatch[0],
              priceNumeric: parseFloat(priceMatch[1].replace(',', '')),
              couponLink: href
            });
          }
        }
      });

      const allPrices = [];
      const priceRegex = /\\$[\\d,]+\\.\\d{2}/g;
      let match;
      while ((match = priceRegex.exec($('body').text())) !== null) {
        allPrices.push(match[0]);
      }

      return {
        url: request.url,
        drugSlug: request.url.split('/drugs/')[1]?.split('/')[0] || '',
        drugName: drugName,
        pharmacyResults: results,
        allPricesFound: [...new Set(allPrices)],
        scrapedAt: new Date().toISOString()
      };
    }`,
    proxyConfiguration: { useApifyProxy: true },
    waitUntil: ['networkidle2'],
    maxRequestsPerCrawl: RXSAVER_SLUGS.length + 10,
  };
}

function parseRxSaverResults(items) {
  const drugs = {};
  let totalPrices = 0;

  for (const item of items) {
    if (!item.drugSlug) continue;

    const slug = item.drugSlug.toLowerCase();

    // Parse pharmacy results
    const prices = [];
    const seenPharmacies = new Set();

    if (item.pharmacyResults && item.pharmacyResults.length > 0) {
      for (const pr of item.pharmacyResults) {
        // Extract pharmacy name from the text
        let pharmacyName = 'Unknown Pharmacy';
        const knownPharmacies = [
          'Walmart', 'CVS', 'Walgreens', 'Rite Aid', 'Kroger', 'Target',
          'Costco', 'Sam\'s Club', 'Sams Club', 'Albertsons', 'Safeway',
          'Publix', 'H-E-B', 'HEB', 'Meijer', 'ShopRite', 'Stop & Shop',
          'Giant', 'Wegmans', 'Hy-Vee', 'Fred Meyer', 'Harris Teeter',
          'Winn-Dixie', 'Food Lion', 'Hannaford', 'Price Chopper',
          'Amazon Pharmacy', 'Capsule', 'Alto', 'HealthWarehouse',
        ];
        for (const name of knownPharmacies) {
          if (pr.pharmacyText && pr.pharmacyText.toLowerCase().includes(name.toLowerCase())) {
            pharmacyName = name;
            break;
          }
        }

        const key = `${pharmacyName}|${pr.priceNumeric}`;
        if (!seenPharmacies.has(key) && pr.priceNumeric > 0) {
          seenPharmacies.add(key);
          prices.push({
            pharmacy: pharmacyName,
            price: pr.priceNumeric,
            type: 'coupon',
          });
        }
      }
    }

    if (prices.length === 0) continue;

    // Sort cheapest first
    prices.sort((a, b) => a.price - b.price);

    // Extract drug info from the name
    const nameParts = (item.drugName || slug).trim();
    const strengthMatch = nameParts.match(/(\d+\s*(?:mg|mcg|ml|%|units?))/i);
    const formMatch = nameParts.match(/\b(tablet|capsule|cream|gel|solution|suspension|inhaler|patch|spray|drops|ointment|suppository|injection|powder|syrup|liquid)\b/i);

    drugs[slug] = {
      name: nameParts.split(/\d/)[0].trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      slug: slug,
      url: item.url || `https://www.rxsaver.com/drugs/${slug}/coupons`,
      strength: strengthMatch ? strengthMatch[1] : '',
      form: formMatch ? formMatch[1].toLowerCase() : 'tablet',
      quantity: '30',
      lowestPrice: prices[0].price,
      highestPrice: prices[prices.length - 1].price,
      pharmacyCount: prices.length,
      scrapedAt: item.scrapedAt || new Date().toISOString(),
      prices: prices,
    };
    totalPrices += prices.length;
  }

  return {
    source: 'RxSaver',
    sourceUrl: 'https://www.rxsaver.com',
    description: 'RxSaver discount card coupon prices at major pharmacies',
    generatedAt: new Date().toISOString(),
    drugCount: Object.keys(drugs).length,
    priceCount: totalPrices,
    drugs: drugs,
  };
}

// ============================================================
// BLINK: SCRAPER INPUT & PARSER
// ============================================================

function buildBlinkInput() {
  return {
    startUrls: BLINK_SLUGS.map(slug => ({
      url: `https://www.blinkhealth.com/${slug}`
    })),
    linkSelector: '',
    globs: [],
    pageFunction: `async function pageFunction(context) {
      const { request, log, jQuery: $ } = context;
      log.info('Scraping ' + request.url);

      const bodyText = $('body').text();
      const drugName = $('h1').first().text().trim().split(' - ')[0].split(' | ')[0].trim();

      // Extract dosage info
      const dosageMatch = bodyText.match(/(\\d+)\\s*(Tablets?|Capsules?|mL|Vials?)\\s*,\\s*(\\d+\\.?\\d*)\\s*(mg|mcg|ml|%)/i);
      const dosageRaw = dosageMatch ? dosageMatch[0] : '';
      const quantity = dosageMatch ? parseInt(dosageMatch[1]) : 30;
      const form = dosageMatch ? dosageMatch[2] : 'Tablets';
      const strength = dosageMatch ? dosageMatch[3] + ' ' + dosageMatch[4] : '';

      // Extract prices
      const prices = [];
      const priceRegex = /\\$(\\d+\\.\\d{2})/g;
      let match;
      const allPrices = [];
      while ((match = priceRegex.exec(bodyText)) !== null) {
        allPrices.push(parseFloat(match[1]));
      }

      // Look for Home Delivery price
      const homeDeliveryMatch = bodyText.match(/Home\\s*Delivery[\\s\\S]*?\\$(\\d+\\.\\d{2})/i);
      if (homeDeliveryMatch) {
        prices.push({
          price: parseFloat(homeDeliveryMatch[1]),
          pharmacy: 'Blink Home Delivery',
          type: 'Home Delivery'
        });
      }

      // Look for Everyday Low Price / pharmacy pickup
      const everyDayMatch = bodyText.match(/Everyday\\s*Low\\s*Price[\\s\\S]*?\\$(\\d+\\.\\d{2})/i);
      if (everyDayMatch) {
        prices.push({
          price: parseFloat(everyDayMatch[1]),
          pharmacy: 'Blink Pharmacy',
          type: 'Everyday Low Price'
        });
      }

      // Fallback: if no labeled prices found, use the lowest price on page
      if (prices.length === 0 && allPrices.length > 0) {
        const validPrices = allPrices.filter(p => p > 0.50 && p < 5000);
        if (validPrices.length > 0) {
          const lowest = Math.min(...validPrices);
          prices.push({
            price: lowest,
            pharmacy: 'Blink Home Delivery',
            type: 'Home Delivery'
          });
        }
      }

      return {
        url: request.url,
        slug: request.url.split('blinkhealth.com/')[1] || '',
        drugName: drugName,
        dosageRaw: dosageRaw,
        quantity: quantity,
        form: form,
        strength: strength,
        prices: prices,
        allPrices: allPrices.slice(0, 10),
        scrapedAt: new Date().toISOString()
      };
    }`,
    proxyConfiguration: { useApifyProxy: true },
    waitUntil: ['networkidle2'],
    maxRequestsPerCrawl: BLINK_SLUGS.length + 10,
  };
}

function parseBlinkResults(items) {
  const drugs = {};
  let totalPrices = 0;

  for (const item of items) {
    if (!item.slug || !item.prices || item.prices.length === 0) continue;

    const slug = item.slug.toLowerCase().replace(/\/$/, '');
    // Use a simple key (base name without salt suffix for index matching)
    const baseKey = slug.split('-')[0].length >= 4 ? slug : slug;

    drugs[baseKey] = {
      name: item.drugName || slug.replace(/-/g, ' '),
      slug: slug,
      url: item.url || `https://www.blinkhealth.com/${slug}`,
      quantity: item.quantity || 30,
      form: item.form || 'Tablets',
      strength: item.strength || '',
      dosageRaw: item.dosageRaw || '',
      prices: item.prices.map(p => ({
        price: p.price,
        pharmacy: p.pharmacy,
        type: p.type,
      })),
    };
    totalPrices += item.prices.length;
  }

  return {
    source: 'Blink Health',
    sourceUrl: 'https://www.blinkhealth.com',
    description: 'Blink Health / BlinkRx prescription drug prices (home delivery and pharmacy pickup)',
    generatedAt: new Date().toISOString(),
    drugCount: Object.keys(drugs).length,
    priceCount: totalPrices,
    drugs: drugs,
  };
}

// ============================================================
// RELOAD MODULE VIA HTTP
// ============================================================

async function reloadModule(name) {
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/api/${name}/reload`, { method: 'POST' });
    const data = await res.json();
    log(`  ${name} reload: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    log(`  ${name} reload failed (server may need manual restart): ${err.message}`);
    return null;
  }
}

// ============================================================
// MAIN
// ============================================================

async function refreshRxSaver() {
  log('=== RxSaver Refresh ===');
  log(`Scraping ${RXSAVER_SLUGS.length} drugs...`);

  const input = buildRxSaverInput();
  const run = await startActorRun(WEB_SCRAPER_ACTOR, input);
  log(`  Started run: ${run.id}`);

  const completed = await waitForRun(run.id);
  log(`  Run completed. Dataset: ${completed.defaultDatasetId}`);

  const items = await getDatasetItems(completed.defaultDatasetId);
  log(`  Downloaded ${items.length} results`);

  const cache = parseRxSaverResults(items);
  log(`  Parsed: ${cache.drugCount} drugs, ${cache.priceCount} prices`);

  if (cache.drugCount === 0) {
    log('  WARNING: No drugs parsed — skipping file write. Scraper may need updating.');
    return false;
  }

  // Backup existing cache
  const cacheFile = path.join(DATA_DIR, 'rxsaver_cache.json');
  const backupFile = path.join(DATA_DIR, `rxsaver_cache.backup-${Date.now()}.json`);
  if (fs.existsSync(cacheFile)) {
    fs.copyFileSync(cacheFile, backupFile);
    log(`  Backed up existing cache to ${path.basename(backupFile)}`);
  }

  // Write new cache
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  log(`  Wrote ${cacheFile} (${(fs.statSync(cacheFile).size / 1024).toFixed(1)} KB)`);

  // Reload module
  await reloadModule('rxsaver');
  return true;
}

async function refreshBlink() {
  log('=== Blink Health Refresh ===');
  log(`Scraping ${BLINK_SLUGS.length} drugs...`);

  const input = buildBlinkInput();
  const run = await startActorRun(WEB_SCRAPER_ACTOR, input);
  log(`  Started run: ${run.id}`);

  const completed = await waitForRun(run.id);
  log(`  Run completed. Dataset: ${completed.defaultDatasetId}`);

  const items = await getDatasetItems(completed.defaultDatasetId);
  log(`  Downloaded ${items.length} results`);

  const cache = parseBlinkResults(items);
  log(`  Parsed: ${cache.drugCount} drugs, ${cache.priceCount} prices`);

  if (cache.drugCount === 0) {
    log('  WARNING: No drugs parsed — skipping file write. Scraper may need updating.');
    return false;
  }

  // Backup existing cache
  const cacheFile = path.join(DATA_DIR, 'blink_cache.json');
  const backupFile = path.join(DATA_DIR, `blink_cache.backup-${Date.now()}.json`);
  if (fs.existsSync(cacheFile)) {
    fs.copyFileSync(cacheFile, backupFile);
    log(`  Backed up existing cache to ${path.basename(backupFile)}`);
  }

  // Write new cache
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  log(`  Wrote ${cacheFile} (${(fs.statSync(cacheFile).size / 1024).toFixed(1)} KB)`);

  // Reload module
  await reloadModule('blink');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rxsaverOnly = args.includes('--rxsaver');
  const blinkOnly = args.includes('--blink');
  const both = !rxsaverOnly && !blinkOnly;

  log('RxGator Cache Refresh');
  log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  log(`  Sources: ${both ? 'RxSaver + Blink' : rxsaverOnly ? 'RxSaver' : 'Blink'}`);

  if (!APIFY_TOKEN) {
    console.error('ERROR: APIFY_TOKEN environment variable not set.');
    console.error('Set it with: export APIFY_TOKEN=your_token_here');
    console.error('Or add to /etc/environment: APIFY_TOKEN=your_token_here');
    process.exit(1);
  }

  if (dryRun) {
    log('Dry run — showing config only:');
    if (both || rxsaverOnly) {
      log(`  RxSaver: ${RXSAVER_SLUGS.length} drugs to scrape`);
      log(`  First 5: ${RXSAVER_SLUGS.slice(0, 5).join(', ')}`);
    }
    if (both || blinkOnly) {
      log(`  Blink: ${BLINK_SLUGS.length} drugs to scrape`);
      log(`  First 5: ${BLINK_SLUGS.slice(0, 5).join(', ')}`);
    }
    log('  Apify actor: ' + WEB_SCRAPER_ACTOR);
    log('  Token: ' + APIFY_TOKEN.substring(0, 12) + '...');
    log('Done (dry run).');
    return;
  }

  const results = {};

  try {
    if (both || rxsaverOnly) {
      results.rxsaver = await refreshRxSaver();
    }
    if (both || blinkOnly) {
      results.blink = await refreshBlink();
    }

    log('=== Summary ===');
    for (const [source, success] of Object.entries(results)) {
      log(`  ${source}: ${success ? 'SUCCESS' : 'FAILED (check logs above)'}`);
    }
    log('Done.');
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
