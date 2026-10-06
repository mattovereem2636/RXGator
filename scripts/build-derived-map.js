#!/usr/bin/env node
/**
 * build-derived-map.js — derives data/brand-generic-map.json from data/drug-names.json.
 *
 * WHY: data/drug-names.json is the one master dictionary. The brand map is a derived file,
 * so no builder script or hand patch can leave the two out of step.
 *
 * RULE: every brand and every alias of every master entry becomes a lowercase key.
 * Misspellings stay in the master list only. Add them with scripts/add-dictionary-term.js.
 *
 * USAGE:  node /var/www/rxaggregator/scripts/build-derived-map.js --check   (writes nothing; exit 1 on a difference)
 *         node /var/www/rxaggregator/scripts/build-derived-map.js --write   (backs up the map, then writes it)
 * Restart the app after a write: pm2 restart rxaggregator
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || path.join(__dirname, '..');
const MASTER = path.join(BASE, 'data', 'drug-names.json');
const MAP = path.join(BASE, 'data', 'brand-generic-map.json');
const MAP_FIELDS = ['generic', 'drugClass', 'primaryUse', 'primaryUseES'];
const PREVIEW_LIMIT = 15;

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { throw new Error('Cannot read ' + file + ': ' + err.message); }
}

function loadMaster() {
  const master = loadJson(MASTER);
  if (!Array.isArray(master) || master.length === 0) throw new Error(MASTER + ' is not a non-empty array.');
  return master;
}

function normalize(obj) {
  const pairs = Object.entries(obj).filter(([, v]) => v !== undefined);
  return Object.fromEntries(pairs.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** @returns {{map: object, collisions: string[]}} */
function buildMap(master) {
  const map = {};
  const collisions = [];
  for (const entry of master) {
    for (const term of [].concat(entry.brands || [], entry.aliases || [])) {
      const key = String(term).toLowerCase().trim();
      if (!key) continue;
      const value = {};
      for (const field of MAP_FIELDS) if (entry[field] !== undefined) value[field] = entry[field];
      if (map[key] && map[key].generic !== value.generic) collisions.push(key + ': ' + map[key].generic + ' vs ' + value.generic);
      map[key] = value;
    }
  }
  return { map, collisions };
}

function diffMaps(current, next) {
  const added = Object.keys(next).filter(k => !(k in current));
  const dropped = Object.keys(current).filter(k => !(k in next));
  const changed = Object.keys(next).filter(k => k in current &&
    JSON.stringify(normalize(current[k])) !== JSON.stringify(normalize(next[k])));
  return { added, dropped, changed };
}

function misspellingSet(master) {
  const set = new Set();
  for (const entry of master) for (const m of entry.commonMisspellings || []) set.add(String(m).toLowerCase().trim());
  return set;
}

function writeAtomic(file, text) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function serialize(map) { return JSON.stringify(map, null, 2) + '\n'; }

function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    console.error('Usage: node build-derived-map.js --check | --write');
    process.exit(2);
  }
  const master = loadMaster();
  const { map, collisions } = buildMap(master);
  const current = fs.existsSync(MAP) ? loadJson(MAP) : {};
  const d = diffMaps(current, map);
  const misspell = misspellingSet(master);
  console.log('Master entries: ' + master.length + ' | derived keys: ' + Object.keys(map).length + ' | current keys: ' + Object.keys(current).length);
  console.log('Added: ' + d.added.length + ' | dropped: ' + d.dropped.length + ' (' + d.dropped.filter(k => misspell.has(k)).length + ' are master misspellings) | changed: ' + d.changed.length);
  if (d.added.length) console.log('  added:', d.added.slice(0, PREVIEW_LIMIT));
  if (d.changed.length) console.log('  changed:', d.changed.slice(0, PREVIEW_LIMIT));
  if (collisions.length) console.warn('WARN: terms that map to two different generics:', collisions.slice(0, PREVIEW_LIMIT));
  const same = d.added.length + d.dropped.length + d.changed.length === 0;
  if (mode === '--check') process.exit(same ? 0 : 1);
  if (same) { console.log('[OK] Map already matches the master. Nothing written.'); return; }
  if (fs.existsSync(MAP)) fs.copyFileSync(MAP, MAP + '.pre-derive-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak');
  writeAtomic(MAP, serialize(map));
  console.log('[OK] Wrote ' + MAP + '. Run: pm2 restart rxaggregator');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error('[ERROR] ' + err.message); process.exit(1); }
}
module.exports = { MASTER, MAP, loadMaster, buildMap, diffMaps, misspellingSet, writeAtomic, serialize };
