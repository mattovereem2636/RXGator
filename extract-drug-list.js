#!/usr/bin/env node
/**
 * extract-drug-list.js — Find drug names in other caches that Optum doesn't have yet
 * Run: node extract-drug-list.js
 * Does NOT require optum-scraper.js (avoids triggering a scrape)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Current Optum scraper drug list (both search names and slugs)
const OPTUM_DRUGS = new Set([
    'metformin', 'metformin-ir', 'lisinopril', 'amlodipine', 'atorvastatin',
    'omeprazole', 'losartan', 'gabapentin', 'sertraline', 'levothyroxine',
    'simvastatin', 'montelukast', 'montelukast-sodium', 'hydrochlorothiazide',
    'pantoprazole', 'pantoprazole-sodium', 'escitalopram', 'rosuvastatin',
    'fluoxetine', 'fluoxetine-hcl', 'trazodone', 'meloxicam', 'clopidogrel',
    'tramadol', 'tramadol-ir', 'prednisone', 'amoxicillin', 'azithromycin',
    'ciprofloxacin', 'doxycycline', 'doxycycline-hyclate', 'metoprolol',
    'carvedilol', 'furosemide', 'albuterol', 'duloxetine', 'bupropion',
    'venlafaxine', 'venlafaxine-er', 'lamotrigine', 'topiramate',
    'cyclobenzaprine', 'benazepril', 'pravastatin', 'glipizide', 'glipizide-er',
    'pioglitazone', 'cephalexin', 'clindamycin', 'valacyclovir', 'finasteride',
    'tamsulosin', 'sildenafil', 'ibuprofen', 'naproxen', 'diclofenac',
    'sumatriptan', 'buspirone'
]);

// Known metadata keys to skip
const SKIP_KEYS = new Set([
    'source', 'sourceUrl', 'source_url', 'source_type', 'description',
    'generatedAt', 'drugCount', 'priceCount', 'dataDate', 'data_date',
    'data_year', 'scrape_date', 'notes', 'medications', 'products',
    'totalProducts', 'total_drugs', 'total_entries_raw', 'total_medications',
    'drugs_pending', 'drugs_with_prices', 'rxCount', 'otcCount',
    'inStockCount', 'withPriceCount', 'unique_generics', 't'
]);

function isDrugName(key) {
    // Skip pure numbers
    if (/^\d+$/.test(key)) return false;
    // Skip metadata keys
    if (SKIP_KEYS.has(key)) return false;
    // Skip URLs
    if (key.startsWith('http')) return false;
    // Skip keys with special patterns (dates, IDs)
    if (/^\d{4}-\d/.test(key)) return false;
    // Must contain at least one letter
    if (!/[a-z]/i.test(key)) return false;
    // Reasonable length (2-60 chars)
    if (key.length < 2 || key.length > 60) return false;
    return true;
}

// Normalize drug name for comparison
function normalize(name) {
    return name.toLowerCase()
        .replace(/[,\/\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')[0]; // first word only for matching
}

const files = fs.readdirSync(DATA_DIR).filter(f =>
    f.endsWith('.json') && f !== 'optum_cache.json'
);

console.log(`\nScanning ${files.length} cache files in ${DATA_DIR}\n`);

const drugSources = {}; // drug -> [sources]

for (const file of files) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        const drugs = data.drugs || data;
        const keys = Object.keys(drugs);
        const source = file.replace('_cache.json', '').replace('.json', '');

        let count = 0;
        for (const key of keys) {
            if (isDrugName(key)) {
                const norm = normalize(key);
                if (!OPTUM_DRUGS.has(key) && !OPTUM_DRUGS.has(norm)) {
                    if (!drugSources[key]) drugSources[key] = [];
                    if (!drugSources[key].includes(source)) {
                        drugSources[key].push(source);
                    }
                    count++;
                }
            }
        }
        console.log(`  ${source}: ${keys.length} total keys, ${count} new drug names`);
    } catch (e) {
        console.log(`  ${file}: error - ${e.message}`);
    }
}

// Sort by number of sources (most cross-referenced first), then alphabetically
const sorted = Object.entries(drugSources)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

// Group by source count
const bySources = {};
for (const [drug, sources] of sorted) {
    const count = sources.length;
    if (!bySources[count]) bySources[count] = [];
    bySources[count].push(drug);
}

console.log(`\n=== RESULTS ===`);
console.log(`Total unique drug names not in Optum: ${sorted.length}`);
console.log(`Already in Optum: ${OPTUM_DRUGS.size} entries\n`);

// Show top candidates (in 3+ sources)
const top = sorted.filter(([, s]) => s.length >= 3);
console.log(`--- HIGH PRIORITY (in 3+ other sources): ${top.length} drugs ---`);
for (const [drug, sources] of top) {
    console.log(`  ${drug} (${sources.length} sources: ${sources.join(', ')})`);
}

const mid = sorted.filter(([, s]) => s.length === 2);
console.log(`\n--- MEDIUM PRIORITY (in 2 sources): ${mid.length} drugs ---`);
for (const [drug, sources] of mid) {
    console.log(`  ${drug} (${sources.join(', ')})`);
}

const low = sorted.filter(([, s]) => s.length === 1);
console.log(`\n--- LOW PRIORITY (in 1 source only): ${low.length} drugs ---`);
// Just show count per source
const lowBySource = {};
for (const [drug, sources] of low) {
    const s = sources[0];
    if (!lowBySource[s]) lowBySource[s] = 0;
    lowBySource[s]++;
}
for (const [source, count] of Object.entries(lowBySource).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${source}: ${count} unique drugs`);
}

console.log('\nDone.\n');
