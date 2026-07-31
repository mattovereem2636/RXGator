/**
 * RxGator Fuzzy Autocomplete Module
 * Uses Fuse.js for client-side fuzzy matching of drug names
 *
 * INTEGRATION:
 *   1. Add <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0"></script> to index.html
 *   2. Add <script src="/js/rxgator-autocomplete.js"></script> after Fuse.js
 *   3. Load drug-names.json on page load (see init())
 *   4. Call RxGatorAutocomplete.init('your-search-input-id') after DOM ready
 */

(function(global) {
  'use strict';

  const RxGatorAutocomplete = {
    fuse: null,
    dictionary: [],
    brandMap: {},
    dropdownEl: null,
    inputEl: null,
    selectedIndex: -1,
    isOpen: false,
    debounceTimer: null,
    lang: 'en', // 'en' or 'es'

    /**
     * Initialize the autocomplete system
     * @param {string} inputId - ID of the search input element
     * @param {object} options - Optional overrides
     */
    init: async function(inputId, options = {}) {
      this.inputEl = document.getElementById(inputId);
      if (!this.inputEl) {
        console.error('[RxGator Autocomplete] Input element not found:', inputId);
        return;
      }

      // Detect language
      this.lang = document.documentElement.lang === 'es' ? 'es' : 'en';

      // Load the drug dictionary
      try {
        const response = await fetch('/data/drug-names.json');
        this.dictionary = await response.json();
        console.log(`[RxGator Autocomplete] Loaded ${this.dictionary.length} drugs`);
      } catch (e) {
        console.error('[RxGator Autocomplete] Failed to load dictionary:', e);
        return;
      }

      // Load brand-generic map
      try {
        const response = await fetch('/data/brand-generic-map.json');
        this.brandMap = await response.json();
        console.log(`[RxGator Autocomplete] Loaded ${Object.keys(this.brandMap).length} brand mappings`);
      } catch (e) {
        console.warn('[RxGator Autocomplete] Brand map not loaded, continuing without it');
      }

      // Build the Fuse.js search index
      // We flatten the dictionary so misspellings and aliases are searchable
      const searchableItems = [];
      this.dictionary.forEach(drug => {
        searchableItems.push({
          ...drug,
          searchTerms: [
            drug.generic,
            ...drug.brands,
            ...drug.aliases,
            ...drug.commonMisspellings
          ].join(' ')
        });
      });

      this.fuse = new Fuse(searchableItems, {
        keys: [
          { name: 'generic', weight: 0.4 },
          { name: 'brands', weight: 0.3 },
          { name: 'aliases', weight: 0.2 },
          { name: 'commonMisspellings', weight: 0.3 },
          { name: 'searchTerms', weight: 0.1 }
        ],
        threshold: 0.4,
        distance: 100,
        minMatchCharLength: 2,
        includeScore: true,
        shouldSort: true,
        isCaseSensitive: false,
        findAllMatches: false,
        ignoreLocation: true,
      });

      // Create the dropdown element
      this._createDropdown();

      // Attach event listeners
      this._attachListeners();

      console.log('[RxGator Autocomplete] Initialized successfully');
    },

    /**
     * Create the autocomplete dropdown DOM element
     */
    _createDropdown: function() {
      // Remove existing dropdown if any
      const existing = document.getElementById('rxgator-autocomplete-dropdown');
      if (existing) existing.remove();

      this.dropdownEl = document.createElement('div');
      this.dropdownEl.id = 'rxgator-autocomplete-dropdown';
      this.dropdownEl.className = 'rxgator-ac-dropdown';
      this.dropdownEl.style.display = 'none';
      this.dropdownEl.setAttribute('role', 'listbox');
      this.dropdownEl.setAttribute('aria-label',
        this.lang === 'es' ? 'Sugerencias de medicamentos' : 'Drug name suggestions'
      );

      // Position relative to the input
      this.inputEl.parentNode.style.position = 'relative';
      this.inputEl.parentNode.appendChild(this.dropdownEl);

      // Set ARIA attributes on input
      this.inputEl.setAttribute('role', 'combobox');
      this.inputEl.setAttribute('aria-autocomplete', 'list');
      this.inputEl.setAttribute('aria-expanded', 'false');
      this.inputEl.setAttribute('aria-controls', 'rxgator-autocomplete-dropdown');
    },

    /**
     * Attach input and keyboard event listeners
     */
    _attachListeners: function() {
      const self = this;

      // Input event — debounced fuzzy search
      this.inputEl.addEventListener('input', function(e) {
        clearTimeout(self.debounceTimer);
        self.debounceTimer = setTimeout(() => {
          self._onInput(e.target.value);
        }, 150);
      });

      // Keyboard navigation
      this.inputEl.addEventListener('keydown', function(e) {
        if (!self.isOpen) return;

        switch(e.key) {
          case 'ArrowDown':
            e.preventDefault();
            self._navigate(1);
            break;
          case 'ArrowUp':
            e.preventDefault();
            self._navigate(-1);
            break;
          case 'Enter':
            if (self.selectedIndex >= 0) {
              e.preventDefault();
              self._selectItem(self.selectedIndex);
            }
            break;
          case 'Escape':
            self._close();
            break;
        }
      });

      // Close on click outside
      document.addEventListener('click', function(e) {
        if (!self.inputEl.contains(e.target) && !self.dropdownEl.contains(e.target)) {
          self._close();
        }
      });

      // Close on focus out
      this.inputEl.addEventListener('blur', function() {
        // Delay to allow click on dropdown item
        setTimeout(() => self._close(), 200);
      });
    },

    /**
     * Handle input changes — run fuzzy search
     */
    _onInput: function(query) {
      if (!query || query.length < 2) {
        this._close();
        return;
      }

      const results = this.fuse.search(query, { limit: 8 });

      if (results.length === 0) {
        this._close();
        return;
      }

      this._renderResults(results, query);
      this._open();
    },

    /**
     * Render search results in the dropdown
     */
    _renderResults: function(results, query) {
      const self = this;
      this.dropdownEl.innerHTML = '';
      this.selectedIndex = -1;

      // On mobile, show fewer results
      const isMobile = window.innerWidth < 768;
      const maxResults = isMobile ? 5 : 8;
      const displayResults = results.slice(0, maxResults);

      displayResults.forEach((result, index) => {
        const drug = result.item;
        const item = document.createElement('div');
        item.className = 'rxgator-ac-item';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.dataset.index = index;

        // Build the display
        const genericName = this._capitalize(drug.generic);
        const brandName = drug.brands[0] || '';
        const useText = this.lang === 'es' ? (drug.primaryUseES || drug.primaryUse) : drug.primaryUse;

        item.innerHTML = `
          <div class="rxgator-ac-item-main">
            <span class="rxgator-ac-generic">${this._highlight(genericName, query)}</span>
            ${brandName ? `<span class="rxgator-ac-brand">(${this._highlight(brandName, query)})</span>` : ''}
          </div>
          <div class="rxgator-ac-item-meta">
            <span class="rxgator-ac-class">${drug.drugClass}</span>
            <span class="rxgator-ac-use">${useText}</span>
          </div>
        `;

        // Click handler
        item.addEventListener('mousedown', function(e) {
          e.preventDefault(); // Prevent blur
          self._selectItem(index);
        });

        // Hover handler
        item.addEventListener('mouseenter', function() {
          self._setActive(index);
        });

        this.dropdownEl.appendChild(item);
      });

      // Add "powered by" footer
      const footer = document.createElement('div');
      footer.className = 'rxgator-ac-footer';
      footer.textContent = this.lang === 'es'
        ? 'Búsqueda inteligente — nombres genéricos primero'
        : 'Smart search — generic names first';
      this.dropdownEl.appendChild(footer);
    },

    /**
     * Highlight matching characters in text
     */
    _highlight: function(text, query) {
      if (!query) return text;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return text.replace(regex, '<mark class="rxgator-ac-highlight">$1</mark>');
    },

    /**
     * Capitalize first letter
     */
    _capitalize: function(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Navigate up/down in the dropdown
     */
    _navigate: function(direction) {
      const items = this.dropdownEl.querySelectorAll('.rxgator-ac-item');
      if (items.length === 0) return;

      let newIndex = this.selectedIndex + direction;
      if (newIndex < 0) newIndex = items.length - 1;
      if (newIndex >= items.length) newIndex = 0;

      this._setActive(newIndex);
    },

    /**
     * Set an item as active/highlighted
     */
    _setActive: function(index) {
      const items = this.dropdownEl.querySelectorAll('.rxgator-ac-item');
      items.forEach((item, i) => {
        item.classList.toggle('rxgator-ac-active', i === index);
        item.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      this.selectedIndex = index;

      // Scroll into view if needed
      if (items[index]) {
        items[index].scrollIntoView({ block: 'nearest' });
      }
    },

    /**
     * Select an item — fill the search box and trigger search
     */
    _selectItem: function(index) {
      const items = this.dropdownEl.querySelectorAll('.rxgator-ac-item');
      if (index < 0 || index >= items.length) return;

      const results = this.fuse.search(this.inputEl.value, { limit: 8 });
      if (!results[index]) return;

      const drug = results[index].item;

      // Always search by generic name — this is the generic-first philosophy
      this.inputEl.value = this._capitalize(drug.generic);
      this.inputEl.dataset.autocompleted = '1'; // flag for search logging
      this._close();

      // Store the selected drug info for the generic banner
      this._lastSelectedDrug = drug;

      // Trigger the existing search form submission
      // Try common patterns — adjust to match RxGator's actual form/button
      const form = this.inputEl.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else {
        // Try triggering Enter key
        this.inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
      }
    },

    /**
     * Open the dropdown
     */
    _open: function() {
      this.dropdownEl.style.display = 'block';
      this.isOpen = true;
      this.inputEl.setAttribute('aria-expanded', 'true');
    },

    /**
     * Close the dropdown
     */
    _close: function() {
      this.dropdownEl.style.display = 'none';
      this.isOpen = false;
      this.selectedIndex = -1;
      this.inputEl.setAttribute('aria-expanded', 'false');
    },

    /**
     * Public: Look up a brand name and return generic info (for the banner)
     * @param {string} query - The search term
     * @returns {object|null} - { generic, drugClass, primaryUse, primaryUseES } or null
     */
    lookupBrandToGeneric: function(query) {
      if (!query) return null;
      const normalized = query.toLowerCase().trim();

      // Check direct brand map first
      if (this.brandMap[normalized]) {
        return this.brandMap[normalized];
      }

      // Check if the last autocomplete selection has brand info
      if (this._lastSelectedDrug) {
        const drug = this._lastSelectedDrug;
        const isBrandSearch = drug.brands.some(b => b.toLowerCase() === normalized) ||
                              drug.aliases.some(a => a.toLowerCase() === normalized);
        if (isBrandSearch) {
          return {
            generic: drug.generic,
            drugClass: drug.drugClass,
            primaryUse: drug.primaryUse,
            primaryUseES: drug.primaryUseES,
          };
        }
      }

      return null;
    },

    /**
     * Public: Run a fuzzy search and return results (for server-side use)
     * @param {string} query
     * @returns {Array} - Array of {generic, brands, score}
     */
    search: function(query) {
      if (!this.fuse) return [];
      return this.fuse.search(query, { limit: 5 }).map(r => ({
        generic: r.item.generic,
        brands: r.item.brands,
        score: r.score,
        drugClass: r.item.drugClass,
        primaryUse: r.item.primaryUse,
      }));
    },

    // Internal state
    _lastSelectedDrug: null,
  };

  // Export
  global.RxGatorAutocomplete = RxGatorAutocomplete;

})(typeof window !== 'undefined' ? window : global);
