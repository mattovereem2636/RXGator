#!/usr/bin/env node
/**
 * patch-v1-5-2-brand-banner.js — release bookkeeping for 1.5.2 (Brand Banner Fix).
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.5.1 -> 1.5.2
 *   2. CHANGELOG.md              new [1.5.2] section above [1.5.1]
 *   3. RXGator-VersionLog.html   new 1.5.2 section marked Current; 1.5.1 loses the badge
 *
 * Run AFTER patch-brand-banner-1-5-2.js. It refuses to run until app.html has brandSearchBox().
 * Backs up all three files and restores them if any write fails. Restart is not needed.
 * Same structure as deploy-seo-baseline-1-5-2/patch-v1-5-2.js (that bundle is now 1.5.3).
 *
 * USAGE:  node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-v1-5-2-brand-banner.js --dry-run
 *         node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-v1-5-2-brand-banner.js [--date=YYYY-MM-DD]
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7);
const NEW_DATE = dateArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const OLD_VERSION = '1.5.1';
const NEW_VERSION = '1.5.2';
const NEW_TITLE = 'Brand Banner Fix';
const OLD_ID = 'v' + OLD_VERSION.replace(/\./g, '-');
const NEW_ID = 'v' + NEW_VERSION.replace(/\./g, '-');

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const APP = path.join(BASE, 'public', 'app.html');

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Fixed', items: [
    'The "Brand Name Search" box on `/app` said the prices were for an FDA-rated generic equivalent on every brand search, including brand-only drugs such as Addyi where no generic is sold. The box now reads the dictionary: a generic is sold (prices include it), RXGator records show no U.S. generic (prices are for the brand), or no record (check the drug name on each price card).',
    'The box is now in English and Spanish. It was English only.',
  ]},
  { title: 'Data', items: [
    'SingleCare prices for Addyi (flibanserin), Vyleesi (bremelanotide), Osphena (ospemifene), and Myfembree, imported 2026-10-14 with `import-singlecare-womens-health.js`. Myfembree is cached but does not show yet: RxNorm resolves it to relugolix, which is also Orgovyx.',
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
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '.');
if (src.changelog.includes('## [' + NEW_VERSION + ']')) abort('CHANGELOG.md already has ' + NEW_VERSION + '.');
if (src.versionLog.includes('id="' + NEW_ID + '"')) abort('VersionLog already has ' + NEW_VERSION + '.');
const oldOpen = '<section class="version current" aria-labelledby="' + OLD_ID + '">';
const badgeMatch = src.versionLog.match(new RegExp(OLD_VERSION.replace(/\./g, '\\.') + ' — (\\d{4}-\\d{2}-\\d{2}) <span class="badge">Current</span>'));
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the ' + OLD_VERSION + ' current section.');
if (!badgeMatch) abort('VersionLog: could not find the ' + OLD_VERSION + ' badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
if (!read(APP).includes('function brandSearchBox(')) abort('app.html has no brandSearchBox(). Run patch-brand-banner-1-5-2.js first so the app version never runs ahead of the work.');

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
