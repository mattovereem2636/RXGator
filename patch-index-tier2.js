/**
 * RxGator Tier 2 Index.html Patch — W-1, W-3, W-4, W-5
 * W-1: Add h1 heading
 * W-3: Replace a href="#" onclick with button elements
 * W-4: Add prefers-reduced-motion support
 * W-5: Replace transition: all with specific properties
 * Date: 2026-08-28
 *
 * Usage: node patch-index-tier2.js [path-to-index.html]
 */

const fs = require('fs');
const path = require('path');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'public', 'index.html');

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
// PATCH 1: W-1 — Add h1 heading after logo
// ============================================================
applyPatch(
  'W-1: Add h1 heading',
  `  <img src="/logo-reversed.png" alt="RXGator - Prescription Aggregator" style="max-width: 360px; width: 90%; height: auto; margin-bottom: 0.5rem;">
  <p data-i18n="tagline">Compare prescription drug prices across all open data sources. One search, every platform, the actual lowest price.</p>`,
  `  <img src="/logo-reversed.png" alt="" style="max-width: 360px; width: 90%; height: auto; margin-bottom: 0.5rem;">
  <h1 class="sr-only">RXGator — Prescription Price Aggregator</h1>
  <p data-i18n="tagline">Compare prescription drug prices across all open data sources. One search, every platform, the actual lowest price.</p>`
);

// ============================================================
// PATCH 2: W-3 — Convert quick-search anchors to buttons
// ============================================================
const quickLinks = [
  ['metformin', 'Metformin'],
  ['lisinopril', 'Lisinopril'],
  ['atorvastatin', 'Atorvastatin'],
  ['sertraline', 'Sertraline'],
  ['gabapentin', 'Gabapentin'],
  ['omeprazole', 'Omeprazole'],
  ['levothyroxine', 'Levothyroxine'],
  ['amlodipine', 'Amlodipine'],
  ['jardiance', 'Jardiance'],
  ['ozempic', 'Ozempic'],
];

for (const [drug, label] of quickLinks) {
  applyPatch(
    `W-3: Convert quick-link ${label}`,
    `<a class="quick-link" href="#" role="button" onclick="quickSearch('${drug}'); return false;">${label}</a>`,
    `<button class="quick-link" type="button" onclick="quickSearch('${drug}')">${label}</button>`
  );
}

// ============================================================
// PATCH 3: W-3 — Fix recent search link generation in JS
// ============================================================
applyPatch(
  'W-3: Convert recent search links to buttons',
  `return \`<a class="quick-link" href="#" style="background:#D5F5E3; border-color:#145A32; color:#145A32;" onclick="quickSearch('\${safe}'); return false;">\${safe}</a>\`;`,
  `return \`<button class="quick-link" type="button" style="background:#D5F5E3; border-color:#145A32; color:#145A32;" onclick="quickSearch('\${safe}')">\${safe}</button>\`;`
);

// ============================================================
// PATCH 4: W-4 — Add prefers-reduced-motion after @keyframes spin
// ============================================================
applyPatch(
  'W-4: Add prefers-reduced-motion',
  `  @keyframes spin { to { transform: rotate(360deg); } }

  /* Drug Info Card */`,
  `  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .status.loading::before { animation: none; }
    .how-to-toggle,
    .pharmacy-toggle,
    .quick-link,
    .feedback-helpful button { transition: none; }
  }

  /* Drug Info Card */`
);

// ============================================================
// PATCHES 5-8: W-5 — Replace transition: all with specific properties
// Each occurrence uses unique surrounding context for matching
// ============================================================
applyPatch(
  'W-5: how-to-toggle transition',
  `    cursor: pointer;
    transition: all 0.15s;
  }

  .how-to-toggle:hover`,
  `    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }

  .how-to-toggle:hover`
);

applyPatch(
  'W-5: pharmacy-toggle transition',
  `    cursor: pointer;
    transition: all 0.15s;
  }

  .pharmacy-toggle:hover`,
  `    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }

  .pharmacy-toggle:hover`
);

applyPatch(
  'W-5: quick-link transition',
  `    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;`,
  `    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    text-decoration: none;`
);

applyPatch(
  'W-5: feedback button transition',
  `    cursor: pointer;
    transition: all 0.15s;
    color: var(--gray-700);
  }

  .feedback-helpful button:hover`,
  `    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    color: var(--gray-700);
  }

  .feedback-helpful button:hover`
);

applyPatch(
  'W-5: my-meds-item-actions button transition',
  `    cursor: pointer;
    color: var(--gray-500);
    transition: all 0.15s;
  }
  .my-meds-item-actions button:hover`,
  `    cursor: pointer;
    color: var(--gray-500);
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }
  .my-meds-item-actions button:hover`
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
console.log('  - W-1: Added h1 heading (visually hidden, screen-reader accessible)');
console.log('  - W-3: Converted 10 quick-search anchors + recent-search links to buttons');
console.log('  - W-4: Added prefers-reduced-motion: reduce overrides');
console.log('  - W-5: Replaced 4 transition: all with specific properties');
