/**
 * RxGator Article Carousel Widget
 * 
 * Reads articles.json, picks 3 random articles, and renders
 * clickable cards in a designated container on the page.
 * 
 * USAGE: Add this to your landing page:
 * 
 *   <div id="rxg-articles"></div>
 *   <link rel="stylesheet" href="/articles/article-style.css">
 *   <script src="/articles/article-widget.js"></script>
 * 
 * The widget renders inside #rxg-articles. Each page load
 * shows a different random selection of 3 articles.
 */
(function() {
  'use strict';

  var CONTAINER_ID = 'rxg-articles';
  var ARTICLE_COUNT = 3; // how many to show per load
  var JSON_PATH = '/articles/articles.json';

  function shuffle(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function render(articles) {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    var picked = shuffle(articles).slice(0, ARTICLE_COUNT);

    var html = '<div class="article-carousel">';
    html += '<h2>Prescription Savings Guides</h2>';
    html += '<div class="carousel-grid">';

    picked.forEach(function(a) {
      html += '<a href="/articles/' + a.slug + '.html" class="carousel-card">';
      html += '<div class="cc-tag">' + a.tag + '</div>';
      html += '<div class="cc-title">' + a.title + '</div>';
      html += '<div class="cc-desc">' + a.description + '</div>';
      html += '</a>';
    });

    html += '</div>';
    html += '<div class="carousel-all"><a href="/articles/">View all articles &rarr;</a></div>';
    html += '</div>';

    container.innerHTML = html;
  }

  // Load and render
  fetch(JSON_PATH)
    .then(function(r) { return r.json(); })
    .then(function(data) { render(data); })
    .catch(function(err) {
      console.warn('RxGator article widget: could not load articles.json', err);
    });
})();
