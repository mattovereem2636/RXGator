/**
 * patch-dictionary-master-oct2026.js — makes data/drug-names.json the only dictionary file.
 *
 * Changes (all or nothing; touched files are backed up and restored on any failure):
 *   1. data/brand-generic-map.json   regenerated from the master: brands and aliases only.
 *                                    Aborts unless the only change is dropped keys that
 *                                    are master misspellings (nothing else may change).
 *   2. public/app.html               fetch('/drug-names.json') -> fetch('/data/drug-names.json')
 *   3. drug-info.js                  reads data/drug-names.json, not public/
 *   4. Retired to _to_delete/ (renamed with a .retired- stamp):
 *        public/drug-names.json, build-dictionary.js, build-drug-dictionary.js,
 *        scripts/add-glp1-drugs.js, fix-dictionary-gaps-sept2026.js
 *      The builders overwrite patched entries from hard-coded lists. The last two write the
 *      public/ copy and would recreate the second dictionary.
 *
 * Needs scripts/build-derived-map.js in place first. Restart after running: pm2 restart rxaggregator
 *
 * USAGE:  node /var/www/rxaggregator/patch-dictionary-master-oct2026.js --dry-run
 *         node /var/www/rxaggregator/patch-dictionary-master-oct2026.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
process.env.RXG_BASE = BASE; // the generator module reads the same base
const DRY_RUN = process.argv.includes('--dry-run');

const P = (...parts) => path.join(BASE, ...parts);
const PUBLIC_DICT = P('public', 'drug-names.json');
const APP_HTML = P('public', 'app.html');
const DRUG_INFO = P('drug-info.js');
const TRASH = P('_to_delete');
const RETIRE = [PUBLIC_DICT, P('build-dictionary.js'), P('build-drug-dictionary.js'), P('scripts', 'add-glp1-drugs.js'), P('fix-dictionary-gaps-sept2026.js')];
const APP_OLD = "fetch('/drug-names.json')";
const APP_NEW = "fetch('/data/drug-names.json')";
const INFO_OLD = "path.join(__dirname, 'public', 'drug-names.json')";
const INFO_NEW = "path.join(__dirname, 'data', 'drug-names.json')";
const SKIP_DIR = /^(node_modules|backup)/;
const SKIP_FILE = /(\.pre-|\.bak|\.map$|\.retired-)/;
const SCAN_EXT = new Set(['.html', '.js', '.json', '.css', '.xml', '.txt', '.webmanifest']);
const MAX_SCAN_BYTES = 3 * 1024 * 1024;
const PREVIEW_LIMIT = 12;

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i === -1) abort('Anchor not found: ' + label);
  if (src.indexOf(anchor, i + anchor.length) !== -1) abort('Anchor is not unique: ' + label);
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sameDictionary = (a, b) => a.map(canon).sort().join('|') === b.map(canon).sort().join('|');

/** True when the text at i looks like a file path or a quoted file name, not prose or a comment. */
function isPathLike(text, i) {
  const prev = text[i - 1];
  if (prev === '"' || prev === "'" || prev === '`') return true;
  return prev === '/' && text.slice(Math.max(0, i - 5), i) !== 'data/';
}

/** Finds paths under public/ that load drug-names.json without going through data/. Comments that only name the file pass. */
function findStaleRefs(dir, patchedApp, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) { if (!SKIP_DIR.test(name)) findStaleRefs(full, patchedApp, out); continue; }
    if (SKIP_FILE.test(name) || !SCAN_EXT.has(path.extname(name)) || stat.size > MAX_SCAN_BYTES || full === PUBLIC_DICT) continue;
    const text = full === APP_HTML ? patchedApp : read(full);
    let i = text.indexOf('drug-names.json');
    while (i !== -1) {
      if (isPathLike(text, i)) out.push(path.relative(BASE, full) + ':' + (text.slice(0, i).split('\n').length));
      i = text.indexOf('drug-names.json', i + 1);
    }
  }
}

// ---- guards ----
const generatorPath = P('scripts', 'build-derived-map.js');
if (!fs.existsSync(generatorPath)) abort('Copy scripts/build-derived-map.js to ' + generatorPath + ' first.');
const gen = require(generatorPath);
const srcApp = read(APP_HTML);
const srcInfo = read(DRUG_INFO);
if (!fs.existsSync(PUBLIC_DICT) && !srcApp.includes(APP_OLD) && srcInfo.includes(INFO_NEW)) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!fs.existsSync(PUBLIC_DICT)) abort('public/drug-names.json is missing but the code still points at it. Review by hand.');

