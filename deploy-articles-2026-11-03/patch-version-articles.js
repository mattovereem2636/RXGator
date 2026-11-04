#!/usr/bin/env node
/**
 * patch-version-articles.js — release bookkeeping for the 2026-11-03 content release.
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              current x.y.z -> x.y.(z+1)  (read at run time)
 *   2. CHANGELOG.md              new section above the current top section
 *   3. RXGator-VersionLog.html   new section marked Current; the old one loses the badge
 *
 * The version is read at run time because 1.5.4 and the SEO bundle may or may not
 * have shipped first. Pass --version=1.5.6 to force a number.
 * Refuses to run until merge-articles.js --apply has added the new articles.
 * Backs up all three files and restores them if any write fails. No restart needed.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-articles-2026-11-03/patch-version-articles.js --dry-run
 *         node /var/www/rxaggregator/deploy-articles-2026-11-03/patch-version-articles.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
const NEW_DATE = arg('date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const NEW_TITLE = 'Trending Health Articles, November 2026';
const NEW_SLUGS = [
  'medicare-open-enrollment-2027-drug-plan-check', 'aca-open-enrollment-2027-prescription-check',
  'retatrutide-online-risks-legal-glp1-prices', 'flu-antiviral-cost-tamiflu-xofluza-2026',
  'canada-drug-imports-customs-rule-2027',
  'es/inscripcion-abierta-medicare-2027-plan-medicamentos', 'es/inscripcion-abierta-aca-2027-recetas',
  'es/retatrutida-en-linea-riesgos-precios-glp1', 'es/costo-antivirales-gripe-tamiflu-xofluza-2026',
  'es/importar-medicamentos-canada-regla-aduanas-2027',
];
const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const SECTIONS = [
  { title: 'Added', items: [
    'Five trending health articles in English and Spanish (10 pages): Medicare open enrollment 2027 (`medicare-open-enrollment-2027-drug-plan-check`); ACA open enrollment and prescriptions (`aca-open-enrollment-2027-prescription-check`); unapproved retatrutide and legal GLP-1 prices (`retatrutide-online-risks-legal-glp1-prices`); flu antiviral costs (`flu-antiviral-cost-tamiflu-xofluza-2026`); the customs rule for Canadian drug imports (`canada-drug-imports-customs-rule-2027`). Spanish versions live under `/articles/es/`.',
  ]},
  { title: 'Fixed', items: [
    'Medicare Part D 2027 article (EN and ES): corrected the 2026 out-of-pocket cap to $2,100 and replaced the old premium estimates with CMS and KFF 2027 figures.',
    'Canadian drug articles (EN and ES): added a dated note about the customs filing requirement that becomes mandatory January 20, 2027.',
  ]},
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toHtml(s) { return escHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

const src = { version: read(FILES.version), changelog: read(FILES.changelog), versionLog: read(FILES.versionLog) };
let ver; try { ver = JSON.parse(src.version); } catch (e) { abort('version.json is not valid JSON.'); }
const OLD_VERSION = String(ver.APP_VERSION || '');
const parts = OLD_VERSION.split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) abort('Unexpected APP_VERSION "' + OLD_VERSION + '".');
const NEW_VERSION = arg('version') || [parts[0], parts[1], parts[2] + 1].join('.');
// 1.5.3 (SEO bundle) and 1.5.4 (Oct 16 code release) are already promised to other packages
// whose scripts expect those numbers. Never take them unless --version forces it.
const RESERVED = ['1.5.3', '1.5.4'];
if (!arg('version') && RESERVED.includes(NEW_VERSION)) {
  abort('Next number would be ' + NEW_VERSION + ', which is reserved (1.5.3 = SEO bundle, 1.5.4 = Oct 16 code release). Deploy those first, or pass --version=1.5.5.');
}
const OLD_ID = 'v' + OLD_VERSION.replace(/\./g, '-');
const NEW_ID = 'v' + NEW_VERSION.replace(/\./g, '-');

// ---- guards: the work must be live before the version moves ----
const aj = JSON.parse(read(path.join(BASE, 'public', 'articles', 'articles.json')));
const missing = NEW_SLUGS.filter((s) => !aj.some((a) => a.slug === s) || !fs.existsSync(path.join(BASE, 'public', 'articles', s + '.html')));
if (missing.length) abort('Run merge-articles.js --apply first. Missing: ' + missing.join(', '));
if (src.changelog.includes('## [' + NEW_VERSION + ']')) abort('CHANGELOG.md already has ' + NEW_VERSION + '.');
if (src.versionLog.includes('id="' + NEW_ID + '"')) abort('VersionLog already has ' + NEW_VERSION + '.');
const oldOpen = '<section class="version current" aria-labelledby="' + OLD_ID + '">';
const badgeRe = new RegExp(OLD_VERSION.replace(/\./g, '\\.') + ' — (\\d{4}-\\d{2}-\\d{2}) <span class="badge">Current</span>');
const badgeMatch = src.versionLog.match(badgeRe);
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the ' + OLD_VERSION + ' current section.');
if (!badgeMatch) abort('VersionLog: could not find the ' + OLD_VERSION + ' badge line.');
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');

function buildChangelog() {
  let out = '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')\n\n';
  for (const sec of SECTIONS) out += '### ' + sec.title + '\n' + sec.items.map((i) => '- ' + i).join('\n') + '\n\n';
  return out + '---\n\n';
}
function buildVersionLog() {
  let out = '<section class="version current" aria-labelledby="' + NEW_ID + '">\n';
  out += '  <h2 id="' + NEW_ID + '">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
  out += '  <p><em>' + escHtml(NEW_TITLE) + '</em></p>\n\n';
  for (const sec of SECTIONS) {
    out += '  <h3>' + sec.title + '</h3>\n  <ul>\n' + sec.items.map((i) => '    <li>' + toHtml(i) + '</li>').join('\n') + '\n  </ul>\n\n';
  }
  return out.replace(/\n\n$/, '\n') + '</section>\n\n';
}

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
