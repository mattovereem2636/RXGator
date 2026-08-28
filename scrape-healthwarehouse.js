#!/usr/bin/env node
/**
 * HealthWarehouse Standalone Scraper v3.0
 * ----------------------------------------
 * Scrapes drug pricing from healthwarehouse.com using Puppeteer.
 * Uses DOM scraping against their MUI (Material UI) React frontend.
 *
 * SETUP (one-time):  npm install puppeteer
 * USAGE:             node scrape-healthwarehouse.js
 * OUTPUT:            healthwarehouse_cache.json
 *
 * Site structure (verified Aug 2026):
 *   Search:     /search/{term}
 *   Categories: /over-the-counter, /diabetic-supplies, /home-medical, /pet-supplies, /pharmacy-supplies
 *   Cards:      .mui-du0t7b containers with a[aria-label] for product name
 *   Prices:     "Prices as low as $X.XX" in <p> tags
 *   Pagination: Client-side buttons [aria-label="Go to next page"]
 *   Per page:   24 products default
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join('/var/www/rxaggregator/data', 'healthwarehouse_cache.json');
const DELAY_MS = 1500;
const MAX_PAGES_PER_CATEGORY = 5; // Cap pages per category to stay polite

// Category slugs (these are direct URL paths, NOT search params)
const CATEGORIES = [
  { slug: 'over-the-counter', label: 'Over-the-Counter' },
  { slug: 'diabetic-supplies', label: 'Diabetic Supplies' },
  { slug: 'home-medical', label: 'Home Medical' },
  { slug: 'pet-supplies', label: 'Pet Supplies' },
  { slug: 'pharmacy-supplies', label: 'Pharmacy Supplies' },
];

// Common drug search terms — search URL is /search/{term}
const DRUG_SEARCHES = [
  'metformin', 'lisinopril', 'atorvastatin', 'amlodipine', 'omeprazole',
  'losartan', 'gabapentin', 'sertraline', 'levothyroxine', 'amoxicillin',
  'azithromycin', 'albuterol', 'montelukast', 'escitalopram', 'pantoprazole',
  'rosuvastatin', 'hydrochlorothiazide', 'furosemide', 'prednisone', 'tramadol',
  'trazodone', 'duloxetine', 'citalopram', 'fluoxetine', 'bupropion',
  'meloxicam', 'cyclobenzaprine', 'tamsulosin', 'finasteride', 'sildenafil',
  'tadalafil', 'clonidine', 'propranolol', 'carvedilol', 'metoprolol',
  'warfarin', 'clopidogrel', 'simvastatin', 'pravastatin', 'ezetimibe',
  'insulin', 'glipizide', 'pioglitazone', 'doxycycline', 'ciprofloxacin',
  'cephalexin', 'metronidazole', 'fluconazole', 'valacyclovir', 'acyclovir',
  'hydroxychloroquine', 'sumatriptan', 'topiramate', 'lamotrigine', 'pregabalin',
  'buspirone', 'hydroxyzine', 'lorazepam', 'alprazolam', 'diazepam',
  'acetaminophen', 'ibuprofen', 'naproxen', 'aspirin', 'cetirizine',
  'loratadine', 'famotidine', 'ranitidine', 'lansoprazole', 'ondansetron',
  'spironolactone', 'liothyronine', 'synthroid', 'eliquis', 'xarelto',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract products from current page using MUI card structure.
 * Cards use class .mui-du0t7b with a[aria-label] for product name.
 */
