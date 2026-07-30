#!/usr/bin/env node
/**
 * patch-articles.js — Add author byline and update Article schema for all RxGator articles
 * Run from the VPS: node /var/www/rxaggregator/patch-articles.js
 */

const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = '/var/www/rxaggregator/public/articles';
const STYLE_FILE = path.join(ARTICLES_DIR, 'article-style.css');

// Get all article HTML files (skip index.html)
const files = fs.readdirSync(ARTICLES_DIR)
  .filter(f => f.endsWith('.html') && f !== 'index.html');

let patched = 0;

files.forEach(file => {
  const filepath = path.join(ARTICLES_DIR, file);
  let html = fs.readFileSync(filepath, 'utf8');
  let changed = false;

  // 1. Add visible author byline after readtime span (if not already present)
  if (!html.includes('article-author')) {
    html = html.replace(
      /<span class="article-readtime">(.*?)<\/span>\s*\n\s*<\/div>/,
      '<span class="article-readtime">$1</span>\n  <span class="article-author">By Matt Overeem, Technology Assessment Project LLC</span>\n</div>'
    );
    changed = true;
  }

  // 2. Update JSON-LD schema — change author from Organization to Person
  // Match the author block specifically (not the publisher block)
  if (html.includes('"author"')) {
    html = html.replace(
      /"author":\s*\{\s*"@type":\s*"Organization",\s*"name":\s*"RXGator",\s*"url":\s*"https:\/\/rxgator\.info"\s*\}/,
      '"author": {\n    "@type": "Person",\n    "name": "Matt Overeem",\n    "url": "https://rxgator.info/about.html",\n    "jobTitle": "Founder",\n    "affiliation": {\n      "@type": "Organization",\n      "name": "Technology Assessment Project LLC"\n    }\n  }'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filepath, html);
    patched++;
    console.log(`  Patched: ${file}`);
  } else {
    console.log(`  Skipped (already patched): ${file}`);
  }
});

// 3. Add author byline CSS if not already present
let css = fs.readFileSync(STYLE_FILE, 'utf8');
if (!css.includes('.article-author')) {
  css += `
/* Author byline */
.article-author {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: #5D6D7E;
  font-style: normal;
}
`;
  fs.writeFileSync(STYLE_FILE, css);
  console.log('\n  Updated article-style.css with author byline styles');
}

console.log(`\nDone! Patched ${patched} of ${files.length} articles.`);
console.log('\nVerify: head -50 ' + path.join(ARTICLES_DIR, 'metformin-cost-without-insurance.html'));
