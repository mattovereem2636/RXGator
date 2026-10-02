/**
 * patch-v1-4-7.js — release bookkeeping for 1.4.7 (Search Match Fix)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.4.6 -> 1.4.7
 *   2. CHANGELOG.md              new [1.4.7] section above [1.4.6]
 *   3. RXGator-VersionLog.html   new 1.4.7 section marked Current; 1.4.6 loses the badge
 *
 * Run AFTER patch-mfr-links3-oct2026.js. The patch refuses to run if that data change is missing. It backs up all three files and restores them if any
 * write fails. Restart is not needed for these files.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-4-7.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-4-7.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_VERSION = '1.4.6';
const NEW_VERSION = '1.4.7';
const NEW_DATE = '2026-10-01';
const NEW_TITLE = 'Search Match Fix';

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const FILES_TO_CHECK = ['rxoutreach.js', 'ira-negotiated.js', 'texas-wac.js', 'va-fss.js'];

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Added', items: [
    '`patch-search-match-oct2026.js` — fixes drug-name matching in four source modules, kept for the audit trail.',
  ]},
  { title: 'Changed', items: [
    '`rxoutreach.js`, `ira-negotiated.js`, `texas-wac.js`, and `va-fss.js` now match a drug only when the typed text starts the indexed name, or the query begins with the whole indexed name.',
    'These four modules no longer match short names inside a long query, and no longer match text from the middle of a name.',
  ]},
  { title: 'Fixed', items: [
    'A search for a combination drug no longer returns unrelated drugs from these four sources. A Descovy search returned tenofovir disoproxil and methylphenidate LA rows from Rx Outreach.',
  ]},
  { title: 'Known Issues', items: [
    'The Walmart and Amazon RxPass lists in `retail-sources.js` and two lookups in `govt-data.js` use the same loose two-way match. They are not fixed.',
    'Text from the middle of a drug name (for example "statin") no longer finds a drug in these four sources.',
    'About a dozen manufacturer links return 403 to automated requests. Confirm each one by hand.',
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
  let out = '<section class="version current" aria-labelledby="v1-4-7">\n';
  out += '  <h2 id="v1-4-7">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
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
if (src.versionLog.includes('id="v1-4-7"')) abort('VersionLog already has 1.4.7.');
const oldOpen = '<section class="version current" aria-labelledby="v1-4-6">';
const oldBadge = '1.4.6 — 2026-10-01 <span class="badge">Current</span>';
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the 1.4.6 current section.');
if (!src.versionLog.includes(oldBadge)) abort('VersionLog: could not find the 1.4.6 badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
const matchPatched = FILES_TO_CHECK.every(f => read(path.join(BASE, f)).includes('MIN_PARTIAL_LENGTH'));
if (!matchPatched) abort('Run patch-search-match-oct2026.js first: one of the four source modules is not patched.');

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="v1-4-6">')
    .replace(oldBadge, '1.4.6 — 2026-10-01'),
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
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], FILES[k] + '.pre-v1.4.7-' + stamp + '.bak');
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="v1-4-7"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: *.pre-v1.4.7-' + stamp + '.bak');
