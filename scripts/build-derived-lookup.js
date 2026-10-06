#!/usr/bin/env node
/**
 * build-derived-lookup.js — derives data/brand-generic-lookup.json from data/drug-names.json.
 *
 * WHY: retail-sources.js resolves a searched name to a generic through this lookup. It used
 * to be a hand-kept file that drifted from the master. Now the master is the only source.
 *
 * RULE: the generic name, every brand, and every alias becomes a lowercase key.
 * Row = { brand, generic, drugClass, primaryUse, hasGeneric, typicalSavings }.
 * Optional master fields: typicalSavings (string; shown only when hasGeneric is true), pricingNames ({ "<term>": "<generic used for pricing>" }).
 *
 * USAGE:  node /var/www/rxaggregator/scripts/build-derived-lookup.js --check   (exit 1 on a difference)
 *         node /var/www/rxaggregator/scripts/build-derived-lookup.js --write
 * Restart after a write: pm2 restart rxaggregator
 */
const fs = require('fs');
const path = require('path');
const lib = require('./build-derived-map.js');

const LOOKUP = path.join(path.dirname(lib.MASTER), 'brand-generic-lookup.json');
const PREVIEW_LIMIT = 15;

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** @returns {{lookup: object, collisions: string[]}} */
function buildLookup(master) {
  const lookup = {};
  const collisions = [];
  for (const entry of master) {
    const brandCase = new Map((entry.brands || []).map(b => [String(b).toLowerCase().trim(), String(b).trim()]));
    const terms = [entry.generic].concat(entry.brands || [], entry.aliases || []);
    for (const term of terms) {
      const key = String(term).toLowerCase().trim();
      if (!key) continue;
      const pricing = entry.pricingNames && entry.pricingNames[key];
      const row = {
        brand: brandCase.get(key) || capitalize(key),
        generic: pricing || entry.generic,
        drugClass: entry.drugClass || '',
        primaryUse: entry.primaryUse || '',
        hasGeneric: entry.hasGeneric === true,
        // A drug with no generic has no generic savings to show.
        typicalSavings: entry.hasGeneric === true && entry.typicalSavings !== undefined ? entry.typicalSavings : null,
      };
      if (lookup[key] && lookup[key].generic !== row.generic) collisions.push(key + ': ' + lookup[key].generic + ' vs ' + row.generic);
      lookup[key] = row;
    }
  }
  return { lookup, collisions };
}

function diffLookups(current, next) {
  const added = Object.keys(next).filter(k => !(k in current));
  const dropped = Object.keys(current).filter(k => !(k in next));
  const changed = Object.keys(next).filter(k => k in current && JSON.stringify(current[k]) !== JSON.stringify(next[k]));
  return { added, dropped, changed };
}

function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') { console.error('Usage: node build-derived-lookup.js --check | --write'); process.exit(2); }
  const { lookup, collisions } = buildLookup(lib.loadMaster());
  const current = fs.existsSync(LOOKUP) ? JSON.parse(fs.readFileSync(LOOKUP, 'utf8')) : {};
  const d = diffLookups(current, lookup);
  console.log('Derived keys: ' + Object.keys(lookup).length + ' | current keys: ' + Object.keys(current).length);
  console.log('Added: ' + d.added.length + ' | dropped: ' + d.dropped.length + ' | changed: ' + d.changed.length);
  if (d.added.length) console.log('  added:', d.added.slice(0, PREVIEW_LIMIT));
  if (d.dropped.length) console.log('  dropped:', d.dropped.slice(0, PREVIEW_LIMIT));
  if (d.changed.length) console.log('  changed:', d.changed.slice(0, PREVIEW_LIMIT));
  if (collisions.length) console.warn('WARN: terms that map to two different generics:', collisions.slice(0, PREVIEW_LIMIT));
  const same = d.added.length + d.dropped.length + d.changed.length === 0;
  if (mode === '--check') process.exit(same ? 0 : 1);
  if (same) { console.log('[OK] Lookup already matches the master. Nothing written.'); return; }
  if (fs.existsSync(LOOKUP)) fs.copyFileSync(LOOKUP, LOOKUP + '.pre-derive-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak');
  lib.writeAtomic(LOOKUP, JSON.stringify(lookup, null, 2) + '\n');
  console.log('[OK] Wrote ' + LOOKUP + '. Run: pm2 restart rxaggregator');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error('[ERROR] ' + err.message); process.exit(1); }
}
module.exports = { LOOKUP, buildLookup, diffLookups };
