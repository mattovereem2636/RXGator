'use strict';
/**
 * counts.js — one data-source number across the whole site.
 * Every hit on 2026-10-08 was RxGator's own count (checked by hand), so the match is "N sources" / "N fuentes".
 * "pricing sources" becomes "data sources": four of the sources do not price anything.
 */
const { SOURCE_COUNT, SOURCE_WORDS, OLD_COUNTS } = require('../lib/config');

const NUM = OLD_COUNTS.join('|');
const NOT_MONEY = '(?<![\\d$.,/-])';
const EN = new RegExp(NOT_MONEY + '\\b(' + NUM + ')(\\s+(?:(?:free|data|pricing|government)\\s+)*)(sources?)\\b', 'gi');
const ES = new RegExp(
  NOT_MONEY + '(?:m(?:á|&aacute;)s de |mas de )?\\b(' + NUM + ')(\\s+(?:(?:distintas|diferentes)\\s+)?)(fuentes?)(\\s+de\\s+(?:datos|precios))?', 'gi');

function matchCase(word, like) { return like[0] === like[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word; }

function run(ctx) {
  for (const page of ctx.pages) {
    let n = 0;
    let out = page.out.replace(EN, (m, num, mid, src) => {
      n++;
      const hadPricing = /pricing/i.test(mid);
      const fixedMid = hadPricing ? mid.replace(/pricing/i, (w) => matchCase('data', w)) : mid;
      return SOURCE_COUNT + fixedMid + src;
    });
    out = out.replace(ES, (m, num, mid, src, tail) => {
      n++;
      const newTail = tail ? tail.replace(/precios/i, 'datos') : '';
      return SOURCE_COUNT + mid + src + newTail;
    });
    out = out.split('nineteen data sources').join(SOURCE_WORDS.en + ' data sources').split('diecinueve fuentes de datos').join(SOURCE_WORDS.es + ' fuentes de datos');
    n += (page.out.split('nineteen data sources').length - 1) + (page.out.split('diecinueve fuentes de datos').length - 1);
    if (out !== page.out) { page.out = out; ctx.log(page.rel, 'source-count', n); }
  }
}

module.exports = { run };
