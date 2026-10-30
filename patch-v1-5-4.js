#!/usr/bin/env node
/**
 * patch-v1-5-4.js — release bookkeeping for 1.5.4 (Brand Lookup and Pack Sizes). Rebuilt 2026-10-29.
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.5.3 -> 1.5.4
 *   2. CHANGELOG.md              new [1.5.4] section above the previous release
 *   3. RXGator-VersionLog.html   new 1.5.4 section marked Current; the previous release loses the badge
 *
 * ORDER: the SEO bundle (deploy-seo-baseline-1-5-2, writes 1.5.3) ships first. This script expects 1.5.3.
 * To ship 1.5.4 before the SEO bundle, pass --allow-from-1.5.2. The SEO bundle then refuses to run
 * until its lib/config.js says 1.5.4 -> 1.5.5.
 *
 * Run AFTER patch-1-5-4-code.js. It refuses to run until the code changes are in place.
 * Backs up all three files and restores them if any write fails. Restart is not needed for this step.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-5-4.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-5-4.js [--date=YYYY-MM-DD] [--allow-from-1.5.2]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const ALLOW_FROM_152 = process.argv.includes('--allow-from-1.5.2');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7);
const NEW_DATE = dateArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const NEW_VERSION = '1.5.4';
const NEW_TITLE = 'Brand Lookup and Pack Sizes';
const NEW_ID = 'v' + NEW_VERSION.replace(/\./g, '-');
const ALLOWED_OLD = ALLOW_FROM_152 ? ['1.5.3', '1.5.2'] : ['1.5.3'];

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
/** Proof that patch-1-5-4-code.js ran: file -> text it adds. */
const CODE_MARKERS = {
  'cache-manager.js': 'resolveTypedCacheKey(drugName, typedName, singleCareCache)',
  'brand-alias.js': 'function resolveTypedCacheKey(',
  'health-report.js': 'excludedFromRates: excluded',
  'health-report-config.js': 'function classifyIp(',
  'public/app.html': "drug-names.json?v=1.5.4",
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Fixed', items: [
    'A search for Myfembree now shows its SingleCare price. The search resolved Myfembree to relugolix, and the relugolix brand alias is Orgovyx, a different product. The price lookup now tries the name the user typed first, and it skips the alias when the typed name belongs to a different drug.',
    'A price for a pack that is not a 30-day or 90-day supply now says "for N units" ("por N unidades" in Spanish), for example Vyleesi (4 pens) and Myfembree (28 tablets). These prices no longer show a made-up 90-day price.',
    'The SingleCare note no longer says "30-count" when the cache has no package size. It says "package size not listed".',
    'The "30-day" and "90-day" labels on price cards are now in Spanish on the Spanish page.',
  ]},
  { title: 'Changed', items: [
    '`/api/health/report` leaves searches from the server, from loopback, and from the Alibaba Cloud crawler out of the zero-result rate. The report lists how many it left out (`excludedFromRates`). The address lists are in `health-report-config.js`.',
    '`/app` loads `/data/drug-names.json?v=1.5.4`, so browsers fetch the new dictionary after a release.',
  ]},
  { title: 'Added', items: [
    '`health-report-config.js` and `patch-1-5-4-code.js` (the code change, kept for the audit trail).',
  ]},
  { title: 'Notes', items: [
    'Autocomplete on `/app` was broken from 1.4.9 to 2026-10-14: `/data/drug-names.json` returned 404. Commit 4a92c7b fixed it with a symlink in `public/data/`. It shipped between releases and is recorded here.',
  ]},
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toHtml(s) { return escHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

function buildChangelog() {
  let out = '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')\n\n';
  for (const sec of SECTIONS) out += '### ' + sec.title + '\n' + sec.items.map((i) => '- ' + i).join('\n') + '\n\n';
  return out + '---\n\n';
}
function buildVersionLog() {
  let out = '<section class="version current" aria-labelledby="' + NEW_ID + '">\n';
  out += '  <h2 id="' + NEW_ID + '">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
  out += '  <p><em>' + NEW_TITLE + '</em></p>\n\n';
  for (const sec of SECTIONS) {
    out += '  <h3>' + sec.title + '</h3>\n  <ul>\n' + sec.items.map((i) => '    <li>' + toHtml(i) + '</li>').join('\n') + '\n  </ul>\n\n';
  }
  return out.replace(/\n\n$/, '\n') + '</section>\n\n';
}

const src = { version: read(FILES.version), changelog: read(FILES.changelog), versionLog: read(FILES.versionLog) };

// ---- guards ----
let ver; try { ver = JSON.parse(src.version); } catch (e) { abort('version.json is not valid JSON.'); }
const OLD_VERSION = ver.APP_VERSION;
if (OLD_VERSION === '1.5.2' && !ALLOW_FROM_152) {
  abort('version.json is at 1.5.2. Deploy the SEO bundle (1.5.3) first, or pass --allow-from-1.5.2 to ship 1.5.4 ahead of it.');
}
if (!ALLOWED_OLD.includes(OLD_VERSION)) abort('version.json is at ' + OLD_VERSION + ', expected ' + ALLOWED_OLD.join(' or ') + '.');
const OLD_ID = 'v' + OLD_VERSION.replace(/\./g, '-');
if (src.changelog.includes('## [' + NEW_VERSION + ']')) abort('CHANGELOG.md already has ' + NEW_VERSION + '.');
if (src.versionLog.includes('id="' + NEW_ID + '"')) abort('VersionLog already has ' + NEW_VERSION + '.');
const oldOpen = '<section class="version current" aria-labelledby="' + OLD_ID + '">';
const badgeMatch = src.versionLog.match(new RegExp(OLD_VERSION.replace(/\./g, '\\.') + ' — (\\d{4}-\\d{2}-\\d{2}) <span class="badge">Current</span>'));
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the ' + OLD_VERSION + ' current section.');
if (!badgeMatch) abort('VersionLog: could not find the ' + OLD_VERSION + ' badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
for (const [file, marker] of Object.entries(CODE_MARKERS)) {
  if (!read(path.join(BASE, file)).includes(marker)) {
    abort(file + ' does not have the 1.5.4 change. Run patch-1-5-4-code.js first so the app version never runs ahead of the work.');
  }
}

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="' + OLD_ID + '">')
    .replace(badgeMatch[0], OLD_VERSION + ' — ' + badgeMatch[1]),
};

console.log('--- PLAN ---');
console.log('version.json            ' + OLD_VERSION + ' -> ' + NEW_VERSION + ' (' + NEW_DATE + ', "' + NEW_TITLE + '")');
console.log('CHANGELOG.md            +' + (out.changelog.length - src.changelog.length) + ' chars');
console.log('RXGator-VersionLog.html +' + (out.versionLog.length - src.versionLog.length) + ' chars');
if (OLD_VERSION === '1.5.2') console.log('NOTE: shipping ahead of the SEO bundle. Change its lib/config.js RELEASE to 1.5.4 -> 1.5.5 before you run it.');
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

// ---- write with rollback ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const written = [];
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const k of written) fs.writeFileSync(FILES[k], src[k], 'utf8');
  process.exit(1);
}
const bakDir = path.join(BASE, 'backups', 'v' + NEW_VERSION + '-' + stamp);
fs.mkdirSync(bakDir, { recursive: true });
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], path.join(bakDir, path.basename(FILES[k])));
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }
try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="' + NEW_ID + '"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: ' + bakDir);
