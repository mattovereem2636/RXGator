/**
 * patch-costco-note-1-5-2.js — OPTIONAL. Needs Matt's sign-off (AGENTS.md: no edits to live pricing-source code
 * without it) and a restart. Not part of the default deploy.
 *
 * The Costco "federal law" claim also lives in app code and data:
 *   retail-sources.js   the note shown with every Costco result
 *   data-sources.json   the description and notes for the Costco source
 * Each edit is an exact-string swap. Any string that is missing or repeated stops the run with nothing written.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-costco-note-1-5-2.js --dry-run
 *         node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-costco-note-1-5-2.js
 *         pm2 restart rxaggregator --update-env
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { BASE } = require('./lib/config');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = 'state laws vary; confirm with your local store';
const EDITS = [
  { file: 'retail-sources.js', find: "'No membership required to use Costco pharmacy (federal law). Prices are estimates based on published reporting.'",
    replace: "'Costco pharmacies serve non-members in most states (" + CONFIRM + "). Prices are estimates based on published reporting.'" },
  { file: 'data-sources.json', find: 'Estimated Costco pharmacy prices based on published reporting. No membership required by federal law.',
    replace: 'Estimated Costco pharmacy prices based on published reporting. Costco serves non-members in most states; ' + CONFIRM + '.' },
  { file: 'data-sources.json', find: 'Uses NADAC benchmark with markup formula. No Costco membership needed for pharmacy (federal law).',
    replace: 'Uses NADAC benchmark with markup formula. Costco serves non-members at the pharmacy in most states; ' + CONFIRM + '.' },
];

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
const originals = {};
const results = {};
for (const e of EDITS) {
  const abs = path.join(BASE, e.file);
  originals[e.file] = originals[e.file] || fs.readFileSync(abs, 'utf8');
  const cur = results[e.file] || originals[e.file];
  const n = cur.split(e.find).length - 1;
  if (n !== 1) abort(e.file + ': expected 1 hit, found ' + n + ' for: ' + e.find.slice(0, 70) + '...');
  results[e.file] = cur.replace(e.find, e.replace);
  console.log('[PLAN] ' + e.file + ': 1 edit');
}
try { JSON.parse(results['data-sources.json']); } catch (err) { abort('data-sources.json would not parse after the edit.'); }
if (DRY_RUN) { console.log('DRY RUN: nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const f of Object.keys(results)) {
  fs.copyFileSync(path.join(BASE, f), path.join(BASE, f + '.pre-costco-note-' + stamp + '.bak'));
  fs.writeFileSync(path.join(BASE, f), results[f], 'utf8');
}
try { execFileSync(process.execPath, ['--check', path.join(BASE, 'retail-sources.js')], { stdio: 'pipe' }); }
catch (err) { for (const f of Object.keys(originals)) fs.writeFileSync(path.join(BASE, f), originals[f], 'utf8'); abort('Syntax check failed; restored both files.'); }
console.log('[OK] updated ' + Object.keys(results).join(', ') + '. Now run: pm2 restart rxaggregator --update-env');
