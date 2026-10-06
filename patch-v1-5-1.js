/**
 * patch-v1-5-1.js — release bookkeeping for 1.5.1 (Banner Fix)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.5.0 -> 1.5.1
 *   2. CHANGELOG.md              new [1.5.1] section above [1.5.0]
 *   3. RXGator-VersionLog.html   new 1.5.1 section marked Current; 1.5.0 loses the badge
 *
 * Run AFTER build-derived-lookup.js --write. The patch refuses to run if the lookup still has generic-name keys.
 * It backs up all three files and restores them if any write fails. Restart is not needed.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-5-1.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-5-1.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_VERSION = '1.5.0';
const NEW_VERSION = '1.5.1';
const NEW_DATE = '2026-10-05';
const NEW_TITLE = 'Banner Fix';

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Fixed', items: [
    'A search for a generic name no longer shows the banner "You searched for the brand name". The 1.5.0 lookup had a row for every generic name, and the banner treated each row as a brand.',
    'The generic banner no longer shows an empty "Typical savings vs. brand" box when a drug has no savings range on file.',
  ]},
  { title: 'Changed', items: [
    '`scripts/build-derived-lookup.js` now makes a lookup key from each brand and each alias. It no longer makes a key from the generic name.',
    '`public/app.html` prints the savings line of the generic banner only when the lookup has a value.',
  ]},
  { title: 'Added', items: [
    '`patch-banner-1-5-1.js` — the banner change, kept for the audit trail.',
  ]},
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toHtml(s) { return escHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

function buildChangelog() {
  let out = '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')\n\n';
  for (const sec of SECTIONS) out += '### ' + sec.title + '\n' + sec.items.map(i => '- ' + i).join('\n') + '\n\n';
  return out + '---\n\n';
}
function buildVersionLog() {
  let out = '<section class="version current" aria-labelledby="v1-5-1">\n';
  out += '  <h2 id="v1-5-1">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
  out += '  <p><em>' + NEW_TITLE + '</em></p>\n\n';
  for (const sec of SECTIONS) {
    out += '  <h3>' + sec.title + '</h3>\n  <ul>\n' + sec.items.map(i => '    <li>' + toHtml(i) + '</li>').join('\n') + '\n  </ul>\n\n';
  }
  return out.replace(/\n\n$/, '\n') + '</section>\n\n';
}

const src = { version: read(FILES.version), changelog: read(FILES.changelog), versionLog: read(FILES.versionLog) };

// ---- guards ----
let ver; try { ver = JSON.parse(src.version); } catch (e) { abort('version.json is not valid JSON.'); }
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '.');
if (src.changelog.includes('## [' + NEW_VERSION + ']')) abort('CHANGELOG.md already has ' + NEW_VERSION + '.');
if (src.versionLog.includes('id="v1-5-1"')) abort('VersionLog already has 1.5.1.');
const oldOpen = '<section class="version current" aria-labelledby="v1-5-0">';
const oldBadge = '1.5.0 — 2026-10-05 <span class="badge">Current</span>';
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the 1.5.0 current section.');
if (!src.versionLog.includes(oldBadge)) abort('VersionLog: could not find the 1.5.0 badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
const lookupPath = path.join(BASE, 'data', 'brand-generic-lookup.json');
if (!fs.existsSync(lookupPath)) abort('data/brand-generic-lookup.json is missing.');
const lookupRows = JSON.parse(read(lookupPath));
if (Object.keys(lookupRows).some(k => lookupRows[k].generic === k)) abort('Run build-derived-lookup.js --write first: the lookup still has generic-name keys.');

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="v1-5-0">')
    .replace(oldBadge, '1.5.0 — 2026-10-05'),
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
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], FILES[k] + '.pre-v1.5.1-' + stamp + '.bak');
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="v1-5-1"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: *.pre-v1.5.1-' + stamp + '.bak');
