'use strict';
/**
 * audit-seo.js — read-only check of the static site. Run it before and after the 1.5.2 patch.
 * Reports: canonicals that 404, hreflang that 404 or is one-sided, dead internal links, stale source counts,
 * banned wording, and sitemap gaps. Exit code 1 when anything is wrong.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/audit-seo.js [--verbose]
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./lib/config');
const { loadPages, ownPath, makeResolver, canonicalOf, isHome } = require('./lib/pages');

const VERBOSE = process.argv.includes('--verbose');
const ASSET = /\.(png|jpe?g|gif|svg|ico|webp|css|js|json|xml|txt|pdf|woff2?|mp4|csv)$/i;
const ALT = /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/gi;
const BANNED = [
  [/costco[^.]{0,160}federal law|federal law[^.]{0,160}costco|\(federal law\)|es ley federal|ley federal no requiere membres|legally required to serve non-members|a federal law requirement/i, 'Costco "federal law" claim'],
  [/free forever|gratis para siempre|always will be|siempre lo será/i, '"free forever" promise'],
  [/every dollar goes directly|cada d(ó|&oacute;)lar se destina/i, '"every dollar goes to data" claim'],
  [/GoodRx only shows GoodRx|GoodRx solo muestra precios de GoodRx/i, '"GoodRx only shows GoodRx prices"'],
  [/queried in real time on every search\. Always current/i, 'NADAC "always current"'],
  [/No ads[.,] (N|n)o affiliate links|Sin anuncios\. Sin enlaces de afiliados/i, '"No ads. No affiliate links"'],
];
const COUNT = new RegExp('(?<![\\d$.,/-])\\b(' + cfg.OLD_COUNTS.join('|') + ')\\s+(?:(?:free|data|pricing|government|distintas|diferentes)\\s+)*(sources?|fuentes?)\\b', 'i');

const problems = [];
const add = (kind, rel, note) => problems.push({ kind, rel, note });

function backLinks(page) {
  const out = [];
  let b;
  ALT.lastIndex = 0;
  while ((b = ALT.exec(page.out))) out.push(b[2].replace(cfg.ORIGIN, ''));
  return out;
}

function checkPage(page, resolves, byPath) {
  const canon = canonicalOf(page);
  if (!canon) add('canonical-missing', page.rel, 'no canonical tag');
  else {
    const p = canon.startsWith(cfg.ORIGIN) ? canon.slice(cfg.ORIGIN.length) || '/' : null;
    if (p === null || !resolves(p)) add('canonical-404', page.rel, canon);
    else if (isHome(page) && p !== '/') add('canonical-home', page.rel, canon);
  }
  const alts = {};
  let m;
  ALT.lastIndex = 0;
  while ((m = ALT.exec(page.out))) {
    const target = m[2].startsWith(cfg.ORIGIN) ? m[2].slice(cfg.ORIGIN.length) : m[2];
    alts[m[1].toLowerCase()] = target;
    if (!resolves(target)) add('hreflang-404', page.rel, m[1] + ' -> ' + target);
  }
  // /app.html is the search tool. It copies the homepage head, robots.txt blocks /app, and it has no Spanish twin. Reported, not scored.
  if (page.rel === '/app.html') return;
  for (const [lang, target] of Object.entries(alts)) {
    if (target === ownPath(page.rel) || !byPath.has(target)) continue;
    if (!backLinks(byPath.get(target)).includes(ownPath(page.rel))) add('hreflang-one-sided', page.rel, lang + ' -> ' + target + ' does not point back');
  }
  const seen = new Set();
  for (const [, attr, href] of page.out.matchAll(/\b(href|src)="(\/[^"#?]*)/g)) {
    if (href.startsWith('//') || href.startsWith('/api') || ASSET.test(href) || seen.has(href)) continue;
    seen.add(href);
    if (!resolves(href)) add('dead-link', page.rel, attr + '="' + href + '"');
  }
  const cm = COUNT.exec(page.out);
  if (cm) add('source-count', page.rel, 'still says "' + cm[0] + '" (site number is ' + cfg.SOURCE_COUNT + ')');
  for (const [re, label] of BANNED) if (re.test(page.out)) add('wording', page.rel, label);
}

function checkSitemap(pages, resolves) {
  const smPath = path.join(cfg.PUBLIC_DIR, 'sitemap.xml');
  if (!fs.existsSync(smPath)) { add('sitemap-missing', '/sitemap.xml', 'file not found'); return; }
  const urls = [...fs.readFileSync(smPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  const inMap = new Set(urls);
  for (const u of urls) if (!resolves(u.replace(cfg.ORIGIN, '') || '/')) add('sitemap-404', '/sitemap.xml', u);
  if (inMap.size !== urls.length) add('sitemap-duplicate', '/sitemap.xml', 'duplicate <loc> entries');
  if (inMap.has(cfg.ORIGIN + '/landing.html')) add('sitemap-duplicate-home', '/sitemap.xml', 'landing.html duplicates "/"');
  for (const page of pages) {
    if (isHome(page) && page.rel !== '/index.html') continue;
    const canon = canonicalOf(page);
    if (canon && !canon.endsWith('/app') && !inMap.has(canon)) add('sitemap-gap', page.rel, 'canonical not in sitemap: ' + canon);
  }
  console.log('Sitemap: ' + urls.length + ' URLs.');
}

function run() {
  const pages = loadPages();
  const resolves = makeResolver(pages);
  const byPath = new Map(pages.map((p) => [ownPath(p.rel), p]));
  for (const page of pages) checkPage(page, resolves, byPath);
  checkSitemap(pages, resolves);
  for (const f of ['llms.txt', 'methodology.html', 'metodologia.html']) {
    if (!fs.existsSync(path.join(cfg.PUBLIC_DIR, f))) add('missing-file', '/' + f, 'not found');
  }
  const kinds = new Map();
  for (const p of problems) kinds.set(p.kind, (kinds.get(p.kind) || 0) + 1);
  console.log('Pages checked: ' + pages.length + '.');
  console.log(problems.length ? '\nPROBLEMS: ' + problems.length : '\nPROBLEMS: 0  (clean)');
  for (const [k, n] of [...kinds].sort()) console.log('  ' + k.padEnd(24) + n);
  if (VERBOSE || problems.length <= 40) for (const p of problems) console.log('  - ' + p.kind + '  ' + p.rel + '  ' + p.note);
  process.exit(problems.length ? 1 : 0);
}

run();
