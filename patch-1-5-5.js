#!/usr/bin/env node
/**
 * patch-1-5-5.js — release 1.5.5 "Source Count": every page says 22 sources, and the /app list names all 22.
 *
 * WHY: 1.5.3 set the source count to 22 across the site, but its audit looked for "N sources" wording
 * and missed "18+". /app (title, meta, social tags, JSON-LD, the browser-tab title), lost-insurance.html,
 * perdi-mi-seguro.html, six articles and pap-database.json still said "18+". The "22 Data Sources" box
 * on /app named only 18; it now also names Inside Rx, HealthWarehouse, TrumpRx.gov and FDA Drug Shortages.
 *
 * Part A edits public pages (exact strings, no regex on code). Part B bumps version.json, CHANGELOG.md
 * and RXGator-VersionLog.html in the same run, so the app version never runs ahead of its log.
 * Every file is backed up to backups/v1.5.5-<stamp>/ and all are restored if any step fails.
 * A second run aborts at the version guard and changes nothing.
 *
 * USAGE:  node /var/www/rxaggregator/patch-1-5-5.js --dry-run
 *         node /var/www/rxaggregator/patch-1-5-5.js [--date=YYYY-MM-DD]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const PUBLIC = path.join(BASE, 'public');
const DRY_RUN = process.argv.includes('--dry-run');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7);
const NEW_DATE = dateArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const OLD_VERSION = '1.5.4';
const NEW_VERSION = '1.5.5';
const NEW_TITLE = 'Source Count';
const OLD_ID = 'v' + OLD_VERSION.replace(/\./g, '-');
const NEW_ID = 'v' + NEW_VERSION.replace(/\./g, '-');
const SOURCE_COUNT = '22';

/** Wording swaps, applied to every listed page. Longest first so "18+ data sources" wins over "18+ sources". */
const WORDING = [
  ['18+ data sources', SOURCE_COUNT + ' data sources'],
  ['18+ pricing sources', SOURCE_COUNT + ' pricing sources'],
  ['18+ Sources', SOURCE_COUNT + ' Sources'],
  ['18+ sources', SOURCE_COUNT + ' sources'],
  ['18+ fuentes', SOURCE_COUNT + ' fuentes'],
];
const PAGES = [
  'app.html', 'lost-insurance.html', 'perdi-mi-seguro.html', 'pap-database.json',
  'articles/medicare-part-d-subsidy-ending-2027.html', 'articles/cobra-insurance-cost.html',
  'articles/lost-insurance-medication-guide.html', 'articles/patient-assistance-programs-complete-guide.html',
  'articles/first-48-hours-after-losing-insurance.html', 'articles/trumprx-explained.html',
];
const LINK = 'target="_blank" rel="noopener" style="color:#1A6FA0;"';
const LIST_FIND = 'Texas DSHS WAC</a> (manufacturer list price).';
const LIST_ADD = 'Texas DSHS WAC</a> (manufacturer list price), ' +
  '<a href="https://insiderx.com" ' + LINK + '>Inside Rx</a> (cached), ' +
  '<a href="https://www.healthwarehouse.com" ' + LINK + '>HealthWarehouse</a> (online pharmacy), ' +
  '<a href="https://trumprx.gov" ' + LINK + '>TrumpRx.gov</a> (government deal prices), and ' +
  '<a href="https://www.accessdata.fda.gov/scripts/drugshortages/default.cfm" ' + LINK + '>FDA Drug Shortages</a> (supply alerts).';
const LIST_OLD_AND = '(Medicare), and <a href="https://www.dshs.texas.gov';
const LIST_NEW_AND = '(Medicare), <a href="https://www.dshs.texas.gov';

const VFILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};
const SECTIONS = [
  { title: 'Fixed', items: [
    'Pages that still said "18+ sources" now say 22, matching the rest of the site: the `/app` title, description, social tags, structured data and browser-tab title; `lost-insurance.html`; `perdi-mi-seguro.html` (Spanish); six articles; and `pap-database.json`. The 1.5.3 audit missed the "18+" wording.',
    'The "22 Data Sources" box on `/app` named only 18 sources. It now also names Inside Rx, HealthWarehouse, TrumpRx.gov and FDA Drug Shortages.',
  ]},
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function count(hay, needle) { return hay.split(needle).length - 1; }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toHtml(s) { return escHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

// ---- version guards first: a second run stops here ----
const vsrc = { version: read(VFILES.version), changelog: read(VFILES.changelog), versionLog: read(VFILES.versionLog) };
let ver; try { ver = JSON.parse(vsrc.version); } catch (e) { abort('version.json is not valid JSON.'); }
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '.');
const oldOpen = '<section class="version current" aria-labelledby="' + OLD_ID + '">';
const badgeMatch = vsrc.versionLog.match(new RegExp(OLD_VERSION.replace(/\./g, '\\.') + ' — (\\d{4}-\\d{2}-\\d{2}) <span class="badge">Current</span>'));
const clAnchor = '## [' + OLD_VERSION + ']';
if (!vsrc.versionLog.includes(oldOpen) || !badgeMatch) abort('VersionLog: could not find the ' + OLD_VERSION + ' current section.');
if (!vsrc.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');

// ---- Part A plan ----
const pages = {};
const tally = {};
for (const rel of PAGES) {
  const p = path.join(PUBLIC, rel);
  if (!fs.existsSync(p)) { console.log('  (not on server, skipped) public/' + rel); continue; }
  const src = read(p);
  let out = src;
  for (const [from, to] of WORDING) {
    const n = count(out, from);
    if (n) { out = out.split(from).join(to); tally[rel] = (tally[rel] || 0) + n; }
  }
  if (rel === 'app.html') {
    if (count(out, LIST_FIND) !== 1) abort('app.html: source-list anchor found ' + count(out, LIST_FIND) + ' times (need 1).');
    if (count(out, LIST_OLD_AND) !== 1) abort('app.html: "(Medicare), and" anchor found ' + count(out, LIST_OLD_AND) + ' times (need 1).');
    out = out.replace(LIST_FIND, LIST_ADD).replace(LIST_OLD_AND, LIST_NEW_AND);
    tally[rel] = (tally[rel] || 0) + 1;
  }
  if (/18\+ (data |pricing )?(sources|Sources|fuentes)/.test(out)) abort(rel + ': "18+" wording still present after the swap.');
  if (out !== src) pages[rel] = { path: p, src, out };
}

// ---- Part B plan ----
function buildChangelog() {
  let o = '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')\n\n';
  for (const s of SECTIONS) o += '### ' + s.title + '\n' + s.items.map((i) => '- ' + i).join('\n') + '\n\n';
  return o + '---\n\n';
}
function buildVersionLog() {
  let o = '<section class="version current" aria-labelledby="' + NEW_ID + '">\n';
  o += '  <h2 id="' + NEW_ID + '">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>\n';
  o += '  <p><em>' + NEW_TITLE + '</em></p>\n\n';
  for (const s of SECTIONS) o += '  <h3>' + s.title + '</h3>\n  <ul>\n' + s.items.map((i) => '    <li>' + toHtml(i) + '</li>').join('\n') + '\n  </ul>\n\n';
  return o.replace(/\n\n$/, '\n') + '</section>\n\n';
}
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const vout = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: vsrc.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: vsrc.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="' + OLD_ID + '">')
    .replace(badgeMatch[0], OLD_VERSION + ' — ' + badgeMatch[1]),
};

console.log('--- PLAN (release ' + NEW_VERSION + ') ---');
for (const rel of Object.keys(pages)) console.log('  public/' + rel.padEnd(58) + tally[rel] + ' change(s)');
console.log('  version.json ' + OLD_VERSION + ' -> ' + NEW_VERSION + ' (' + NEW_DATE + ', "' + NEW_TITLE + '"); CHANGELOG.md and VersionLog updated');
if (!Object.keys(pages).length) abort('No page needs a change. Nothing to release.');
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

// ---- write everything, with backups and rollback ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bakDir = path.join(BASE, 'backups', 'v' + NEW_VERSION + '-' + stamp);
fs.mkdirSync(bakDir, { recursive: true });
const targets = [];
for (const rel of Object.keys(pages)) targets.push({ path: pages[rel].path, src: pages[rel].src, out: pages[rel].out, bak: 'public__' + rel.replace(/\//g, '__') });
for (const k of Object.keys(VFILES)) targets.push({ path: VFILES[k], src: vsrc[k], out: vout[k], bak: path.basename(VFILES[k]) });
for (const t of targets) fs.copyFileSync(t.path, path.join(bakDir, t.bak));
const written = [];
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const t of written) fs.writeFileSync(t.path, t.src, 'utf8');
  process.exit(1);
}
try { for (const t of targets) { fs.writeFileSync(t.path, t.out, 'utf8'); written.push(t); } }
catch (e) { restoreAll('write failed: ' + e.message); }

// ---- checks: JSON parses, app.html inline scripts parse, version file says 1.5.5 ----
try { JSON.parse(read(path.join(PUBLIC, 'pap-database.json'))); } catch (e) { restoreAll('pap-database.json no longer parses: ' + e.message); }
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxg155-'));
const html = read(path.join(PUBLIC, 'app.html'));
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
let m; let i = 0;
while ((m = re.exec(html))) {
  const tmp = path.join(tmpDir, 'inline-' + (i++) + '.js');
  if (/application\/ld\+json/i.test(m[1])) {
    try { JSON.parse(m[2]); } catch (e) { restoreAll('app.html JSON-LD block ' + i + ' no longer parses'); }
    continue;
  }
  fs.writeFileSync(tmp, m[2]);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { restoreAll('app.html inline script ' + i + ' has a syntax error'); }
}
try { if (JSON.parse(read(VFILES.version)).APP_VERSION !== NEW_VERSION) throw new Error('mismatch'); }
catch (e) { restoreAll('version.json invalid after write'); }

console.log('[OK] ' + Object.keys(pages).length + ' pages updated; version.json -> ' + NEW_VERSION + '. Backups: ' + bakDir);
console.log('Static files only: no restart needed. Hard-refresh /app to see the new title.');
