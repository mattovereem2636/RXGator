/**
 * check-mfr-links.js  (READ-ONLY)
 *
 * Checks every outbound program link in manufacturer_assistance.json and
 * public/pap-database.json and prints one line per URL: status, final URL, and
 * which drug and program it belongs to. Writes nothing.
 *
 * LIMITS: some manufacturer sites answer automated requests with 403 or 404. Treat every
 * FAIL as "confirm in a browser", not as proof. Pages built with JavaScript return 200
 * even when the content is wrong, so a 200 does not prove the link is right.
 *
 * USAGE (from /var/www/rxaggregator):  node check-mfr-links.js
 * Run quarterly with the content audit.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 15000;
const CONCURRENCY = 4;
const UA = 'Mozilla/5.0 (compatible; RxGatorLinkCheck/1.0; +https://rxgator.info)';

const mfr = JSON.parse(fs.readFileSync(path.join(__dirname, 'manufacturer_assistance.json'), 'utf8'));
const pap = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'pap-database.json'), 'utf8'));

const targets = [];
for (const [drug, entry] of Object.entries(mfr)) {
  for (const p of (entry.programs || [])) if (p.url) targets.push({ url: p.url, where: 'mfr: ' + drug + ' / ' + p.name });
}
for (const d of (pap.drugs || [])) {
  if (d.pap && d.pap.application_url) targets.push({ url: d.pap.application_url, where: 'pap-db: ' + d.generic_name + ' / ' + (d.pap.program_name || '') });
}

/** Fetch one URL, following redirects. Resolves to { status, finalUrl } or { error }. */
function check(url, hops) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ error: 'bad URL' }); }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(u, { headers: { 'User-Agent': UA, Accept: 'text/html' }, timeout: TIMEOUT_MS }, res => {
      res.resume();
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        if (hops >= MAX_REDIRECTS) return resolve({ status: res.statusCode, finalUrl: url, error: 'too many redirects' });
        return resolve(check(new URL(loc, u).toString(), hops + 1));
      }
      resolve({ status: res.statusCode, finalUrl: url });
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.code || e.message }));
  });
}

async function run() {
  const seen = new Map();
  const unique = targets.filter(t => !seen.has(t.url) && seen.set(t.url, true));
  const results = [];
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const t = unique[next++];
      const r = await check(t.url, 0);
      results.push(Object.assign({}, t, r));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => a.where.localeCompare(b.where));
  let bad = 0;
  for (const r of results) {
    const ok = r.status && r.status < 400 && !r.error;
    if (!ok) bad++;
    const moved = r.finalUrl && r.finalUrl !== r.url ? '  -> ' + r.finalUrl : '';
    console.log((ok ? 'OK   ' : 'FAIL ') + (r.status || r.error) + '  ' + r.url + moved + '\n       ' + r.where);
  }
  console.log('\n' + results.length + ' unique links checked, ' + bad + ' need a browser check.');
}
run();
