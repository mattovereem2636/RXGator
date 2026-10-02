/**
 * patch-search-match-oct2026.js
 *
 * Fixes loose name matching in four source modules (release 1.4.7):
 *   rxoutreach.js, ira-negotiated.js, texas-wac.js, va-fss.js
 * Bug: search() accepted a drug when the query contained ANY index key (query.includes(key)).
 * Keys include brand names and first words, so a short key matched inside a long query.
 * Searching Descovy (resolved to "emtricitabine/tenofovir alafenamide") returned tenofovir
 * disoproxil and methylphenidate LA rows from Rx Outreach.
 *
 * New rule, after the exact-match step fails, a key matches when:
 *   - it STARTS WITH the typed text (partial typing, 4+ characters), or
 *   - the query BEGINS WITH the whole key plus a space ("atorvastatin calcium tablet" -> key
 *     "atorvastatin calcium"), and the key is 4+ characters.
 * Matching inside a key ("statin") and short keys inside long queries are gone.
 *
 * ALL OR NOTHING. Every file is checked first. If any file is not in the expected state, nothing
 * is written. A file that is already patched is skipped. Each patched file must pass node --check
 * before any write. Backs up each file as <file>.pre-searchmatch-<stamp>.bak.
 * USAGE (from /var/www/rxaggregator):
 *   node /var/www/rxaggregator/patch-search-match-oct2026.js --dry-run
 *   node /var/www/rxaggregator/patch-search-match-oct2026.js
 * Restart the app afterward: each index loads once at startup.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.RXG_BASE || __dirname;
const DRY_RUN = process.argv.includes('--dry-run');
const FILES = ['rxoutreach.js', 'ira-negotiated.js', 'texas-wac.js', 'va-fss.js'];

const OLD_LOOP =
`    for (const [key, entries] of Object.entries(drugIndex)) {
      if (key.includes(query) || query.includes(key)) {
        matches.push(...entries);
      }
    }`;
const OLD_COMMENT = '    // Fuzzy: check if query is a substring of any indexed key\n';
const NEW_LOOP =
`    // Loose match, kept narrow on purpose (see patch-search-match-oct2026.js). A key matches when it
    // starts with the typed text (partial typing, 4+ characters), or when the query begins with the
    // whole key ("atorvastatin calcium tablet" -> key "atorvastatin calcium"). The old test,
    // query.includes(key), matched short keys inside long queries and returned unrelated drugs.
    for (const [key, entries] of Object.entries(drugIndex)) {
      const typedPrefix = query.length >= MIN_PARTIAL_LENGTH && key.startsWith(query);
      const queryStartsWithKey = key.length >= MIN_PARTIAL_LENGTH && query.startsWith(key + ' ');
      if (typedPrefix || queryStartsWithKey) {
        matches.push(...entries);
      }
    }`;
const CONST_LINE = 'const MIN_PARTIAL_LENGTH = 4;  // shortest text that may match the start of a drug name\n\n';
const FN_ANCHOR = 'function search(drugName)';

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function count(s, sub) { let n = 0, i = -1; while ((i = s.indexOf(sub, i + 1)) >= 0) n++; return n; }

const plan = [];
for (const f of FILES) {
  const p = path.join(BASE, f);
  if (!fs.existsSync(p)) abort(f + ' not found in ' + BASE + '. Nothing written.');
  const src = fs.readFileSync(p, 'utf8');
  if (src.includes('MIN_PARTIAL_LENGTH')) { plan.push({ f, p, skip: true }); continue; }
  if (count(src, OLD_LOOP) !== 1) abort(f + ': old matching loop found ' + count(src, OLD_LOOP) + ' times, expected 1. Nothing written.');
  if (count(src, FN_ANCHOR) !== 1) abort(f + ': expected one "' + FN_ANCHOR + '". Nothing written.');
  let out = src;
  const loopAt = out.indexOf(OLD_LOOP);
  const hasComment = out.slice(Math.max(0, loopAt - OLD_COMMENT.length), loopAt) === OLD_COMMENT;
  const start = hasComment ? loopAt - OLD_COMMENT.length : loopAt;
  out = out.slice(0, start) + NEW_LOOP + out.slice(loopAt + OLD_LOOP.length);
  const fnAt = out.indexOf(FN_ANCHOR);
  out = out.slice(0, fnAt) + CONST_LINE + out.slice(fnAt);
  plan.push({ f, p, src, out });
}

console.log('--- PLAN ---');
plan.forEach(x => console.log((x.skip ? 'skip (already patched)  ' : 'patch                    ') + x.f));
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const x of plan.filter(x => !x.skip)) {
  const tmp = x.p.replace(/\.js$/, '') + '.new-' + stamp + '.js';
  fs.writeFileSync(tmp, x.out, 'utf8');
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { fs.unlinkSync(tmp); abort(x.f + ' failed the syntax check. Nothing written. ' + String(e.stderr || e.message).split('\n')[0]); }
  fs.unlinkSync(tmp);
}
for (const x of plan.filter(x => !x.skip)) {
  fs.copyFileSync(x.p, x.p + '.pre-searchmatch-' + stamp + '.bak');
  fs.writeFileSync(x.p, x.out, 'utf8');
  console.log('[OK] ' + x.f + '  backup: ' + x.f + '.pre-searchmatch-' + stamp + '.bak');
}
console.log('Next: node /var/www/rxaggregator/patch-v1-4-7.js, then pm2 restart rxaggregator.');
