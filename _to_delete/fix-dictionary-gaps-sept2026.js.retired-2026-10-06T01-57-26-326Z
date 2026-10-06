/**
 * fix-dictionary-gaps-sept2026.js
 *
 * 1. Removes 12 orphaned plain-string entries left over from a prior
 *    GLP-1 dictionary patch (tirzepatide/semaglutide aliases that got
 *    appended as bare strings instead of nested inside proper objects).
 * 2. Adds two genuine dictionary gaps surfaced by the 2026-09-13
 *    drug-gap report: vibegron (Gemtesa) and darolutamide (Nubeqa,
 *    commonly misspelled "nubeca").
 *
 * Backs up both public/ and data/ copies before writing.
 */
const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'public', 'drug-names.json'),
  path.join(__dirname, 'data', 'drug-names.json'),
];

const NEW_ENTRIES = [
  {
    id: "1132",
    generic: "vibegron",
    brands: ["Gemtesa"],
    aliases: ["gemtesa"],
    drugClass: "Beta-3 adrenergic agonist",
    primaryUse: "Overactive bladder",
    primaryUseES: "Vejiga hiperactiva",
    hasGeneric: false,
    commonMisspellings: ["vibegon", "vibegrom", "vibegran"]
  },
  {
    id: "1133",
    generic: "darolutamide",
    brands: ["Nubeqa"],
    aliases: ["nubeqa"],
    drugClass: "Androgen receptor inhibitor",
    primaryUse: "Prostate cancer",
    primaryUseES: "Cáncer de próstata",
    hasGeneric: false,
    commonMisspellings: ["nubeca", "darolutimide", "darolutomide"]
  }
];

for (const file of files) {
  const backupPath = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(file, backupPath);
  console.log(`[BACKUP] ${file} -> ${backupPath}`);

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = data.length;
  const cleaned = data.filter(x => typeof x === 'object' && x !== null);
  const removed = before - cleaned.length;

  for (const entry of NEW_ENTRIES) {
    if (cleaned.some(x => x.generic === entry.generic)) {
      console.log(`[SKIP] ${entry.generic} already present in ${file}`);
      continue;
    }
    cleaned.push(entry);
  }

  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2) + '\n');
  console.log(`[OK] ${file}: removed ${removed} stray string entries, now ${cleaned.length} total entries`);
}

console.log('\nDone. Restart the app (pm2 restart rxaggregator) if drug-names.json is cached in memory.');
