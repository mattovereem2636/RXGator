#!/usr/bin/env node

// ============================================================
// RxGator — Medicare Part D CMS Data Fetcher
// Pulls the full Medicare Part D Spending by Drug dataset
// directly from the CMS public API (data.cms.gov)
//
// Usage:
//   node fetch-medicare-partd.js                    # fetch + auto-import to local RxGator
//   node fetch-medicare-partd.js --save-only        # fetch + save JSON, skip import
//   node fetch-medicare-partd.js --year 2023        # use 2023 data instead of latest
//   node fetch-medicare-partd.js --url https://...  # import to a different RxGator URL
//
// No API key required. No rate limiting. Free government data.
// Dataset: Medicare Part D Spending by Drug (Annual)
// Source: https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug
// ============================================================

const fs = require('fs');
const path = require('path');

// CMS API endpoint — Medicare Part D Spending by Drug (Annual)
const DATASET_ID = '7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b';
const CMS_API_BASE = `https://data.cms.gov/data-api/v1/dataset/${DATASET_ID}/data`;
const PAGE_SIZE = 5000; // CMS max

// RxGator import defaults
const DEFAULT_IMPORT_URL = 'http://localhost:3100/api/medicare-partd/import';
const DEFAULT_AUTH = 'rxadmin:drug';

// Parse CLI args
const args = process.argv.slice(2);
const saveOnly = args.includes('--save-only');
const yearIdx = args.indexOf('--year');
const requestedYear = yearIdx >= 0 ? args[yearIdx + 1] : null;
const urlIdx = args.indexOf('--url');
const importUrl = urlIdx >= 0 ? args[urlIdx + 1] : DEFAULT_IMPORT_URL;
const authIdx = args.indexOf('--auth');
const authCreds = authIdx >= 0 ? args[authIdx + 1] : DEFAULT_AUTH;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchAllPages() {
  let allRecords = [];
  let offset = 0;
  let page = 1;

  console.log(`\n  ╔══════════════════════════════════════════════╗`);
  console.log(`  ║   RxGator — Medicare Part D Data Fetcher      ║`);
  console.log(`  ║   Source: data.cms.gov (CMS Public API)       ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝\n`);

  while (true) {
    const url = `${CMS_API_BASE}?size=${PAGE_SIZE}&offset=${offset}`;
    console.log(`  [Page ${page}] Fetching offset=${offset}, size=${PAGE_SIZE}...`);

    const data = await fetchJSON(url);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`  [Page ${page}] No more records.`);
      break;
    }

    allRecords = allRecords.concat(data);
    console.log(`  [Page ${page}] Got ${data.length} records (total: ${allRecords.length})`);

    if (data.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    page++;

    // Small delay to be polite to the API
    await new Promise(r => setTimeout(r, 500));
  }

  return allRecords;
}

function detectLatestYear(records) {
  if (records.length === 0) return null;

  const sample = records[0];
  const years = Object.keys(sample)
    .filter(k => k.startsWith('Tot_Spndng_'))
    .map(k => k.replace('Tot_Spndng_', ''))
    .sort()
    .reverse();

  // Find the most recent year that actually has data
  for (const year of years) {
    const hasData = records.some(r => r[`Tot_Spndng_${year}`] && parseFloat(r[`Tot_Spndng_${year}`]) > 0);
    if (hasData) return year;
  }

  return years[0];
}

function transformRecords(rawRecords, year) {
  const transformed = [];
  let skipped = 0;

  for (const r of rawRecords) {
    const spending = r[`Tot_Spndng_${year}`];
    const claims = r[`Tot_Clms_${year}`];
    const beneficiaries = r[`Tot_Benes_${year}`];
    const avgPerClaim = r[`Avg_Spnd_Per_Clm_${year}`];

    // Skip records with no data for this year
    if (!spending || parseFloat(spending) === 0) {
      skipped++;
      continue;
    }

    transformed.push({
      brandName: r.Brnd_Name || '',
      genericName: r.Gnrc_Name || '',
      manufacturerName: r.Mftr_Name || '',
      totalSpending: spending,
      totalClaims: claims || '',
      totalBeneficiaries: beneficiaries || '',
      avgSpendPerClaim: avgPerClaim || '',
      avgSpendPerDosageUnit: r[`Avg_Spnd_Per_Dsg_Unt_Wghtd_${year}`] || '',
      totalDosageUnits: r[`Tot_Dsg_Unts_${year}`] || '',
      dataYear: year,
    });
  }

  return { transformed, skipped };
}

async function importToRxGator(records, url, auth) {
  console.log(`\n  Importing ${records.length} records to ${url}...`);

  // Split into chunks to avoid body size limits
  const CHUNK_SIZE = 2000;
  let totalImported = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(records.length / CHUNK_SIZE);

    console.log(`  [Chunk ${chunkNum}/${totalChunks}] Sending ${chunk.length} records...`);

    const authHeader = 'Basic ' + Buffer.from(auth).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`  [Chunk ${chunkNum}] Import failed: HTTP ${res.status} — ${text.substring(0, 200)}`);
      continue;
    }

    const result = await res.json();
    console.log(`  [Chunk ${chunkNum}] Imported: ${result.imported || 0} records, ${result.generics || '?'} generics, ${result.brands || '?'} brands`);
    totalImported += (result.imported || 0);

    await new Promise(r => setTimeout(r, 200));
  }

  return totalImported;
}

async function main() {
  try {
    // Step 1: Fetch all pages from CMS API
    const rawRecords = await fetchAllPages();
    console.log(`\n  Total raw records fetched: ${rawRecords.length}`);

    if (rawRecords.length === 0) {
      console.error('  ERROR: No records returned from CMS API.');
      process.exit(1);
    }

    // Step 2: Detect the latest year (or use requested year)
    const year = requestedYear || detectLatestYear(rawRecords);
    console.log(`  Using year: ${year}`);

    // Step 3: Transform to RxGator format
    const { transformed, skipped } = transformRecords(rawRecords, year);
    console.log(`  Transformed: ${transformed.length} records (${skipped} skipped — no data for ${year})`);

    // Count unique drugs
    const uniqueGenerics = new Set(transformed.map(r => r.genericName));
    const uniqueBrands = new Set(transformed.map(r => r.brandName));
    const overallCount = transformed.filter(r => r.manufacturerName === 'Overall').length;
    console.log(`  Unique generics: ${uniqueGenerics.size}`);
    console.log(`  Unique brands: ${uniqueBrands.size}`);
    console.log(`  Overall (aggregate) entries: ${overallCount}`);

    // Step 4: Save to file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `medicare_partd_${year}_${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    fs.writeFileSync(filepath, JSON.stringify(transformed, null, 2));
    console.log(`\n  Saved: ${filepath} (${(fs.statSync(filepath).size / 1024).toFixed(0)} KB)`);

    // Step 5: Import to RxGator (unless --save-only)
    if (saveOnly) {
      console.log('\n  --save-only mode: skipping import.');
      console.log(`  To import later, run:`);
      console.log(`  curl -X POST ${importUrl} -u ${authCreds} -H 'Content-Type: application/json' -d @${filename}`);
    } else {
      const imported = await importToRxGator(transformed, importUrl, authCreds);
      console.log(`\n  Import complete: ${imported} records processed.`);
    }

    console.log('\n  Done.\n');
  } catch (err) {
    console.error(`\n  ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
