#!/usr/bin/env node
/**
 * RxGator Data Source Health-Check Script
 * Tests all data sources and reports status.
 *
 * Usage:
 *   node health-check.js              # Full check, console output
 *   node health-check.js --json       # JSON output (for scheduled tasks)
 *   node health-check.js --brief      # One-line summary only
 *
 * Sources tested:
 *   Live APIs: Cost Plus, NADAC, openFDA, RxNorm, MedlinePlus, Medicare Part D, FDA Shortage, FDA Recall
 *   Cached:    GoodRx, SingleCare, RxSaver, Blink Health
 *   Static:    Walmart, Costco, Amazon RxPass, Rx Outreach, VA FSS, IRA Negotiated, Texas WAC
 *   Files:     drug-names.json, brand-generic-lookup.json
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const TEST_DRUG = 'metformin';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function fetchJSON(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, timeoutMs).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: null, raw: data.slice(0, 200) }); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function fileCheck(relPath) {
  const full = path.join(BASE_DIR, relPath);
  try {
    const stat = fs.statSync(full);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = JSON.parse(raw);
    const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    const ageDays = ((Date.now() - stat.mtimeMs) / 86400000).toFixed(1);
    return { ok: true, entries: count, sizeMB: (stat.size / 1048576).toFixed(2), ageDays };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkSource(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    return { name, status: 'OK', ms, ...result };
  } catch (e) {
    const ms = Date.now() - start;
    return { name, status: 'FAIL', ms, error: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Live API checks
// ──────────────────────────────────────────────────────────────

async function checkCostPlus() {
  const url = `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=${encodeURIComponent(TEST_DRUG)}`;
  const res = await fetchJSON(url);
  const count = res.body?.results?.length || 0;
  return { httpStatus: res.status, results: count, note: count > 0 ? 'Returning data' : 'No results (API reachable)' };
}

async function checkNADAC() {
  const searchTerm = TEST_DRUG.toUpperCase();
  const url = `https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0?` +
    `conditions[0][property]=ndc_description&conditions[0][value]=%25${encodeURIComponent(searchTerm)}%25&conditions[0][operator]=LIKE` +
    `&sort[0][property]=as_of_date&sort[0][order]=desc&limit=3`;
  const res = await fetchJSON(url);
  const count = res.body?.results?.length || (Array.isArray(res.body) ? res.body.length : 0);
  return { httpStatus: res.status, results: count, note: count > 0 ? 'Returning data' : 'No results (API reachable)' };
}

async function checkOpenFDA() {
  const url = `https://api.fda.gov/drug/ndc.json?search=generic_name:"${TEST_DRUG}"&limit=3`;
  const res = await fetchJSON(url);
  const count = res.body?.results?.length || 0;
  return { httpStatus: res.status, results: count, note: count > 0 ? 'Returning data' : 'No results' };
}

async function checkRxNorm() {
  const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${TEST_DRUG}&search=1`;
  const res = await fetchJSON(url);
  const rxcui = res.body?.idGroup?.rxnormId?.[0] || null;
  return { httpStatus: res.status, rxcui, note: rxcui ? `RxCUI: ${rxcui}` : 'No RxCUI found' };
}

async function checkMedlinePlus() {
  // metformin RxCUI = 6809
  const url = 'https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=6809&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json';
  const res = await fetchJSON(url);
  const entries = res.body?.feed?.entry?.length || 0;
  return { httpStatus: res.status, results: entries, note: entries > 0 ? 'Returning drug info' : 'No entries' };
}

async function checkMedicarePartD() {
  const datasetId = '7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b';
  const url = `https://data.cms.gov/data-api/v1/dataset/${datasetId}/data?keyword=${encodeURIComponent(TEST_DRUG)}&size=3`;
  const res = await fetchJSON(url);
  const count = Array.isArray(res.body) ? res.body.length : 0;
  return { httpStatus: res.status, results: count, note: count > 0 ? 'Returning data' : 'No results (API reachable)' };
}

async function checkFDAShortage() {
  const url = `https://api.fda.gov/drug/shortages.json?search=generic_name:"${TEST_DRUG}"&limit=1`;
  const res = await fetchJSON(url);
  // 404 = no shortage found (expected for most drugs)
  if (res.status === 404 || (res.body?.error?.code === 'NOT_FOUND')) {
    return { httpStatus: res.status, note: 'API reachable (no shortage for test drug — expected)' };
  }
  return { httpStatus: res.status, results: res.body?.results?.length || 0, note: 'Returning data' };
}

async function checkFDARecall() {
  const url = `https://api.fda.gov/drug/enforcement.json?search=openfda.generic_name:"${TEST_DRUG}"&limit=1`;
  const res = await fetchJSON(url);
  if (res.status === 404 || (res.body?.error?.code === 'NOT_FOUND')) {
    return { httpStatus: res.status, note: 'API reachable (no recalls for test drug)' };
  }
  return { httpStatus: res.status, results: res.body?.results?.length || 0, note: 'Returning data' };
}

// ──────────────────────────────────────────────────────────────
// Cache checks
// ──────────────────────────────────────────────────────────────

function checkCacheFile(name, filename, expectKey) {
  return () => {
    const info = fileCheck(filename);
    if (!info.ok) throw new Error(info.error);
    // Check if test drug has data
    const raw = JSON.parse(fs.readFileSync(path.join(BASE_DIR, filename), 'utf8'));
    const hasTestDrug = !!raw[TEST_DRUG] || !!raw[TEST_DRUG.toLowerCase()];
    return {
      entries: info.entries,
      sizeMB: info.sizeMB,
      ageDays: info.ageDays,
      hasTestDrug,
      note: `${info.entries} drugs cached, file ${info.ageDays} days old`,
    };
  };
}

// ──────────────────────────────────────────────────────────────
// Static/module checks
// ──────────────────────────────────────────────────────────────

function checkModule(name, modulePath, searchFn) {
  return () => {
    const mod = require(path.join(BASE_DIR, modulePath));
    const initFn = mod.init || mod.load;
    if (initFn) initFn(path.join(BASE_DIR, 'data'));
    const results = searchFn(mod);
    const count = Array.isArray(results) ? results.length : (results ? 1 : 0);
    return { results: count, note: count > 0 ? 'Module loaded, returning data' : 'Module loaded, no data for test drug' };
  };
}

// ──────────────────────────────────────────────────────────────
// File integrity checks
// ──────────────────────────────────────────────────────────────

function checkDataFile(name, relPath, minEntries) {
  return () => {
    const info = fileCheck(relPath);
    if (!info.ok) throw new Error(info.error);
    if (info.entries < minEntries) {
      return { ...info, note: `WARNING: Only ${info.entries} entries (expected ${minEntries}+)` };
    }
    return { ...info, note: `${info.entries} entries, ${info.sizeMB} MB, ${info.ageDays} days old` };
  };
}

// ──────────────────────────────────────────────────────────────
// Search log analysis
// ──────────────────────────────────────────────────────────────

function analyzeSearchLog() {
  const logPath = path.join(BASE_DIR, 'search_log.csv');
  try {
    if (!fs.existsSync(logPath)) return { note: 'No search log found' };
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    if (lines.length < 2) return { note: 'Search log empty' };

    const dataLines = lines.slice(1); // skip header
    const total = dataLines.length;

    // Parse last 7 days
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    let recentTotal = 0;
    let recentZero = 0;
    const failedDrugs = {};

    for (const line of dataLines) {
      const cols = line.split(',');
      const timestamp = new Date(cols[0]).getTime();
      if (timestamp >= sevenDaysAgo) {
        recentTotal++;
        const sourcesHit = parseInt(cols[6]) || 0;
        if (sourcesHit === 0) {
          recentZero++;
          const drug = (cols[3] || '').replace(/"/g, '').toLowerCase();
          if (drug) failedDrugs[drug] = (failedDrugs[drug] || 0) + 1;
        }
      }
    }

    const zeroRate = recentTotal > 0 ? ((recentZero / recentTotal) * 100).toFixed(1) : '0.0';
    const topFailed = Object.entries(failedDrugs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([drug, count]) => `${drug} (${count})`);

    return {
      totalSearches: total,
      last7Days: recentTotal,
      last7DaysZeroResults: recentZero,
      zeroResultRate: `${zeroRate}%`,
      topFailedSearches: topFailed.length > 0 ? topFailed : ['none'],
      note: `${recentTotal} searches last 7 days, ${zeroRate}% zero-result rate`,
    };
  } catch (e) {
    return { note: `Error reading log: ${e.message}` };
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function runHealthCheck() {
  const startTime = Date.now();

  const checks = await Promise.all([
    // Live APIs
    checkSource('Cost Plus Drugs API', checkCostPlus),
    checkSource('NADAC (Medicaid)', checkNADAC),
    checkSource('openFDA NDC', checkOpenFDA),
    checkSource('RxNorm (NLM/NIH)', checkRxNorm),
    checkSource('MedlinePlus', checkMedlinePlus),
    checkSource('Medicare Part D (CMS)', checkMedicarePartD),
    checkSource('FDA Drug Shortage', checkFDAShortage),
    checkSource('FDA Drug Recall', checkFDARecall),

    // Cached data
    checkSource('GoodRx (cache)', checkCacheFile('GoodRx', 'goodrx_cache.json', TEST_DRUG)),
    checkSource('SingleCare (cache)', checkCacheFile('SingleCare', 'singlecare_cache.json', TEST_DRUG)),
    checkSource('RxSaver (cache)', () => {
      const info = fileCheck('data/rxsaver_cache.json');
      if (!info.ok) throw new Error(info.error);
      return { ...info, note: `${info.entries} entries, ${info.ageDays} days old` };
    }),
    checkSource('Blink Health (cache)', () => {
      const info = fileCheck('data/blink_cache.json');
      if (!info.ok) throw new Error(info.error);
      return { ...info, note: `${info.entries} entries, ${info.ageDays} days old` };
    }),

    // Static modules
    checkSource('Rx Outreach', checkModule('Rx Outreach', 'rxoutreach.js', m => m.search(TEST_DRUG))),
    checkSource('VA FSS', checkModule('VA FSS', 'va-fss.js', m => m.search(TEST_DRUG))),
    checkSource('IRA Negotiated', checkModule('IRA Negotiated', 'ira-negotiated.js', m => m.search(TEST_DRUG))),
    checkSource('Texas WAC', checkModule('Texas WAC', 'texas-wac.js', m => m.search(TEST_DRUG))),

    // Core data files
    checkSource('Drug Dictionary', checkDataFile('Drug Dictionary', 'data/drug-names.json', 100)),
    checkSource('Brand-Generic Map', checkDataFile('Brand-Generic Map', 'data/brand-generic-map.json', 200)),
  ]);

  // Search log analysis (sync, so just run it)
  const searchLog = analyzeSearchLog();

  const totalMs = Date.now() - startTime;
  const ok = checks.filter(c => c.status === 'OK').length;
  const fail = checks.filter(c => c.status === 'FAIL').length;

  return {
    timestamp: new Date().toISOString(),
    summary: `${ok}/${checks.length} sources healthy, ${fail} failed`,
    totalMs,
    checks,
    searchLog,
  };
}

// ──────────────────────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const briefMode = args.includes('--brief');

  const result = await runHealthCheck();

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (briefMode) {
    const fails = result.checks.filter(c => c.status === 'FAIL').map(c => c.name);
    if (fails.length === 0) {
      console.log(`[OK] ${result.summary} (${result.totalMs}ms)`);
    } else {
      console.log(`[ALERT] ${result.summary} — FAILED: ${fails.join(', ')}`);
    }
    return;
  }

  // Full console report
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           RxGator Data Source Health Check                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Timestamp: ${result.timestamp}`);
  console.log(`  Test drug: ${TEST_DRUG}`);
  console.log(`  Total time: ${result.totalMs}ms`);
  console.log('');

  // Group by category
  const liveAPIs = result.checks.slice(0, 8);
  const cached = result.checks.slice(8, 12);
  const staticMods = result.checks.slice(12, 16);
  const files = result.checks.slice(16);

  const printSection = (title, items) => {
    console.log(`  ── ${title} ${'─'.repeat(50 - title.length)}`);
    for (const c of items) {
      const icon = c.status === 'OK' ? '✅' : '❌';
      const time = c.ms ? `${c.ms}ms` : '';
      console.log(`  ${icon} ${c.name.padEnd(28)} ${time.padStart(7)}  ${c.note || c.error || ''}`);
    }
    console.log('');
  };

  printSection('Live APIs', liveAPIs);
  printSection('Cached Data', cached);
  printSection('Static Modules', staticMods);
  printSection('Core Files', files);

  // Search log
  console.log('  ── Search Log Analysis ──────────────────────────────────');
  if (result.searchLog.last7Days !== undefined) {
    console.log(`  Searches (last 7 days): ${result.searchLog.last7Days}`);
    console.log(`  Zero-result rate:       ${result.searchLog.zeroResultRate} (target: <5%)`);
    if (result.searchLog.topFailedSearches[0] !== 'none') {
      console.log(`  Top failed searches:    ${result.searchLog.topFailedSearches.join(', ')}`);
    }
  } else {
    console.log(`  ${result.searchLog.note}`);
  }
  console.log('');

  // Summary
  const failedChecks = result.checks.filter(c => c.status === 'FAIL');
  if (failedChecks.length === 0) {
    console.log('  ✅ ALL SOURCES HEALTHY');
  } else {
    console.log(`  ⚠️  ${failedChecks.length} SOURCE(S) NEED ATTENTION:`);
    for (const f of failedChecks) {
      console.log(`     • ${f.name}: ${f.error}`);
    }
  }
  console.log('');
}

main().catch(e => {
  console.error('Health check failed:', e.message);
  process.exit(1);
});
