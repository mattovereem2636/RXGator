'use strict';
/**
 * patch-seo-1-5-2.js — RxGator 1.5.2 "Search Hygiene": fixes from the 2026-10-08 web presence baseline.
 *
 * What it does (static files in public/ only; no app code, no restart):
 *   canonicals, hreflang, dead internal links, one data-source number, health and funding wording (EN + ES),
 *   Organization/WebSite schema, methodology pages (EN + ES), llms.txt, and a sitemap built from the files on disk.
 *
 * Safe by design: reads everything first, stops before writing if any expected text is missing (--allow-miss
 * overrides), backs up each changed file to backups/seo-1-5-2-<stamp>/, preserves file modified times, and
 * rolls every file back if a write fails. Running it twice changes nothing the second time.
 *
 * USAGE (on the server):
 *   node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-seo-1-5-2.js --dry-run
 *   node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-seo-1-5-2.js
 * Flags: --dry-run  --verbose  --allow-miss  --date=YYYY-MM-DD
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./lib/config');
const { loadPages, writeAll } = require('./lib/pages');
const sitemap = require('./builders/sitemap');
const methodology = require('./builders/methodology');
const llms = require('./builders/llms');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const ALLOW_MISS = args.includes('--allow-miss');
const dateArg = (args.find((a) => a.startsWith('--date=')) || '').slice(7);
const TODAY = dateArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

const STEPS = ['canonical', 'links', 'hreflang', 'counts', 'wording', 'schema'];
const events = [];
const warnings = [];
const misses = [];
const ctx = {
  pages: [],
  log: (rel, what, n, note) => events.push({ rel, what, n, note }),
  warn: (rel, what, note) => warnings.push({ rel, what, note }),
  miss: (rel, what, note) => misses.push({ rel, what, note }),
};

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }

function summarize() {
  const byWhat = new Map();
  for (const e of events) {
    const row = byWhat.get(e.what) || { n: 0, pages: new Set() };
    row.n += e.n; row.pages.add(e.rel); byWhat.set(e.what, row);
  }
  console.log('\n--- CHANGES BY KIND ---');
  for (const [what, row] of [...byWhat].sort()) console.log(('  ' + what).padEnd(30) + String(row.n).padStart(5) + ' edit(s) on ' + row.pages.size + ' page(s)');
  if (VERBOSE) for (const e of events) console.log('  ' + e.rel.padEnd(58) + e.what + ' x' + e.n + (e.note ? '  ' + e.note : ''));
  if (warnings.length) { console.log('\n--- WARNINGS (' + warnings.length + ') ---'); for (const w of warnings) console.log('  ' + w.rel + '  [' + w.what + '] ' + w.note); }
  if (misses.length) { console.log('\n--- MISSES (' + misses.length + ') --- expected text not found'); for (const m of misses) console.log('  ' + m.rel + '  [' + m.what + '] ' + m.note); }
}

function main() {
  if (!fs.existsSync(cfg.PUBLIC_DIR)) abort('Cannot find ' + cfg.PUBLIC_DIR + '. Set RXG_BASE if the app lives elsewhere.');
  ctx.pages = loadPages();
  console.log('Loaded ' + ctx.pages.length + ' pages from ' + cfg.PUBLIC_DIR + '. Date: ' + TODAY + '. Source count: ' + cfg.SOURCE_COUNT + '.');
  for (const name of STEPS) require('./steps/' + name).run(ctx);

  const privacy = ctx.pages.find((p) => p.rel === '/privacy.html');
  if (!privacy) abort('privacy.html not found; the methodology pages are built from it.');
  const fresh = methodology.build(privacy.out);
  const virtual = fresh.map((f) => ({ rel: f.rel, abs: path.join(cfg.PUBLIC_DIR, f.rel), src: '', out: f.content, mtime: new Date(), isNew: true }));
  const site = sitemap.build([...ctx.pages, ...virtual], TODAY);
  const extra = [
    ...fresh.map((f) => ({ abs: path.join(cfg.PUBLIC_DIR, f.rel), content: f.content })),
    { abs: path.join(cfg.PUBLIC_DIR, 'llms.txt'), content: llms.build(TODAY) },
    { abs: path.join(cfg.PUBLIC_DIR, 'sitemap.xml'), content: site.xml },
  ];
  for (const f of extra) {
    const was = fs.existsSync(f.abs) ? fs.readFileSync(f.abs, 'utf8') : null;
    ctx.log('/' + path.basename(f.abs), was === null ? 'new-file' : (was === f.content ? 'unchanged-file' : 'rewrite-file'), was === f.content ? 0 : 1);
  }
  const changed = ctx.pages.filter((p) => p.out !== p.src).length;
  console.log('\nPages changed: ' + changed + ' of ' + ctx.pages.length + '. Sitemap entries: ' + site.count + '.');
  summarize();

  if (misses.length && !ALLOW_MISS) abort(misses.length + ' expected text(s) not found. Nothing was written. The server files differ from what this patch expects; re-run with --allow-miss only after reading the list above.');
  if (DRY) { console.log('\nDRY RUN: nothing written.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(cfg.BASE, 'backups', 'seo-1-5-2-' + stamp);
  const res = writeAll(ctx.pages, backupDir, extra);
  console.log('\n[OK] wrote ' + res.changed + ' page(s) and ' + res.extra + ' new or rebuilt file(s).');
  console.log('[OK] backups: ' + backupDir);
  console.log('Next: node ' + path.join(__dirname, 'audit-seo.js') + '   (must report 0 problems)');
}

try { main(); } catch (err) { abort(err.message); }