const master = gen.loadMaster();
let publicDict;
try { publicDict = JSON.parse(read(PUBLIC_DICT)); } catch (e) { abort('public/drug-names.json is not valid JSON.'); }
if (!Array.isArray(publicDict) || !sameDictionary(master, publicDict)) abort('public/drug-names.json differs from data/drug-names.json. Reconcile the two before retiring the public copy.');

const { map: nextMap, collisions } = gen.buildMap(master);
const currentMap = JSON.parse(read(gen.MAP));
const diff = gen.diffMaps(currentMap, nextMap);
const misspell = gen.misspellingSet(master);
const droppedOther = diff.dropped.filter(k => !misspell.has(k));
if (diff.added.length) abort(diff.added.length + ' keys would be ADDED to the map: ' + diff.added.slice(0, PREVIEW_LIMIT).join(', ') + '. Review before regenerating.');
if (diff.changed.length) abort(diff.changed.length + ' map keys would CHANGE: ' + diff.changed.slice(0, PREVIEW_LIMIT).join(', ') + '. Review before regenerating.');
if (droppedOther.length) abort(droppedOther.length + ' keys would be dropped that are not master misspellings: ' + droppedOther.slice(0, PREVIEW_LIMIT).join(', '));

if (countOf(srcApp, APP_OLD) !== 1) abort('app.html: expected exactly one ' + APP_OLD + ', found ' + countOf(srcApp, APP_OLD) + '.');
if (countOf(srcInfo, INFO_OLD) !== 1) abort('drug-info.js: expected exactly one ' + INFO_OLD + ', found ' + countOf(srcInfo, INFO_OLD) + '.');
const outApp = replaceOnce(srcApp, APP_OLD, APP_NEW, 'app.html fetch');
const outInfo = replaceOnce(srcInfo, INFO_OLD, INFO_NEW, 'drug-info.js path');
const stale = [];
findStaleRefs(P('public'), outApp, stale);
if (stale.length) abort('Other files under public/ still load drug-names.json without data/: ' + stale.slice(0, PREVIEW_LIMIT).join(', '));
const toRetire = RETIRE.filter(f => fs.existsSync(f));

console.log('--- PLAN ---');
console.log('data/brand-generic-map.json  ' + Object.keys(currentMap).length + ' -> ' + Object.keys(nextMap).length + ' keys (dropping ' + diff.dropped.length + ' misspelling keys; they stay in the master)');
if (collisions.length) console.log('  note: terms mapping to two generics: ' + collisions.slice(0, PREVIEW_LIMIT).join('; '));
console.log('public/app.html              fetch path -> /data/drug-names.json');
console.log('drug-info.js                 reads data/drug-names.json');
console.log('retire to _to_delete/        ' + toRetire.map(f => path.relative(BASE, f)).join(', '));
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

// ---- write with rollback ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const EDITS = [
  { p: APP_HTML, src: srcApp, out: outApp },
  { p: DRUG_INFO, src: srcInfo, out: outInfo },
  { p: gen.MAP, src: read(gen.MAP), out: gen.serialize(nextMap) },
];
const written = [];
const moved = [];
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const m of moved.reverse()) { try { fs.renameSync(m.to, m.from); } catch (e) { console.error('Could not move back ' + m.to + ': ' + e.message); } }
  for (const f of written) fs.writeFileSync(f.p, f.src, 'utf8');
  process.exit(1);
}
for (const f of EDITS) fs.copyFileSync(f.p, f.p + '.pre-master-' + stamp + '.bak');
try { for (const f of EDITS) { fs.writeFileSync(f.p, f.out, 'utf8'); written.push(f); } }
catch (e) { restoreAll('write failed: ' + e.message); }

try { execFileSync(process.execPath, ['--check', DRUG_INFO], { stdio: 'pipe' }); } catch (e) { restoreAll('drug-info.js failed the syntax check'); }
try {
  const again = gen.diffMaps(JSON.parse(read(gen.MAP)), nextMap);
  if (again.added.length + again.dropped.length + again.changed.length) throw new Error('map differs after write');
  if (!read(APP_HTML).includes(APP_NEW)) throw new Error('app.html missing new path');
} catch (e) { restoreAll('verification failed: ' + e.message); }

try {
  fs.mkdirSync(TRASH, { recursive: true });
  for (const from of toRetire) {
    const to = path.join(TRASH, path.basename(from) + '.retired-' + stamp);
    fs.renameSync(from, to);
    moved.push({ from, to });
  }
} catch (e) { restoreAll('could not retire files: ' + e.message); }

console.log('[OK] Map regenerated (' + Object.keys(nextMap).length + ' keys). app.html and drug-info.js point at data/drug-names.json.');
console.log('[OK] Retired ' + moved.length + ' files to _to_delete/. Backups: *.pre-master-' + stamp + '.bak');
console.log('NEXT: pm2 restart rxaggregator, then run the browser checks.');
