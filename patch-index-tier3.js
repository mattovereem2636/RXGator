/**
 * RxGator Tier 3 Index.html Patch — S-3 (client), W-8, W-9
 * S-3: Add client-side safeUrl() for defense-in-depth
 * W-8: Replace literal ... with ellipsis character
 * W-9: Replace straight apostrophes with curly quotes in user-facing text
 * Date: 2026-08-28
 *
 * Usage: node patch-index-tier3.js [path-to-index.html]
 */

const fs = require('fs');
const path = require('path');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'public', 'index.html');

if (!fs.existsSync(htmlFile)) {
  console.error('[PATCH] File not found: ' + htmlFile);
  process.exit(1);
}

let src = fs.readFileSync(htmlFile, 'utf8');
const original = src;
let patchCount = 0;

// Unicode constants
var RSQUO = '’'; // right single quotation mark (curly apostrophe)
var ELLIP = '…'; // horizontal ellipsis

function applyPatch(label, search, replacement) {
  var idx = src.indexOf(search);
  if (idx === -1) {
    console.error('[PATCH] FAILED — could not find marker for: ' + label);
    console.error('[PATCH] Searched for: ' + search.substring(0, 80) + '...');
    process.exit(1);
  }
  var second = src.indexOf(search, idx + 1);
  if (second !== -1) {
    console.error('[PATCH] FAILED — marker is not unique for: ' + label);
    process.exit(1);
  }
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
  patchCount++;
  console.log('[PATCH] Applied: ' + label);
}

// ============================================================
// S-3: Add client-side safeUrl() after the esc() function
// ============================================================
applyPatch(
  'S-3: Add client-side safeUrl helper',
  'function esc(s) {\n' +
  '  if (!s) return \'\';\n' +
  '  const d = document.createElement(\'div\');\n' +
  '  d.textContent = s;\n' +
  '  return d.innerHTML;\n' +
  '}',
  'function esc(s) {\n' +
  '  if (!s) return \'\';\n' +
  '  const d = document.createElement(\'div\');\n' +
  '  d.textContent = s;\n' +
  '  return d.innerHTML;\n' +
  '}\n' +
  'function safeUrl(u) { if (!u) return \'\'; var t = String(u).trim(); return /^https?:\\/\\//i.test(t) ? t : \'\'; }'
);

// ============================================================
// S-3: Use safeUrl() in the price-link href
// ============================================================
applyPatch(
  'S-3: Apply safeUrl to price-link href',
  '${p.sourceUrl ? `<a class="price-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">View on ${esc(p.source)} &rarr;</a>` : \'\'}',
  '${safeUrl(p.sourceUrl) ? `<a class="price-link" href="${esc(safeUrl(p.sourceUrl))}" target="_blank" rel="noopener">View on ${esc(p.source)} &rarr;</a>` : \'\'}'
);

// ============================================================
// W-8: Replace ... with ellipsis in user-facing text
// ============================================================

applyPatch(
  'W-8: Drug search placeholder',
  'placeholder="e.g. metformin, lisinopril, atorvastatin..."',
  'placeholder="e.g. metformin, lisinopril, atorvastatin' + ELLIP + '"'
);

applyPatch(
  'W-8: i18n drugPlaceholder',
  "drugPlaceholder: { en: 'e.g. metformin, lisinopril, atorvastatin...', es: 'ej. metformina, lisinopril, atorvastatina...' }",
  "drugPlaceholder: { en: 'e.g. metformin, lisinopril, atorvastatin" + ELLIP + "', es: 'ej. metformina, lisinopril, atorvastatina" + ELLIP + "' }"
);

applyPatch(
  'W-8: Loading message ellipsis',
  "and Texas WAC...', es: 'Consultando 18 fuentes de datos: Cost Plus Drugs, SingleCare, GoodRx, RxSaver, Blink Health, Amazon RxPass, NADAC, FUL, Medicare Part D, RxNorm, MedlinePlus, openFDA, Walmart, Costco, Rx Outreach, VA FSS, IRA Negotiated y Texas WAC...' }",
  "and Texas WAC" + ELLIP + "', es: 'Consultando 18 fuentes de datos: Cost Plus Drugs, SingleCare, GoodRx, RxSaver, Blink Health, Amazon RxPass, NADAC, FUL, Medicare Part D, RxNorm, MedlinePlus, openFDA, Walmart, Costco, Rx Outreach, VA FSS, IRA Negotiated y Texas WAC" + ELLIP + "' }"
);

applyPatch(
  'W-8: Searching button text',
  "searchBtn.textContent = currentLang === 'es' ? 'Buscando...' : 'Searching...';",
  "searchBtn.textContent = currentLang === 'es' ? 'Buscando" + ELLIP + "' : 'Searching" + ELLIP + "';"
);

applyPatch(
  'W-8: Did you mean label',
  "const dymLabel = currentLang === 'es' ? '¿Quiso decir...?' : 'Did you mean...?';",
  "const dymLabel = currentLang === 'es' ? '¿Quiso decir" + ELLIP + "?' : 'Did you mean" + ELLIP + "?';"
);

applyPatch(
  'W-8+W-9: Feedback placeholder',
  "placeholder=\"What drugs couldn't you find? What features would make this more useful? Any other thoughts...\">",
  "placeholder=\"What drugs couldn" + RSQUO + "t you find? What features would make this more useful? Any other thoughts" + ELLIP + "\">"
);

