/**
 * patch-v1-4-1.js — RxGator 1.4.1 (Health Check Probe Fix)
 *
 * One deployment, four files, all-or-nothing:
 *   1. health-report.js       fix openFDA NDC probe URL
 *   2. version.json           1.4.0 -> 1.4.1
 *   3. CHANGELOG.md           add 1.4.1 entry
 *   4. RXGator-VersionLog.html add 1.4.1 entry, demote 1.4.0 from "Current"
 *
 * WHY: the probe searched "status:Current", which is not a field in the
 * openFDA NDC dataset. openFDA answers 404 when a search matches nothing,
 * so the health report showed INVALID_RESPONSE while the API was healthy.
 *
 * Every anchor is validated BEFORE any file is written. Backups are made
 * first. If the syntax check on health-report.js fails, all files are restored.
 *
 * Run on SERVER:  node /var/www/rxaggregator/patch-v1-4-1.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = '/var/www/rxaggregator';
const NEW_VERSION = '1.4.1';
const NEW_DATE = '2026-09-24';
const NEW_TITLE = 'Health Check Probe Fix';

const F = {
  health: BASE + '/health-report.js',
  version: BASE + '/version.json',
  changelog: BASE + '/CHANGELOG.md',
  versionLog: BASE + '/RXGator-VersionLog.html',
};

const OLD_URL = 'https://api.fda.gov/drug/ndc.json?search=status:Current&limit=3';
const NEW_URL = 'https://api.fda.gov/drug/ndc.json?search=generic_name:metformin&limit=3';

const CHANGELOG_ANCHOR = '## [1.4.0] — 2026-09-18';
const LOG_SECTION_OLD = '<section class="version current" aria-labelledby="v1-4-0">';
const LOG_SECTION_NEW = '<section class="version" aria-labelledby="v1-4-0">';
const LOG_H2_OLD = '<h2 id="v1-4-0">1.4.0 — 2026-09-18 <span class="badge">Current</span></h2>';
const LOG_H2_NEW = '<h2 id="v1-4-0">1.4.0 — 2026-09-18</h2>';

const CHANGELOG_ENTRY = [
  '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')',
  '',
  '### Fixed',
  '- openFDA NDC health probe in `health-report.js` searched `status:Current`, which is not a field in the openFDA NDC dataset. openFDA returns HTTP 404 when a search matches nothing, so `/api/health/report` showed `INVALID_RESPONSE` while the API was healthy. The probe now searches `generic_name:metformin`.',
  '',
  '### Notes',
  '- The 5.83% zero-result rate (target under 5%) needed no dictionary change. Vibegron, darolutamide, gemtesa, and nubeqa are already in the dictionary. The six zero-result rows came from test searches run from the server IP on 2026-09-18 during the gap-fix work, and they leave the 7-day window on 2026-09-25.',
  '',
  '---',
  '',
  '',
].join('\n');

const LOG_ENTRY = [
  '<section class="version current" aria-labelledby="v1-4-1">',
  '  <h2 id="v1-4-1">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>',
  '  <p><em>' + NEW_TITLE + '</em></p>',
  '',
  '  <h3>Fixed</h3>',
  '  <ul>',
  '    <li>openFDA NDC health probe in <code>health-report.js</code> searched <code>status:Current</code>, which is not a field in the openFDA NDC dataset. openFDA returns HTTP 404 when a search matches nothing, so <code>/api/health/report</code> showed <code>INVALID_RESPONSE</code> while the API was healthy. The probe now searches <code>generic_name:metformin</code>.</li>',
  '  </ul>',
  '',
  '  <h3>Notes</h3>',
  '  <ul>',
  '    <li>The 5.83% zero-result rate needed no dictionary change. Vibegron, darolutamide, gemtesa, and nubeqa are already in the dictionary. The six zero-result rows came from test searches run from the server IP on 2026-09-18 and leave the 7-day window on 2026-09-25.</li>',
  '  </ul>',
  '</section>',
  '',
  '',
].join('\n');

function abort(msg) {
  console.error('ABORT: ' + msg + ' No files were changed.');
  process.exit(1);
}
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

// ---- 1. Read everything ----
const src = {};
for (const key of Object.keys(F)) {
  try { src[key] = fs.readFileSync(F[key], 'utf8'); }
  catch (err) { abort('Cannot read ' + F[key] + ' (' + err.message + ').'); }
}

// ---- 2. Validate every anchor ----
if (count(src.health, NEW_URL) > 0) abort('health-report.js already patched.');
if (count(src.health, OLD_URL) !== 1) abort('Old probe URL must appear exactly once in health-report.js.');
const hIdx = src.health.indexOf(OLD_URL);
const hLine = src.health.slice(src.health.lastIndexOf('\n', hIdx) + 1, src.health.indexOf('\n', hIdx));
if (!hLine.includes("name: 'openFDA NDC'")) abort('Matched line is not the openFDA NDC entry.');

let ver;
try { ver = JSON.parse(src.version); } catch (err) { abort('version.json is not valid JSON.'); }
if (ver.APP_VERSION !== '1.4.0') abort('version.json is at ' + ver.APP_VERSION + ', expected 1.4.0.');

if (count(src.changelog, CHANGELOG_ANCHOR) !== 1) abort('CHANGELOG 1.4.0 heading must appear exactly once.');
if (count(src.versionLog, LOG_SECTION_OLD) !== 1) abort('VersionLog 1.4.0 section tag must appear exactly once.');
if (count(src.versionLog, LOG_H2_OLD) !== 1) abort('VersionLog 1.4.0 heading must appear exactly once.');

// ---- 3. Build new contents ----
const out = {};
out.health = src.health.slice(0, hIdx) + NEW_URL + src.health.slice(hIdx + OLD_URL.length);

ver.APP_VERSION = NEW_VERSION;
ver.APP_DATE = NEW_DATE;
ver.changelogEntry = NEW_TITLE;
out.version = JSON.stringify(ver, null, 2) + '\n';

const cIdx = src.changelog.indexOf(CHANGELOG_ANCHOR);
out.changelog = src.changelog.slice(0, cIdx) + CHANGELOG_ENTRY + src.changelog.slice(cIdx);

let log = src.versionLog.replace(LOG_H2_OLD, LOG_H2_NEW);
const sIdx = log.indexOf(LOG_SECTION_OLD);
log = log.slice(0, sIdx) + LOG_ENTRY + LOG_SECTION_NEW + log.slice(sIdx + LOG_SECTION_OLD.length);
out.versionLog = log;

// ---- 4. Back up, write, verify ----
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const backups = {};
for (const key of Object.keys(F)) {
  backups[key] = F[key] + '.pre-v1.4.1-' + stamp + '.bak';
  fs.copyFileSync(F[key], backups[key]);
  console.log('[BACKUP] ' + backups[key]);
}

function restoreAll(reason) {
  for (const key of Object.keys(F)) fs.copyFileSync(backups[key], F[key]);
  console.error('RESTORED all files from backup. Reason: ' + reason);
  process.exit(1);
}

for (const key of Object.keys(F)) fs.writeFileSync(F[key], out[key]);

try { execFileSync('node', ['--check', F.health]); }
catch (err) { restoreAll('syntax check failed on health-report.js'); }
try { JSON.parse(fs.readFileSync(F.version, 'utf8')); }
catch (err) { restoreAll('version.json is not valid JSON after write'); }

console.log('[OK] health-report.js probe URL fixed');
console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md entry added');
console.log('[OK] RXGator-VersionLog.html entry added, 1.4.0 demoted from Current');
console.log('\nNext: pm2 restart rxaggregator, then run the verification steps.');
