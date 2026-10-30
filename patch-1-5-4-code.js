#!/usr/bin/env node
/**
 * patch-1-5-4-code.js — code changes for release 1.5.4 (rebuilt 2026-10-29; the Oct 16 patch file was lost).
 *
 * 1. Typed-brand-first cache lookup (brand-alias.js, cache-manager.js, search-handler.js).
 *    "Myfembree" resolves to relugolix, whose brand alias is Orgovyx, a different product, so the
 *    cached Myfembree price never showed. The name the user typed is now tried first, and the alias
 *    is skipped when the typed name is a dictionary name of a different drug.
 * 2. Pack sizes other than 30 or 90 (cache-manager.js, search-handler.js, public/app.html).
 *    Vyleesi is sold as 4 pens and Myfembree as 28 tablets. The card said "30-day" and multiplied by 3
 *    for a fake 90-day price. Such prices now carry packQuantity, show "for N units" / "por N unidades",
 *    and have no 90-day price. The 30-day and 90-day labels are now translated.
 * 3. Health report traffic filter (health-report.js + new health-report-config.js).
 *    Server, loopback and Alibaba Cloud crawler searches no longer count toward the zero-result rate;
 *    the report lists how many it left out.
 * 4. Cache-busting: app.html loads /data/drug-names.json?v=1.5.4.
 *
 * Each edit finds one exact anchor (indexOf/slice, no regex on code). All anchors are checked before
 * anything is written. Edits already applied are skipped, so a second run changes nothing.
 * Backups go to backups/v1.5.4-code-<stamp>/. Every edited JS file and the inline scripts of
 * app.html must pass a syntax check, or all files are restored.
 *
 * Requires health-report-config.js in the app folder first (copied by DEPLOY-1-5-4.md, Step 1).
 * USAGE:  node /var/www/rxaggregator/patch-1-5-4-code.js --dry-run
 *         node /var/www/rxaggregator/patch-1-5-4-code.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const RELEASE = '1.5.4';

/** Each edit: file, find (must occur once), replace, done (text that proves it already ran). */
const EDITS = [
  // ---------- 1. brand-alias.js: name index + resolveTypedCacheKey ----------
  { file: 'brand-alias.js', done: 'let nameIndex = {};',
    find: 'let aliasIndex = null;\n',
    replace: 'let aliasIndex = null;\nlet nameIndex = {};   // 1.5.4: any dictionary name (generic, brand, alias) -> its generic\n' },
  { file: 'brand-alias.js', done: '  nameIndex = {};\n',
    find: '  aliasIndex = {};\n',
    replace: '  aliasIndex = {};\n  nameIndex = {};\n' },
  { file: 'brand-alias.js', done: 'nameIndex[n] = nameIndex[n] || g;',
    find: "      if (!entry || typeof entry !== 'object') continue;\n      if (entry.hasGeneric !== false) continue;\n",
    replace: "      if (!entry || typeof entry !== 'object') continue;\n" +
      "      const g = String(entry.generic || '').toLowerCase().trim();\n" +
      "      for (const raw of [entry.generic].concat(entry.brands || [], entry.aliases || [])) {\n" +
      "        const n = String(raw || '').toLowerCase().trim();\n" +
      "        if (n && g) nameIndex[n] = nameIndex[n] || g;\n" +
      "      }\n" +
      "      if (entry.hasGeneric !== false) continue;\n" },
  { file: 'brand-alias.js', done: 'function resolveTypedCacheKey(',
    find: 'module.exports = { brandAliasFor, resolveCacheKey };',
    replace: [
      '/**',
      ' * 1.5.4: pick the cache key, trying the name the user typed first.',
      ' * WHY: "Myfembree" resolves to the generic relugolix, and the relugolix alias is Orgovyx, a different',
      ' * product. The typed name finds the right entry. The alias is skipped when the typed name is a',
      ' * dictionary name of a different drug, so one brand can never show another brand\'s price.',
      ' * @param {string} resolvedName - The resolved (usually generic) name.',
      ' * @param {string} typedName - The name the user typed, after spelling correction.',
      ' * @param {object} cache - A cache object keyed by lowercase drug name.',
      ' * @returns {string} The key to read (may not exist in the cache).',
      ' */',
      'function resolveTypedCacheKey(resolvedName, typedName, cache) {',
      '  if (!aliasIndex) buildIndex();',
      "  const typed = String(typedName || '').toLowerCase().trim();",
      '  if (typed && cache[typed]) return typed;',
      "  const key = String(resolvedName || '').toLowerCase().trim();",
      '  if (cache[key]) return key;',
      '  const alias = brandAliasFor(key);',
      '  if (!alias || !cache[alias]) return key;',
      '  const typedGeneric = nameIndex[typed];',
      '  if (typed && typed !== alias && typedGeneric && typedGeneric !== key) return key;',
      '  return alias;',
      '}',
      '',
      'module.exports = { brandAliasFor, resolveCacheKey, resolveTypedCacheKey };',
    ].join('\n') },

  // ---------- 1+2. cache-manager.js ----------
  { file: 'cache-manager.js', done: 'resolveTypedCacheKey } = require',
    find: "const { resolveCacheKey } = require('./brand-alias');",
    replace: "const { resolveCacheKey, resolveTypedCacheKey } = require('./brand-alias');\n\n" +
      '// 1.5.4: supplies the result cards label as "30-day" / "90-day". Any other pack size is shown as\n' +
      '// "for N units" with no 90-day price, because multiplying a 4-pen pack by 3 is not a 90-day supply.\n' +
      'const STANDARD_SUPPLIES = [30, 90];\n\n' +
      '/** @returns {number|null} The pack quantity when it is not a standard supply, else null. */\n' +
      'function packSizeOf(quantity) {\n' +
      '  const n = Number(quantity);\n' +
      '  return Number.isFinite(n) && n > 0 && !STANDARD_SUPPLIES.includes(n) ? n : null;\n' +
      '}' },
  { file: 'cache-manager.js', done: 'function querySingleCare(drugName, typedName)',
    find: 'function querySingleCare(drugName) {\n  const key = resolveCacheKey(drugName, singleCareCache);',
    replace: 'function querySingleCare(drugName, typedName) {\n  const key = resolveTypedCacheKey(drugName, typedName, singleCareCache);' },
  { file: 'cache-manager.js', done: 'const scPack = packSizeOf(entry.quantity);',
    find: '    priceFor30: entry.quantity === 90 ? +(entry.lowestPrice / 3).toFixed(2) : entry.lowestPrice,\n' +
      '    priceFor90: entry.quantity === 90 ? entry.lowestPrice : +(entry.lowestPrice * 3).toFixed(2),\n',
    replace: '    priceFor30: entry.quantity === 90 ? +(entry.lowestPrice / 3).toFixed(2) : entry.lowestPrice,\n' +
      '    priceFor90: scPack ? null : (entry.quantity === 90 ? entry.lowestPrice : +(entry.lowestPrice * 3).toFixed(2)),\n' +
      '    packQuantity: scPack,\n',
    before: { find: '  const results = [];\n\n  results.push({\n    source: \'SingleCare\',',
      replace: '  const scPack = packSizeOf(entry.quantity);\n  const results = [];\n\n  results.push({\n    source: \'SingleCare\',' } },
  { file: 'cache-manager.js', done: "'package size not listed'}). Prices vary",
    find: "(${entry.quantity || 30}-count). Prices vary by pharmacy and location.`",
    replace: "(${entry.quantity ? entry.quantity + '-count' : 'package size not listed'}). Prices vary by pharmacy and location.`" },
  { file: 'cache-manager.js', done: 'function queryGoodRx(drugName, typedName)',
    find: 'function queryGoodRx(drugName) {\n  const key = resolveCacheKey(drugName, goodRxCache);',
    replace: 'function queryGoodRx(drugName, typedName) {\n  const key = resolveTypedCacheKey(drugName, typedName, goodRxCache);' },
  { file: 'cache-manager.js', done: 'const grPack = packSizeOf(entry.quantity);',
    find: '  const qty = entry.quantity || 30;\n',
    replace: '  const qty = entry.quantity || 30;\n  const grPack = packSizeOf(entry.quantity);\n' },
  { file: 'cache-manager.js', done: 'priceFor90: grPack ? null',
    find: '    priceFor90: qty === 90 ? lowest.goodrx_price : +(lowest.goodrx_price * 3).toFixed(2),\n',
    replace: '    priceFor90: grPack ? null : (qty === 90 ? lowest.goodrx_price : +(lowest.goodrx_price * 3).toFixed(2)),\n    packQuantity: grPack,\n' },

  // ---------- 1+2. search-handler.js ----------
  { file: 'search-handler.js', done: 'querySingleCare(pricingSearchName, drugName)',
    find: 'const singleCareResults = querySingleCare(pricingSearchName);',
    replace: '// 1.5.4: pass the typed name too, so a brand finds its own cache entry first (Myfembree).\n    const singleCareResults = querySingleCare(pricingSearchName, drugName);' },
  { file: 'search-handler.js', done: 'queryGoodRx(pricingSearchName, drugName)',
    find: 'const goodRxResults = queryGoodRx(pricingSearchName);',
    replace: 'const goodRxResults = queryGoodRx(pricingSearchName, drugName);' },
  { file: 'search-handler.js', done: 'packQuantity: sc.packQuantity',
    find: '        priceForQuantity: qty <= 30 ? sc.priceFor30 : sc.priceFor90,\n        priceFor30: sc.priceFor30, priceFor90: sc.priceFor90,\n',
    replace: '        priceForQuantity: (sc.packQuantity || qty <= 30) ? sc.priceFor30 : sc.priceFor90,\n        priceFor30: sc.priceFor30, priceFor90: sc.priceFor90,\n        packQuantity: sc.packQuantity || null,\n' },
  { file: 'search-handler.js', done: 'packQuantity: gr.packQuantity',
    find: '        priceForQuantity: qty <= 30 ? gr.priceFor30 : gr.priceFor90,\n        priceFor30: gr.priceFor30, priceFor90: gr.priceFor90,\n',
    replace: '        priceForQuantity: (gr.packQuantity || qty <= 30) ? gr.priceFor30 : gr.priceFor90,\n        priceFor30: gr.priceFor30, priceFor90: gr.priceFor90,\n        packQuantity: gr.packQuantity || null,\n' },

  // ---------- 3. health-report.js ----------
  { file: 'health-report.js', done: "require('./health-report-config')",
    find: 'const BASE_DIR = path.resolve(__dirname);\n',
    replace: "const BASE_DIR = path.resolve(__dirname);\n// 1.5.4: server, loopback and crawler searches are counted apart from the user rates.\nconst { classifyIp, IP_COLUMN_NAMES } = require('./health-report-config');\n" },
  { file: 'health-report.js', done: 'let ipIdx = header.findIndex',
    find: "    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;\n",
    replace: "    // logSearch() writes the IP in column 2 (index 1) after the timestamp.\n" +
      "    let ipIdx = header.findIndex(h => IP_COLUMN_NAMES.includes(h));\n" +
      "    if (ipIdx < 0 && dateIdx === 0 && header.length >= 12) ipIdx = 1;\n" +
      "    const excluded = { server: 0, loopback: 0, crawler: 0 };\n" +
      "    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;\n" },
  { file: 'health-report.js', done: 'excluded[kind]++',
    find: "      totalSearches++;\n",
    replace: "      const kind = ipIdx >= 0 ? classifyIp(row[ipIdx]) : null;\n      if (kind) { excluded[kind]++; continue; }\n      totalSearches++;\n" },
  { file: 'health-report.js', done: 'excludedFromRates: excluded',
    find: "zeroResultRate: zeroResultRate + '%', zeroResultRateOk: zeroResultRate < 5, topSearched, topFailed };",
    replace: "zeroResultRate: zeroResultRate + '%', zeroResultRateOk: zeroResultRate < 5, topSearched, topFailed,\n" +
      "      excludedFromRates: excluded, ipFilter: ipIdx >= 0 ? 'on' : 'off (no IP column found)' };" },

  // ---------- 2+4. public/app.html ----------
  { file: 'public/app.html', done: "drug-names.json?v=1.5.4",
    find: "const res = await fetch('/data/drug-names.json');",
    replace: "const res = await fetch('/data/drug-names.json?v=1.5.4'); // 1.5.4: new URL per release so browsers drop the cached copy" },
  { file: 'public/app.html', done: "forUnits: {",
    find: "  ninetyDay: { en: '90-day', es: '90 días' },\n",
    replace: "  ninetyDay: { en: '90-day', es: '90 días' },\n  forUnits: { en: 'for {n} units', es: 'por {n} unidades' },\n" },
  { file: 'public/app.html', done: 'const isPack = !!p.packQuantity;',
    find: "      const displayPrice = data.query.quantity == 90 ? p.priceFor90 : p.priceFor30;\n      const displayLabel = data.query.quantity == 90 ? '90-day' : '30-day';\n",
    replace: "      // 1.5.4: a pack that is not a 30- or 90-day supply shows its own size and one price.\n" +
      "      const isPack = !!p.packQuantity;\n" +
      "      const displayPrice = isPack ? p.priceFor30 : (data.query.quantity == 90 ? p.priceFor90 : p.priceFor30);\n" +
      "      const displayLabel = isPack ? t('forUnits').replace('{n}', p.packQuantity) : t(data.query.quantity == 90 ? 'ninetyDay' : 'thirtyDay');\n" },
  { file: 'public/app.html', done: '(qty == 90 && !p.packQuantity)',
    find: '            const dp = qty == 90 ? p.priceFor90 : p.priceFor30;',
    replace: '            const dp = (qty == 90 && !p.packQuantity) ? p.priceFor90 : p.priceFor30;' },
  { file: 'public/app.html', done: "lowest.packQuantity ? ' ' + t('forUnits')",
    find: "(lowest.priceFor30 || 0).toFixed(2) + '<span style=\"font-size:0.75rem; font-weight:400; color:var(--gray-500);\"> /30-day</span></div>';",
    replace: "(lowest.priceFor30 || 0).toFixed(2) + '<span style=\"font-size:0.75rem; font-weight:400; color:var(--gray-500);\">' + (lowest.packQuantity ? ' ' + t('forUnits').replace('{n}', lowest.packQuantity) : ' /30-day') + '</span></div>';" },
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function count(hay, needle) { let n = 0, i = -1; while ((i = hay.indexOf(needle, i + 1)) !== -1) n++; return n; }
function replaceOnce(text, find, replace) { const i = text.indexOf(find); return text.slice(0, i) + replace + text.slice(i + find.length); }

if (!fs.existsSync(path.join(BASE, 'health-report-config.js'))) {
  abort('health-report-config.js is not in ' + BASE + '. Copy it first (DEPLOY-1-5-4.md, Step 1).');
}

// ---- plan: check every anchor before writing anything ----
const files = {};
const plan = [];
for (const e of EDITS) {
  if (!files[e.file]) {
    const p = path.join(BASE, e.file);
    try { files[e.file] = { path: p, src: fs.readFileSync(p, 'utf8') }; } catch (err) { abort('Cannot read ' + p + ': ' + err.message); }
    files[e.file].out = files[e.file].src;
  }
  const f = files[e.file];
  if (f.out.includes(e.done)) { plan.push('SKIP (already applied) ' + e.file + ': ' + e.done.trim().slice(0, 60)); continue; }
  const steps = e.before ? [e.before, e] : [e];
  for (const s of steps) {
    const n = count(f.out, s.find);
    if (n !== 1) abort(e.file + ': anchor found ' + n + ' times (need 1): ' + JSON.stringify(s.find.slice(0, 80)));
    f.out = replaceOnce(f.out, s.find, s.replace);
  }
  plan.push('EDIT ' + e.file + ': ' + e.done.trim().slice(0, 60));
}
console.log('--- PLAN (release ' + RELEASE + ' code) ---');
plan.forEach((l) => console.log('  ' + l));
const changed = Object.keys(files).filter((k) => files[k].out !== files[k].src);
console.log('Files to change: ' + (changed.length ? changed.join(', ') : 'none'));
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }
if (!changed.length) { console.log('[OK] Nothing to do.'); process.exit(0); }

