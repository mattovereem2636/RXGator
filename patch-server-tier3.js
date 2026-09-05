/**
 * RxGator Tier 3 Server Patch — S-3
 * S-3: Add URL scheme validation to prevent stored XSS via javascript: URIs
 * Adds safeUrl() helper and applies it at external data entry points.
 * Date: 2026-08-28
 *
 * Usage: node patch-server-tier3.js [path-to-server.js]
 */

const fs = require('fs');
const path = require('path');

const serverFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'server.js');

if (!fs.existsSync(serverFile)) {
  console.error(`[PATCH] File not found: ${serverFile}`);
  process.exit(1);
}

let src = fs.readFileSync(serverFile, 'utf8');
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
// PATCH 1: S-3 — Add safeUrl helper after escapeHtml
// ============================================================
applyPatch(
  'S-3: Add safeUrl helper',
  `function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}`,
  `function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Validate a URL scheme. Returns the URL if it starts with http: or https:.
 * Returns empty string for javascript:, data:, vbscript:, or any other scheme.
 * @param {string} url - The URL to validate.
 * @returns {string} The safe URL or empty string.
 */
function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\\/\\//i.test(trimmed)) return trimmed;
  return '';
}`
);

// ============================================================
// PATCH 2: S-3 — Sanitize SingleCare entry.url (external Apify data)
// ============================================================
applyPatch(
  'S-3: Sanitize SingleCare sourceUrl',
  `    source: 'SingleCare',
    sourceUrl: entry.url || \`https://www.singlecare.com/prescription/\${encodeURIComponent(key)}\`,`,
  `    source: 'SingleCare',
    sourceUrl: safeUrl(entry.url) || \`https://www.singlecare.com/prescription/\${encodeURIComponent(key)}\`,`
);

// ============================================================
// PATCH 3: S-3 — Sanitize Cost Plus Drugs r.url (API response)
// ============================================================
applyPatch(
  'S-3: Sanitize Cost Plus sourceUrl',
  `        source: 'Cost Plus Drugs',
        sourceUrl: r.url,`,
  `        source: 'Cost Plus Drugs',
        sourceUrl: safeUrl(r.url),`
);

// ============================================================
// PATCH 4: S-3 — Sanitize Rx Outreach ro.sourceUrl (scraped data)
// ============================================================
applyPatch(
  'S-3: Sanitize Rx Outreach sourceUrl',
  `        source: 'Rx Outreach',
        sourceUrl: ro.sourceUrl,`,
  `        source: 'Rx Outreach',
        sourceUrl: safeUrl(ro.sourceUrl),`
);

// ============================================================
// WRITE
// ============================================================
const backupFile = serverFile + '.pre-tier3-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(serverFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully`);
console.log('\n[PATCH] Summary:');
console.log('  - S-3: Added safeUrl() helper — allowlists http/https schemes only');
console.log('  - S-3: Applied safeUrl() to SingleCare, Cost Plus, and Rx Outreach URLs');
