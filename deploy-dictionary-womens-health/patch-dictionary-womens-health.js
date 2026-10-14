#!/usr/bin/env node
/**
 * patch-dictionary-womens-health.js — adds five brand-only drugs to the master dictionary
 * (data/drug-names.json) and rebuilds the derived brand map and lookup.
 *
 * WHY: Addyi, Vyleesi, Osphena and Myfembree had no dictionary entry. The 1.5.2 brand box then
 * shows its "no record" text, and autocomplete cannot suggest them. With hasGeneric false the
 * box says no U.S. generic is sold, which is true for all five (checked 2026-10-14).
 * Orgovyx (relugolix) is added as a guard: RxNorm resolves "Myfembree" to relugolix, and an
 * exact "relugolix" entry keeps the fuzzy matcher from steering Orgovyx searches to Myfembree.
 * "relugolix" is never an alias of Myfembree, so no Myfembree price can show on an Orgovyx search.
 *
 * Pricing does not change: brand-only drugs already price through RxNorm.
 * Data change only: no version bump (the Oct 5 decision for dictionary additions).
 * Restart after the write so fuzzy search reloads: pm2 restart rxaggregator
 *
 * USAGE:  node /var/www/rxaggregator/deploy-dictionary-womens-health/patch-dictionary-womens-health.js --dry-run
 *         node /var/www/rxaggregator/deploy-dictionary-womens-health/patch-dictionary-womens-health.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
process.env.RXG_BASE = BASE; // the generator modules read the same base
const DRY_RUN = process.argv.includes('--dry-run');
const P = (...parts) => path.join(BASE, ...parts);

// Generic names match the RxNorm ingredient names. Aliases include each brand in lowercase, as in 1.5.0.
const NEW_ENTRIES = [
  { generic: 'flibanserin', brands: ['Addyi'], aliases: ['addyi'],
    drugClass: 'Serotonin 1A agonist / 2A antagonist', primaryUse: 'Low sexual desire in premenopausal women (HSDD)',
    primaryUseES: 'Deseo sexual bajo en mujeres premenopáusicas (HSDD)', hasGeneric: false,
    commonMisspellings: ['flibanserine', 'flibanseran', 'flibansarin', 'addyie'] },
  { generic: 'bremelanotide', brands: ['Vyleesi'], aliases: ['vyleesi'],
    drugClass: 'Melanocortin receptor agonist', primaryUse: 'Low sexual desire in premenopausal women (HSDD)',
    primaryUseES: 'Deseo sexual bajo en mujeres premenopáusicas (HSDD)', hasGeneric: false,
    commonMisspellings: ['bremelanatide', 'bremelonotide', 'vylesi', 'vyleesy', 'vylessi'] },
  { generic: 'ospemifene', brands: ['Osphena'], aliases: ['osphena'],
    drugClass: 'Estrogen agonist/antagonist (SERM)', primaryUse: 'Painful intercourse and vaginal dryness after menopause',
    primaryUseES: 'Relaciones sexuales dolorosas y sequedad vaginal después de la menopausia', hasGeneric: false,
    commonMisspellings: ['ospemifine', 'ospemiphene', 'osphina', 'ospheena', 'ospena'] },
  { generic: 'relugolix, estradiol, and norethindrone acetate', brands: ['Myfembree'], aliases: ['myfembree'],
    drugClass: 'GnRH receptor antagonist combination', primaryUse: 'Heavy menstrual bleeding from uterine fibroids; endometriosis pain',
    primaryUseES: 'Sangrado menstrual abundante por fibromas uterinos; dolor por endometriosis', hasGeneric: false,
    commonMisspellings: ['myfembre', 'myfembry', 'myfembrie', 'myfemebree'] },
  { generic: 'relugolix', brands: ['Orgovyx'], aliases: ['orgovyx'],
    drugClass: 'GnRH receptor antagonist', primaryUse: 'Advanced prostate cancer',
    primaryUseES: 'Cáncer de próstata avanzado', hasGeneric: false,
    commonMisspellings: ['relugolex', 'orgovix'] },
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
const lc = s => String(s).toLowerCase().trim();
const norm = s => lc(s).replace(/[^a-z0-9]/g, '');

function main() {
  for (const f of ['build-derived-map.js', 'build-derived-lookup.js']) {
    if (!fs.existsSync(P('scripts', f))) abort('Missing ' + P('scripts', f) + '.');
  }
  const gen = require(P('scripts', 'build-derived-map.js'));
  const lk = require(P('scripts', 'build-derived-lookup.js'));
  const srcMaster = fs.readFileSync(gen.MASTER, 'utf8');
  const master = JSON.parse(srcMaster);
  if (!Array.isArray(master) || master.length === 0) abort('Master is not a non-empty array.');

  // The live derived files must match the master before we start, or the diff below is meaningless.
  const before = { map: gen.buildMap(master).map, lookup: lk.buildLookup(master).lookup };
  const liveMap = JSON.parse(fs.readFileSync(gen.MAP, 'utf8'));
  const liveLookup = JSON.parse(fs.readFileSync(lk.LOOKUP, 'utf8'));
  const dm = gen.diffMaps(liveMap, before.map); const dl = lk.diffLookups(liveLookup, before.lookup);
  if (dm.added.length + dm.dropped.length + dm.changed.length + dl.added.length + dl.dropped.length + dl.changed.length) {
    abort('The live map or lookup differs from the master already. Run build-derived-map.js --check and build-derived-lookup.js --check first.');
  }

  const owner = new Map();
  for (const e of master) for (const t of [e.generic].concat(e.brands || [], e.aliases || [], e.commonMisspellings || [])) owner.set(lc(t), e.generic);
  const genericNorms = new Set(master.map(e => norm(e.generic)));

  const added = []; const skipped = [];
  let nextId = master.reduce((m, e) => Math.max(m, parseInt(e.id, 10) || 0), 0) + 1;
  for (const s of NEW_ENTRIES) {
    if (genericNorms.has(norm(s.generic))) { skipped.push(s.generic + ' (already in the master)'); continue; }
    for (const t of [s.generic].concat(s.brands, s.aliases, s.commonMisspellings)) {
      const o = owner.get(lc(t));
      if (o) abort('"' + t + '" already belongs to "' + o + '". Nothing changed.');
    }
    const entry = Object.assign({ id: String(nextId++) }, s);
    master.push(entry);
    for (const t of [s.generic].concat(s.brands, s.aliases, s.commonMisspellings)) owner.set(lc(t), s.generic);
    genericNorms.add(norm(s.generic));
    added.push(entry);
  }

  const { map, collisions: mc } = gen.buildMap(master);
  const { lookup, collisions: lc2 } = lk.buildLookup(master);
  if (mc.length || lc2.length) abort('Collisions: ' + mc.concat(lc2).join('; '));
  const genericKeys = Object.keys(lookup).filter(k => master.some(e => lc(e.generic) === k));
  if (genericKeys.length) abort('The lookup would gain generic-name keys: ' + genericKeys.join(', '));
  const dMap = gen.diffMaps(liveMap, map); const dLk = lk.diffLookups(liveLookup, lookup);
  if (dMap.dropped.length || dMap.changed.length || dLk.dropped.length || dLk.changed.length) abort('An existing map or lookup key would change. Nothing written.');

  console.log('--- PLAN ---');
  console.log('Master ' + (master.length - added.length) + ' -> ' + master.length + ' entries');
  for (const e of added) console.log('  + id ' + e.id + '  ' + e.generic + ' [' + e.brands.join(', ') + ']  hasGeneric=false');
  if (skipped.length) console.log('Skipped: ' + skipped.join('; '));
  console.log('Brand map: +' + dMap.added.length + ' keys (' + dMap.added.join(', ') + '), 0 dropped, 0 changed');
  console.log('Lookup:    +' + dLk.added.length + ' keys (' + dLk.added.join(', ') + '), 0 dropped, 0 changed');
  if (added.length === 0) { console.log('Nothing to add.'); return; }
  if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bakDir = P('data', 'backups', 'dictionary-womens-health-' + stamp);
  fs.mkdirSync(bakDir, { recursive: true });
  const files = [
    { p: gen.MASTER, src: srcMaster, out: JSON.stringify(master, null, 2) + '\n' },
    { p: gen.MAP, src: fs.readFileSync(gen.MAP, 'utf8'), out: gen.serialize(map) },
    { p: lk.LOOKUP, src: fs.readFileSync(lk.LOOKUP, 'utf8'), out: gen.serialize(lookup) },
  ];
  for (const f of files) fs.writeFileSync(path.join(bakDir, path.basename(f.p)), f.src, 'utf8');
  const written = [];
  try {
    for (const f of files) { gen.writeAtomic(f.p, f.out); written.push(f); }
    const m2 = JSON.parse(fs.readFileSync(gen.MASTER, 'utf8'));
    if (m2.length !== master.length) throw new Error('master entry count differs');
    const c1 = gen.diffMaps(JSON.parse(fs.readFileSync(gen.MAP, 'utf8')), gen.buildMap(m2).map);
    const c2 = lk.diffLookups(JSON.parse(fs.readFileSync(lk.LOOKUP, 'utf8')), lk.buildLookup(m2).lookup);
    if (c1.added.length + c1.dropped.length + c1.changed.length + c2.added.length + c2.dropped.length + c2.changed.length) throw new Error('derived files do not match the master after the write');
    const log = added.map(e => [new Date().toISOString(), 'entry', e.generic, e.brands.join('|')].join('\t')).join('\n') + '\n';
    fs.appendFileSync(P('data', 'dictionary-changes.log'), log, 'utf8');
  } catch (err) {
    for (const f of written) fs.writeFileSync(f.p, f.src, 'utf8');
    abort('Write failed, files restored: ' + err.message + ' (backups in ' + bakDir + ')');
  }
  console.log('[OK] Added ' + added.length + ' entries. Backups: ' + bakDir);
  console.log('NEXT: pm2 restart rxaggregator');
}

try { main(); } catch (err) { abort(err.message); }
