#!/usr/bin/env node
/**
 * build-articles.js — Renders EJS article templates into static HTML files
 * in public/articles/. Run this after creating or editing any .ejs article
 * template in views/articles/.
 *
 * Usage:
 *   node scripts/build-articles.js              # build all articles
 *   node scripts/build-articles.js metformin     # build only articles matching "metformin"
 */

const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const ARTICLES_DIR = path.join(VIEWS_DIR, 'articles');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'articles');
const LAYOUTS_DIR = path.join(VIEWS_DIR, 'layouts');

// Optional filter: only build articles whose filename contains this string
const filter = process.argv[2] || null;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Find all .ejs files in views/articles/
const articleFiles = fs.readdirSync(ARTICLES_DIR)
  .filter(f => f.endsWith('.ejs'))
  .filter(f => !filter || f.includes(filter));

if (articleFiles.length === 0) {
  console.log(filter
    ? `No article templates matching "${filter}" found in ${ARTICLES_DIR}`
    : `No article templates found in ${ARTICLES_DIR}`
  );
  process.exit(0);
}

// Read the article layout template
const layoutPath = path.join(LAYOUTS_DIR, 'article.ejs');
const layoutTemplate = fs.readFileSync(layoutPath, 'utf8');

let built = 0;
let errors = 0;

articleFiles.forEach(file => {
  const templatePath = path.join(ARTICLES_DIR, file);
  const slug = file.replace('.ejs', '');
  const outputPath = path.join(OUTPUT_DIR, `${slug}.html`);

  try {
    // Each article .ejs file should export data via a frontmatter-style
    // JSON block at the top, wrapped in <%# ... %> comments, followed
    // by the article body content.
    //
    // But for simplicity, article templates are just the body content
    // plus a companion .json data file with the same name.
    const dataPath = path.join(ARTICLES_DIR, `${slug}.json`);
    if (!fs.existsSync(dataPath)) {
      console.warn(`  SKIP ${file} — no companion ${slug}.json data file`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    data.slug = data.slug || slug;

    // Render the article body content
    const bodyTemplate = fs.readFileSync(templatePath, 'utf8');
    const bodyHtml = ejs.render(bodyTemplate, data, {
      filename: templatePath, // enables includes relative to the template
      views: [VIEWS_DIR]
    });

    // Render the full page using the layout
    data.content = bodyHtml;
    const fullHtml = ejs.render(layoutTemplate, data, {
      filename: layoutPath,
      views: [VIEWS_DIR]
    });

    fs.writeFileSync(outputPath, fullHtml);
    console.log(`  OK  ${slug}.html`);
    built++;
  } catch (err) {
    console.error(`  ERR ${file}: ${err.message}`);
    errors++;
  }
});

console.log(`\nBuild complete: ${built} articles built, ${errors} errors.`);
if (errors > 0) process.exit(1);
