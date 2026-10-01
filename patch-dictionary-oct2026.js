const fs = require('fs');
const path = require('path');

const DICT_PATH = path.join(__dirname, 'data', 'drug-names.json');
const MAP_PATH = path.join(__dirname, 'data', 'brand-generic-map.json');

const dictionary = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
const brandMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const highestId = Math.max(...dictionary.map(e => parseInt(e.id)));
console.log('Current dictionary: ' + dictionary.length + ' drugs, highest ID: ' + highestId);
console.log('Current brand map: ' + Object.keys(brandMap).length + ' mappings');

const newDrugs = [
  {
    id: String(highestId + 1),
    generic: "dupilumab",
    brands: ["Dupixent"],
    aliases: ["dupixent"],
    drugClass: "Monoclonal Antibody",
    primaryUse: "Eczema / Asthma",
    primaryUseES: "Eccema / Asma",
    hasGeneric: false,
    commonMisspellings: ["dupliumab","dupilimab","duplimab","dupilumeb","duplxent","dupixant","dupexent","dupikent"]
  },
  {
    id: String(highestId + 2),
    generic: "fostemsavir",
    brands: ["Rukobia"],
    aliases: ["rukobia"],
    drugClass: "Attachment Inhibitor",
    primaryUse: "HIV",
    primaryUseES: "VIH",
    hasGeneric: false,
    commonMisspellings: ["fostemsivir","fostemsvir","fostemsaver","rukobai"]
  }
];

const existingGenerics = new Set(dictionary.map(e => e.generic));
const toAdd = newDrugs.filter(drug => {
  if (existingGenerics.has(drug.generic)) {
    console.log('SKIP: ' + drug.generic + ' already in dictionary');
    return false;
  }
  return true;
});

if (toAdd.length === 0) { console.log('No new drugs to add.'); process.exit(0); }

toAdd.forEach(drug => dictionary.push(drug));

let newMappings = 0;
toAdd.forEach(drug => {
  const mapEntry = { generic: drug.generic, drugClass: drug.drugClass, primaryUse: drug.primaryUse, primaryUseES: drug.primaryUseES };
  drug.brands.forEach(brand => { const key = brand.toLowerCase(); if (!brandMap[key]) { brandMap[key] = mapEntry; newMappings++; } });
  (drug.aliases || []).forEach(alias => { const key = alias.toLowerCase(); if (!brandMap[key]) { brandMap[key] = mapEntry; newMappings++; } });
  (drug.commonMisspellings || []).forEach(ms => { const key = ms.toLowerCase(); if (!brandMap[key]) { brandMap[key] = mapEntry; newMappings++; } });
});

fs.writeFileSync(DICT_PATH, JSON.stringify(dictionary, null, 2), 'utf8');
fs.writeFileSync(MAP_PATH, JSON.stringify(brandMap, null, 2), 'utf8');

console.log('\n--- RESULTS ---');
console.log('Added ' + toAdd.length + ' new drugs: ' + toAdd.map(d => d.generic).join(', '));
console.log('Dictionary: ' + dictionary.length + ' drugs (was 130)');
console.log('Brand map: ' + Object.keys(brandMap).length + ' mappings (was 248), added ' + newMappings + ' new');
console.log('New IDs: ' + toAdd.map(d => d.id).join(', '));
