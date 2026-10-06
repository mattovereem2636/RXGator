/**
 * patch-coverage-1-5-0.js — release 1.5.0 data work: import the common generics the master lacks
 * and retire the hand-kept brand-generic-lookup.json.
 *
 * All or nothing. Every touched file is backed up and restored on any failure.
 *   1. data/drug-names.json
 *        - adds the generics in coverage-1-5-0.json (Spanish text included). It skips any drug whose
 *          normalized name already exists, so "Lisinopril" and "lisinopril " never become two entries.
 *        - Zantac moves from ranitidine to famotidine (Matt's ruling).
 *        - semaglutide gets the aliases "ozempic pill", "ozempic tablets", "wegovy pill".
 *        - hasGeneric -> false for semaglutide, tirzepatide, empagliflozin, apixaban, rivaroxaban
 *          (no marketed US generic of the brand product).
 *        - carries typicalSavings and pricingNames (the generic string the old lookup used for pricing)
 *          from the old lookup, so searches price the same as before.
 *        - adds as aliases any old lookup key that would otherwise stop resolving.
 *   2. data/brand-generic-map.json      regenerated from the master.
 *   3. data/brand-generic-lookup.json   new, derived from the master.
 *   4. retail-sources.js                require path -> ./data/brand-generic-lookup.json
 *   5. Retired to _to_delete/: brand-generic-lookup.json and the stale root brand-generic-map.json.
 *
 * Needs scripts/build-derived-map.js, scripts/build-derived-lookup.js and coverage-1-5-0.json in place.
 * Restart after running: pm2 restart rxaggregator
 *
 * USAGE:  node /var/www/rxaggregator/patch-coverage-1-5-0.js --dry-run
 *         node /var/www/rxaggregator/patch-coverage-1-5-0.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
process.env.RXG_BASE = BASE; // the generator modules read the same base
const DRY_RUN = process.argv.includes('--dry-run');
const P = (...parts) => path.join(BASE, ...parts);

const OLD_LOOKUP = P('brand-generic-lookup.json');
const OLD_MAP_ROOT = P('brand-generic-map.json');
const RETAIL = P('retail-sources.js');
const SPEC = P('coverage-1-5-0.json');
const TRASH = P('_to_delete');
const REQ_OLD = "require('./brand-generic-lookup.json')";
const REQ_NEW = "require('./data/brand-generic-lookup.json')";
const SEMAGLUTIDE_ALIASES = ['ozempic pill', 'ozempic tablets', 'wegovy pill'];
const NO_US_GENERIC = ['semaglutide', 'tirzepatide', 'empagliflozin', 'apixaban', 'rivaroxaban'];
// Old lookup rows that are not a drug name (vitamins, IV fluids, combination products).
const NOT_CARRIED = new Set(['alka-seltzer hangover relief', 'alka-seltzer plus cold and cough', 'prenate dha', 'lactated ringers and dextrose', 'atenolol and chlorthalidone']);
const SKIP_DIR = /^(node_modules|_to_delete|backup|\.git|public|logs|data)/;
const SKIP_FILE = /(^patch-|\.pre-|\.bak|\.retired-)/;
const PREVIEW_LIMIT = 20;

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return abort('Cannot read ' + p + ': ' + e.message); } }
function readJson(p) { try { return JSON.parse(read(p)); } catch (e) { return abort(p + ' is not valid JSON.'); } }
const lc = s => String(s).toLowerCase().trim();
const norm = s => lc(s).replace(/[^a-z0-9]/g, '');
const rows = (n, list) => (list.length ? '\n  ' + list.slice(0, PREVIEW_LIMIT).join('\n  ') + (list.length > PREVIEW_LIMIT ? '\n  ... +' + (list.length - PREVIEW_LIMIT) + ' more' : '') : ' none');

/** Finds JS files outside patches that still load the old root lookup. */
function findLookupReaders(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (!SKIP_DIR.test(name) && name !== 'scripts') findLookupReaders(full, out); continue; }
    if (SKIP_FILE.test(name) || path.extname(name) !== '.js' || full === RETAIL) continue;
    const text = read(full);
    let i = text.indexOf('brand-generic-lookup');
    while (i !== -1) { // comments that only name the file pass; quoted names and paths do not
      const prev = text[i - 1];
      if (prev === '"' || prev === "'" || prev === '`' || (prev === '/' && text.slice(Math.max(0, i - 5), i) !== 'data/')) { out.push(path.relative(BASE, full) + ':' + text.slice(0, i).split('\n').length); break; }
      i = text.indexOf('brand-generic-lookup', i + 1);
    }
  }
}

