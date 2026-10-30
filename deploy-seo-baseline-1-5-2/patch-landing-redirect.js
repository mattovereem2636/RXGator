/**
 * patch-landing-redirect.js — OPTIONAL. Touches server.js, so it needs a restart. Not part of the default deploy.
 *
 * landing.html is a byte-identical copy of index.html (the homepage). This adds one line to server.js so
 * /landing.html answers with a 301 to "/". Together with the canonical fix, search engines then see one homepage.
 *
 * It inserts the route BEFORE express.static, because static would serve the file first.
 * Backs up server.js, checks the syntax of the result with `node --check`, and restores on failure.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-landing-redirect.js --dry-run
 *         node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-landing-redirect.js
 *         pm2 restart rxaggregator --update-env      (name confirmed in the 2026-09-14 session log)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { BASE } = require('./lib/config');

const DRY_RUN = process.argv.includes('--dry-run');
const FILE = path.join(BASE, 'server.js');
// Matches the one `app.use(express.static(...))` line, whatever its arguments, so a small difference in server.js does not block the patch.
const ANCHOR_RE = /^[ \t]*app\.use\(\s*express\.static\([^\n]*$/m;
const MARK = '// 1.5.2: landing.html duplicates the homepage';
const ROUTE = MARK + '. Send visitors and crawlers to the one canonical URL.\n'
  + "app.get('/landing.html', (req, res) => res.redirect(301, '/'));\n";

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
const src = fs.readFileSync(FILE, 'utf8');
if (src.includes(MARK)) abort('server.js already has the landing redirect.');
const hits = (src.match(new RegExp(ANCHOR_RE.source, 'gm')) || []).length;
if (hits !== 1) abort('Expected exactly one express.static line, found ' + hits + '. Edit by hand.');
const out = src.replace(ANCHOR_RE, (line) => ROUTE + line);
console.log('Insert before express.static:\n' + ROUTE);
if (DRY_RUN) { console.log('DRY RUN: nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bak = FILE + '.pre-landing-redirect-' + stamp + '.bak';
fs.copyFileSync(FILE, bak);
fs.writeFileSync(FILE, out, 'utf8');
try { execFileSync(process.execPath, ['--check', FILE], { stdio: 'pipe' }); }
catch (e) { fs.writeFileSync(FILE, src, 'utf8'); abort('Syntax check failed, restored server.js. ' + String(e.stderr || e.message)); }
console.log('[OK] server.js updated. Backup: ' + bak);
console.log('Now run: pm2 restart rxaggregator --update-env   then:  curl -I https://rxgator.info/landing.html  (expect 301 to /)');