async function extractProducts(page) {
  await sleep(1500);

  return page.evaluate(() => {
    const items = [];

    // Primary strategy: MUI product cards
    // The card container class is .mui-du0t7b
    // Product name is in a[href][aria-label] inside the card
    const cards = document.querySelectorAll('.mui-du0t7b');
    cards.forEach(card => {
      const link = card.querySelector('a[href][aria-label]');
      if (!link) return;

      const name = link.getAttribute('aria-label');
      const href = link.getAttribute('href');
      const text = card.textContent || '';

      // Price: "Prices as low as $X.XX"
      const priceMatch = text.match(/\$([\d,]+\.?\d*)/);
      // SKU: "SKU: XXXXX"
      const skuMatch = text.match(/SKU:\s*(\S+)/);
      // Rx status
      const rxRequired = text.includes('Prescription Required');
      // Stock status
      const inStock = !text.includes('Out of Stock') && !text.includes('Unavailable');

      if (name && name.length > 2) {
        items.push({
          name: name.trim(),
          price: priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null,
          url: href ? `https://www.healthwarehouse.com${href.startsWith('/') ? '' : '/'}${href}` : null,
          sku: skuMatch ? skuMatch[1] : null,
          rxRequired,
          inStock,
        });
      }
    });

    if (items.length > 0) return items;

    // Fallback: try aria-label links anywhere on page
    const links = document.querySelectorAll('a[aria-label][href]');
    links.forEach(link => {
      const name = link.getAttribute('aria-label');
      const href = link.getAttribute('href');
      // Skip nav/utility links
      if (!href || href.includes('/search') || href === '/' || name.length < 5) return;
      if (href.startsWith('/') && !href.includes('/category') && !href.includes('/page')) {
        const parent = link.closest('div') || link.parentElement;
        const text = parent?.textContent || '';
        const priceMatch = text.match(/\$([\d,]+\.?\d*)/);
        if (priceMatch) {
          items.push({
            name: name.trim(),
            price: parseFloat(priceMatch[1].replace(',', '')),
            url: `https://www.healthwarehouse.com${href}`,
            sku: null,
            rxRequired: text.includes('Prescription Required'),
            inStock: !text.includes('Out of Stock'),
          });
        }
      }
    });

    return items;
  });
}

/**
 * Dismiss cookie consent banner if present
 */
async function dismissCookies(page) {
  try {
    // Look for "Reject All" button (privacy-preserving choice)
    const rejected = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const rejectBtn = buttons.find(b => b.textContent.trim() === 'Reject All');
      if (rejectBtn) { rejectBtn.click(); return true; }
      return false;
    });
    if (rejected) {
      console.log('  Cookie banner dismissed (Reject All)');
      await sleep(500);
    }
  } catch (e) {
    // Not critical
  }
}

/**
 * Search for a drug term. URL pattern: /search/{term}
 */
async function scrapeSearch(page, searchTerm) {
  const url = `https://www.healthwarehouse.com/search/${encodeURIComponent(searchTerm)}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const products = await extractProducts(page);
    return products;
  } catch (err) {
    console.log(` error: ${err.message}`);
    return [];
  }
}

/**
 * Scrape a category page with pagination (button-click based).
 * Category URL: /slug
 * Pagination: click [aria-label="Go to next page"] button
 */
async function scrapeCategoryPage(page, category) {
  const allProducts = [];
  try {
    const url = `https://www.healthwarehouse.com/${category.slug}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Scroll down to trigger lazy-loaded images (doesn't affect product count)
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
    });
    await sleep(500);

    // Get total count from "X-Y of Z" text
    const totalInfo = await page.evaluate(() => {
      const match = document.body.textContent.match(/\d+-\d+ of (\d+)/);
      return match ? parseInt(match[1]) : 0;
    });

    // Page 1
    const p1 = await extractProducts(page);
    allProducts.push(...p1);
    console.log(`    Page 1: ${p1.length} products (${totalInfo} total in category)`);

    // Paginate through remaining pages
    const totalPages = Math.min(Math.ceil(totalInfo / 24), MAX_PAGES_PER_CATEGORY);
    for (let pg = 2; pg <= totalPages; pg++) {
      const hasNext = await page.evaluate(() => {
        const btn = document.querySelector('[aria-label="Go to next page"]');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return false;
      });

      if (!hasNext) break;

      await sleep(DELAY_MS);
      // Wait for new products to render
      await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));

      const products = await extractProducts(page);
      if (products.length === 0) break;
      allProducts.push(...products);
      process.stdout.write(`    Page ${pg}: ${products.length} products\r`);
    }
    console.log(`    Total scraped: ${allProducts.length} products`);

  } catch (err) {
    console.log(`    Error: ${err.message}`);
  }

  return allProducts;
}

