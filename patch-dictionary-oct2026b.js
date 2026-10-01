/**
 * patch-dictionary-oct2026b.js
 *
 * Adds vibegron (Gemtesa), darolutamide (Nubeqa) and amphetamine/dextroamphetamine
 * (Adderall) to data/drug-names.json and data/brand-generic-map.json.
 *
 * WHY: brand-alias.js builds its generic -> brand index only from dictionary
 * entries with hasGeneric === false and exactly one brand. Without the vibegron
 * and darolutamide entries, the SingleCare, GoodRx, and RxSaver caches keyed
 * "gemtesa" and "nubeqa" are unreachable. Adderall fills a gap seen on 2026-10-01
 * (a search for "D amphetamine salt compo" returned zero results).
 *
 * SAFE TO RE-RUN: skips any generic already present. Backs up both files first.
 * USAGE:  node patch-dictionary-oct2026b.js --dry-run   (shows changes, writes nothing)
 *         node patch-dictionary-oct2026b.js             (applies)
 * Restart the app afterward: brand-alias.js loads its index once.
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DICT_PATH = path.join(__dirname, 'data', 'drug-names.json');
const MAP_PATH = path.join(__dirname, 'data', 'brand-generic-map.json');

const dictionary = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
const brandMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const highestId = Math.max(...dictionary.map(e => parseInt(e.id, 10)));
console.log('Current dictionary: ' + dictionary.length + ' drugs, highest ID: ' + highestId);
console.log('Current brand map: ' + Object.keys(brandMap).length + ' mappings');

const NEW_DRUGS = [
  {
    generic: 'vibegron',
    brands: ['Gemtesa'],
    aliases: ['gemtesa'],
    drugClass: 'Beta-3 Adrenergic Agonist',
    primaryUse: 'Overactive Bladder',
    primaryUseES: 'Vejiga hiperactiva',
    hasGeneric: false,
    commonMisspellings: ['vibegon', 'vibegran', 'vibgron', 'vibegorn', 'gemtessa', 'gemptesa']
  },
  {
    generic: 'darolutamide',
    brands: ['Nubeqa'],
    aliases: ['nubeqa'],
    drugClass: 'Androgen Receptor Inhibitor',
    primaryUse: 'Prostate Cancer',
    primaryUseES: 'Cáncer de próstata',
    hasGeneric: false,
    commonMisspellings: ['darolutimide', 'darolutamid', 'darulutamide', 'darolutimid', 'nubeka', 'nubequa']
  },
  {
    // Name matches brand-generic-lookup.json ("amphetamine/dextroamphetamine").
    generic: 'amphetamine/dextroamphetamine',
    brands: ['Adderall'],
    aliases: ['adderall', 'amphetamine salts', 'mixed amphetamine salts', 'dextroamphetamine amphetamine',
              'd amphetamine salt', 'd amphetamine salt combo'],
    drugClass: 'CNS Stimulant',
    primaryUse: 'ADHD',
    primaryUseES: 'TDAH',
    hasGeneric: true,
    commonMisspellings: ['adderal', 'aderall', 'adderrall', 'adderol', 'adrerall', 'd amphetamine salt compo']
  }
];

const existingGenerics = new Set(dictionary.map(e => String(e.generic).toLowerCase()));
let nextId = highestId + 1;
const toAdd = [];
for (const drug of NEW_DRUGS) {
  if (existingGenerics.has(drug.generic)) {
    console.log('SKIP: ' + drug.generic + ' already in dictionary');
    continue;
  }
  toAdd.push(Object.assign({ id: String(nextId++) }, drug));
}

if (toAdd.length === 0) { console.log('No new drugs to add.'); process.exit(0); }

let newMappings = 0;
const skippedKeys = [];
for (const drug of toAdd) {
  const mapEntry = { generic: drug.generic, drugClass: drug.drugClass, primaryUse: drug.primaryUse, primaryUseES: drug.primaryUseES };
  const keys = [].concat(drug.brands, drug.aliases || [], drug.commonMisspellings || []).map(k => k.toLowerCase());
  for (const key of keys) {
    if (brandMap[key]) { skippedKeys.push(key + ' (already maps to ' + brandMap[key].generic + ')'); continue; }
    brandMap[key] = mapEntry;
    newMappings++;
  }
}

console.log('\n--- PLAN ---');
console.log('Add ' + toAdd.length + ' drugs: ' + toAdd.map(d => d.generic + ' (id ' + d.id + ')').join(', '));
console.log('Add ' + newMappings + ' brand-map keys');
if (skippedKeys.length) console.log('Keys left alone (already mapped): ' + skippedKeys.join('; '));

if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(DICT_PATH, DICT_PATH + '.pre-oct2026b-' + stamp + '.bak');
fs.copyFileSync(MAP_PATH, MAP_PATH + '.pre-oct2026b-' + stamp + '.bak');

for (const drug of toAdd) dictionary.push(drug);
fs.writeFileSync(DICT_PATH, JSON.stringify(dictionary, null, 2), 'utf8');
fs.writeFileSync(MAP_PATH, JSON.stringify(brandMap, null, 2), 'utf8');

console.log('\n--- RESULTS ---');
console.log('Dictionary: ' + dictionary.length + ' drugs');
console.log('Brand map: ' + Object.keys(brandMap).length + ' mappings, added ' + newMappings);
console.log('Backups: *.pre-oct2026b-' + stamp + '.bak (beside each file)');
console.log('Next: restart the app (brand-alias.js loads once) and search in a browser.');
