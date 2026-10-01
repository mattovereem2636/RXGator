/**
 * patch-v1-4-5.js — release bookkeeping for 1.4.5 (Manufacturer Link Cleanup)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.4.4 -> 1.4.5
 *   2. CHANGELOG.md              new [1.4.5] section above [1.4.4]
 *   3. RXGator-VersionLog.html   new 1.4.5 section marked Current; 1.4.4 loses the badge
 *
 * Run AFTER patch-mfr-links2-oct2026.js. The patch refuses to run if that data change is missing. It backs up all three files and restores them if any
 * write fails. Restart is not needed for these files.
 *
 * USAGE:  node /var/www/rxaggregator/patch-v1-4-5.js --dry-run
 *         node /var/www/rxaggregator/patch-v1-4-5.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_VERSION = '1.4.4';
const NEW_VERSION = '1.4.5';
const NEW_DATE = '2026-10-01';
const NEW_TITLE = 'Manufacturer Link Cleanup';

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const GUARDS = {
  mfr: path.join(BASE, 'manufacturer_assistance.json'),
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Added', items: [
    '`patch-mfr-links2-oct2026.js` — second link-fix pass, kept for the audit trail.',
  ]},
  { title: 'Changed', items: [
    'Replaced the program links for Invokana, Sanofi insulins (Lantus), Victoza, the Novo Nordisk assistance program (liraglutide entry), Entresto, the Novartis Patient Assistance Foundation, and Januvia in `manufacturer_assistance.json`.',
    'Replaced the Ready, Set, PrEP entry with an HIV.gov page that lists manufacturer programs for PrEP medicines. The Ready, Set, PrEP site no longer resolves.',
    'Replaced the Takeda Help at Hand link in `public/pap-database.json` (now 1.0.2).',
  ]},
  { title: 'Fixed', items: [
    'Nine program links returned 404, did not resolve, or landed on an error page. `check-mfr-links.js` found them in the 1.4.4 run.',
  ]},
  { title: 'Known Issues', items: [
    'Three new links need a browser check, because automated tools could not read them: Victoza, Entresto, and Januvia. Each carries `needsReview` in the data.',
    'About a dozen links return 403 to automated requests. These include Lilly, Bayer, AbbVie, and AstraZeneca pages. They load in a browser. Confirm each one by hand.',
    'The `pap-database.json` BMS link for aripiprazole returns 404, and `jjpaf.org` timed out. Both are not fixed. The aripiprazole entry may belong to a different manufacturer.',
    'Takeda reports that some products leave Help at Hand on 2026-12-31.',
    'Dollar amounts remain in the program text for the 13 drugs not reviewed in 1.4.4.',
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
  let out = '<section class="version current" aria-labelledby="v1-4-5">\n';
  out += '  <h2 id="v1-4-5">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
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
if (src.versionLog.includes('id="v1-4-5"')) abort('VersionLog already has 1.4.4.');
const oldOpen = '<section class="version current" aria-labelledby="v1-4-4">';
const oldBadge = '1.4.4 — 2026-10-01 <span class="badge">Current</span>';
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the 1.4.3 current section.');
if (!src.versionLog.includes(oldBadge)) abort('VersionLog: could not find the 1.4.3 badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
let mfr; try { mfr = JSON.parse(read(GUARDS.mfr)); } catch (e) { abort('manufacturer_assistance.json is not valid JSON.'); }
const inv = mfr.canagliflozin && mfr.canagliflozin.programs.some(p => /savings-and-cost-support/.test(p.url || ''));
if (!inv) abort('Run patch-mfr-links2-oct2026.js first: the Invokana link is not updated.');

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="v1-4-4">')
    .replace(oldBadge, '1.4.4 — 2026-10-01'),
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
for (const k of Object.keys(FILES)) fs.copyFileSync(FILES[k], FILES[k] + '.pre-v1.4.5-' + stamp + '.bak');
try {
  for (const k of Object.keys(FILES)) { fs.writeFileSync(FILES[k], out[k], 'utf8'); written.push(k); }
} catch (e) { restoreAll('write failed: ' + e.message); }

try { if (JSON.parse(read(FILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('version mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }
if (!read(FILES.changelog).includes('## [' + NEW_VERSION + ']')) restoreAll('CHANGELOG missing new section');
if (!read(FILES.versionLog).includes('id="v1-4-5"')) restoreAll('VersionLog missing new section');

console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md and RXGator-VersionLog.html updated. Backups: *.pre-v1.4.5-' + stamp + '.bak');
