/**
 * RxGator Health Report Endpoint
 * Exposes /api/health/report — comprehensive JSON health check
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const BASE_DIR = path.resolve(__dirname);

const CACHE_FILES = [
  { name: 'goodrx_cache', path: 'goodrx_cache.json', maxAgeDays: 45 },
  { name: 'singlecare_cache', path: 'singlecare_cache.json', maxAgeDays: 45 },
  { name: 'rxsaver_cache', path: 'data/rxsaver_cache.json', maxAgeDays: 45 },
  { name: 'blink_cache', path: 'data/blink_cache.json', maxAgeDays: 45 },
];

function checkCaches() {
  const now = Date.now();
  return CACHE_FILES.map(cf => {
    const fullPath = path.join(BASE_DIR, cf.path);
    try {
      const stat = fs.statSync(fullPath);
      const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      const stale = ageDays > cf.maxAgeDays;
      let entries = null;
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        entries = Array.isArray(data) ? data.length : Object.keys(data).length;
      } catch (_) {}
      return { name: cf.name, file: cf.path, lastModified: stat.mtime.toISOString(),
        ageDays: Math.round(ageDays * 10) / 10, stale, entries, status: stale ? 'STALE' : 'OK' };
    } catch (err) {
      return { name: cf.name, file: cf.path, status: 'MISSING', error: err.message };
    }
  });
}

function parseCSVRow(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i+1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current); return result;
}

function analyzeSearchLog() {
  const logPath = path.join(BASE_DIR, 'search_log.csv');
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.trim().split('\n');
    if (lines.length < 2) return { status: 'EMPTY', totalSearches: 0 };
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const drugIdx = header.findIndex(h => ['drug','query','drug_name','search_term','drugname'].includes(h));
    const dateIdx = header.findIndex(h => ['date','timestamp','time','searched_at'].includes(h));
    const resultsIdx = header.findIndex(h => ['results','result_count','resultcount','sources_hit','sourceshit'].includes(h));
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let totalSearches = 0, zeroResults = 0;
    const drugCounts = {}, failedTerms = {};
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      if (!row || row.length < Math.max(drugIdx, dateIdx, resultsIdx) + 1) continue;
      if (dateIdx >= 0) {
        const rowDate = new Date(row[dateIdx]);
        if (!isNaN(rowDate.getTime()) && rowDate.getTime() < sevenDaysAgo) continue;
      }
      totalSearches++;
      const drug = (row[drugIdx] || '').trim().toLowerCase();
      const resultCount = resultsIdx >= 0 ? parseInt(row[resultsIdx], 10) : NaN;
      if (drug) {
        drugCounts[drug] = (drugCounts[drug] || 0) + 1;
        if (resultsIdx >= 0 && resultCount === 0) {
          zeroResults++;
          failedTerms[drug] = (failedTerms[drug] || 0) + 1;
        }
      }
    }
    const zeroResultRate = totalSearches > 0 ? Math.round((zeroResults / totalSearches) * 10000) / 100 : 0;
    const topSearched = Object.entries(drugCounts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([drug,count]) => ({drug,count}));
    const topFailed = Object.entries(failedTerms).sort((a,b) => b[1]-a[1]).slice(0,10).map(([term,count]) => ({term,count}));
    return { status: 'OK', period: '7_days', totalSearches, zeroResults,
      zeroResultRate: zeroResultRate + '%', zeroResultRateOk: zeroResultRate < 5, topSearched, topFailed };
  } catch (err) { return { status: 'ERROR', error: err.message }; }
}

const API_CHECKS = [
  { name: 'Cost Plus Drugs', url: 'https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=metformin',
    validate: (body) => { const d = JSON.parse(body); return d && (Array.isArray(d) ? d.length > 0 : Object.keys(d).length > 0); } },
  { name: 'NADAC (Medicaid)', url: 'https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0?conditions%5B0%5D%5Bproperty%5D=ndc_description&conditions%5B0%5D%5Bvalue%5D=%25METFORMIN%25&conditions%5B0%5D%5Boperator%5D=LIKE&limit=3',
    validate: (body) => { const d = JSON.parse(body); return d && d.results && d.results.length > 0; } },
  { name: 'openFDA NDC', url: 'https://api.fda.gov/drug/ndc.json?search=generic_name:metformin&limit=3',
    validate: (body) => { const d = JSON.parse(body); return d && d.results && d.results.length > 0; } },
  { name: 'RxNorm (NLM)', url: 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=metformin&search=1',
    validate: (body) => { const d = JSON.parse(body); return d && d.idGroup && d.idGroup.rxnormId && d.idGroup.rxnormId.length > 0; } },
  { name: 'MedlinePlus Connect', url: 'https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=6809&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json',
    validate: (body) => { const d = JSON.parse(body); return d && d.feed && d.feed.entry && d.feed.entry.length > 0; } },
  { name: 'Medicare Part D (CMS)', url: 'https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data?keyword=metformin&size=3',
    validate: (body) => { const d = JSON.parse(body); return Array.isArray(d) && d.length > 0; } },
  { name: 'FDA Drug Shortages', url: 'https://api.fda.gov/drug/shortages.json?search=generic_name:metformin&limit=1',
    validate: (body, sc) => { if (sc === 200) return true; if (sc === 404) { const d = JSON.parse(body); return d && d.error && d.error.code === 'NOT_FOUND'; } return false; } },
  { name: 'FDA Recall / Enforcement', url: 'https://api.fda.gov/drug/enforcement.json?search=openfda.generic_name:metformin&limit=1',
    validate: (body) => { const d = JSON.parse(body); return d && d.results && d.results.length > 0; } },
];

function checkApi(apiDef) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const transport = apiDef.url.startsWith('https') ? https : http;
    const req = transport.get(apiDef.url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const valid = apiDef.validate(body, res.statusCode);
          resolve({ name: apiDef.name, status: valid ? 'OK' : 'INVALID_RESPONSE', httpStatus: res.statusCode, responseMs: elapsed });
        } catch (err) {
          resolve({ name: apiDef.name, status: 'PARSE_ERROR', httpStatus: res.statusCode, responseMs: elapsed, error: err.message });
        }
      });
    });
    req.on('error', (err) => { resolve({ name: apiDef.name, status: 'DOWN', responseMs: Date.now() - startTime, error: err.message }); });
    req.on('timeout', () => { req.destroy(); resolve({ name: apiDef.name, status: 'TIMEOUT', responseMs: Date.now() - startTime, error: 'Request timed out (15s)' }); });
  });
}

module.exports = function (app) {
  app.get('/api/health/report', async (req, res) => {
    const token = process.env.HEALTH_TOKEN;
    if (token) {
      const auth = req.headers.authorization;
      if (!auth || auth !== 'Bearer ' + token) return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const [apis, caches, searchLog] = await Promise.all([
        Promise.all(API_CHECKS.map(checkApi)), Promise.resolve(checkCaches()), Promise.resolve(analyzeSearchLog())
      ]);
      const apisOk = apis.filter(a => a.status === 'OK').length;
      const apisFailed = apis.filter(a => a.status !== 'OK');
      const staleCaches = caches.filter(c => c.status === 'STALE');
      const missingCaches = caches.filter(c => c.status === 'MISSING');
      const issues = [];
      if (apisFailed.length > 0) issues.push(apisFailed.length + ' API(s) down');
      if (staleCaches.length > 0) issues.push(staleCaches.length + ' cache(s) stale');
      if (missingCaches.length > 0) issues.push(missingCaches.length + ' cache(s) missing');
      if (searchLog.status === 'OK' && !searchLog.zeroResultRateOk) issues.push('Zero-result rate above 5%');
      res.json({ timestamp: new Date().toISOString(), overall: issues.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND',
        issues, summary: { apisHealthy: apisOk + '/' + apis.length, cachesOk: caches.filter(c => c.status === 'OK').length + '/' + caches.length, searchLogStatus: searchLog.status },
        apis, caches, searchLog });
    } catch (err) { res.status(500).json({ error: 'Health report failed', message: err.message }); }
  });
};