// ---- guards ----
for (const f of ['build-derived-map.js', 'build-derived-lookup.js']) if (!fs.existsSync(P('scripts', f))) abort('Copy scripts/' + f + ' to ' + P('scripts', f) + ' first.');
const gen = require(P('scripts', 'build-derived-map.js'));
const lk = require(P('scripts', 'build-derived-lookup.js'));
const srcRetail = read(RETAIL);
if (!fs.existsSync(OLD_LOOKUP) && fs.existsSync(lk.LOOKUP) && srcRetail.includes(REQ_NEW)) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!fs.existsSync(OLD_LOOKUP)) abort('brand-generic-lookup.json is missing but retail-sources.js still points at it. Review by hand.');
if (!fs.existsSync(SPEC)) abort('Copy coverage-1-5-0.json to ' + SPEC + ' first.');
if (srcRetail.split(REQ_OLD).length !== 2) abort('retail-sources.js: expected exactly one ' + REQ_OLD + '.');
const readers = [];
findLookupReaders(BASE, readers);
if (readers.length) abort('These files still read brand-generic-lookup: ' + readers.join(', ') + '. Repoint them first.');

const oldLookup = readJson(OLD_LOOKUP);
const spec = readJson(SPEC);
const srcMaster = read(gen.MASTER);
const master = JSON.parse(srcMaster);
if (!Array.isArray(master) || !Array.isArray(spec)) abort('Master and spec must both be arrays.');
const byGeneric = g => master.find(e => lc(e.generic) === g);
const report = { skipped: [], droppedTerms: [], added: [], moved: [], flags: [], aliasAdds: [], unresolved: [], misspelled: [] };

// ---- owner indexes ----
const ownerOf = new Map();
const normOwner = new Map();
function indexEntry(e) {
  for (const t of [e.generic].concat(e.brands || [], e.aliases || [], e.commonMisspellings || [])) { ownerOf.set(lc(t), e); normOwner.set(norm(t), e); }
}
master.forEach(indexEntry);

// ---- 1a. rulings ----
const fam = byGeneric('famotidine'); const ran = byGeneric('ranitidine'); const sem = byGeneric('semaglutide');
if (!fam || !ran || !sem) abort('Master lacks famotidine, ranitidine, or semaglutide.');
if ((ran.brands || []).some(b => lc(b) === 'zantac')) {
  ran.brands = ran.brands.filter(b => lc(b) !== 'zantac');
  ran.aliases = (ran.aliases || []).filter(a => lc(a) !== 'zantac');
  fam.brands = (fam.brands || []).concat('Zantac');
  fam.aliases = (fam.aliases || []).concat('zantac');
  ownerOf.set('zantac', fam); normOwner.set('zantac', fam);
  report.moved.push('Zantac: ranitidine -> famotidine');
}
for (const a of SEMAGLUTIDE_ALIASES) {
  if (ownerOf.has(a)) continue;
  sem.aliases = (sem.aliases || []).concat(a); ownerOf.set(a, sem); normOwner.set(norm(a), sem);
  report.added.push('alias "' + a + '" on semaglutide');
}
for (const g of NO_US_GENERIC) {
  const e = byGeneric(g);
  if (e && e.hasGeneric !== false) { e.hasGeneric = false; report.flags.push(g + ': hasGeneric true -> false'); }
}

