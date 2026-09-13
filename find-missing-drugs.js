#!/usr/bin/env node
/**
 * find-missing-drugs.js
 *
 * Weekly job: scans search_log.csv for drug searches that returned no
 * price results, cross-references them against public/drug-names.json,
 * and separates genuine "add this drug" candidates from:
 *   - typos of a known drug that aren't yet in its commonMisspellings list
 *   - drugs that ARE in the dictionary but no price source ever returned data
 *
 * Run: node find-missing-drugs.js
 * Output: logs/drug-gap-report-<date>.json + emails a summary via Resend
 *         (reuses the same .env.healthcheck / Resend setup as the health checks)
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const SEARCH_LOG = path.join(BASE_DIR, 'search_log.csv');
const DRUG_NAMES_FILE = path.join(BASE_DIR, 'public', 'drug-names.json');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const ENV_FILE = path.join(BASE_DIR, '.env.healthcheck');

const ALERT_EMAIL = 'mattovereem@gmail.com';
const MIN_NO_RESULT_SEARCHES = 2; // a term needs at least this many zero-result searches to count as signal
const FUZZY_MAX_DISTANCE = 2;     // edit-distance threshold for "likely a typo of a known drug"

// ---------- load key=value pairs from .env.healthcheck ----------
function loadEnv(file) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

// ---------- minimal CSV line parser (handles quoted fields) ----------
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function loadSearchLog(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => { row[h] = (fields[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ---------- Levenshtein edit distance ----------
function editDistance(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// ---------- build lookup structures from drug-names.json ----------
function loadDictionary(file) {
  const known = new Set();     // exact-match set: generic + brands + aliases + commonMisspellings
  const fuzzyTargets = [];     // [{term, generic}] — generic + brand names only, used for fuzzy scan
  if (!fs.existsSync(file)) return { known, fuzzyTargets };
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const e of entries) {
    const generic = (e.generic || '').toLowerCase();
    if (generic) {
      known.add(generic);
      fuzzyTargets.push({ term: generic, generic });
    }
    for (const b of e.brands || []) {
      const t = b.toLowerCase();
      known.add(t);
      fuzzyTargets.push({ term: t, generic: generic || t });
    }
    for (const a of e.aliases || []) known.add(a.toLowerCase());
    for (const m of e.commonMisspellings || []) known.add(m.toLowerCase());
  }
  return { known, fuzzyTargets };
}

function closestKnownDrug(term, fuzzyTargets) {
  let best = null;
  let bestDist = Infinity;
  for (const { term: kTerm, generic } of fuzzyTargets) {
    if (Math.abs(kTerm.length - term.length) > FUZZY_MAX_DISTANCE + 2) continue; // cheap prefilter
    const d = editDistance(term, kTerm);
    if (d < bestDist) {
      bestDist = d;
      best = generic;
    }
  }
  return bestDist <= FUZZY_MAX_DISTANCE ? { generic: best, distance: bestDist } : null;
}

// ---------- main analysis ----------
function analyze() {
  const rows = loadSearchLog(SEARCH_LOG);
  const { known, fuzzyTargets } = loadDictionary(DRUG_NAMES_FILE);

  const stats = new Map(); // normalized term -> { total, noResult, examples: Set }
  for (const row of rows) {
    const raw = (row.drug || '').trim();
    if (!raw) continue;
    const term = raw.toLowerCase();
    if (!stats.has(term)) stats.set(term, { total: 0, noResult: 0, examples: new Set() });
    const s = stats.get(term);
    s.total++;
    s.examples.add(raw);
    if (!row.sources_hit || row.sources_hit === '') s.noResult++;
  }

  const missingCandidates = [];  // genuine gaps: not in dictionary, no close fuzzy match either
  const nearMisses = [];         // typos of a known drug not yet in commonMisspellings
  const knownNoPriceData = [];   // exact dictionary match, but still returned no price

  for (const [term, s] of stats.entries()) {
    if (s.noResult < MIN_NO_RESULT_SEARCHES) continue; // not enough signal — skip one-off typos/noise

    if (known.has(term)) {
      knownNoPriceData.push({ term, noResultCount: s.noResult, totalSearches: s.total });
      continue;
    }
    const fuzzy = closestKnownDrug(term, fuzzyTargets);
    if (fuzzy) {
      nearMisses.push({ term, closestMatch: fuzzy.generic, distance: fuzzy.distance, noResultCount: s.noResult });
    } else {
      missingCandidates.push({
        term,
        noResultCount: s.noResult,
        totalSearches: s.total,
        examples: [...s.examples].slice(0, 3),
      });
    }
  }

  missingCandidates.sort((a, b) => b.noResultCount - a.noResultCount);
  nearMisses.sort((a, b) => b.noResultCount - a.noResultCount);
  knownNoPriceData.sort((a, b) => b.noResultCount - a.noResultCount);

  return {
    generatedAt: new Date().toISOString(),
    windowSearches: rows.length,
    missingCandidates,
    nearMisses,
    knownNoPriceData,
  };
}

function writeReport(report) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const outFile = path.join(LOGS_DIR, `drug-gap-report-${dateStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  return outFile;
}

function buildEmailBody(report, outFile) {
  const lines = [];
  lines.push(`RxGator Drug Gap Report — ${report.generatedAt}`);
  lines.push(`Total searches in log: ${report.windowSearches}`);
  lines.push('');

  lines.push(`=== Candidates to add (${report.missingCandidates.length}) ===`);
  if (report.missingCandidates.length === 0) lines.push('None this run.');
  for (const c of report.missingCandidates.slice(0, 25)) {
    lines.push(`  ${c.term} — ${c.noResultCount}x no match. e.g. "${c.examples.join('", "')}"`);
  }
  lines.push('');

  lines.push(`=== Likely typos not yet in commonMisspellings (${report.nearMisses.length}) ===`);
  if (report.nearMisses.length === 0) lines.push('None this run.');
  for (const n of report.nearMisses.slice(0, 25)) {
    lines.push(`  "${n.term}" -> probably "${n.closestMatch}" (edit distance ${n.distance}), missed ${n.noResultCount}x`);
  }
  lines.push('');

  lines.push(`=== Known drugs with no price source hit (${report.knownNoPriceData.length}) ===`);
  if (report.knownNoPriceData.length === 0) lines.push('None this run.');
  for (const k of report.knownNoPriceData.slice(0, 25)) {
    lines.push(`  ${k.term} — ${k.noResultCount}x no price found out of ${k.totalSearches} searches`);
  }
  lines.push('');
  lines.push(`Full report: ${outFile}`);

  return lines.join('\n');
}

async function sendReportEmail(subject, body) {
  const env = loadEnv(ENV_FILE);
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY not set in .env.healthcheck — skipping email.');
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RxGator Health <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject,
        text: body,
      }),
    });
  } catch (err) {
    console.error('Failed to send report email:', err.message);
  }
}

(async () => {
  const report = analyze();
  const outFile = writeReport(report);
  const subject = report.missingCandidates.length > 0
    ? `RxGator: ${report.missingCandidates.length} new drug candidate(s) this week`
    : 'RxGator: weekly drug gap report — no new candidates';
  const body = buildEmailBody(report, outFile);
  await sendReportEmail(subject, body);

  console.log(`Drug gap report written to ${outFile}`);
  console.log(
    `Candidates: ${report.missingCandidates.length}, ` +
    `near-misses: ${report.nearMisses.length}, ` +
    `known-no-price: ${report.knownNoPriceData.length}`
  );
})();
