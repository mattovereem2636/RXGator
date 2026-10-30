'use strict';
/**
 * canonical.js — make every canonical and og:url point at a URL that answers 200.
 * Homepage twins (index.html, landing.html) both canonical to "/".
 * Any other page whose canonical 404s gets its own URL instead (nine pages on 2026-10-08).
 */
const { ORIGIN } = require('../lib/config');
const { ownPath, makeResolver, isHome } = require('../lib/pages');
const { replaceUrl } = require('../lib/edit');

const CANON = /(<link\s+rel="canonical"\s+href=")([^"]+)(")/i;
const OGURL = /(<meta\s+property="og:url"\s+content=")([^"]+)(")/i;

/** @param {{pages:object[], log:Function}} ctx */
function run(ctx) {
  const resolves = makeResolver(ctx.pages);
  for (const page of ctx.pages) {
    const m = CANON.exec(page.out);
    if (!m) { ctx.warn(page.rel, 'canonical', 'page has no canonical tag'); continue; }
    const current = m[2];
    const currentPath = current.startsWith(ORIGIN) ? current.slice(ORIGIN.length) || '/' : null;

    if (isHome(page)) {
      const target = ORIGIN + '/';
      if (current !== target) { page.out = page.out.replace(CANON, '$1' + target + '$3'); ctx.log(page.rel, 'canonical', 1); }
      const og = OGURL.exec(page.out);
      if (og && og[2] !== target) { page.out = page.out.replace(OGURL, '$1' + target + '$3'); ctx.log(page.rel, 'og:url', 1); }
      continue;
    }
    if (currentPath === null || resolves(currentPath)) continue;

    const target = ORIGIN + ownPath(page.rel);
    let total = 0;
    let n;
    [page.out, n] = replaceUrl(page.out, current, target); total += n;
    // og:url sometimes drifts from the canonical (it did on the six price pages): align it too
    const og = OGURL.exec(page.out);
    if (og && og[2] !== target && !resolves(og[2].replace(ORIGIN, '') || '/')) {
      [page.out, n] = replaceUrl(page.out, og[2], target); total += n;
    }
    ctx.log(page.rel, 'canonical', total, current + ' -> ' + target);
  }
}

module.exports = { run };
