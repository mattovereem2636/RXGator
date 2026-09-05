/**
 * RxGator Tier 2 Landing.html Patch — W-2, W-4
 * W-2: Add h1 and fix heading hierarchy (section-title divs to h2)
 * W-4: Add prefers-reduced-motion support
 * Date: 2026-08-28
 *
 * Usage: node patch-landing-tier2.js [path-to-landing.html]
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
// PATCH 1: W-2 — Add h1 after logo in hero
// ============================================================
applyPatch(
  'W-2: Add h1 heading to hero',
  `  <img src="/logo-reversed.png" alt="RXGator - Prescription Aggregator" class="hero-logo">
  <div style="margin-bottom:0.5rem;">`,
  `  <img src="/logo-reversed.png" alt="" class="hero-logo">
  <h1 class="sr-only">RXGator — Prescription Price Aggregator</h1>
  <div style="margin-bottom:0.5rem;">`
);

// ============================================================
// PATCH 2: W-2 — Convert "Why RXGator?" section-title to h2
// ============================================================
applyPatch(
  'W-2: Why RXGator section-title to h2',
  `    <div class="section-title" data-i18n="whyTitle">Why RXGator?</div>`,
  `    <h2 class="section-title" data-i18n="whyTitle">Why RXGator?</h2>`
);

// ============================================================
// PATCH 3: W-2 — Convert "18 Data Sources" section-title to h2
// ============================================================
applyPatch(
  'W-2: 18 Data Sources section-title to h2',
  `    <div class="section-title" data-i18n="sourcesTitle">18 Data Sources. One Search.</div>`,
  `    <h2 class="section-title" data-i18n="sourcesTitle">18 Data Sources. One Search.</h2>`
);

// ============================================================
// PATCH 4: W-2 — Convert "Support RXGator" section-title to h2
// ============================================================
applyPatch(
  'W-2: Support section-title to h2',
  `    <div class="section-title" data-i18n="supportTitle">Support RXGator</div>`,
  `    <h2 class="section-title" data-i18n="supportTitle">Support RXGator</h2>`
);

// ============================================================
// PATCH 5: W-4 — Add prefers-reduced-motion to landing.html
// Insert before the closing </style> tag, after the last CSS rule
// ============================================================
applyPatch(
  'W-4: Add prefers-reduced-motion to landing',
  `  .hero-cta:focus-visible {
    outline: 3px solid var(--teal-bright);
    outline-offset: 3px;
  }

  .hero-note {`,
  `  .hero-cta:focus-visible {
    outline: 3px solid var(--teal-bright);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-cta { transition: none; }
    .support-card { transition: none; }
    .source-card { transition: none; }
  }

  .hero-note {`
);

// ============================================================
// WRITE
// ============================================================
const backupFile = htmlFile + '.pre-tier2-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(htmlFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully`);
console.log('\n[PATCH] Summary:');
console.log('  - W-2: Added h1 heading (visually hidden, screen-reader accessible)');
console.log('  - W-2: Converted 3 section-title divs to h2 elements');
console.log('  - W-4: Added prefers-reduced-motion: reduce overrides');
