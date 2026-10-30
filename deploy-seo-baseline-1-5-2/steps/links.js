'use strict';
/**
 * links.js — repair internal links that 404.
 * 1) Exact href swaps from LINK_MAP (nav, footer, related cards, breadcrumbs).
 * 2) Cards for articles that were never written are removed (UNLINK).
 */
const { LINK_MAP, LINK_PATTERNS, UNLINK } = require('../lib/config');
const { replaceExact, removeLinkedCards, pruneEmptyRelated } = require('../lib/edit');
const { makeResolver } = require('../lib/pages');

/** /articles/some-slug or /articles/es/some-slug with no extension: the template that wrote the six price pages and the Sept 23 drafts does this. */
const EXTENSIONLESS_ARTICLE = /href="(\/articles\/(?:es\/)?[a-z0-9][a-z0-9-]*)"/g;

function run(ctx) {
  const resolves = makeResolver(ctx.pages);
  for (const page of ctx.pages) {
    for (const [from, to] of Object.entries(LINK_MAP)) {
      const [out, n] = replaceExact(page.out, 'href="' + from + '"', 'href="' + to + '"');
      if (n) { page.out = out; ctx.log(page.rel, 'link', n, from + ' -> ' + to); }
    }
    for (const [re, to, note] of LINK_PATTERNS) {
      let n = 0;
      page.out = page.out.replace(re, () => { n++; return to; });
      if (n) ctx.log(page.rel, 'link', n, note);
    }
    // generic: add .html when the article file exists (runs after LINK_MAP, so mapped hrefs are already final)
    let generic = 0;
    page.out = page.out.replace(EXTENSIONLESS_ARTICLE, (m, href) => {
      if (resolves(href) || !resolves(href + '.html')) return m;
      generic++;
      return 'href="' + href + '.html"';
    });
    if (generic) ctx.log(page.rel, 'link-ext', generic, 'added .html to extensionless article links');
    for (const href of UNLINK) {
      const [out, n] = removeLinkedCards(page.out, href);
      if (n) { page.out = out; ctx.log(page.rel, 'unlink', n, href); }
    }
    if (page.out !== page.src && /related-(articles|section|grid)/.test(page.out)) {
      const [out, n] = pruneEmptyRelated(page.out);
      if (n) { page.out = out; ctx.log(page.rel, 'prune-empty-related', n, 'removed an empty Related Articles box'); }
    }
  }
}

module.exports = { run };
