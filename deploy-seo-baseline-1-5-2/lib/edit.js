'use strict';
/**
 * edit.js — small, exact text edits. No blind regex on whole pages: every edit reports how many times it hit.
 */

/** Replace every exact occurrence. @returns {[string, number]} */
function replaceExact(text, find, repl) {
  if (!text.includes(find)) return [text, 0];
  const parts = text.split(find);
  return [parts.join(repl), parts.length - 1];
}

/** Replace a URL string only where a quote, space, comma, or tag end follows (so /x does not hit /x.html). */
function replaceUrl(text, url, repl) {
  const esc = url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  let n = 0;
  const out = text.replace(new RegExp(esc + '(?=["\'<\\s,])', 'g'), () => { n++; return repl; });
  return [out, n];
}

/** Find the index just past the matching close tag for the element opened at `start`. */
function matchClose(html, start, tag) {
  const open = new RegExp('<' + tag + '(?=[\\s>])', 'gi');
  const close = new RegExp('</' + tag + '>', 'gi');
  let depth = 0;
  const re = new RegExp(open.source + '|' + close.source, 'gi');
  re.lastIndex = start;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * Remove every related-article card whose link points at `href`.
 * A card is the anchor itself (class related-card), the enclosing <li>, or the enclosing div.related-card.
 * @returns {[string, number]}
 */
function removeLinkedCards(html, href) {
  const needle = 'href="' + href + '"';
  let count = 0;
  let idx;
  while ((idx = html.indexOf(needle)) !== -1) {
    const aStart = html.lastIndexOf('<a ', idx);
    const aTagEnd = html.indexOf('>', aStart) + 1;
    const aEnd = html.indexOf('</a>', idx) + 4;
    let start = aStart;
    let end = aEnd;
    if (!/class="[^"]*related-card/.test(html.slice(aStart, aTagEnd))) {
      const liAt = html.lastIndexOf('<li', aStart);
      const liOk = liAt !== -1 && html.slice(liAt, aStart).indexOf('</li>') === -1;
      const divStart = html.lastIndexOf('<div class="related-card"', aStart);
      const divEnd = divStart === -1 ? -1 : matchClose(html, divStart, 'div');
      const divOk = divStart !== -1 && divEnd > aEnd;
      if (divOk && (!liOk || divStart > liAt)) { start = divStart; end = divEnd; }
      else if (liOk) { start = liAt; end = html.indexOf('</li>', aEnd) + 5; }
      else return [html, count]; // unknown shape: leave it, the audit will report it
    }
    // swallow the indentation before and one newline after, so no blank holes remain
    const lineStart = html.lastIndexOf('\n', start) + 1;
    if (html.slice(lineStart, start).trim() === '') start = lineStart;
    if (html[end] === '\n') end += 1;
    html = html.slice(0, start) + html.slice(end);
    count++;
  }
  return [html, count];
}

/**
 * After cards are removed, drop any "Related Articles" box left with nothing in it
 * (the omeprazole page had three cards, all pointing at articles that were never written).
 * @returns {[string, number]}
 */
function pruneEmptyRelated(html) {
  let n = 0;
  const EMPTY_LIST = /<(ul|div class="related-grid")[^>]*>\s*<\/(?:ul|div)>/g;
  let out = html.replace(EMPTY_LIST, () => { n++; return ''; });
  const EMPTY_BOX = /<(section|div) class="related-(?:articles|section)"[^>]*>\s*<h2>[^<]*<\/h2>\s*<\/\1>[ \t]*\n?/g;
  out = out.replace(EMPTY_BOX, () => { n++; return ''; });
  return [out, n];
}

/** Insert `block` immediately before the first `</head>`. */
function beforeHeadClose(html, block) {
  const i = html.indexOf('</head>');
  return i === -1 ? [html, 0] : [html.slice(0, i) + block + '\n' + html.slice(i), 1];
}

module.exports = { replaceExact, replaceUrl, removeLinkedCards, pruneEmptyRelated, beforeHeadClose, matchClose };
