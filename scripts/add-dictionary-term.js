#!/usr/bin/env node
/**
 * add-dictionary-term.js — adds a misspelling, alias, or brand to one master dictionary entry.
 *
 * WHY: the weekly gap report lists typos that miss. This tool turns each one into a single
 * command instead of a patch and a release. Brands and aliases also refresh the derived map and lookup.
 *
 * USAGE:  node /var/www/rxaggregator/scripts/add-dictionary-term.js <misspelling|alias|brand> "<generic>" "<term>" ["<term>" ...] [--dry-run]
 * EXAMPLE: node /var/www/rxaggregator/scripts/add-dictionary-term.js misspelling "darolutamide" "nubeqqa"
 *
 * The tool refuses a term that already belongs to a different drug. It backs up the master,
 * restores it if the map write fails, and appends one line to data/dictionary-changes.log.
 * Restart after a change: pm2 restart rxaggregator
 */
const fs = require('fs');
const path = require('path');
const lib = require('./build-derived-map.js');
const lk = require('./build-derived-lookup.js');

const FIELD_FOR_KIND = { misspelling: 'commonMisspellings', alias: 'aliases', brand: 'brands' };
const TERM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'&\/-]{1,59}$/;
const LOG_FILE = path.join(path.dirname(lib.MASTER), 'dictionary-changes.log');

function fail(msg) { console.error('[ABORT] ' + msg); process.exit(1); }

function ownerIndex(master) {
  const index = new Map();
  for (const entry of master) {
    const owner = String(entry.generic);
    const terms = [entry.generic].concat(entry.brands || [], entry.aliases || [], entry.commonMisspellings || []);
    for (const t of terms) index.set(String(t).toLowerCase().trim(), owner);
  }
  return index;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const args = process.argv.slice(2).filter(a => a !== '--dry-run');
  const [kind, genericArg, ...termArgs] = args;
  if (!FIELD_FOR_KIND[kind] || !genericArg || termArgs.length === 0) {
    fail('Usage: add-dictionary-term.js <misspelling|alias|brand> "<generic>" "<term>" ["<term>" ...] [--dry-run]');
  }
  const master = lib.loadMaster();
  const matches = master.filter(e => String(e.generic || '').toLowerCase() === genericArg.toLowerCase().trim());
  if (matches.length !== 1) fail('Found ' + matches.length + ' master entries for generic "' + genericArg + '". Use the exact generic name.');
  const entry = matches[0];
  const owners = ownerIndex(master);
  const fresh = [];
  for (const raw of termArgs) {
    const term = kind === 'brand' ? raw.trim() : raw.trim().toLowerCase();
    if (!TERM_PATTERN.test(term)) fail('Term "' + raw + '" is not allowed (letters, digits, space, . \' & / - ; 2 to 60 characters).');
    const owner = owners.get(term.toLowerCase());
    if (owner && owner !== String(entry.generic)) fail('"' + term + '" already belongs to "' + owner + '". Nothing changed.');
    if (owner) { console.log('[SKIP] "' + term + '" is already on ' + entry.generic + '.'); continue; }
    fresh.push(term);
  }
  if (fresh.length === 0) { console.log('Nothing to add.'); return; }
  console.log('Plan: add ' + kind + ' ' + JSON.stringify(fresh) + ' to ' + entry.generic + (kind === 'misspelling' ? ' (map unchanged)' : ' and refresh the map and lookup'));
  if (dryRun) { console.log('DRY RUN: nothing written.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = lib.MASTER + '.pre-term-' + stamp + '.bak';
  fs.copyFileSync(lib.MASTER, backup);
  entry[FIELD_FOR_KIND[kind]] = (entry[FIELD_FOR_KIND[kind]] || []).concat(fresh);
  try {
    lib.writeAtomic(lib.MASTER, JSON.stringify(master, null, 2) + '\n');
    if (kind !== 'misspelling') {
      const { map } = lib.buildMap(master);
      if (fs.existsSync(lib.MAP)) fs.copyFileSync(lib.MAP, lib.MAP + '.pre-term-' + stamp + '.bak');
      lib.writeAtomic(lib.MAP, lib.serialize(map));
      if (fs.existsSync(lk.LOOKUP)) fs.copyFileSync(lk.LOOKUP, lk.LOOKUP + '.pre-term-' + stamp + '.bak');
      lib.writeAtomic(lk.LOOKUP, lib.serialize(lk.buildLookup(master).lookup));
    }
    const lines = fresh.map(t => [new Date().toISOString(), kind, entry.generic, t].join('\t')).join('\n') + '\n';
    fs.appendFileSync(LOG_FILE, lines, 'utf8');
  } catch (err) {
    fs.copyFileSync(backup, lib.MASTER);
    fail('Write failed, master restored from backup: ' + err.message);
  }
  console.log('[OK] Added. Backup: ' + backup);
  console.log('Next: pm2 restart rxaggregator');
}

try { main(); } catch (err) { fail(err.message); }
