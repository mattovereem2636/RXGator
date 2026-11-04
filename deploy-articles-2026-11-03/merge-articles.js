#!/usr/bin/env node
/**
 * merge-articles.js — RxGator content release 2026-11-03.
 *
 * Merges new article metadata into the live site files. Safe to run twice:
 * every step skips entries that already exist.
 *
 *   1. public/articles/articles.json  (carousel rotation)
 *      - adds the 10 new articles (articles-json-entries.json)
 *   2. public/sitemap.xml             adds the 10 new article URLs
 *      (--sitemap-backfill also adds every /articles/ index URL that is missing)
 *   3. public/articles/index.html     adds the 10 new cards
 *
 * Default is a dry run. Pass --apply to write. Every written file is backed up
 * first as <file>.pre-articles-2026-11-03.
 *
 * Usage (on the server):
 *   node /var/www/rxaggregator/deploy-articles-2026-11-03/merge-articles.js
 *   node /var/www/rxaggregator/deploy-articles-2026-11-03/merge-articles.js --apply
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = process.env.RXG_BASE || '/var/www/rxaggregator';
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const ARTICLES_JSON = path.join(PUBLIC_DIR, 'articles', 'articles.json');
const SITEMAP = path.join(PUBLIC_DIR, 'sitemap.xml');
const INDEX_HTML = path.join(PUBLIC_DIR, 'articles', 'index.html');
const RELEASE_DIR = __dirname;
const BACKUP_SUFFIX = '.pre-articles-2026-11-03';
const SITE = 'https://rxgator.info';
const RELEASE_DATE = '2026-11-03';
const DATE_LABEL = { en: 'November 3, 2026', es: '3 de noviembre de 2026' };

const APPLY = process.argv.includes('--apply');
const SITEMAP_BACKFILL = process.argv.includes('--sitemap-backfill');

/** Read a JSON file or stop with a clear message. */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[merge-articles] ERROR reading ${file}: ${err.message}`);
    process.exit(1);
  }
}

/** Back up a file once, then write the new content (only with --apply). */
function writeWithBackup(file, content) {
  if (!APPLY) return;
  try {
    const backup = file + BACKUP_SUFFIX;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`[merge-articles] wrote ${file} (backup: ${backup})`);
  } catch (err) {
    console.error(`[merge-articles] ERROR writing ${file}: ${err.message}`);
    process.exit(1);
  }
}

/** Escape text for HTML. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Step 1: add new entries to articles.json, newest first. */
function mergeArticlesJson(newEntries) {
  const current = readJson(ARTICLES_JSON);
  if (!Array.isArray(current)) {
    console.error('[merge-articles] ERROR: articles.json is not an array. Nothing changed.');
    process.exit(1);
  }
  const known = new Set(current.map((a) => a.slug));
  const toAdd = newEntries.filter((a) => !known.has(a.slug));
  const merged = [...current, ...toAdd].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  console.log(`[merge-articles] articles.json: ${current.length} now, adding ${toAdd.length}, total ${merged.length}`);
  if (toAdd.length) writeWithBackup(ARTICLES_JSON, JSON.stringify(merged, null, 2) + '\n');
}

/** Build one sitemap <url> block. */
function sitemapUrl(loc) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${RELEASE_DATE}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
}

/** Step 2: add missing article URLs to sitemap.xml. */
function mergeSitemap(newEntries, indexHtml) {
  let xml = fs.readFileSync(SITEMAP, 'utf8');
  const wanted = newEntries.map((a) => `${SITE}/articles/${a.slug}.html`);
  if (SITEMAP_BACKFILL) {
    const re = /href="\/articles\/([^"]+)\.html" class="article-item"/g;
    let m;
    while ((m = re.exec(indexHtml)) !== null) wanted.push(`${SITE}/articles/${m[1]}.html`);
  }
  const missing = [...new Set(wanted)].filter((loc) => !xml.includes(`<loc>${loc}</loc>`));
  console.log(`[merge-articles] sitemap.xml: adding ${missing.length} URL(s)${SITEMAP_BACKFILL ? ' (with backfill)' : ''}`);
  if (!missing.length) return;
  if (!xml.includes('</urlset>')) {
    console.error('[merge-articles] ERROR: sitemap.xml has no </urlset>. Nothing changed.');
    process.exit(1);
  }
  xml = xml.replace('</urlset>', missing.map(sitemapUrl).join('\n') + '\n</urlset>');
  writeWithBackup(SITEMAP, xml);
}

/** Build one /articles/ index card in the live markup. */
function indexCard(a) {
  const lang = a.lang === 'es' ? 'es' : 'en';
  return `  <a href="/articles/${a.slug}.html" class="article-item" data-lang="${lang}">
    <div class="ai-meta">
      <span class="ai-tag">${esc(a.tag)}</span>
      <span class="ai-date">${DATE_LABEL[lang]} &middot; ${esc(a.readTime)}</span>
    </div>
    <div class="ai-title">${esc(a.title)}</div>
    <div class="ai-desc">${esc(a.description)}</div>
  </a>\n`;
}

/** Step 3: insert new cards before the first existing card of each language. */
function mergeIndex(newEntries) {
  let page = fs.readFileSync(INDEX_HTML, 'utf8');
  let added = 0;
  ['en', 'es'].forEach((lang) => {
    const cards = newEntries
      .filter((a) => (a.lang === 'es' ? 'es' : 'en') === lang)
      .filter((a) => !page.includes(`href="/articles/${a.slug}.html"`));
    if (!cards.length) return;
    const anchor = page.search(new RegExp(`\\s*<a href="/articles/[^"]+" class="article-item" data-lang="${lang}">`));
    if (anchor < 0) {
      console.warn(`[merge-articles] WARN: no ${lang} card found in index.html; add ${cards.length} card(s) by hand.`);
      return;
    }
    const lineStart = page.lastIndexOf('\n', anchor + 1) + 1;
    page = page.slice(0, lineStart) + cards.map(indexCard).join('') + page.slice(lineStart);
    added += cards.length;
  });
  // Keep the language filter button counts in step with the cards.
  const countOf = (lang) => (page.match(new RegExp(`class="article-item" data-lang="${lang}"`, 'g')) || []).length;
  const en = countOf('en');
  const es = countOf('es');
  const before = page;
  page = page
    .replace(/(filterLang\('all'\)">All \()\d+(\))/, `$1${en + es}$2`)
    .replace(/(filterLang\('en'\)">English \()\d+(\))/, `$1${en}$2`)
    .replace(/(filterLang\('es'\)">Espa(?:ñ|&ntilde;)ol \()\d+(\))/, `$1${es}$2`);
  console.log(`[merge-articles] index.html: adding ${added} card(s); counts all=${en + es} en=${en} es=${es}`);
  if (added || page !== before) writeWithBackup(INDEX_HTML, page);
}

function main() {
  console.log(`[merge-articles] ${APPLY ? 'APPLY' : 'DRY RUN (add --apply to write)'}`);
  const newEntries = readJson(path.join(RELEASE_DIR, 'articles-json-entries.json'));
  const missingFiles = newEntries.filter((a) => !fs.existsSync(path.join(PUBLIC_DIR, 'articles', `${a.slug}.html`)));
  if (missingFiles.length) {
    console.error('[merge-articles] ERROR: copy the HTML files first. Missing:', missingFiles.map((a) => a.slug).join(', '));
    process.exit(1);
  }
  const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
  mergeArticlesJson(newEntries);
  mergeSitemap(newEntries, indexHtml);
  mergeIndex(newEntries);
  console.log('[merge-articles] done');
}

main();
