#!/usr/bin/env node
/**
 * parse-rxsaver-apify.js
 *
 * Converts raw Apify Web Scraper output from RxSaver into RxGator's
 * normalized cache format (rxsaver_cache.json).
 *
 * Usage:
 *   node parse-rxsaver-apify.js <input1.json> [input2.json ...] [-o output.json]
 *
 * Examples:
 *   node parse-rxsaver-apify.js rxsaver-100-raw-output.json
 *   node parse-rxsaver-apify.js batch1.json batch2.json -o rxsaver_cache.json
 *
 * Input:  Raw Apify JSON array (each entry has drugSlug, drugName, pharmacyResults, etc.)
 * Output: Normalized rxsaver_cache.json ready for deployment to /var/www/rxaggregator/data/
 */

const fs = require('fs');
const path = require('path');

// --- Parse CLI args ---
const args = process.argv.slice(2);
let outputFile = 'rxsaver_cache.json';
const inputFiles = [];

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && args[i + 1]) {
        outputFile = args[++i];
    } else if (!args[i].startsWith('-')) {
        inputFiles.push(args[i]);
    }
}

if (inputFiles.length === 0) {
    console.error('Usage: node parse-rxsaver-apify.js <input1.json> [input2.json ...] [-o output.json]');
    process.exit(1);
}

// --- Load and merge all input files ---
let rawEntries = [];
for (const file of inputFiles) {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const entries = Array.isArray(data) ? data : (data.startUrls ? [] : [data]);
        console.log(`  Loaded ${entries.length} entries from ${path.basename(file)}`);
        rawEntries = rawEntries.concat(entries);
    } catch (err) {
        console.error(`Error reading ${file}: ${err.message}`);
        process.exit(1);
    }
}

// --- Deduplicate by drugSlug (later file wins) ---
const bySlug = new Map();
for (const entry of rawEntries) {
    if (entry.drugSlug) {
        bySlug.set(entry.drugSlug.toLowerCase(), entry);
    }
}
console.log(`\n  Total unique drugs: ${bySlug.size} (from ${rawEntries.length} raw entries)`);

// --- Normalize drug name ---
function cleanDrugName(rawName) {
    // "Metformin Coupon Options" → "Metformin"
    // "Lisinopril-Hydrochlorothiazide Coupon Options" → "Lisinopril-Hydrochlorothiazide"
    return rawName
        .replace(/\s*Coupon\s*Options?\s*$/i, '')
        .replace(/\s*Coupons?\s*$/i, '')
        .replace(/\s*Prices?\s*$/i, '')
        .trim();
}

// --- Normalize strength ---
function cleanStrength(raw) {
    if (!raw) return '';
    // Already clean from the scraper: "500mg", "10mg", "800mg-160mg"
    return raw.trim();
}

// --- Normalize quantity ---
function cleanQuantity(raw) {
    if (!raw) return '';
    // "60 tablets" → "60", "30 capsules" → "30"
    const match = raw.match(/(\d+)/);
    return match ? match[1] : raw.trim();
}

// --- Normalize form ---
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

// --- Normalize pharmacy name ---
function cleanPharmacyName(raw) {
    return raw
        .replace(/\s+/g, ' ')
        .replace(/\s*logo\s*$/i, '')
        .trim();
}

// --- Build normalized cache ---
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

    // Skip drugs with no pharmacy results
    if (pharmacyResults.length === 0) {
        drugsSkipped++;
        continue;
    }

    const drugName = cleanDrugName(entry.drugName || slug);
    const strength = cleanStrength(entry.strength);
    const form = cleanForm(entry.form);
    const quantity = cleanQuantity(entry.quantity);

    // Build normalized price entries
    const prices = pharmacyResults
        .filter(p => p.priceNumeric && p.priceNumeric > 0)
        .map(p => ({
            pharmacy: cleanPharmacyName(p.pharmacyName),
            price: p.priceNumeric,
            type: 'coupon'
        }))
        .sort((a, b) => a.price - b.price);  // cheapest first

    if (prices.length === 0) {
        drugsSkipped++;
        continue;
    }

    // Use lowercase slug as the key (matches RxGator search normalization)
    const key = slug.toLowerCase();

    cache.drugs[key] = {
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
        scrapedAt: entry.scrapedAt
    };

    totalPrices += prices.length;
    drugsWithPrices++;
}

cache.drugCount = drugsWithPrices;
cache.priceCount = totalPrices;

// --- Write output ---
const outputPath = path.resolve(outputFile);
fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));

// --- Report ---
console.log(`\n  ✓ Cache written to: ${outputPath}`);
console.log(`  ✓ Drugs with prices: ${drugsWithPrices}`);
console.log(`  ✓ Drugs skipped (no prices): ${drugsSkipped}`);
console.log(`  ✓ Total price entries: ${totalPrices}`);
console.log(`  ✓ Average pharmacies/drug: ${(totalPrices / drugsWithPrices).toFixed(1)}`);

// Price range summary
const allPrices = Object.values(cache.drugs).map(d => d.lowestPrice);
if (allPrices.length > 0) {
    console.log(`  ✓ Lowest price in cache: $${Math.min(...allPrices).toFixed(2)}`);
    console.log(`  ✓ Highest lowest-price: $${Math.max(...allPrices).toFixed(2)}`);
}

console.log(`\n  Ready to deploy: scp ${outputFile} root@74.208.32.197:/var/www/rxaggregator/data/`);
