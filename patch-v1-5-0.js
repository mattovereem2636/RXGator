/**
 * patch-v1-5-0.js — release bookkeeping for 1.5.0 (Coverage)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.4.9 -> 1.5.0
 *   2. CHANGELOG.md              new [1.5.0] section above [1.4.9]
 *   3. RXGator-VersionLog.html   new 1.5.0 section marked Current; 1.4.9 loses the badge
 *
 * Run AFTER patch-coverage-1-5-0.js. The patch refuses to run if that change is missing.
 * It backs up all three files and restores them if any write fails. Restart is not needed.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-5-0.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-5-0.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_VERSION = '1.4.9';
const NEW_VERSION = '1.5.0';
const NEW_DATE = '2026-10-05';
const NEW_TITLE = 'Coverage';

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Added', items: [
    'About 75 common generics in `data/drug-names.json`, each with brands, drug class, primary use, and Spanish text. Examples: ezetimibe, telmisartan, paroxetine, valacyclovir, and sacubitril/valsartan.',
    '`scripts/build-derived-lookup.js` — generates `data/brand-generic-lookup.json` from the master. Its `--check` mode compares the two files and writes nothing.',
    'The aliases "ozempic pill", "ozempic tablets", and "wegovy pill" on semaglutide. The Ozempic pill launched in the US on May 4, 2026.',
    'The optional master fields `typicalSavings` and `pricingNames`. The lookup uses them to price a search the same way as before.',
    '`patch-coverage-1-5-0.js` and `coverage-1-5-0.json` — the one-time import, kept for the audit trail.',
  ]},
  { title: 'Changed', items: [
    'Zantac now belongs to famotidine. Zantac 360 contains famotidine, not ranitidine.',
    '`retail-sources.js` now reads `data/brand-generic-lookup.json`, which is generated from the master.',
    '`scripts/add-dictionary-term.js` now refreshes the lookup as well as the map when it adds a brand or an alias.',
    'Semaglutide, tirzepatide, empagliflozin, apixaban, and rivaroxaban now have `hasGeneric` set to false. No generic of the brand product sells in the US.',
    'Ticagrelor, mirabegron, sacubitril/valsartan, lisdexamfetamine, and cyclosporine ophthalmic now have `hasGeneric` set to true. Generics launched.',
  ]},
  { title: 'Removed', items: [
    'The hand-kept `brand-generic-lookup.json` in the app root, moved to `_to_delete/`.',
    'The stale `brand-generic-map.json` in the app root, moved to `_to_delete/`. The live copy is in `data/`.',
  ]},
  { title: 'Known Issues', items: [
    'The Depakote lookup row still prices as divalproex sodium, but the master entry is valproic acid. A price-coverage check is open.',
    'Januvia, Lantus, Basaglar, Toujeo, Humalog, and Admelog now search by generic name. Confirm that a generic sells in the US for each.',
    'The typical savings range of some brands now shows the most common value for the drug, not a value for each brand.',
    'The health check does not yet test that the map and the lookup match the master.',
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
  let out = '<section class="version current" aria-labelledby="v1-5-0">\n';
  out += '  <h2 id="v1-5-0">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
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
if (src.versionLog.includes('id="v1-5-0"')) abort('VersionLog already has 1.5.0.');
const oldOpen = '<section class="version current" aria-labelledby="v1-4-9">';
const oldBadge = '1.4.9 — 2026-10-05 <span class="badge">Current</span>';
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the 1.4.9 current section.');
if (!src.versionLog.includes(oldBadge)) abort('VersionLog: could not find the 1.4.9 badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
if (fs.existsSync(path.join(BASE, 'brand-generic-lookup.json'))) abort('Run patch-coverage-1-5-0.js first: brand-generic-lookup.json still exists in the app root.');
if (!fs.existsSync(path.join(BASE, 'data', 'brand-generic-lookup.json'))) abort('data/brand-generic-lookup.json is missing.');

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="v1-4-9">')
    .replace(oldBadge, '1.4.9 — 2026-10-05'),
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
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], FILES[k] + '.pre-v1.5.0-' + stamp + '.bak');
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="v1-5-0"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: *.pre-v1.5.0-' + stamp + '.bak');