// ---- 1b. import ----
let nextId = master.reduce((m, e) => Math.max(m, parseInt(e.id, 10) || 0), 0) + 1;
for (const s of spec) {
  const hit = normOwner.get(norm(s.generic));
  if (hit) { report.skipped.push(s.generic + ' (already covered by "' + hit.generic + '")'); continue; }
  const brands = [];
  for (const b of s.brands || []) {
    const owner = ownerOf.get(lc(b));
    if (owner) report.droppedTerms.push('brand "' + b + '" for ' + s.generic + ' (owned by ' + owner.generic + ')'); else brands.push(b);
  }
  const aliases = [];
  for (const a of brands.map(lc).concat((s.aliases || []).map(lc))) if (!ownerOf.has(a) && !aliases.includes(a)) aliases.push(a);
  const entry = { id: String(nextId++), generic: s.generic, brands, aliases, drugClass: s.drugClass, primaryUse: s.primaryUse, primaryUseES: s.primaryUseES, hasGeneric: s.hasGeneric, commonMisspellings: [] };
  master.push(entry); indexEntry(entry); report.added.push('drug ' + s.generic + ' (id ' + entry.id + ')');
}

// ---- 1c. carry typicalSavings and pricingNames from the old lookup ----
function termsOf(e) { return [...new Set([e.generic].concat(e.brands || [], e.aliases || []).map(lc))]; }
function carryOldValues() {
  for (const e of master) {
    const counts = new Map();
    for (const key of termsOf(e)) {
      const row = oldLookup[key];
      if (!row) continue;
      if (row.typicalSavings !== null && row.typicalSavings !== undefined) counts.set(row.typicalSavings, (counts.get(row.typicalSavings) || 0) + 1);
      if (row.generic && lc(row.generic) !== lc(e.generic) && !(e.pricingNames && e.pricingNames[key])) { e.pricingNames = Object.assign({}, e.pricingNames, { [key]: row.generic }); }
    }
    if (e.typicalSavings === undefined && counts.size) e.typicalSavings = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
}
carryOldValues();

// ---- 1d. keep every old lookup key resolving ----
let probe = lk.buildLookup(master).lookup;
for (const key of Object.keys(oldLookup)) {
  if (probe[key] || NOT_CARRIED.has(key)) continue;
  const og = lc(oldLookup[key].generic);
  const target = master.find(e => lc(e.generic) === og || Object.values(e.pricingNames || {}).some(v => lc(v) === og));
  if (target && ownerOf.get(key) === target) { report.misspelled.push(key + ' -> ' + target.generic); continue; } // stays a misspelling by design
  if (!target || ownerOf.has(key)) { report.unresolved.push(key + ' (old generic "' + oldLookup[key].generic + '")'); continue; }
  target.aliases = (target.aliases || []).concat(key); ownerOf.set(key, target);
  report.aliasAdds.push(key + ' -> ' + target.generic);
}
carryOldValues();

// ---- validation ----
const seenGeneric = new Set(); const seenId = new Set();
for (const e of master) {
  if (seenGeneric.has(lc(e.generic))) abort('Duplicate generic: ' + e.generic);
  if (seenId.has(String(e.id))) abort('Duplicate id: ' + e.id);
  seenGeneric.add(lc(e.generic)); seenId.add(String(e.id));
}
const { map: nextMap, collisions: mapCollisions } = gen.buildMap(master);
const { lookup: nextLookup, collisions: lookupCollisions } = lk.buildLookup(master);
const hasGenericShifts = Object.keys(oldLookup).filter(k => nextLookup[k] && nextLookup[k].hasGeneric !== oldLookup[k].hasGeneric).map(k => k + ': ' + oldLookup[k].hasGeneric + ' -> ' + nextLookup[k].hasGeneric);
const genericShifts = Object.keys(oldLookup).filter(k => nextLookup[k] && lc(nextLookup[k].generic) !== lc(oldLookup[k].generic)).map(k => k + ': "' + oldLookup[k].generic + '" -> "' + nextLookup[k].generic + '"');
const lost = Object.keys(oldLookup).filter(k => !nextLookup[k]);

console.log('--- PLAN ---');
console.log('Master entries ' + JSON.parse(srcMaster).length + ' -> ' + master.length);
console.log('Rulings applied:' + rows(0, report.moved.concat(report.flags)));
console.log('Added:' + rows(0, report.added));
console.log('Skipped as already covered:' + rows(0, report.skipped));
console.log('Brand terms dropped (owned elsewhere):' + rows(0, report.droppedTerms));
console.log('Old lookup keys kept as aliases:' + rows(0, report.aliasAdds));
console.log('Old lookup keys NOT carried (' + lost.length + '):' + rows(0, lost));
console.log('Old lookup keys that are master misspellings (left out by design):' + rows(0, report.misspelled));
console.log('Unresolved old keys:' + rows(0, report.unresolved));
console.log('Lookup rows whose pricing generic changes:' + rows(0, genericShifts));
console.log('Lookup rows whose hasGeneric changes (pricing path changes):' + rows(0, hasGenericShifts));
if (mapCollisions.length) console.log('WARN map collisions:' + rows(0, mapCollisions));
if (lookupCollisions.length) console.log('WARN lookup collisions:' + rows(0, lookupCollisions));
console.log('map keys ' + Object.keys(nextMap).length + ' | lookup keys ' + Object.keys(nextLookup).length + ' (old lookup ' + Object.keys(oldLookup).length + ')');
if (report.unresolved.length) abort('Unresolved old lookup keys. Review before continuing.');
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

// ---- write with rollback ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const EDITS = [
  { p: gen.MASTER, src: srcMaster, out: JSON.stringify(master, null, 2) + '\n' },
  { p: gen.MAP, src: read(gen.MAP), out: gen.serialize(nextMap) },
  { p: RETAIL, src: srcRetail, out: srcRetail.replace(REQ_OLD, REQ_NEW) },
];
const written = []; const moved = []; let lookupWritten = false;
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const m of moved.reverse()) { try { fs.renameSync(m.to, m.from); } catch (e) { console.error('Could not move back ' + m.to + ': ' + e.message); } }
  if (lookupWritten) { try { fs.unlinkSync(lk.LOOKUP); } catch (e) { console.error('Could not remove ' + lk.LOOKUP); } }
  for (const f of written) fs.writeFileSync(f.p, f.src, 'utf8');
  process.exit(1);
}
for (const f of EDITS) fs.copyFileSync(f.p, f.p + '.pre-v1.5.0-' + stamp + '.bak');
try {
  for (const f of EDITS) { fs.writeFileSync(f.p, f.out, 'utf8'); written.push(f); }
  fs.writeFileSync(lk.LOOKUP, gen.serialize(nextLookup), 'utf8'); lookupWritten = true;
} catch (e) { restoreAll('write failed: ' + e.message); }

