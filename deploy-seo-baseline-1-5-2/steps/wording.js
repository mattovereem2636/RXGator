'use strict';
/**
 * wording.js — apply the exact-text rules. A count mismatch is a MISS: the run stops before it writes.
 * Also adds the methodology pointer under the FAQ source list.
 */
const { rules } = require('../lib/wording-rules');
const { SOURCE_COUNT } = require('../lib/config');

const FAQ_LIST_END = /(openFDA<\/a><\/strong>[^\n]*<\/li>\s*<\/ul>)/;
const FAQ_POINTER = '\n      <p>That list shows the main sources. The <a href="/methodology.html" style="color:var(--teal);">methodology page</a> names all ' + SOURCE_COUNT + ' and explains how RXGator ranks them.</p>';

function run(ctx) {
  const byRel = new Map(ctx.pages.map((p) => [p.rel, p]));
  for (const rule of rules) {
    for (const rel of rule.files) {
      const page = byRel.get(rel);
      if (!page) { ctx.miss(rel, rule.id, 'file not found'); continue; }
      const parts = page.out.split(rule.find);
      const found = parts.length - 1;
      if (found === 0 && page.out.includes(rule.replace)) continue; // already applied: idempotent
      if (found !== rule.count) { ctx.miss(rel, rule.id, 'expected ' + rule.count + ' hit(s), found ' + found); continue; }
      page.out = parts.join(rule.replace);
      ctx.log(rel, rule.id, found);
    }
  }
  const faq = byRel.get('/faq.html');
  if (faq && !faq.out.includes('/methodology.html')) {
    if (FAQ_LIST_END.test(faq.out)) { faq.out = faq.out.replace(FAQ_LIST_END, (m) => m.replace(/<\/ul>\s*$/, '</ul>') + FAQ_POINTER); ctx.log('/faq.html', 'faq-methodology-pointer', 1); }
    else ctx.miss('/faq.html', 'faq-methodology-pointer', 'source list end not found');
  }
}

module.exports = { run };
