/**
 * patch-v1-4-3.js — RxGator 1.4.3 (Secret Hygiene)
 *
 * WHY: GitHub push protection blocked a push because refresh-caches.js line 26
 * hard-codes an Apify API token. Secrets belong in .env, never in source.
 * This patch moves the token to .env WITHOUT printing it, replaces the
 * hard-coded line with an env read, and updates .gitignore.
 *
 * Six files, all-or-nothing:
 *   1. refresh-caches.js       hard-coded token -> env read
 *   2. .env                    adds APIFY_TOKEN_REFRESH_CACHES (skipped if present)
 *   3. .gitignore              adds missing ignore rules
 *   4. version.json            1.4.2 -> 1.4.3
 *   5. CHANGELOG.md            add 1.4.3 entry
 *   6. RXGator-VersionLog.html add 1.4.3 entry, demote 1.4.2 from "Current"
 *
 * The token value is never written to the console or to any log.
 * Run on SERVER:  node /var/www/rxaggregator/patch-v1-4-3.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = '/var/www/rxaggregator';
const NEW_VERSION = '1.4.3';
const OLD_VERSION = '1.4.2';
const NEW_DATE = '2026-09-24';
const NEW_TITLE = 'Secret Hygiene';
const ENV_KEY = 'APIFY_TOKEN_REFRESH_CACHES';

const F = {
  refresh: BASE + '/refresh-caches.js',
  env: BASE + '/.env',
  gitignore: BASE + '/.gitignore',
  version: BASE + '/version.json',
  changelog: BASE + '/CHANGELOG.md',
  versionLog: BASE + '/RXGator-VersionLog.html',
};

const TOKEN_LINE_RE = /^const TOKEN = 'apify_api_([A-Za-z0-9]+)';[ \t]*$/gm;
const NEW_TOKEN_BLOCK = [
  '// Token comes from the environment or /var/www/rxaggregator/.env (' + ENV_KEY + ').',
  '// Never hard-code secrets in source files.',
  'function loadToken() {',
  '  if (process.env.' + ENV_KEY + ') return process.env.' + ENV_KEY + ';',
  "  const envText = require('fs').readFileSync('/var/www/rxaggregator/.env', 'utf8');",
  '  const match = envText.match(/^' + ENV_KEY + '=(.+)$/m);',
  '  return match ? match[1].trim() : null;',
  '}',
  'const TOKEN = loadToken();',
  'if (!TOKEN) {',
  "  console.error('[refresh-caches] " + ENV_KEY + " is not set in the environment or /var/www/rxaggregator/.env');",
  '  process.exit(1);',
  '}',
].join('\n');

const IGNORE_RULES = ['.env', '*.bak', '*.tar.gz', 'backups/', 'search_log.csv'];

const CHANGELOG_ANCHOR = '## [1.4.2] — 2026-09-24';
const LOG_SECTION_OLD = '<section class="version current" aria-labelledby="v1-4-2">';
const LOG_SECTION_NEW = '<section class="version" aria-labelledby="v1-4-2">';
const LOG_H2_OLD = '<h2 id="v1-4-2">1.4.2 — 2026-09-24 <span class="badge">Current</span></h2>';
const LOG_H2_NEW = '<h2 id="v1-4-2">1.4.2 — 2026-09-24</h2>';

const CHANGELOG_ENTRY = [
  '## [' + NEW_VERSION + '] — ' + NEW_DATE + ' (' + NEW_TITLE + ')',
  '',
  '### Security',
  '- Removed a hard-coded Apify API token from `refresh-caches.js`. The script now reads `' + ENV_KEY + '` from the environment or `/var/www/rxaggregator/.env`. GitHub push protection blocked the commit that contained the token, so the token was never published.',
  '',
  '### Changed',
  '- `.gitignore` now excludes `.env`, `*.bak`, `*.tar.gz`, `backups/`, and `search_log.csv`. The search log holds visitor IP addresses and no longer belongs in version control. `data/backups/` is untracked for the same reason.',
  '',
  '---',
  '',
  '',
].join('\n');

const LOG_ENTRY = [
  '<section class="version current" aria-labelledby="v1-4-3">',
  '  <h2 id="v1-4-3">' + NEW_VERSION + ' — ' + NEW_DATE + ' <span class="badge">Current</span></h2>',
  '  <p><em>' + NEW_TITLE + '</em></p>',
  '',
  '  <h3>Security</h3>',
  '  <ul>',
  '    <li>Removed a hard-coded Apify API token from <code>refresh-caches.js</code>. The script now reads <code>' + ENV_KEY + '</code> from the environment or <code>/var/www/rxaggregator/.env</code>. GitHub push protection blocked the commit that contained the token, so the token was never published.</li>',
  '  </ul>',
  '',
  '  <h3>Changed</h3>',
  '  <ul>',
  '    <li><code>.gitignore</code> now excludes <code>.env</code>, <code>*.bak</code>, <code>*.tar.gz</code>, <code>backups/</code>, and <code>search_log.csv</code>. The search log holds visitor IP addresses and no longer belongs in version control. <code>data/backups/</code> is untracked for the same reason.</li>',
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
const src = {};
for (const key of Object.keys(F)) {
  try { src[key] = fs.readFileSync(F[key], 'utf8'); }
  catch (err) { abort('Cannot read ' + F[key] + ' (' + err.message + ').'); }
}

// ---- 2. Validate ----
const tokenMatches = src.refresh.match(TOKEN_LINE_RE) || [];
if (tokenMatches.length !== 1) abort('Expected exactly one hard-coded token line in refresh-caches.js, found ' + tokenMatches.length + '.');
TOKEN_LINE_RE.lastIndex = 0;
const token = 'apify_api_' + /^const TOKEN = 'apify_api_([A-Za-z0-9]+)';/m.exec(src.refresh)[1];
if (src.refresh.split(token).length - 1 !== 1) abort('The token appears more than once in refresh-caches.js.');

let ver;
try { ver = JSON.parse(src.version); } catch (err) { abort('version.json is not valid JSON.'); }
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '.');
if (count(src.changelog, CHANGELOG_ANCHOR) !== 1) abort('CHANGELOG 1.4.2 heading must appear exactly once.');
if (count(src.versionLog, LOG_SECTION_OLD) !== 1) abort('VersionLog 1.4.2 section tag must appear exactly once.');
if (count(src.versionLog, LOG_H2_OLD) !== 1) abort('VersionLog 1.4.2 heading must appear exactly once.');

// ---- 3. Build new contents ----
const out = {};
out.refresh = src.refresh.replace(TOKEN_LINE_RE, () => NEW_TOKEN_BLOCK);

const envHasKey = new RegExp('^' + ENV_KEY + '=', 'm').test(src.env);
out.env = envHasKey
  ? src.env
  : src.env + (src.env.endsWith('\n') || src.env.length === 0 ? '' : '\n') + ENV_KEY + '=' + token + '\n';

const existingRules = new Set(src.gitignore.split('\n').map(l => l.trim()));
const missing = IGNORE_RULES.filter(r => !existingRules.has(r));
out.gitignore = missing.length === 0
  ? src.gitignore
  : src.gitignore + (src.gitignore.endsWith('\n') || src.gitignore.length === 0 ? '' : '\n') +
    '# Added in v' + NEW_VERSION + ': secrets, backups, logs with visitor IPs\n' + missing.join('\n') + '\n';

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
  backups[key] = F[key] + '.pre-v1.4.3-' + stamp + '.bak';
  fs.copyFileSync(F[key], backups[key]);
}
console.log('[BACKUP] 6 files backed up (*.pre-v1.4.3-' + stamp + '.bak). The .env and refresh-caches.js backups contain the token; they are ignored by git.');

function restoreAll(reason) {
  for (const key of Object.keys(F)) fs.copyFileSync(backups[key], F[key]);
  console.error('RESTORED all files from backup. Reason: ' + reason);
  process.exit(1);
}

for (const key of Object.keys(F)) fs.writeFileSync(F[key], out[key]);

try { execFileSync('node', ['--check', F.refresh]); }
catch (err) { restoreAll('syntax check failed on refresh-caches.js'); }
if (fs.readFileSync(F.refresh, 'utf8').includes('apify_api_')) restoreAll('a token string is still present in refresh-caches.js');
if (!new RegExp('^' + ENV_KEY + '=apify_api_', 'm').test(fs.readFileSync(F.env, 'utf8'))) restoreAll(ENV_KEY + ' is missing from .env after write');
try { JSON.parse(fs.readFileSync(F.version, 'utf8')); }
catch (err) { restoreAll('version.json is not valid JSON after write'); }

console.log('[OK] refresh-caches.js: hard-coded token removed, now reads ' + ENV_KEY);
console.log('[OK] .env: ' + (envHasKey ? ENV_KEY + ' was already present, left unchanged' : ENV_KEY + ' added (value not shown)'));
console.log('[OK] .gitignore: ' + (missing.length ? 'added ' + missing.join(', ') : 'nothing to add'));
console.log('[OK] version.json -> ' + NEW_VERSION + ' (' + NEW_DATE + ')');
console.log('[OK] CHANGELOG.md entry added');
console.log('[OK] RXGator-VersionLog.html entry added, 1.4.2 demoted from Current');
console.log('\nNext: pm2 restart rxaggregator, then the git cleanup steps in DEPLOY-v1.4.3.md.');
