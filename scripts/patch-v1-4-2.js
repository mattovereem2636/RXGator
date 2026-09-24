/**
 * patch-v1-4-2.js — RxGator 1.4.2 (Brand-Only Cache Lookup Fix)
 *
 * Requires /var/www/rxaggregator/brand-alias.js to be present (copied first).
 *
 * One deployment, five files, all-or-nothing:
 *   1. cache-manager.js        SingleCare + GoodRx lookups try the brand alias on a miss
 *   2. rxsaver.js              RxSaver lookup tries the brand alias on a miss
 *   3. version.json            1.4.1 -> 1.4.2
 *   4. CHANGELOG.md            add 1.4.2 entry
 *   5. RXGator-VersionLog.html add 1.4.2 entry, demote 1.4.1 from "Current"
 *
 * Every anchor is validated BEFORE any file is written. Backups are made
 * first. If a syntax check or the alias self-test fails, all files are restored.
 *
 * Run on SERVER:  node /var/www/rxaggregator/patch-v1-4-2.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = '/var/www/rxaggregator';
const NEW_VERSION = '1.4.2';
const OLD_VERSION = '1.4.1';
const NEW_DATE = '2026-09-24';
const NEW_TITLE = 'Brand-Only Cache Lookup Fix';

const F = {
  cache: BASE + '/cache-manager.js',
  rxsaver: BASE + '/rxsaver.js',
  version: BASE + '/version.json',
  changelog: BASE + '/CHANGELOG.md',
  versionLog: BASE + '/RXGator-VersionLog.html',
};
const ALIAS_FILE = BASE + '/brand-alias.js';

// cache-manager.js anchors
const SC_OLD = '  const key = drugName.toLowerCase().trim();\n  const entry = singleCareCache[key];';
const SC_NEW = '  const key = resolveCacheKey(drugName, singleCareCache);\n  const entry = singleCareCache[key];';
const GR_OLD = '  const key = drugName.toLowerCase().trim();\n  const entry = goodRxCache[key];';
const GR_NEW = '  const key = resolveCacheKey(drugName, goodRxCache);\n  const entry = goodRxCache[key];';
const SC_DOC = ' * Query the SingleCare cache for coupon pricing on a drug.';
const REQUIRE_LINE = "const { resolveCacheKey } = require('./brand-alias');\n\n";

// rxsaver.js anchor
const RX_OLD = 'if (!drug) return null;';
const RX_NEW = [
  'if (!drug) {',
  '        // Brand-only drugs (e.g. vibegron) are indexed under the brand name (e.g. gemtesa).',
  "        const brandAlias = require('./brand-alias').brandAliasFor(query);",
  '        if (brandAlias) {',
  "            const brandQuery = brandAlias.replace(/[^a-z0-9]/g, ' ').replace(/\\s+/g, ' ').trim();",
  "            drug = searchIndex.get(brandQuery) || searchIndex.get(brandQuery.replace(/\\s+/g, '-'));",
  '        }',
  '    }',
  '',
  '    if (!drug) return null;',
].join('\n');

// version log / changelog anchors (1.4.1 is current now)
const CHANGELOG_ANCHOR = '## [1.4.1] — 2026-09-24';
const LOG_SECTION_OLD = '<section class="version current" aria-labelledby="v1-4-1">';
const LOG_SECTION_NEW = '<section class="version" aria-labelledby="v1-4-1">';
const LOG_H2_OLD = '<h2 id="v1-4-1">1.4.1 — 2026-09-24 <span class="badge">Current</span></h2>';
const LOG_H2_NEW = '<h2 id="v1-4-1">1.4.1 — 2026-09-24</h2>';

const CHANGELOG_ENTRY = [
  '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')',
  '',
  '### Added',
  '- `brand-alias.js` — maps a brand-only generic to its brand name. An alias exists only when the dictionary entry has `hasGeneric: false` and exactly one brand, so multi-brand drugs and drugs with a real generic are never aliased.',
  '',
  '### Fixed',
  '- Cache lookups missed brand-only drugs. Search resolves these drugs to the generic name (for example `vibegron`), but the SingleCare, GoodRx, and RxSaver caches key them by brand name (`gemtesa`, `nubeqa`). The Gemtesa and Nubeqa pricing added in 1.4.0 was unreachable, and every search for these drugs logged zero source hits. `cache-manager.js` (SingleCare, GoodRx) and `rxsaver.js` now try the brand alias when the direct lookup misses. Direct hits are unchanged.',
  '',
  '### Notes',
  '- The alias index loads at startup from `data/drug-names.json`. Restart the app after dictionary changes.',
  '- Other cached sources are not changed in this release.',
  '',
  '---',
  '',
  '',
].join('\n');

const LOG_ENTRY = [
  '<section class="version current" aria-labelledby="v1-4-2">',
  '  <h2 id="v1-4-2">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>',
  '  <p><em>' + NEW_TITLE + '</em></p>',
  '',
  '  <h3>Added</h3>',
  '  <ul>',
  '    <li><code>brand-alias.js</code> — maps a brand-only generic to its brand name. An alias exists only when the dictionary entry has <code>hasGeneric: false</code> and exactly one brand, so multi-brand drugs and drugs with a real generic are never aliased.</li>',
  '  </ul>',
  '',
  '  <h3>Fixed</h3>',
  '  <ul>',
  '    <li>Cache lookups missed brand-only drugs. Search resolves these drugs to the generic name (for example <code>vibegron</code>), but the SingleCare, GoodRx, and RxSaver caches key them by brand name (<code>gemtesa</code>, <code>nubeqa</code>). The Gemtesa and Nubeqa pricing added in 1.4.0 was unreachable, and every search for these drugs logged zero source hits. <code>cache-manager.js</code> (SingleCare, GoodRx) and <code>rxsaver.js</code> now try the brand alias when the direct lookup misses. Direct hits are unchanged.</li>',
  '  </ul>',
  '',
  '  <h3>Notes</h3>',
  '  <ul>',
  '    <li>The alias index loads at startup from <code>data/drug-names.json</code>. Restart the app after dictionary changes.</li>',
  '    <li>Other cached sources are not changed in this release.</li>',
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
function replaceOnce(text, oldStr, newStr) {
  const i = text.indexOf(oldStr);
  return text.slice(0, i) + newStr + text.slice(i + oldStr.length);
}

// ---- 1. Read everything ----
if (!fs.existsSync(ALIAS_FILE)) abort('brand-alias.js is not in ' + BASE + '. Copy it first.');
const src = {};
for (const key of Object.keys(F)) {
  try { src[key] = fs.readFileSync(F[key], 'utf8'); }
  catch (err) { abort('Cannot read ' + F[key] + ' (' + err.message + ').'); }
}

// ---- 2. Validate every anchor ----
if (src.cache.includes("require('./brand-alias')")) abort('cache-manager.js already patched.');
if (src.rxsaver.includes("require('./brand-alias')")) abort('rxsaver.js already patched.');
if (count(src.cache, SC_OLD) !== 1) abort('SingleCare lookup lines must appear exactly once in cache-manager.js.');
if (count(src.cache, GR_OLD) !== 1) abort('GoodRx lookup lines must appear exactly once in cache-manager.js.');
if (count(src.cache, SC_DOC) !== 1) abort('SingleCare doc comment must appear exactly once in cache-manager.js.');
if (src.cache.lastIndexOf('/**', src.cache.indexOf(SC_DOC)) === -1) abort('Cannot find the doc comment start in cache-manager.js.');
if (count(src.rxsaver, RX_OLD) !== 1) abort('"' + RX_OLD + '" must appear exactly once in rxsaver.js.');

let ver;
try { ver = JSON.parse(src.version); } catch (err) { abort('version.json is not valid JSON.'); }
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '.');

if (count(src.changelog, CHANGELOG_ANCHOR) !== 1) abort('CHANGELOG 1.4.1 heading must appear exactly once.');
if (count(src.versionLog, LOG_SECTION_OLD) !== 1) abort('VersionLog 1.4.1 section tag must appear exactly once.');
if (count(src.versionLog, LOG_H2_OLD) !== 1) abort('VersionLog 1.4.1 heading must appear exactly once.');

// ---- 3. Build new contents ----
const out = {};

let cache = replaceOnce(src.cache, SC_OLD, SC_NEW);
cache = replaceOnce(cache, GR_OLD, GR_NEW);
const docIdx = cache.indexOf(SC_DOC);
const docStart = cache.lastIndexOf('/**', docIdx);
out.cache = cache.slice(0, docStart) + REQUIRE_LINE + cache.slice(docStart);

out.rxsaver = replaceOnce(src.rxsaver, RX_OLD, RX_NEW);

ver.APP_VERSION = NEW_VERSION;
ver.APP_DATE = NEW_DATE;
ver.changelogEntry = NEW_TITLE;
out.version = JSON.stringify(ver, null, 2) + '\n';

const cIdx = src.changelog.indexOf(CHANGELOG_ANCHOR);
out.changelog = src.changelog.slice(0, cIdx) + CHANGELOG_ENTRY + src.changelog.slice(cIdx);

let log = replaceOnce(src.versionLog, LOG_H2_OLD, LOG_H2_NEW);
const sIdx = log.indexOf(LOG_SECTION_OLD);
log = log.slice(0, sIdx) + LOG_ENTRY + LOG_SECTION_NEW + log.slice(sIdx + LOG_SECTION_OLD.length);
out.versionLog = log;

// ---- 4. Back up, write, verify ----
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const backups = {};
for (const key of Object.keys(F)) {
  backups[key] = F[key] + '.pre-v1.4.2-' + stamp + '.bak';
  fs.copyFileSync(F[key], backups[key]);
  console.log('[BACKUP] ' + backups[key]);
}

function restoreAll(reason) {
  for (const key of Object.keys(F)) fs.copyFileSync(backups[key], F[key]);
  console.error('RESTORED all files from backup. Reason: ' + reason);
  process.exit(1);
}

for (const key of Object.keys(F)) fs.writeFileSync(F[key], out[key]);

for (const key of ['cache', 'rxsaver']) {
  try { execFileSync('node', ['--check', F[key]]); }
  catch (err) { restoreAll('syntax check failed on ' + F[key]); }
}
try { JSON.parse(fs.readFileSync(F.version, 'utf8')); }
catch (err) { restoreAll('version.json is not valid JSON after write'); }

// Self-test against the real dictionary: the two known brand-only drugs must alias.
try {
  const alias = require(ALIAS_FILE);
  const v = alias.brandAliasFor('vibegron');
  const d = alias.brandAliasFor('darolutamide');
  if (v !== 'gemtesa' || d !== 'nubeqa') restoreAll('alias self-test failed (vibegron -> ' + v + ', darolutamide -> ' + d + ')');
  console.log('[OK] alias self-test: vibegron -> ' + v + ', darolutamide -> ' + d);
} catch (err) {
  restoreAll('brand-alias.js failed to load: ' + err.message);
}

console.log('[OK] cache-manager.js: SingleCare and GoodRx lookups use the brand alias');
console.log('[OK] rxsaver.js: RxSaver lookup uses the brand alias');
console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md entry added');
console.log('[OK] RXGator-VersionLog.html entry added, 1.4.1 demoted from Current');
console.log('\nNext: pm2 restart rxaggregator, then run the verification steps.');
