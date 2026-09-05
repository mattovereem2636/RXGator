/**
 * My Medications — client-side saved medication list with combined cost estimate
 * Stores data in localStorage. No backend required.
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'rxgator_my_meds';
  const MAX_MEDS = 20;

  // ---- Data layer ----
  function getMeds() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  function saveMeds(meds) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
    updateBadge();
    if (document.getElementById('myMedsPanel')?.classList.contains('open')) {
      renderPanel();
    }
  }

  function addMed(med) {
    const meds = getMeds();
    // Dedupe by drug name (case-insensitive)
    const key = med.drugName.toLowerCase().trim();
    const idx = meds.findIndex(m => m.drugName.toLowerCase().trim() === key);
    if (idx >= 0) {
      meds[idx] = med; // Update existing
    } else {
      if (meds.length >= MAX_MEDS) {
        alert(typeof currentLang !== 'undefined' && currentLang === 'es'
          ? `Puede guardar hasta ${MAX_MEDS} medicamentos.`
          : `You can save up to ${MAX_MEDS} medications.`);
        return false;
      }
      meds.push(med);
    }
    saveMeds(meds);
    return true;
  }

  function removeMed(drugName) {
    const meds = getMeds().filter(m => m.drugName.toLowerCase().trim() !== drugName.toLowerCase().trim());
    saveMeds(meds);
  }

  function isSaved(drugName) {
    return getMeds().some(m => m.drugName.toLowerCase().trim() === drugName.toLowerCase().trim());
  }

  // ---- i18n helpers ----
  function isEs() {
    return typeof currentLang !== 'undefined' && currentLang === 'es';
  }

  const labels = {
    myMeds: { en: 'My Medications', es: 'Mis Medicamentos' },
    save: { en: 'Save to My Meds', es: 'Guardar en Mis Meds' },
    saved: { en: 'Saved', es: 'Guardado' },
    remove: { en: 'Remove', es: 'Eliminar' },
    monthlyCost: { en: 'Est. Monthly Cost', es: 'Costo Mensual Est.' },
    annualCost: { en: 'Est. Annual Cost', es: 'Costo Anual Est.' },
    bestPrice: { en: 'best price', es: 'mejor precio' },
    source: { en: 'Source', es: 'Fuente' },
    empty: { en: 'No medications saved yet. Search for a drug and click "Save to My Meds" to start tracking your costs.',
             es: 'No tiene medicamentos guardados. Busque un medicamento y haga clic en "Guardar en Mis Meds" para comenzar.' },
    clearAll: { en: 'Clear All', es: 'Borrar Todo' },
    perMonth: { en: '/month', es: '/mes' },
    perYear: { en: '/year', es: '/año' },
    searchNow: { en: 'Search prices', es: 'Buscar precios' },
    dataNote: { en: 'Prices shown are the lowest found at time of search. Actual prices may vary.',
                es: 'Los precios mostrados son los más bajos encontrados al momento de la búsqueda. Los precios reales pueden variar.' },
    printList: { en: 'Print List', es: 'Imprimir Lista' },
  };

  function l(key) {
    const pair = labels[key];
    return pair ? (isEs() ? pair.es : pair.en) : key;
  }

  // ---- Badge ----
  function updateBadge() {
    const badge = document.getElementById('myMedsBadge');
    if (!badge) return;
    const count = getMeds().length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  // ---- Floating button + panel injection ----
  function injectUI() {
    // Floating button
    const fab = document.createElement('div');
    fab.id = 'myMedsFab';
    fab.setAttribute('role', 'button');
    fab.setAttribute('aria-label', 'My Medications');
    fab.setAttribute('tabindex', '0');
    fab.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2"/>
        <line x1="12" y1="10" x2="12" y2="16"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none"/>
      </svg>
      <span id="myMedsBadge" style="display:none;">0</span>
    `;
    fab.addEventListener('click', togglePanel);
    fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); }});
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'myMedsPanel';
    panel.innerHTML = `
      <div class="mmp-header">
        <h3 id="myMedsTitle">${l('myMeds')}</h3>
        <button class="mmp-close" onclick="document.getElementById('myMedsPanel').classList.remove('open')" aria-label="Close">&times;</button>
      </div>
      <div id="myMedsContent"></div>
    `;
    document.body.appendChild(panel);

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #myMedsFab {
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, #0C8080, #0B3B5C);
        color: #fff; display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #myMedsFab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
      #myMedsBadge {
        position: absolute; top: -4px; right: -4px;
        min-width: 20px; height: 20px; border-radius: 10px;
        background: #C0392B; color: #fff; font-size: 0.72rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center; padding: 0 5px;
      }

      #myMedsPanel {
        position: fixed; top: 0; right: -420px; z-index: 10000;
        width: 400px; max-width: 95vw; height: 100vh;
        background: #fff; box-shadow: -4px 0 24px rgba(0,0,0,0.15);
        transition: right 0.3s ease; overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #myMedsPanel.open { right: 0; }

      .mmp-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1rem 1.25rem; background: linear-gradient(135deg, #0C8080, #0B3B5C);
        color: #fff; position: sticky; top: 0; z-index: 1;
      }
      .mmp-header h3 { margin: 0; font-size: 1.1rem; }
      .mmp-close {
        background: none; border: none; color: #fff; font-size: 1.5rem;
        cursor: pointer; padding: 0 0.3rem; line-height: 1;
      }

      .mmp-summary {
        background: #D5F5E3; padding: 1rem 1.25rem; border-bottom: 1px solid #A9DFBF;
      }
      .mmp-total { font-size: 1.6rem; font-weight: 700; color: #145A32; }
      .mmp-annual { font-size: 0.9rem; color: #1E8449; margin-top: 0.25rem; }
      .mmp-note { font-size: 0.78rem; color: #5D6D7E; margin-top: 0.5rem; font-style: italic; }

      .mmp-med {
        display: flex; justify-content: space-between; align-items: center;
        padding: 0.85rem 1.25rem; border-bottom: 1px solid #ECF0F1;
        transition: background 0.15s;
      }
      .mmp-med:hover { background: #F8F9F9; }
      .mmp-med-info { flex: 1; }
      .mmp-med-name { font-weight: 600; color: #2C3E50; font-size: 0.95rem; }
      .mmp-med-detail { font-size: 0.82rem; color: #5D6D7E; margin-top: 0.15rem; }
      .mmp-med-price { text-align: right; min-width: 80px; }
      .mmp-med-price .big { font-size: 1.1rem; font-weight: 700; color: #1E8449; }
      .mmp-med-price .src { font-size: 0.72rem; color: #7F8C8D; }

      .mmp-remove {
        background: none; border: none; color: #C0392B; font-size: 0.78rem;
        cursor: pointer; padding: 0.2rem 0.4rem; margin-left: 0.5rem;
        border-radius: 4px; transition: background 0.15s;
      }
      .mmp-remove:hover { background: #FDEDEC; }

      .mmp-empty {
        padding: 2rem 1.5rem; text-align: center; color: #7F8C8D; font-size: 0.92rem; line-height: 1.6;
      }

      .mmp-actions {
        padding: 0.75rem 1.25rem; display: flex; gap: 0.5rem; justify-content: flex-end;
        border-top: 1px solid #ECF0F1; position: sticky; bottom: 0; background: #fff;
      }
      .mmp-actions button {
        padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.82rem;
        font-weight: 600; cursor: pointer; border: 1px solid #AEB6BF;
        background: #fff; color: #2C3E50; transition: background 0.15s;
      }
      .mmp-actions button:hover { background: #F4F6F7; }
      .mmp-actions .mmp-clear { color: #C0392B; border-color: #E6B0AA; }
      .mmp-actions .mmp-clear:hover { background: #FDEDEC; }

      .mmp-search-link {
        display: inline-block; margin-top: 0.3rem; font-size: 0.78rem;
        color: #0C8080; text-decoration: none; font-weight: 600;
      }
      .mmp-search-link:hover { text-decoration: underline; }

      /* Save button in results */
      .save-med-btn {
        padding: 0.4rem 1rem; background: #0C8080; color: #fff;
        border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 600;
        cursor: pointer; transition: background 0.15s;
      }
      .save-med-btn:hover { background: #0a6e6e; }
      .save-med-btn.is-saved { background: #1E8449; }
      .save-med-btn.is-saved:hover { background: #C0392B; }

      @media (max-width: 600px) {
        #myMedsFab { bottom: 16px; right: 16px; width: 48px; height: 48px; }
        #myMedsFab svg { width: 20px; height: 20px; }
        #myMedsPanel { width: 100vw; }
      }
      @media print {
        #myMedsFab { display: none !important; }
        #myMedsPanel { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    updateBadge();
  }

  // ---- Panel rendering ----
  function renderPanel() {
    const content = document.getElementById('myMedsContent');
    const meds = getMeds();
    document.getElementById('myMedsTitle').textContent = l('myMeds');

    if (meds.length === 0) {
      content.innerHTML = `<div class="mmp-empty">${l('empty')}</div>`;
      return;
    }

    let monthlyTotal = 0;
    meds.forEach(m => { if (m.bestPrice) monthlyTotal += m.bestPrice; });

    let html = `
      <div class="mmp-summary">
        <div class="mmp-total">$${monthlyTotal.toFixed(2)}${l('perMonth')}</div>
        <div class="mmp-annual">$${(monthlyTotal * 12).toFixed(2)}${l('perYear')} ${l('annualCost').toLowerCase()}</div>
        <div class="mmp-note">${l('dataNote')}</div>
      </div>
    `;

    meds.forEach(m => {
      const searchUrl = `/?drug=${encodeURIComponent(m.drugName)}`;
      html += `
        <div class="mmp-med">
          <div class="mmp-med-info">
            <div class="mmp-med-name">${esc(m.drugName)}</div>
            <div class="mmp-med-detail">
              ${m.strength ? esc(m.strength) : ''}
              ${m.source ? ` &middot; ${esc(m.source)}` : ''}
              ${m.savedDate ? ` &middot; ${esc(m.savedDate)}` : ''}
            </div>
            <a href="${searchUrl}" class="mmp-search-link">${l('searchNow')} &rarr;</a>
          </div>
          <div class="mmp-med-price">
            ${m.bestPrice ? `<div class="big">$${m.bestPrice.toFixed(2)}</div>` : '<div class="big">--</div>'}
            <div class="src">${l('bestPrice')}</div>
          </div>
          <button class="mmp-remove" onclick="window._rxgRemoveMed('${esc(m.drugName)}')" title="${l('remove')}" aria-label="${l('remove')} ${esc(m.drugName)}">&times;</button>
        </div>
      `;
    });

    html += `
      <div class="mmp-actions">
        <button class="mmp-clear" onclick="window._rxgClearMeds()">${l('clearAll')}</button>
        <button onclick="window._rxgPrintMeds()">${l('printList')}</button>
      </div>
    `;

    content.innerHTML = html;
  }

  function togglePanel() {
    const panel = document.getElementById('myMedsPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      renderPanel();
    }
  }

  // ---- Public API for inline onclick handlers ----
  window._rxgRemoveMed = function(name) {
    removeMed(name);
    // Update save button if visible
    updateSaveButton(name);
  };

  window._rxgClearMeds = function() {
    const msg = isEs() ? '¿Borrar todos los medicamentos guardados?' : 'Clear all saved medications?';
    if (confirm(msg)) {
      saveMeds([]);
      // Update any visible save buttons
      document.querySelectorAll('.save-med-btn').forEach(btn => {
        btn.classList.remove('is-saved');
        btn.textContent = l('save');
      });
    }
  };

  window._rxgPrintMeds = function() {
    const meds = getMeds();
    if (meds.length === 0) return;
    let monthlyTotal = 0;
    meds.forEach(m => { if (m.bestPrice) monthlyTotal += m.bestPrice; });

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>My Medications - RxGator</title>
    <style>
      body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 2rem auto; color: #2C3E50; }
      h1 { color: #0B3B5C; font-size: 1.3rem; border-bottom: 2px solid #0C8080; padding-bottom: 0.5rem; }
      table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
      th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #0C8080; color: #0B3B5C; font-size: 0.85rem; }
      td { padding: 0.5rem; border-bottom: 1px solid #ECF0F1; font-size: 0.9rem; }
      .total { font-size: 1.1rem; font-weight: 700; color: #1E8449; margin: 1rem 0; }
      .note { font-size: 0.78rem; color: #7F8C8D; font-style: italic; }
      .footer { margin-top: 2rem; font-size: 0.75rem; color: #AEB6BF; }
    </style></head><body>
    <h1>My Medications — RxGator</h1>
    <table>
      <thead><tr><th>Medication</th><th>Details</th><th>Best Price</th><th>Source</th></tr></thead>
      <tbody>
        ${meds.map(m => `<tr>
          <td><strong>${esc(m.drugName)}</strong></td>
          <td>${m.strength || ''}</td>
          <td>${m.bestPrice ? '$' + m.bestPrice.toFixed(2) : '--'}</td>
          <td>${m.source || ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="total">Estimated Monthly Cost: $${monthlyTotal.toFixed(2)} &middot; Annual: $${(monthlyTotal * 12).toFixed(2)}</div>
    <p class="note">${l('dataNote')}</p>
    <div class="footer">Generated by RxGator (rxgator.info) on ${new Date().toLocaleDateString()}</div>
    </body></html>`);
    win.document.close();
    win.print();
  };

  // ---- Save button for search results ----
  // Called from renderResults to inject the save button
  window._rxgSaveMedButton = function(drugName, bestPrice, source, strength) {
    const alreadySaved = isSaved(drugName);
    const btnId = 'saveMedBtn_' + drugName.replace(/[^a-zA-Z0-9]/g, '_');
    return `<button id="${btnId}" class="save-med-btn${alreadySaved ? ' is-saved' : ''}"
      onclick="window._rxgToggleSave('${esc(drugName)}', ${bestPrice || 0}, '${esc(source || '')}', '${esc(strength || '')}')"
      >${alreadySaved ? l('saved') + ' ✓' : l('save')}</button>`;
  };

  window._rxgToggleSave = function(drugName, bestPrice, source, strength) {
    if (isSaved(drugName)) {
      removeMed(drugName);
      updateSaveButton(drugName);
    } else {
      const med = {
        drugName: drugName,
        bestPrice: bestPrice || null,
        source: source || '',
        strength: strength || '',
        savedDate: new Date().toLocaleDateString()
      };
      if (addMed(med)) {
        updateSaveButton(drugName);
      }
    }
  };

  function updateSaveButton(drugName) {
    const btnId = 'saveMedBtn_' + drugName.replace(/[^a-zA-Z0-9]/g, '_');
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const saved = isSaved(drugName);
    btn.classList.toggle('is-saved', saved);
    btn.textContent = saved ? l('saved') + ' ✓' : l('save');
  }

  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ---- Init ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();