async function main() {
  console.log('HealthWarehouse Scraper v3.0');
  console.log('===========================\n');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate to homepage and pass Cloudflare
  console.log('Navigating to healthwarehouse.com...');
  try {
    await page.goto('https://www.healthwarehouse.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await sleep(5000);

    const title = await page.title();
    console.log(`Page title: "${title}"`);

    if (title.includes('moment') || title.includes('Cloudflare') || title.includes('Just a')) {
      console.log('Cloudflare challenge detected. Waiting 15s...');
      await sleep(15000);
      const title2 = await page.title();
      if (title2.includes('moment') || title2.includes('Cloudflare')) {
        console.log('ERROR: Cannot pass Cloudflare. Try running with headless: false');
        await browser.close();
        process.exit(1);
      }
    }
    console.log('Cloudflare passed.');
  } catch (err) {
    console.error('Navigation error:', err.message);
    await browser.close();
    process.exit(1);
  }

  // Dismiss cookie consent
  await dismissCookies(page);

  const allProducts = new Map(); // Dedup by uppercase name

  function addProduct(p, source) {
    if (!p.name || p.name.length < 3) return;
    const key = p.name.toUpperCase().trim();
    const existing = allProducts.get(key);
    // Keep the entry with the best data (has price, has sku)
    if (!existing || (p.price && !existing.price) || (p.sku && !existing.sku)) {
      allProducts.set(key, { ...p, source });
    }
  }

  // Phase 1: Drug searches (Rx drugs — most relevant for RxGator)
  console.log('\n--- Phase 1: Drug searches ---');
  let searchHits = 0;
  for (const term of DRUG_SEARCHES) {
    process.stdout.write(`  ${term}... `);
    const products = await scrapeSearch(page, term);
    if (products.length > 0) {
      console.log(`${products.length} found`);
      products.forEach(p => addProduct(p, 'rx-search'));
      searchHits += products.length;
    } else {
      console.log('0');
    }
    await sleep(800);
  }
  console.log(`\n  Search results: ${searchHits} hits → ${allProducts.size} unique products\n`);

  // Phase 2: Category pages (OTC, diabetic supplies, etc.)
  console.log('--- Phase 2: Category pages ---');
  for (const cat of CATEGORIES) {
    console.log(`  Scraping: ${cat.label} (/${cat.slug})`);
    const products = await scrapeCategoryPage(page, cat);
    products.forEach(p => addProduct(p, cat.slug));
    await sleep(DELAY_MS);
  }

  console.log(`\n  Grand total: ${allProducts.size} unique products\n`);

  await browser.close();

  // Build cache JSON
  const drugList = Array.from(allProducts.values())
    .map(p => ({
      name: p.name,
      price: p.price,
      url: p.url,
      sku: p.sku,
      rxRequired: p.rxRequired,
      inStock: p.inStock,
      source: p.source,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cache = {
    source: 'HealthWarehouse',
    sourceUrl: 'https://www.healthwarehouse.com',
    dataDate: new Date().toISOString().split('T')[0],
    scrapedAt: new Date().toISOString(),
    description: 'Drug pricing from HealthWarehouse online pharmacy (NABP accredited, all 50 states)',
    totalProducts: drugList.length,
    withPriceCount: drugList.filter(d => d.price).length,
    inStockCount: drugList.filter(d => d.inStock).length,
    rxCount: drugList.filter(d => d.rxRequired).length,
    otcCount: drugList.filter(d => !d.rxRequired).length,
    products: drugList
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cache, null, 2));
  const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  console.log('===========================');
  console.log('Scrape complete!');
  console.log(`  Total products: ${cache.totalProducts}`);
  console.log(`  With prices:    ${cache.withPriceCount}`);
  console.log(`  In stock:       ${cache.inStockCount}`);
  console.log(`  Rx drugs:       ${cache.rxCount}`);
  console.log(`  OTC products:   ${cache.otcCount}`);
  console.log(`  Output: ${OUTPUT_FILE} (${sizeKB} KB)`);
  console.log('\nTo deploy to RxGator:');
  console.log('  1. SCP healthwarehouse_cache.json to server: data/ directory');
  console.log('  2. The healthwarehouse-prices.js module will load it automatically');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
