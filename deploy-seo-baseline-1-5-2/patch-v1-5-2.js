/**
 * patch-v1-5-2.js — release bookkeeping for 1.5.2 (Search Hygiene)
 *
 * Updates three files together, so the app version never runs ahead of its log:
 *   1. version.json              1.5.1 -> 1.5.2
 *   2. CHANGELOG.md              new [1.5.2] section above [1.5.1]
 *   3. RXGator-VersionLog.html   new 1.5.2 section marked Current; 1.5.1 loses the badge
 *
 * Run AFTER patch-seo-1-5-2.js. It refuses to run until the methodology pages and llms.txt exist.
 * It backs up all three files and restores them if any write fails. Restart is not needed.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-v1-5-2.js --dry-run
 *         node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-v1-5-2.js [--date=YYYY-MM-DD]
 */
const fs = require('fs');
const path = require('path');
const { BASE, PUBLIC_DIR, RELEASE } = require('./lib/config');

const DRY_RUN = process.argv.includes('--dry-run');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7);
const NEW_DATE = dateArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const { OLD_VERSION, NEW_VERSION, TITLE: NEW_TITLE } = RELEASE;
const OLD_ID = 'v' + OLD_VERSION.replace(/\./g, '-');
const NEW_ID = 'v' + NEW_VERSION.replace(/\./g, '-');

const FILES = {
  version: path.join(BASE, 'version.json'),
  changelog: path.join(BASE, 'CHANGELOG.md'),
  versionLog: path.join(BASE, 'RXGator-VersionLog.html'),
};

// One source for both formats. Backticks mark code.
const SECTIONS = [
  { title: 'Fixed', items: [
    'Nine pages named a canonical URL that returns 404: the six August price pages, the Rx Outreach review, `lost-insurance.html`, and `perdi-mi-seguro.html`. Each now names its own URL.',
    '`index.html` and `landing.html` now both name `/` as canonical.',
    'Seven English pages gained their Spanish hreflang pair. Two hreflang targets that did not exist now point at the real Spanish pages, and the lost-insurance pair works.',
    'About 100 internal links that returned 404 now work (the nav and footer on the six price pages, related-article links, `/contact`, `/search`). Seven related cards for articles that were never written are removed.',
    'One data-source number, 22, replaces 8, 12, 16, 18, 19, and 20 on 124 pages (including the search page), in English and Spanish.',
    'The Costco "federal law" claim now says "in most states, but state laws vary" on every page and in the search results text.',
    '"Free forever" and "every dollar goes to data" no longer promise more than the FAQ funding answer says. "GoodRx only shows GoodRx prices" (homepage, About, and search results) and "NADAC is always current" are corrected. "No ads. No affiliate links" is removed because the FAQ discloses affiliate commissions.',
    'The homepage price example labels the Costco figure as an estimate and calls the example illustrative.',
  ]},
  { title: 'Added', items: [
    '`public/methodology.html` and `public/metodologia.html` list all 22 sources, what each provides, how fresh the data is, and how results are ranked.',
    '`public/llms.txt` for AI assistants, built only from claims the site already makes.',
    'Organization and WebSite structured data on the homepage and the About page.',
    'Footer links to Articles and Methodology on the homepage.',
    '`deploy-seo-baseline-1-5-2/` with the patch, `audit-seo.js` (read-only check), and a sitemap builder.',
  ]},
  { title: 'Changed', items: [
    '`public/sitemap.xml` is built from the files on disk and lists every indexable page once (144 URLs; it listed 67). Run `patch-seo-1-5-2.js` again after any deploy that adds pages.',
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
if (ver.APP_VERSION !== OLD_VERSION) abort('version.json is at ' + ver.APP_VERSION + ', expected ' + OLD_VERSION + '. Another release may have shipped; update RELEASE in lib/config.js.');
if (src.changelog.includes('## [' + NEW_VERSION + ']')) abort('CHANGELOG.md already has ' + NEW_VERSION + '.');
if (src.versionLog.includes('id="' + NEW_ID + '"')) abort('VersionLog already has ' + NEW_VERSION + '.');
const oldOpen = '<section class="version current" aria-labelledby="' + OLD_ID + '">';
// The old release date is read from the log itself so a different ship date does not block the patch.
const badgeMatch = src.versionLog.match(new RegExp(OLD_VERSION.replace(/\./g, '\\.') + ' — (\\d{4}-\\d{2}-\\d{2}) <span class="badge">Current</span>'));
if (!src.versionLog.includes(oldOpen)) abort('VersionLog: could not find the ' + OLD_VERSION + ' current section.');
if (!badgeMatch) abort('VersionLog: could not find the ' + OLD_VERSION + ' badge line.');
const oldBadge = badgeMatch[0];
const OLD_DATE = badgeMatch[1];
const clAnchor = '## [' + OLD_VERSION + ']';
if (!src.changelog.includes(clAnchor)) abort('CHANGELOG.md: could not find ' + clAnchor + '.');
for (const f of ['methodology.html', 'metodologia.html', 'llms.txt']) {
  if (!fs.existsSync(path.join(PUBLIC_DIR, f))) abort('public/' + f + ' is missing. Run patch-seo-1-5-2.js first so the app version never runs ahead of the work.');
}

// ---- build outputs ----
ver.APP_VERSION = NEW_VERSION; ver.APP_DATE = NEW_DATE; ver.changelogEntry = NEW_TITLE;
const out = {
  version: JSON.stringify(ver, null, 2) + '\n',
  changelog: src.changelog.replace(clAnchor, buildChangelog() + clAnchor),
  versionLog: src.versionLog.replace(oldOpen, buildVersionLog() + '<section class="version" aria-labelledby="' + OLD_ID + '">')
    .replace(oldBadge, OLD_VERSION + ' — ' + OLD_DATE),
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
