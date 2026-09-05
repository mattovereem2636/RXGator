/**
 * RxGator Tier 3 Landing.html Patch — W-7, W-9
 * W-7: Add width/height to img tags to prevent layout shift
 * W-9: Replace straight apostrophes with curly quotes
 * Date: 2026-08-28
 *
 * Usage: node patch-landing-tier3.js [path-to-landing.html]
 */

const fs = require('fs');
const path = require('path');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'public', 'landing.html');

if (!fs.existsSync(htmlFile)) {
  console.error(`[PATCH] File not found: ${htmlFile}`);
  process.exit(1);
}

let src = fs.readFileSync(htmlFile, 'utf8');
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
// W-7: Add width/height to hero logo
// The Tier 2 patch already changed alt="" and added h1,
// so we match the post-Tier-2 state
// ============================================================
// Note: On server, Tier 2 changed alt="" and added h1. Match post-Tier-2 state.
applyPatch(
  'W-7: Add dimensions to hero logo',
  '<img src="/logo-reversed.png" alt="" class="hero-logo">\n  <h1 class="sr-only">',
  '<img src="/logo-reversed.png" alt="" class="hero-logo" width="360" height="80">\n  <h1 class="sr-only">'
);

// ============================================================
// W-7: Add width/height to screenshot image
// ============================================================
applyPatch(
  'W-7: Add dimensions to screenshot',
  '<img src="/screenshot.png" alt="RXGator search results showing prescription drug prices from 18 sources" style="max-width:100%; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.15);" onerror="this.style.display=\'none\'">',
  '<img src="/screenshot.png" alt="RXGator search results showing prescription drug prices from 18 sources" width="800" height="500" style="max-width:100%; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.15);" onerror="this.style.display=\'none\'">'
);

// ============================================================
// W-9: Replace straight apostrophes with curly quotes
// ============================================================

// W-9a: "that's why RXGator"
applyPatch(
  "W-9: that's why RXGator",
  "that's why RXGator searches all options.",
  "that’s why RXGator searches all options."
);

// W-9b: "it doesn't. Shouldn't" (HTML version)
applyPatch(
  "W-9: doesn't/Shouldn't (HTML)",
  "Sometimes GoodRx wins. Sometimes it doesn't. Shouldn't you know?</p>",
  "Sometimes GoodRx wins. Sometimes it doesn’t. Shouldn’t you know?</p>"
);

// W-9c: "Mark Cuban's"
applyPatch(
  "W-9: Mark Cuban's",
  "Mark Cuban's transparent pricing.",
  "Mark Cuban’s transparent pricing."
);

// W-9d: JS i18n whyNotGoodrx — doesn't/Shouldn't (escaped in JS)
applyPatch(
  "W-9: doesn't/Shouldn't (JS i18n)",
  "Sometimes GoodRx wins. Sometimes it doesn\\'t. Shouldn\\'t you know?'",
  "Sometimes GoodRx wins. Sometimes it doesn\\u2019t. Shouldn\\u2019t you know?'"
);

// ============================================================
// WRITE
// ============================================================
const backupFile = htmlFile + '.pre-tier3-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(htmlFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully`);
console.log('\n[PATCH] Summary:');
console.log('  - W-7: Added width/height to hero logo and screenshot images');
console.log('  - W-9: Replaced straight apostrophes with curly quotes in 4 locations');
