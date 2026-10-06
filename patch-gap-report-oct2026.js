/**
 * patch-gap-report-oct2026.js — fixes the weekly drug gap report (find-missing-drugs.js)
 * and repairs the dictionary drift behind it.
 *
 * Changes (all or nothing; every touched file is backed up and restored on any failure):
 *   1. find-missing-drugs.js
 *        - reads data/drug-names.json (the dictionary every patch updates), not public/
 *        - counts only the last 14 days of search_log.csv
 *        - skips the server's own IP and localhost
 *        - treats sources_hit = 0 as "no result" (newer log rows write 0, older rows leave it empty)
 *   2. data/drug-names.json
 *        - restores the darolutamide misspellings: nubeca, darolutimide, darolutomide
 *   3. public/drug-names.json
 *        - appends entries that exist in data/ but not in public/ (expected: vibegron,
 *          darolutamide, Adderall); aborts if more than 6 differ, so unexpected drift is never copied blindly
 *        - adds the same darolutamide misspellings
 *
 * Restart after running: pm2 restart rxaggregator  (the alias index loads at startup).
 *
 * USAGE:  node /var/www/rxaggregator/patch-gap-report-oct2026.js --dry-run
 *         node /var/www/rxaggregator/patch-gap-report-oct2026.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const REPORT_JS = path.join(BASE, 'find-missing-drugs.js');
const DATA_DICT = path.join(BASE, 'data', 'drug-names.json');
const PUBLIC_DICT = path.join(BASE, 'public', 'drug-names.json');
const MISSPELLINGS = { darolutamide: ['nubeca', 'darolutimide', 'darolutomide'] };
const MAX_SYNC = 6;

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function parseDict(p, text) {
  let arr;
  try { arr = JSON.parse(text); } catch (e) { abort(p + ' is not valid JSON.'); }
  if (!Array.isArray(arr)) abort(p + ' is not a top-level array.');
  return arr;
}
const gen = e => String((e && e.generic) || '').toLowerCase();

// Replace an anchor that must appear exactly once. indexOf/slice only (no regex).
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i === -1) abort('Anchor not found: ' + label);
  if (src.indexOf(anchor, i + anchor.length) !== -1) abort('Anchor is not unique: ' + label);
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

const HELPERS = [
  '// ---------- log filtering (v1.4.8) ----------',
  'const WINDOW_DAYS = 14;  // older rows are history, not signal',
  'const MS_PER_DAY = 24 * 60 * 60 * 1000;',
  "// The server's own test searches and localhost checks are not user demand.",
  "const IGNORED_IPS = new Set(['74.208.32.197', '127.0.0.1', '::1']);",
  '',
  'function normalizeIp(ip) {',
  "  return String(ip || '').replace(/^::ffff:/, '').trim();",
  '}',
  '',
  '// Old log rows leave sources_hit empty. Newer rows write 0.',
  'function isNoResult(sourcesHit) {',
  "  const v = String(sourcesHit || '').trim();",
  "  return v === '' || Number(v) === 0;",
  '}',
  '',
  'function filterRows(rows) {',
  '  const cutoff = Date.now() - WINDOW_DAYS * MS_PER_DAY;',
  '  return rows.filter(row => {',
  '    const t = Date.parse(row.timestamp);',
  '    if (Number.isNaN(t) || t < cutoff) return false;',
  '    return !IGNORED_IPS.has(normalizeIp(row.ip));',
  '  });',
  '}',
  '',
  ''
].join('\n');

// ---- load everything first ----
const srcReport = read(REPORT_JS);
if (srcReport.includes('WINDOW_DAYS')) { console.log('Already applied (find-missing-drugs.js has WINDOW_DAYS). Nothing to do.'); process.exit(0); }
const srcData = read(DATA_DICT);
const srcPublic = read(PUBLIC_DICT);
const data = parseDict(DATA_DICT, srcData);
const pub = parseDict(PUBLIC_DICT, srcPublic);

// ---- 1. build the new report script ----
let rep = srcReport;
rep = replaceOnce(rep, 'cross-references them against public/drug-names.json,', 'cross-references them against data/drug-names.json,', 'header comment');
rep = replaceOnce(rep, "const DRUG_NAMES_FILE = path.join(BASE_DIR, 'public', 'drug-names.json');", "const DRUG_NAMES_FILE = path.join(BASE_DIR, 'data', 'drug-names.json');", 'DRUG_NAMES_FILE');
rep = replaceOnce(rep, '// ---------- main analysis ----------', HELPERS + '// ---------- main analysis ----------', 'main analysis marker');
rep = replaceOnce(rep, 'const rows = loadSearchLog(SEARCH_LOG);', 'const rows = filterRows(loadSearchLog(SEARCH_LOG));', 'loadSearchLog call');
rep = replaceOnce(rep, "if (!row.sources_hit || row.sources_hit === '') s.noResult++;", 'if (isNoResult(row.sources_hit)) s.noResult++;', 'noResult test');
rep = replaceOnce(rep, 'lines.push(`Total searches in log: ${report.windowSearches}`);',
  'lines.push(`Searches in the last ${WINDOW_DAYS} days (server and localhost excluded): ${report.windowSearches}`);', 'email line');

// ---- 2 and 3. dictionaries ----
function addMisspellings(arr) {
  const added = [];
  for (const [generic, words] of Object.entries(MISSPELLINGS)) {
    const entry = arr.find(e => gen(e) === generic);
    if (!entry) abort('No "' + generic + '" entry to attach misspellings to.');
    const have = new Set((entry.commonMisspellings || []).map(w => String(w).toLowerCase()));
    const fresh = words.filter(w => !have.has(w));
    if (fresh.length) entry.commonMisspellings = (entry.commonMisspellings || []).concat(fresh);
    added.push(generic + ': +' + fresh.length);
  }
  return added;
}
const dataBefore = JSON.stringify(data);
const dataNotes = addMisspellings(data);

const pubSet = new Set(pub.map(gen));
const toSync = data.filter(e => gen(e) && !pubSet.has(gen(e)));
if (toSync.length > MAX_SYNC) abort(toSync.length + ' entries differ between data/ and public/ (limit ' + MAX_SYNC + '): ' + toSync.map(gen).join(', ') + '. Review before syncing.');
for (const e of toSync) pub.push(JSON.parse(JSON.stringify(e)));
const pubNotes = addMisspellings(pub);

console.log('--- PLAN ---');
console.log('find-missing-drugs.js   6 edits (path, window, IP filter, zero count, email line, helpers)');
console.log('data/drug-names.json    ' + dataNotes.join('; ') + (JSON.stringify(data) === dataBefore ? ' (already present)' : ''));
console.log('public/drug-names.json  +' + toSync.length + ' entries (' + (toSync.map(gen).join(', ') || 'none') + '); ' + pubNotes.join('; '));
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

// ---- write with rollback ----
const FILES = [
  { p: REPORT_JS, src: srcReport, out: rep },
  { p: DATA_DICT, src: srcData, out: JSON.stringify(data, null, 2) + '\n' },
  { p: PUBLIC_DICT, src: srcPublic, out: JSON.stringify(pub, null, 2) + '\n' },
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const written = [];
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const f of written) fs.writeFileSync(f.p, f.src, 'utf8');
  process.exit(1);
}
for (const f of FILES) fs.copyFileSync(f.p, f.p + '.pre-v1.4.8-' + stamp + '.bak');
try {
  for (const f of FILES) { fs.writeFileSync(f.p, f.out, 'utf8'); written.push(f); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { execFileSync(process.execPath, ['--check', REPORT_JS], { stdio: 'pipe' }); }
catch (e) { restoreAll('find-missing-drugs.js failed the syntax check'); }
try {
  const d = JSON.parse(read(DATA_DICT)); const p = JSON.parse(read(PUBLIC_DICT));
  if (!d.some(e => (e.commonMisspellings || []).includes('nubeca'))) throw new Error('nubeca missing in data/');
  if (!p.some(e => (e.commonMisspellings || []).includes('nubeca'))) throw new Error('nubeca missing in public/');
} catch (e) { restoreAll('dictionary check failed: ' + e.message); }

console.log('[OK] find-missing-drugs.js patched and syntax-checked.');
console.log('[OK] data/ and public/ drug-names.json updated. Backups: *.pre-v1.4.8-' + stamp + '.bak');
console.log('NEXT: run "pm2 restart rxaggregator", then search "nubeca" in a browser.');
