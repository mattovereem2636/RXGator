'use strict';
/**
 * hreflang.js — every English/Spanish pair must point at each other, and every target must exist.
 * 1) Dead Spanish targets are swapped for the page that exists (DEAD_ALTERNATES).
 * 2) A Spanish page that names an English twin, where the English page has no hreflang, gets the pair added.
 */
const { ORIGIN, DEAD_ALTERNATES } = require('../lib/config');
const { ownPath, makeResolver } = require('../lib/pages');
const { replaceExact } = require('../lib/edit');

const ALT = /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?>/gi;
const CANON = /<link\s+rel="canonical"\s+href="[^"]+"\s*\/?>/i;

function alternates(html) {
  const out = {};
  let m;
  ALT.lastIndex = 0;
  while ((m = ALT.exec(html))) out[m[1].toLowerCase()] = m[2].startsWith(ORIGIN) ? m[2].slice(ORIGIN.length) : m[2];
  return out;
}

function run(ctx) {
  const resolves = makeResolver(ctx.pages);
  const byPath = new Map(ctx.pages.map((p) => [ownPath(p.rel), p]));

  for (const page of ctx.pages) {
    for (const [from, to] of Object.entries(DEAD_ALTERNATES)) {
      const [out, n] = replaceExact(page.out, 'hreflang="es" href="' + ORIGIN + from + '"', 'hreflang="es" href="' + ORIGIN + to + '"');
      if (n) { page.out = out; ctx.log(page.rel, 'hreflang-dead', n, from + ' -> ' + to); }
    }
    // the extensionless pair (lost-insurance / perdi-mi-seguro) is fixed by the canonical + link maps; fix its hreflang too
    for (const stem of ['/lost-insurance', '/perdi-mi-seguro']) {
      const [out, n] = replaceExact(page.out, 'hreflang="en" href="' + ORIGIN + stem + '"', 'hreflang="en" href="' + ORIGIN + stem + '.html"');
      const [out2, n2] = replaceExact(out, 'hreflang="es" href="' + ORIGIN + stem + '"', 'hreflang="es" href="' + ORIGIN + stem + '.html"');
      if (n + n2) { page.out = out2; ctx.log(page.rel, 'hreflang-dead', n + n2, stem + ' -> ' + stem + '.html'); }
    }
  }

  // reciprocal pairs: Spanish page -> English twin that does not point back
  for (const es of ctx.pages) {
    const alts = alternates(es.out);
    if (!alts.es || !alts.en || alts.es !== ownPath(es.rel)) continue;
    const en = byPath.get(alts.en);
    if (!en) { ctx.warn(es.rel, 'hreflang', 'English twin ' + alts.en + ' not found'); continue; }
    const back = alternates(en.out);
    if (back.es === alts.es) continue;
    if (Object.keys(back).length) { ctx.warn(en.rel, 'hreflang', 'has hreflang but not the es pair; left alone'); continue; }
    if (!CANON.test(en.out)) { ctx.warn(en.rel, 'hreflang', 'no canonical tag to anchor on'); continue; }
    const block = '\n<link rel="alternate" hreflang="en" href="' + ORIGIN + ownPath(en.rel) + '">\n<link rel="alternate" hreflang="es" href="' + ORIGIN + alts.es + '">';
    en.out = en.out.replace(CANON, (tag) => tag + block);
    ctx.log(en.rel, 'hreflang-add', 1, 'en <-> ' + alts.es);
  }
  void resolves;
}

module.exports = { run };