// ---- write with backups and rollback ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bakDir = path.join(BASE, 'backups', 'v' + RELEASE + '-code-' + stamp);
fs.mkdirSync(bakDir, { recursive: true });
for (const k of changed) fs.copyFileSync(files[k].path, path.join(bakDir, k.replace(/\//g, '__')));
function restoreAll(reason) {
  console.error('[ROLLBACK] ' + reason);
  for (const k of changed) fs.writeFileSync(files[k].path, files[k].src, 'utf8');
  process.exit(1);
}
try { for (const k of changed) fs.writeFileSync(files[k].path, files[k].out, 'utf8'); }
catch (err) { restoreAll('write failed: ' + err.message); }

// ---- syntax check ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxg154-'));
function nodeCheck(file, label) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (err) { restoreAll('syntax error in ' + label + ': ' + String(err.stderr || err.message).split('\n').slice(0, 4).join(' | ')); }
}
for (const k of changed) {
  if (k.endsWith('.js')) { nodeCheck(files[k].path, k); continue; }
  // app.html: check each inline script except JSON-LD.
  const html = files[k].out;
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(html))) {
    if (/application\/ld\+json/i.test(m[1])) continue;
    const tmp = path.join(tmpDir, 'inline-' + (i++) + '.js');
    fs.writeFileSync(tmp, m[2]);
    nodeCheck(tmp, k + ' inline script ' + i);
  }
}
nodeCheck(path.join(BASE, 'health-report-config.js'), 'health-report-config.js');
console.log('[OK] ' + changed.length + ' files patched and syntax-checked. Backups: ' + bakDir);
console.log('Next: node ' + path.join(BASE, 'patch-v1-5-4.js') + ' --dry-run, then pm2 restart rxaggregator.');