applyPatch(
  'W-8: Sending button text',
  "btn.textContent = 'Sending...';",
  "btn.textContent = 'Sending" + ELLIP + "';"
);

applyPatch(
  'W-8: My Meds search placeholder',
  'placeholder="Search your medications..."',
  'placeholder="Search your medications' + ELLIP + '"'
);

applyPatch(
  'W-8: Multi-drug searching status',
  "resultsDiv.innerHTML = '<div class=\"status loading\">Searching ' + drugNames.length + ' medications...</div>';",
  "resultsDiv.innerHTML = '<div class=\"status loading\">Searching ' + drugNames.length + ' medications" + ELLIP + "</div>';"
);

applyPatch(
  'W-8: Multi-drug searched progress',
  "resultsDiv.innerHTML = '<div class=\"status loading\">Searched ' + completed + ' of ' + drugNames.length + '...</div>';",
  "resultsDiv.innerHTML = '<div class=\"status loading\">Searched ' + completed + ' of ' + drugNames.length + '" + ELLIP + "</div>';"
);

// ============================================================
// W-9: Replace straight apostrophes with curly in user-facing text
// Using ’ (right single quotation mark) for curly apostrophe
// ============================================================

applyPatch(
  'W-9: Article card — don\'t have coverage',
  "Practical strategies for finding the lowest prices when you don't have coverage.",
  "Practical strategies for finding the lowest prices when you don" + RSQUO + "t have coverage."
);

applyPatch(
  'W-9: Article card — Cuban\'s',
  "Cost Plus Drugs Review: Is Mark Cuban's Pharmacy Legit?",
  "Cost Plus Drugs Review: Is Mark Cuban" + RSQUO + "s Pharmacy Legit?"
);

applyPatch(
  'W-9: Article card — What\'s Still',
  "Walmart $4 Prescription List: What's Still on It?",
  "Walmart $4 Prescription List: What" + RSQUO + "s Still on It?"
);

applyPatch(
  'W-9: Article card — Walmart\'s discount',
  "The complete guide to Walmart's discount generic drug program.",
  "The complete guide to Walmart" + RSQUO + "s discount generic drug program."
);

applyPatch(
  'W-9: Article card — here\'s how',
  "Pharmacy Benefit Managers control drug pricing — here's how they work.",
  "Pharmacy Benefit Managers control drug pricing — here" + RSQUO + "s how they work."
);

applyPatch(
  'W-9: Article card — America\'s',
  "America's most prescribed drug can cost $4 or $90 — it depends where you fill it.",
  "America" + RSQUO + "s most prescribed drug can cost $4 or $90 — it depends where you fill it."
);

applyPatch(
  'W-9: Article card — Don\'t Know',
  "Rx Outreach: The Nonprofit Pharmacy Most People Don't Know About",
  "Rx Outreach: The Nonprofit Pharmacy Most People Don" + RSQUO + "t Know About"
);

applyPatch(
  'W-9: pharmacyCostTip — you\'re',
  'pharmacyCostTip: { en: "If you\'re paying much more than this, ask your pharmacist why."',
  'pharmacyCostTip: { en: "If you' + RSQUO + 're paying much more than this, ask your pharmacist why."'
);

applyPatch(
  'W-9: recallDesc — bottle\'s',
  "recallDesc: { en: 'The FDA has reported one or more active recalls for this medication. Check your bottle\\'s lot number against the details below and contact your pharmacist if affected. Do not stop taking your medication without consulting your doctor.'",
  "recallDesc: { en: 'The FDA has reported one or more active recalls for this medication. Check your bottle\\u2019s lot number against the details below and contact your pharmacist if affected. Do not stop taking your medication without consulting your doctor.'"
);

applyPatch(
  'W-9: cantAffordDesc — don\'t',
  'cantAffordDesc: { en: "Many drug manufacturers offer additional savings programs that most people don\'t know about',
  'cantAffordDesc: { en: "Many drug manufacturers offer additional savings programs that most people don' + RSQUO + 't know about'
);

applyPatch(
  'W-9: Doctor\'s office',
  "Your doctor's office can help with the paperwork.",
  "Your doctor" + RSQUO + "s office can help with the paperwork."
);

// ============================================================
// Cleanup: Remove vestigial crossorigin on self-hosted Fuse.js
// ============================================================
applyPatch(
  'Cleanup: Remove vestigial crossorigin on Fuse.js',
  '<script src="/fuse.min.js" crossorigin="anonymous"></script>',
  '<script src="/fuse.min.js"></script>'
);

// ============================================================
// WRITE
// ============================================================
var backupFile = htmlFile + '.pre-tier3-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log('[PATCH] Backup saved: ' + backupFile);

fs.writeFileSync(htmlFile, src);
console.log('[PATCH] All ' + patchCount + ' patches applied successfully');
console.log('\n[PATCH] Summary:');
console.log('  - S-3: Added client-side safeUrl() and applied to price-link href');
console.log('  - W-8: Replaced ... with … in all user-facing text');
console.log('  - W-9: Replaced straight apostrophes with curly quotes');
console.log('  - Cleanup: Removed vestigial crossorigin on self-hosted Fuse.js');
