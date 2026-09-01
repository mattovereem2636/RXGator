#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const BASE_DIR = '/var/www/rxaggregator';
const DRUG_NAMES_PATH = path.join(BASE_DIR, 'data', 'drug-names.json');
const DRUG_NAMES_PUBLIC = path.join(BASE_DIR, 'public', 'drug-names.json');
const BRAND_MAP_PATH = path.join(BASE_DIR, 'data', 'brand-generic-map.json');
const BACKUP_DIR = path.join(BASE_DIR, 'backups');
const NEW_DRUGS = [
  { generic: 'tirzepatide', rxcui: '2601723', brands: ['mounjaro', 'zepbound'], aliases: ['tirzepatide injection', 'tirz'] },
  { generic: 'semaglutide', rxcui: '1991302', brands: ['ozempic', 'wegovy', 'rybelsus'], aliases: ['semaglutide injection', 'semaglutide oral', 'sema'] }
];
function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
function loadJSON(fp) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { console.error('ERROR: Cannot read ' + fp + ': ' + e.message); process.exit(1); } }
function saveJSON(fp, d) { fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf8'); }
function backup(fp) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, path.basename(fp, '.json') + '-' + timestamp() + '.json');
  fs.copyFileSync(fp, dest); console.log('  Backed up: ' + dest);
}
console.log('=== RxGator GLP-1 Drug Dictionary Update ===');
console.log('Date: ' + new Date().toISOString() + '\n');
console.log('Step 1: Creating backups...');
backup(DRUG_NAMES_PATH); backup(BRAND_MAP_PATH);
const drugNames = loadJSON(DRUG_NAMES_PATH);
const brandMap = loadJSON(BRAND_MAP_PATH);
const beforeCount = Array.isArray(drugNames) ? drugNames.length : Object.keys(drugNames).length;
console.log('\nCurrent drug-names.json entries: ' + beforeCount);
let addedNames = [], addedMappings = [], skippedNames = [], skippedMappings = [];
for (const drug of NEW_DRUGS) {
  const allNames = [drug.generic, ...drug.brands, ...drug.aliases];
  for (const name of allNames) {
    const ln = name.toLowerCase();
    if (Array.isArray(drugNames)) {
      const exists = drugNames.some(e => (typeof e === 'string' ? e.toLowerCase() === ln : (e && e.name && e.name.toLowerCase() === ln)));
      if (!exists) { drugNames.push(ln); addedNames.push(ln); } else { skippedNames.push(ln); }
    } else if (typeof drugNames === 'object') {
      if (!drugNames[ln]) { drugNames[ln] = { name: ln, rxcui: drug.rxcui }; addedNames.push(ln); } else { skippedNames.push(ln); }
    }
  }
  for (const brand of drug.brands) {
    const lb = brand.toLowerCase();
    if (!brandMap[lb]) { brandMap[lb] = drug.generic.toLowerCase(); addedMappings.push(lb + ' -> ' + drug.generic); } else { skippedMappings.push(lb); }
  }
  for (const alias of drug.aliases) {
    const la = alias.toLowerCase();
    if (!brandMap[la]) { brandMap[la] = drug.generic.toLowerCase(); addedMappings.push(la + ' -> ' + drug.generic); }
  }
}
console.log('\nStep 3: Saving updated files...');
saveJSON(DRUG_NAMES_PATH, drugNames); saveJSON(BRAND_MAP_PATH, brandMap);
if (fs.existsSync(path.dirname(DRUG_NAMES_PUBLIC))) { fs.copyFileSync(DRUG_NAMES_PATH, DRUG_NAMES_PUBLIC); console.log('  Copied to: ' + DRUG_NAMES_PUBLIC); }
const afterCount = Array.isArray(drugNames) ? drugNames.length : Object.keys(drugNames).length;
console.log('\n=== RESULTS ===');
console.log('Drug names before: ' + beforeCount);
console.log('Drug names after:  ' + afterCount);
console.log('Names added:       ' + addedNames.length);
if (addedNames.length > 0) { console.log('\nAdded to drug-names.json:'); addedNames.forEach(n => console.log('  + ' + n)); }
if (skippedNames.length > 0) { console.log('\nAlready in drug-names.json (skipped):'); skippedNames.forEach(n => console.log('  - ' + n)); }
if (addedMappings.length > 0) { console.log('\nAdded to brand-generic-map.json:'); addedMappings.forEach(m => console.log('  + ' + m)); }
if (skippedMappings.length > 0) { console.log('\nAlready in brand-generic-map.json (skipped):'); skippedMappings.forEach(m => console.log('  - ' + m)); }
console.log('\nDone. No PM2 restart needed.');
console.log('Test by searching for "tirzepatide" and "semaglutide" on rxgator.info.');
