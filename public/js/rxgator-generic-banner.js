/**
 * RxGator Generic Available Banner
 * Shows a prominent banner when a brand-name drug has a generic equivalent
 *
 * INTEGRATION:
 *   Call RxGatorGenericBanner.check(searchQuery, containerElementId) after search results load
 *   Requires brand-generic-map.json loaded (handled by autocomplete module, or load independently)
 */

(function(global) {
  'use strict';

  const RxGatorGenericBanner = {
    brandMap: null,
    lang: 'en',

    /**
     * Initialize — load brand map if not already loaded
     */
    init: async function() {
      this.lang = document.documentElement.lang === 'es' ? 'es' : 'en';

      // Use the autocomplete module's brandMap if available
      if (global.RxGatorAutocomplete && global.RxGatorAutocomplete.brandMap &&
          Object.keys(global.RxGatorAutocomplete.brandMap).length > 0) {
        this.brandMap = global.RxGatorAutocomplete.brandMap;
      } else {
        try {
          const response = await fetch('/data/brand-generic-map.json');
          this.brandMap = await response.json();
        } catch (e) {
          console.error('[RxGator Generic Banner] Failed to load brand map:', e);
          return;
        }
      }

      console.log('[RxGator Generic Banner] Initialized');
    },

    /**
     * Check if a search query is a brand name and show the banner
     * @param {string} query - The search query
     * @param {string} containerId - ID of the element to insert the banner before/into
     * @returns {object|null} - The generic info if found, null otherwise
     */
    check: function(query, containerId) {
      if (!this.brandMap || !query) return null;

      const normalized = query.toLowerCase().trim();
      const match = this.brandMap[normalized];

      // Remove any existing banner
      this._removeBanner();

      if (!match) return null;

      // Build and insert the banner
      this._showBanner(query, match, containerId);
      return match;
    },

    /**
     * Show the generic available banner
     */
    _showBanner: function(brandQuery, match, containerId) {
      const banner = document.createElement('div');
      banner.id = 'rxgator-generic-banner';
      banner.className = 'rxgator-gb';
      banner.setAttribute('role', 'alert');

      const genericCapitalized = match.generic.charAt(0).toUpperCase() + match.generic.slice(1);
      const brandCapitalized = brandQuery.charAt(0).toUpperCase() + brandQuery.slice(1);

      if (this.lang === 'es') {
        banner.innerHTML = `
          <div class="rxgator-gb-icon">💊</div>
          <div class="rxgator-gb-content">
            <div class="rxgator-gb-title">
              <span class="rxgator-gb-arrow">${brandCapitalized} → </span>
              <span class="rxgator-gb-generic-name">${genericCapitalized}</span>
              <span class="rxgator-gb-badge">Genérico disponible</span>
            </div>
            <div class="rxgator-gb-description">
              <strong>${genericCapitalized}</strong> es la versión genérica aprobada por la FDA de ${brandCapitalized}.
              Contiene el mismo ingrediente activo a la misma concentración y generalmente cuesta
              <span class="rxgator-gb-savings">80–95% menos</span>.
            </div>
            <div class="rxgator-gb-meta">
              <span class="rxgator-gb-class">${match.drugClass}</span>
              <span class="rxgator-gb-use">${match.primaryUseES || match.primaryUse}</span>
            </div>
            <div class="rxgator-gb-note">
              Los precios genéricos se muestran primero a continuación. Los precios de marca pueden estar disponibles de las mismas fuentes.
            </div>
          </div>
          <button class="rxgator-gb-close" aria-label="Cerrar" onclick="document.getElementById('rxgator-generic-banner').remove()">✕</button>
        `;
      } else {
        banner.innerHTML = `
          <div class="rxgator-gb-icon">💊</div>
          <div class="rxgator-gb-content">
            <div class="rxgator-gb-title">
              <span class="rxgator-gb-arrow">${brandCapitalized} → </span>
              <span class="rxgator-gb-generic-name">${genericCapitalized}</span>
              <span class="rxgator-gb-badge">Generic Available</span>
            </div>
            <div class="rxgator-gb-description">
              <strong>${genericCapitalized}</strong> is the FDA-approved generic version of ${brandCapitalized}.
              It contains the same active ingredient at the same strength and is typically
              <span class="rxgator-gb-savings">80–95% cheaper</span>.
            </div>
            <div class="rxgator-gb-meta">
              <span class="rxgator-gb-class">${match.drugClass}</span>
              <span class="rxgator-gb-use">${match.primaryUse}</span>
            </div>
            <div class="rxgator-gb-note">
              Generic prices are shown first below. Brand-name prices may also be available from the same sources.
            </div>
          </div>
          <button class="rxgator-gb-close" aria-label="Close" onclick="document.getElementById('rxgator-generic-banner').remove()">✕</button>
        `;
      }

      // Insert banner
      const container = document.getElementById(containerId);
      if (container) {
        container.insertBefore(banner, container.firstChild);
      } else {
        // Fallback: insert before the first results element
        const results = document.querySelector('.results, .price-cards, #results, #searchResults, [class*="result"]');
        if (results) {
          results.parentNode.insertBefore(banner, results);
        } else {
          document.body.appendChild(banner);
        }
      }

      // Animate in
      requestAnimationFrame(() => {
        banner.classList.add('rxgator-gb-visible');
      });
    },

    /**
     * Remove existing banner
     */
    _removeBanner: function() {
      const existing = document.getElementById('rxgator-generic-banner');
      if (existing) existing.remove();
    },

    /**
     * Check if a query is for a generic drug (not a brand name)
     * @param {string} query
     * @returns {boolean}
     */
    isGenericSearch: function(query) {
      if (!this.brandMap || !query) return true;
      return !this.brandMap[query.toLowerCase().trim()];
    },
  };

  global.RxGatorGenericBanner = RxGatorGenericBanner;

})(typeof window !== 'undefined' ? window : global);
