/**
 * patch-banner-1-5-1.js — hides the empty "Typical savings vs. brand" badge in the generic banner.
 *
 * WHY: some drugs (for example Entresto or Vyvanse) have a generic but no savings range on file.
 * The banner then showed a label and an empty green box. This change prints the savings line only
 * when the lookup supplies a value. One edit to public/app.html (and public/index.html if it has the same line); the file is backed up first.
 *
 * USAGE:  node /var/www/rxaggregator/patch-banner-1-5-1.js --dry-run
 *         node /var/www/rxaggregator/patch-banner-1-5-1.js
 * No restart needed (static file). Hard-refresh the browser afterward.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const DRY_RUN = process.argv.includes('--dry-run');
const TARGETS = ['app.html', 'index.html'].map(f => path.join(BASE, 'public', f)); // /app serves app.html

const OLD = [
  "          <br><span style=\"font-weight:700;\">${t('genericBannerSavings')}</span> <span style=\"background:#145A32; color:#fff; padding:0.15rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.95rem;\">${esc(gi.typicalSavings)}</span>",
].join('\n');
const NEW = [
  "          ${gi.typicalSavings ? `<br><span style=\"font-weight:700;\">${t('genericBannerSavings')}</span> <span style=\"background:#145A32; color:#fff; padding:0.15rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.95rem;\">${esc(gi.typicalSavings)}</span>` : ''}",
].join('\n');

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
const jobs = [];
let already = 0;
for (const file of TARGETS) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(NEW)) { already++; continue; }
  const i = src.indexOf(OLD);
  if (i === -1) continue;
  if (src.indexOf(OLD, i + OLD.length) !== -1) abort('Anchor is not unique in ' + file);
  jobs.push({ file, src, out: src.slice(0, i) + NEW + src.slice(i + OLD.length) });
}
if (!jobs.length && already) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!jobs.length) abort('Anchor not found in public/app.html or public/index.html. The banner code changed; review by hand.');

console.log('--- PLAN ---');
for (const j of jobs) console.log(path.relative(BASE, j.file) + ': savings line prints only when typicalSavings has a value (+' + (j.out.length - j.src.length) + ' chars)');
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const j of jobs) {
  const backup = j.file + '.pre-v1.5.1-' + stamp + '.bak';
  fs.copyFileSync(j.file, backup);
  try {
    fs.writeFileSync(j.file, j.out, 'utf8');
    if (!fs.readFileSync(j.file, 'utf8').includes(NEW)) throw new Error('new text missing after write');
  } catch (e) { fs.copyFileSync(backup, j.file); abort('Write failed, ' + j.file + ' restored: ' + e.message); }
  console.log('[OK] ' + path.relative(BASE, j.file) + ' patched. Backup: ' + backup);
}
console.log('NEXT: hard-refresh the browser (Ctrl+F5) and search "Entresto".');
