/**
 * RxGator Article Carousel Widget (v2, 2026-10-27)
 *
 * Reads articles.json, picks 3 random articles in the visitor's language,
 * and renders clickable cards in #rxg-articles.
 *
 * v2 changes: filters by language (entries with lang "es" show only in
 * Spanish; all others show in English), follows the homepage EN/ES toggle,
 * translates the heading, escapes text, and announces updates politely.
 *
 * USAGE (unchanged):
 *   <div id="rxg-articles"></div>
 *   <script src="/articles/article-widget.js"></script>
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'rxg-articles';
  var ARTICLE_COUNT = 3;
  var JSON_PATH = '/articles/articles.json';
  var LANG_KEY = 'rxgator_lang';
  var TEXT = {
    en: { heading: 'Prescription Savings Guides', all: 'View all articles &rarr;' },
    es: { heading: 'Gu&iacute;as de Ahorro en Recetas', all: 'Ver todos los art&iacute;culos &rarr;' }
  };
  var allArticles = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function currentLang() {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.indexOf('es') === 0) return 'es';
    try {
      if (localStorage.getItem(LANG_KEY) === 'es') return 'es';
    } catch (e) { /* storage blocked; fall back to English */ }
    return 'en';
  }

  function shuffle(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  function render() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container || !allArticles.length) return;
    var lang = currentLang();
    var t = TEXT[lang];
    var pool = allArticles.filter(function (a) { return (a.lang === 'es' ? 'es' : 'en') === lang; });
    if (!pool.length) pool = allArticles;
    var picked = shuffle(pool).slice(0, ARTICLE_COUNT);

    var html = '<div class="article-carousel">';
    html += '<h2>' + t.heading + '</h2>';
    html += '<div class="carousel-grid">';
    picked.forEach(function (a) {
      html += '<a href="/articles/' + encodeURI(a.slug) + '.html" class="carousel-card" lang="' + (a.lang === 'es' ? 'es' : 'en') + '">';
      html += '<div class="cc-tag">' + esc(a.tag) + '</div>';
      html += '<div class="cc-title">' + esc(a.title) + '</div>';
      html += '<div class="cc-desc">' + esc(a.description) + '</div>';
      html += '</a>';
    });
    html += '</div>';
    html += '<div class="carousel-all"><a href="/articles/">' + t.all + '</a></div>';
    html += '</div>';

    container.setAttribute('aria-live', 'polite');
    container.innerHTML = html;
  }

  function watchLanguage() {
    if (!window.MutationObserver) return;
    var last = currentLang();
    new MutationObserver(function () {
      var now = currentLang();
      if (now !== last) { last = now; render(); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  fetch(JSON_PATH)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      allArticles = Array.isArray(data) ? data : [];
      render();
      watchLanguage();
    })
    .catch(function (err) {
      console.warn('RxGator article widget: could not load articles.json', err);
    });
})();
