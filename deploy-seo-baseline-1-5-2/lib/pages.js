'use strict';
/**
 * pages.js — load every public .html file into memory, resolve URLs, and write changes back safely.
 * Nothing touches disk until writeAll(). A failed write rolls every file back.
 */
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, ORIGIN, SKIP_FILE, SKIP_DIR, KNOWN_ROUTES, HOME_PAGES } = require('./config');

/** @returns {{rel:string, abs:string, src:string, out:string, mtime:Date, isNew:boolean}[]} */
function loadPages(dir = PUBLIC_DIR) {
  const pages = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) { if (!SKIP_DIR.has(ent.name)) walk(abs); continue; }
      if (!ent.name.endsWith('.html') || SKIP_FILE.test(ent.name)) continue;
      const src = fs.readFileSync(abs, 'utf8');
      const rel = '/' + path.relative(dir, abs).split(path.sep).join('/');
      pages.push({ rel, abs, src, out: src, mtime: fs.statSync(abs).mtime, isNew: false });
    }
  })(dir);
  return pages.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** The URL path a page answers on. /index.html -> /, /articles/index.html -> /articles/ */
function ownPath(rel) {
  if (rel === '/index.html') return '/';
  if (rel.endsWith('/index.html')) return rel.slice(0, -'index.html'.length);
  return rel;
}

/** Build a resolver: true when the server answers 200 for this URL path. */
function makeResolver(pages) {
  const files = new Set(pages.map((p) => p.rel));
  return function resolves(urlPath) {
    const clean = urlPath.split('#')[0].split('?')[0];
    if (KNOWN_ROUTES.includes(clean)) return true;
    return files.has(clean) || files.has(clean + 'index.html');
  };
}

/** Where a page really lives for the sitemap: its canonical when that resolves, else its own URL. */
function canonicalOf(page) {
  const m = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(page.out);
  return m ? m[1] : null;
}

function isHome(page) { return HOME_PAGES.includes(page.rel); }

/** Write changed pages with a per-run backup folder. Preserves each file's mtime. Rolls back on any failure. */
function writeAll(pages, backupDir, extraFiles = []) {
  const changed = pages.filter((p) => p.out !== p.src);
  const written = [];
  try {
    for (const p of changed) {
      const bak = path.join(backupDir, p.rel);
      fs.mkdirSync(path.dirname(bak), { recursive: true });
      fs.writeFileSync(bak, p.src, 'utf8');
    }
    for (const p of changed) {
      fs.writeFileSync(p.abs, p.out, 'utf8');
      fs.utimesSync(p.abs, p.mtime, p.mtime);
      written.push(p);
    }
    for (const f of extraFiles) {
      const existed = fs.existsSync(f.abs);
      if (existed) {
        const bak = path.join(backupDir, path.relative(PUBLIC_DIR, f.abs));
        fs.mkdirSync(path.dirname(bak), { recursive: true });
        fs.copyFileSync(f.abs, bak);
      }
      fs.writeFileSync(f.abs, f.content, 'utf8');
      written.push({ abs: f.abs, src: existed ? fs.readFileSync(path.join(backupDir, path.relative(PUBLIC_DIR, f.abs)), 'utf8') : null });
    }
  } catch (err) {
    for (const p of written) {
      if (p.src === null) fs.rmSync(p.abs, { force: true });
      else fs.writeFileSync(p.abs, p.src, 'utf8');
    }
    throw new Error('write failed, rolled back ' + written.length + ' file(s): ' + err.message);
  }
  return { changed: changed.length, extra: extraFiles.length };
}

module.exports = { loadPages, ownPath, makeResolver, canonicalOf, isHome, writeAll, ORIGIN };
