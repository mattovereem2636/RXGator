/**
 * RxGator PAP Card — Drop-in script for search results
 * Loads pap-database.json, watches for search results, injects PAP info card.
 * Add to /app page: <script src="/pap-card.js" defer></script>
 */
(function () {
  'use strict';

  var papDB = null;
  var lastDrug = '';
  var cardId = 'rxg-pap-card';

  // ── Load PAP Database ──
  fetch('/pap-database.json')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      papDB = data;
      checkResults();           // check if results already on page
      observeResults();         // watch for future results
    })
    .catch(function () { /* silently fail — PAP card is an enhancement */ });

  // ── Observe #results for changes ──
  function observeResults() {
    var target = document.getElementById('results');
    if (!target) return;
    var mo = new MutationObserver(function () { checkResults(); });
    mo.observe(target, { childList: true, subtree: true });
  }

  // ── Check if drug-info is present and inject card ──
  function checkResults() {
    if (!papDB) return;
    var drugInfo = document.querySelector('#results .drug-info');
    if (!drugInfo) return;

    var h2 = drugInfo.querySelector('h2');
    if (!h2) return;

    // Extract generic drug name (text before the RxCUI badge span)
    var drugName = h2.childNodes[0] ? h2.childNodes[0].textContent.trim().toLowerCase() : '';
    if (!drugName || drugName === lastDrug) return;
    lastDrug = drugName;

    // Also grab brand names from the meta section
    var brandText = '';
    var metaDiv = drugInfo.querySelector('.meta');
    if (metaDiv) {
      var brandLine = Array.from(metaDiv.querySelectorAll('div')).find(function (d) {
        return d.textContent.indexOf('Brand') !== -1;
      });
      if (brandLine) brandText = brandLine.textContent.replace('Brand names:', '').trim().toLowerCase();
    }

    // Look up drug in PAP database
    var match = findDrug(drugName, brandText);

    // Remove old card if present
    var old = document.getElementById(cardId);
    if (old) old.remove();

    if (!match) return; // Drug not in our top-100 DB — no card

    // Build and inject card
    var card = buildCard(match);
    var insertAfter = drugInfo.nextElementSibling || drugInfo;
    drugInfo.parentNode.insertBefore(card, insertAfter);
  }

  // ── Find drug by generic name or brand name ──
  function findDrug(generic, brands) {
    var g = generic.toLowerCase();
    var brandList = brands ? brands.split(',').map(function (b) { return b.trim().toLowerCase(); }) : [];

    for (var i = 0; i < papDB.drugs.length; i++) {
      var d = papDB.drugs[i];
      var dg = (d.generic_name || '').toLowerCase();
      var db = (d.brand_name || '').toLowerCase();

      // Exact generic match
      if (dg === g) return d;

      // Generic starts with or contains
      if (g.indexOf(dg) !== -1 || dg.indexOf(g) !== -1) return d;

      // Brand match
      for (var j = 0; j < brandList.length; j++) {
        if (db.indexOf(brandList[j]) !== -1 || brandList[j].indexOf(db.split('/')[0]) !== -1) return d;
      }
    }
    return null;
  }

  // ── Build the PAP card DOM element ──
  function buildCard(drug) {
    var card = document.createElement('div');
    card.id = cardId;

    if (drug.pap) {
      card.className = 'rxg-pap-card rxg-pap-has-program';
      card.innerHTML = buildPapCard(drug);
    } else {
      card.className = 'rxg-pap-card rxg-pap-generic';
      card.innerHTML = buildGenericCard(drug);
    }
    return card;
  }

  // ── Card for drugs WITH a PAP ──
  function buildPapCard(drug) {
    var p = drug.pap;
    var html = '';
    html += '<div class="rxg-pap-header">';
    html += '<span class="rxg-pap-icon">&#10003;</span>';
    html += '<div>';
    html += '<strong>Free Medication Program Available</strong>';
    html += '<span class="rxg-pap-sub">' + esc(p.program_name) + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="rxg-pap-body">';
    html += '<div class="rxg-pap-grid">';
    html += gi('Income Limit', p.income_limit_pct_fpl ? (p.income_limit_pct_fpl + '% FPL') : 'Varies');
    html += gi('Eligibility', p.insurance_requirement || 'See program');
    html += gi('Processing', p.processing_time || 'Varies');
    html += gi('You Get', p.what_you_get || 'Free medication');
    html += '</div>';

    if (p.notes) {
      html += '<p class="rxg-pap-note">' + esc(p.notes) + '</p>';
    }

    html += '<div class="rxg-pap-actions">';
    if (p.application_url) {
      html += '<a href="' + esc(p.application_url) + '" target="_blank" rel="noopener" class="rxg-pap-btn rxg-pap-btn-apply">Apply Now</a>';
    }
    if (p.phone) {
      html += '<a href="tel:' + esc(p.phone.replace(/[^0-9+]/g, '')) + '" class="rxg-pap-btn rxg-pap-btn-phone">' + esc(p.phone) + '</a>';
    }
    html += '<a href="/pap-finder" class="rxg-pap-btn rxg-pap-btn-more">Full PAP Details</a>';
    html += '</div>';

    if (drug.has_generic && drug.generic_price_range) {
      html += '<p class="rxg-pap-generic-note">Generic also available at ' + esc(drug.generic_price_range) + ' — ask your doctor if appropriate.</p>';
    }
    html += '</div>';
    return html;
  }

  // ── Card for drugs WITHOUT a PAP (generic, low-cost) ──
  function buildGenericCard(drug) {
    var html = '';
    html += '<div class="rxg-pap-header rxg-pap-header-blue">';
    html += '<span class="rxg-pap-icon">&#128176;</span>';
    html += '<div>';
    html += '<strong>Low-Cost Generic Available</strong>';
    if (drug.generic_price_range) {
      html += '<span class="rxg-pap-sub">Typical cost: ' + esc(drug.generic_price_range) + '</span>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="rxg-pap-body">';
    if (drug.notes) {
      html += '<p class="rxg-pap-note">' + esc(drug.notes) + '</p>';
    }
    html += '<div class="rxg-pap-actions">';
    html += '<a href="/pap-finder" class="rxg-pap-btn rxg-pap-btn-more">Check Assistance Programs</a>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Helpers ──
  function gi(label, value) {
    return '<div class="rxg-pap-gi"><span class="rxg-pap-gl">' + esc(label) + '</span><span class="rxg-pap-gv">' + esc(value) + '</span></div>';
  }
  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ── Inject styles (once) ──
  var style = document.createElement('style');
  style.textContent = [
    '.rxg-pap-card { margin: 16px 0; border-radius: 10px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }',
    '.rxg-pap-has-program { border: 2px solid #1E8449; }',
    '.rxg-pap-generic { border: 2px solid #0C8080; }',
    '.rxg-pap-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: #D5F5E3; color: #145A32; }',
    '.rxg-pap-header-blue { background: #D0F0F0; color: #0B3B5C; }',
    '.rxg-pap-icon { font-size: 1.5rem; flex-shrink: 0; }',
    '.rxg-pap-header strong { display: block; font-size: 1rem; }',
    '.rxg-pap-sub { display: block; font-size: 0.85rem; opacity: 0.85; margin-top: 2px; }',
    '.rxg-pap-body { padding: 16px 18px; background: #fff; }',
    '.rxg-pap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }',
    '@media (max-width: 500px) { .rxg-pap-grid { grid-template-columns: 1fr; } }',
    '.rxg-pap-gi { }',
    '.rxg-pap-gl { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #7F8C8D; }',
    '.rxg-pap-gv { display: block; font-size: 0.9rem; color: #2C3E50; font-weight: 500; }',
    '.rxg-pap-note { font-size: 0.85rem; color: #5D6D7E; margin: 8px 0 12px; line-height: 1.5; }',
    '.rxg-pap-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }',
    '.rxg-pap-btn { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 6px; font-size: 0.88rem; font-weight: 600; text-decoration: none; transition: opacity 0.15s; }',
    '.rxg-pap-btn:hover { opacity: 0.85; text-decoration: none; }',
    '.rxg-pap-btn-apply { background: #1E8449; color: #fff; }',
    '.rxg-pap-btn-phone { background: #0B3B5C; color: #fff; }',
    '.rxg-pap-btn-more { background: #EAECEE; color: #2C3E50; }',
    '.rxg-pap-generic-note { font-size: 0.82rem; color: #7F8C8D; margin-top: 10px; font-style: italic; }',
    '@media print { .rxg-pap-card { box-shadow: none; border: 1px solid #ccc; } }'
  ].join('\n');
  document.head.appendChild(style);
})();
