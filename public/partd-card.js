/**
 * RxGator Part D Card — Drop-in script for search results
 * Loads partd-database.json, watches for search results, injects Part D info card.
 * Add to /app page: <script src="/partd-card.js" defer></script>
 */
(function () {
  'use strict';

  var partdDB = null;
  var lastDrug = '';
  var cardId = 'rxg-partd-card';

  // ── Load Part D Database ──
  fetch('/partd-database.json')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      partdDB = data;
      checkResults();
      observeResults();
    })
    .catch(function () { /* silently fail — Part D card is an enhancement */ });

  // ── Observe #results for changes ──
  function observeResults() {
    var target = document.getElementById('results');
    if (!target) return;
    var mo = new MutationObserver(function () { checkResults(); });
    mo.observe(target, { childList: true, subtree: true });
  }

  // ── Check if drug-info is present and inject card ──
  function checkResults() {
    if (!partdDB) return;
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

    // Look up drug in Part D database
    var drugKey = findDrug(drugName, brandText);

    // Remove old card if present
    var old = document.getElementById(cardId);
    if (old) old.remove();

    if (!drugKey) return;

    // Build and inject card
    var card = buildCard(drugKey);

    // Insert after .needymeds-card if present, else after .drug-info, else after PAP card
    var papCard = document.getElementById('rxg-pap-card');
    var needyMeds = document.querySelector('#results .needymeds-card');
    var insertTarget = papCard || needyMeds || drugInfo;
    insertTarget.parentNode.insertBefore(card, insertTarget.nextSibling);
  }

  // ── Find drug by generic/brand name ──
  function findDrug(generic, brands) {
    var g = generic.toLowerCase();
    var brandList = brands ? brands.split(',').map(function (b) { return b.trim().toLowerCase(); }) : [];

    for (var key in partdDB.drugs) {
      var d = partdDB.drugs[key];
      var dg = (d.generic || '').toLowerCase();
      var db = (d.brand || '').toLowerCase();

      if (dg === g) return key;
      if (g.indexOf(dg) !== -1 || dg.indexOf(g) !== -1) return key;

      for (var j = 0; j < brandList.length; j++) {
        if (db && (db.indexOf(brandList[j]) !== -1 || brandList[j].indexOf(db) !== -1)) return key;
      }
    }
    return null;
  }

  // ── Get tier summary across all formularies ──
  function getTierSummary(drugKey) {
    var tiers = {};
    var totalFormularies = 0;
    var coveredCount = 0;

    for (var fid in partdDB.formularies) {
      totalFormularies++;
      var drugs = partdDB.formularies[fid];
      if (drugs[drugKey]) {
        coveredCount++;
        var t = drugs[drugKey].tier;
        tiers[t] = (tiers[t] || 0) + 1;
      }
    }

    return {
      tiers: tiers,
      covered: coveredCount,
      total: totalFormularies,
      coverageRate: totalFormularies > 0 ? Math.round(coveredCount / totalFormularies * 100) : 0
    };
  }

  // ── Build the Part D card ──
  function buildCard(drugKey) {
    var drug = partdDB.drugs[drugKey];
    var summary = getTierSummary(drugKey);

    var card = document.createElement('div');
    card.id = cardId;

    // Tier names
    var tierNames = {1:'Preferred Generic',2:'Generic',3:'Preferred Brand',4:'Non-Preferred',5:'Specialty'};
    var tierColors = {1:'#1E8449',2:'#2874A6',3:'#E67E22',4:'#C0392B',5:'#6C3483'};

    // Most common tier
    var mostCommonTier = 1;
    var maxCount = 0;
    for (var t in summary.tiers) {
      if (summary.tiers[t] > maxCount) {
        maxCount = summary.tiers[t];
        mostCommonTier = parseInt(t);
      }
    }

    // Typical cost ranges by tier
    var costRanges = {1:'$0–5',2:'$5–15',3:'$20–50',4:'$50–100',5:'25–33%'};
    var costLabel = costRanges[mostCommonTier] || '$5–50';

    // Build tier breakdown
    var tierBars = '';
    for (var tier = 1; tier <= 5; tier++) {
      var count = summary.tiers[tier] || 0;
      if (count === 0) continue;
      var pct = Math.round(count / summary.total * 100);
      tierBars += '<div style="display:flex;align-items:center;gap:8px;margin:3px 0">' +
        '<span style="font-size:0.78rem;color:#5D6D7E;width:110px">Tier ' + tier + ' ' + tierNames[tier] + '</span>' +
        '<div style="flex:1;background:#EAECEE;border-radius:3px;height:14px;overflow:hidden">' +
          '<div style="width:' + pct + '%;background:' + tierColors[tier] + ';height:100%;border-radius:3px;min-width:2px"></div>' +
        '</div>' +
        '<span style="font-size:0.78rem;color:#5D6D7E;width:36px;text-align:right">' + pct + '%</span>' +
      '</div>';
    }

    var borderColor = summary.coverageRate >= 80 ? '#0C8080' : (summary.coverageRate >= 50 ? '#E67E22' : '#C0392B');

    card.innerHTML =
      '<div style="border:2px solid ' + borderColor + ';border-radius:10px;padding:16px 20px;margin:12px 0;background:#fff">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
          '<div>' +
            '<div style="font-weight:700;color:#0B3B5C;font-size:0.95rem">' +
              '<span style="color:' + borderColor + '">&#9830;</span> Medicare Part D Coverage' +
            '</div>' +
            '<div style="font-size:0.82rem;color:#5D6D7E;margin-top:2px">' +
              'Covered by <strong>' + summary.coverageRate + '%</strong> of Part D plans &bull; ' +
              'Most common: <strong style="color:' + tierColors[mostCommonTier] + '">Tier ' + mostCommonTier + '</strong> (' + tierNames[mostCommonTier] + ')' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:1.1rem;font-weight:700;color:' + tierColors[mostCommonTier] + '">' + costLabel + '</div>' +
            '<div style="font-size:0.72rem;color:#7F8C8D">typical copay/mo</div>' +
          '</div>' +
        '</div>' +
        '<div style="margin:10px 0">' + tierBars + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #EAECEE">' +
          '<a href="/part-d-optimizer" style="display:inline-block;background:#0C8080;color:#fff;padding:7px 18px;border-radius:6px;font-size:0.85rem;font-weight:600;text-decoration:none">Compare All Plans</a>' +
          '<span style="font-size:0.75rem;color:#AEB6BF">CMS PUF data &bull; July 2026</span>' +
        '</div>' +
      '</div>';

    return card;
  }

  // ── Inject Styles ──
  var style = document.createElement('style');
  style.textContent = '#rxg-partd-card{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}';
  document.head.appendChild(style);

})();
