/**
 * patch-v1-4-4.js — release bookkeeping for 1.4.4 (Manufacturer Links and Dictionary Fix)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.4.3 -> 1.4.4
 *   2. CHANGELOG.md              new [1.4.4] section above [1.4.3]
 *   3. RXGator-VersionLog.html   new 1.4.4 section marked Current; 1.4.3 loses the badge
 *
 * Run AFTER patch-dictionary-oct2026b.js and patch-mfr-links-oct2026.js. The patch refuses to
 * run if those data changes are missing. It backs up all three files and restores them if any
 * write fails. Restart is not needed for these files.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-4-4.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-4-4.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_VERSION = '1.4.3';
const NEW_VERSION = '1.4.4';
const NEW_DATE = '2026-10-01';
const NEW_TITLE = 'Manufacturer Links and Dictionary Fix';

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const GUARDS = {
  mfr: path.join(BASE, 'manufacturer_assistance.json'),
  dict: path.join(BASE, 'data', 'drug-names.json'),
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Added', items: [
    'Dictionary entries for vibegron (Gemtesa), darolutamide (Nubeqa), and amphetamine/dextroamphetamine (Adderall). The 1.4.2 brand alias builds its index from these entries.',
    'Dictionary entries for dupilumab (Dupixent) and fostemsavir (Rukobia), from the October gap patch.',
    'Manufacturer assistance entries for darolutamide (Nubeqa) and vibegron (Gemtesa) in `manufacturer_assistance.json`.',
    '`check-mfr-links.js` — a read-only checker for every program link in `manufacturer_assistance.json` and `public/pap-database.json`. Run it with each quarterly content audit.',
    '`patch-dictionary-oct2026b.js` and `patch-mfr-links-oct2026.js` — data patches for this release, kept for the audit trail.',
  ]},
  { title: 'Changed', items: [
    'Corrected program links and eligibility text for empagliflozin, tirzepatide, semaglutide, and apixaban in `manufacturer_assistance.json`.',
    'Replaced dollar amounts in program text with a pointer to the program page. The official pages show different amounts, and those amounts change.',
    'Corrected the Novo Nordisk and BMS patient assistance links in `public/pap-database.json` (now 1.0.1). Removed stale retail prices from its notes.',
  ]},
  { title: 'Fixed', items: [
    'Seven program links returned errors or sent patients to a page for healthcare professionals. These covered the Jardiance savings card, the BI Cares link in `manufacturer_assistance.json`, the Ozempic savings card, two Novo Nordisk assistance links, and two BMS assistance links.',
    'The dictionary lacked the vibegron and darolutamide entries that the 1.4.2 brand alias needs. The cause is not known.',
  ]},
  { title: 'Known Issues', items: [
    'Four program links need a browser check. Automated tools could not read them: BI Cares, Lilly Cares, the BMS Patient Assistance Foundation site, and the Gemtesa program terms. Each carries `needsReview` in the data.',
    'Zepbound has no program of its own. It shows the Mounjaro card.',
    '`build-dictionary.js` writes both dictionary files from its own list. It erases entries that patch scripts add. Do not run it until those entries move into its list.',
    'The other 13 drugs in `manufacturer_assistance.json` have not been link-checked. Run `check-mfr-links.js`.',
    'Adderall returns no prices from SingleCare, GoodRx, Blink Health, Inside Rx, and Health Warehouse. Nubeqa returns one source. The cache key gaps are not investigated.',
    'The Ozempic page lists tablet form and oral route (Rybelsus data). It also lists recalls from Apollo Care, LLC under "this medication". The matching logic is not reviewed.',
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
  let out = '<section class="version current" aria-labelledby="v1-4-4">\n';
  out += '  <h2 id="v1-4-4">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
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
if (src.versionLog.includes('id="v1-4-4"')) abort('VersionLog already has 1.4.4.');
const oldOpen = '<section class="version current" aria-labelledby="v1-4-3">';
const oldBadge = '1.4.3 — 2026-09-24 <span class="badge">Current</span>';
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the 1.4.3 current section.');
if (!src.versionLog.includes(oldBadge)) abort('VersionLog: could not find the 1.4.3 badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
let mfr; try { mfr = JSON.parse(read(GUARDS.mfr)); } catch (e) { abort('manufacturer_assistance.json is not valid JSON.'); }
if (!mfr.darolutamide || !mfr.vibegron) abort('Run patch-mfr-links-oct2026.js first: darolutamide and vibegron are missing.');
if (!/vibegron/i.test(read(GUARDS.dict))) abort('Run patch-dictionary-oct2026b.js first: vibegron is missing from data/drug-names.json.');

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="v1-4-3">')
    .replace(oldBadge, '1.4.3 — 2026-09-24'),
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
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], FILES[k] + '.pre-v1.4.4-' + stamp + '.bak');
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="v1-4-4"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: *.pre-v1.4.4-' + stamp + '.bak');
