'use strict';
/**
 * sitemap.js — build sitemap.xml from the files on disk. Run at every deploy so it can never go stale.
 * Rules: one entry per distinct canonical URL; skip pages whose canonical is /app or /api (robots blocks them);
 * lastmod = dateModified, else article:modified_time, else datePublished, else the file's own modified date.
 */
const { ORIGIN } = require('../lib/config');
const { ownPath, canonicalOf, isHome } = require('../lib/pages');

const DATE_PATTERNS = [
  /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/,
  /article:modified_time"\s+content="(\d{4}-\d{2}-\d{2})/,
  /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/,
  /article:published_time"\s+content="(\d{4}-\d{2}-\d{2})/,
];
const PRIORITY = [
  [/^\/$/, '1.0', 'weekly'],
  [/^\/articles\/$/, '0.8', 'weekly'],
  [/^\/(about|methodology|metodologia)\.html$/, '0.8', 'monthly'],
  [/^\/(privacy|terms)\.html$/, '0.3', 'yearly'],
  [/^\/articles\/es\//, '0.6', 'monthly'],
  [/^\/articles\//, '0.7', 'monthly'],
  [/./, '0.7', 'monthly'],
];

function lastmod(page, today) {
  for (const re of DATE_PATTERNS) {
    const m = re.exec(page.out);
    if (m && m[1] <= today) return m[1];
  }
  return page.mtime.toISOString().slice(0, 10);
}

/** @returns {{xml:string, count:number, urls:string[]}} */
function build(pages, today) {
  const seen = new Map();
  for (const page of pages) {
    if (isHome(page) && page.rel !== '/index.html') continue; // landing.html duplicates "/"
    const canon = canonicalOf(page);
    const url = canon || ORIGIN + ownPath(page.rel);
    const path = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) || '/' : null;
    if (path === null || path === '/app' || path.startsWith('/api')) continue;
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(page.out)) continue;
    if (!seen.has(url)) seen.set(url, { url, path, mod: lastmod(page, today) });
  }
  const order = (e) => (e.path === '/' ? 0 : /^\/articles\/$/.test(e.path) ? 2 : e.path.startsWith('/articles/es/') ? 5 : e.path.startsWith('/articles/') ? 4 : 1);
  const entries = [...seen.values()].sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path));
  const body = entries.map((e) => {
    const [, prio, freq] = PRIORITY.find(([re]) => re.test(e.path));
    return '  <url>\n    <loc>' + e.url + '</loc>\n    <lastmod>' + e.mod + '</lastmod>\n    <changefreq>' + freq + '</changefreq>\n    <priority>' + prio + '</priority>\n  </url>';
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body.join('\n') + '\n</urlset>\n';
  return { xml, count: entries.length, urls: entries.map((e) => e.url) };
}

module.exports = { build };