try { execFileSync(process.execPath, ['--check', RETAIL], { stdio: 'pipe' }); } catch (e) { restoreAll('retail-sources.js failed the syntax check'); }
try {
  const m = readJson(gen.MASTER);
  if (m.length !== master.length) throw new Error('master entry count differs');
  const mapDiff = gen.diffMaps(readJson(gen.MAP), nextMap);
  const lkDiff = lk.diffLookups(readJson(lk.LOOKUP), nextLookup);
  if (mapDiff.added.length + mapDiff.dropped.length + mapDiff.changed.length + lkDiff.added.length + lkDiff.dropped.length + lkDiff.changed.length) throw new Error('derived files differ after write');
  if (!read(RETAIL).includes(REQ_NEW)) throw new Error('retail-sources.js missing the new path');
} catch (e) { restoreAll('verification failed: ' + e.message); }

try {
  fs.mkdirSync(TRASH, { recursive: true });
  for (const from of [OLD_LOOKUP, OLD_MAP_ROOT].filter(f => fs.existsSync(f))) {
    const to = path.join(TRASH, path.basename(from) + '.retired-' + stamp);
    fs.renameSync(from, to); moved.push({ from, to });
  }
} catch (e) { restoreAll('could not retire files: ' + e.message); }

console.log('[OK] Master now has ' + master.length + ' entries. Map ' + Object.keys(nextMap).length + ' keys. Lookup ' + Object.keys(nextLookup).length + ' keys.');
console.log('[OK] retail-sources.js reads data/brand-generic-lookup.json. Retired ' + moved.length + ' files to _to_delete/. Backups: *.pre-v1.5.0-' + stamp + '.bak');
console.log('NEXT: pm2 restart rxaggregator, then run the browser checks.');
