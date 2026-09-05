/**
 * RxGator Tier 3 My-Medications.js Patch — W-6
 * W-6: Add aria-label to icon-only remove button
 * Date: 2026-08-28
 *
 * Usage: node patch-mymeds-tier3.js [path-to-my-medications.js]
 */

const fs = require('fs');
const path = require('path');

const jsFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'public', 'my-medications.js');

if (!fs.existsSync(jsFile)) {
  console.error(`[PATCH] File not found: ${jsFile}`);
  process.exit(1);
}

let src = fs.readFileSync(jsFile, 'utf8');
const original = src;
let patchCount = 0;

function applyPatch(label, search, replacement) {
  const idx = src.indexOf(search);
  if (idx === -1) {
    console.error(`[PATCH] FAILED — could not find marker for: ${label}`);
    console.error(`[PATCH] Searched for: ${search.substring(0, 80)}...`);
    process.exit(1);
  }
  const second = src.indexOf(search, idx + 1);
  if (second !== -1) {
    console.error(`[PATCH] FAILED — marker is not unique for: ${label}`);
    process.exit(1);
  }
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
  patchCount++;
  console.log(`[PATCH] Applied: ${label}`);
}

// ============================================================
// W-6: Add aria-label to remove button
// The × button has title but no aria-label. Screen readers
// announce "multiplication sign" without aria-label.
// ============================================================
applyPatch(
  'W-6: Add aria-label to remove button',
  `<button class="mmp-remove" onclick="window._rxgRemoveMed('\${esc(m.drugName)}')" title="\${l('remove')}">&times;</button>`,
  `<button class="mmp-remove" onclick="window._rxgRemoveMed('\${esc(m.drugName)}')" title="\${l('remove')}" aria-label="\${l('remove')} \${esc(m.drugName)}">&times;</button>`
);

// ============================================================
// WRITE
// ============================================================
const backupFile = jsFile + '.pre-tier3-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(jsFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully`);
console.log('\n[PATCH] Summary:');
console.log('  - W-6: Added aria-label="Remove [drugName]" to the × remove button');
