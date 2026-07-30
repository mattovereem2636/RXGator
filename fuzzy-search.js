/**
 * RxGator Server-Side Fuzzy Search Module
 * Provides brand-to-generic resolution and RxNorm approximate matching fallback
 *
 * INTEGRATION into server.js:
 *   const fuzzySearch = require('./fuzzy-search');
 *   fuzzySearch.init();  // loads the JSON data files
 *
 *   // In your search endpoint handler:
 *   app.get('/api/search', async (req, res) => {
 *     const query = req.query.drug || req.query.q || '';
 *     const resolved = await fuzzySearch.resolve(query);
 *     // resolved.searchTerm    = the name to search data sources with
 *     // resolved.isGeneric     = whether the resolved term is generic
 *     // resolved.brandInfo     = { generic, drugClass, primaryUse } if brand was detected
 *     // resolved.suggestions   = ['term1', 'term2'] if fuzzy match was needed
 *     // resolved.corrected     = true if the term was auto-corrected
 *     // resolved.original      = the original query before correction
 *     // Then pass resolved.searchTerm to your existing data source queries
 *   });
 *
 *   // New API endpoint for "Did you mean?" from client
 *   app.get('/api/suggest', async (req, res) => {
 *     const query = req.query.q || '';
 *     const suggestions = await fuzzySearch.getSuggestions(query);
 *     res.json(suggestions);
 *   });
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const FuzzySearch = {
  drugNames: [],       // Full drug dictionary
  brandMap: {},        // Brand-to-generic quick lookup
  genericSet: null,    // Set of all known generic names for fast lookup
  cache: new Map(),    // LRU cache for RxNorm API responses
  cacheMaxSize: 500,
  initialized: false,

  /**
   * Initialize — load data files
   * @param {string} dataDir - Path to the data directory containing drug-names.json and brand-generic-map.json
   */
  init: function(dataDir) {
    dataDir = dataDir || path.join(__dirname, 'data');

    try {
      const namesPath = path.join(dataDir, 'drug-names.json');
      const brandPath = path.join(dataDir, 'brand-generic-map.json');

      this.drugNames = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
      this.brandMap = JSON.parse(fs.readFileSync(brandPath, 'utf8'));

      // Build a set of known generic names for fast exact matching
      this.genericSet = new Set(this.drugNames.map(d => d.generic.toLowerCase()));

      // Also add all brand names and aliases to a combined lookup
      this.allKnownNames = new Set();
      this.drugNames.forEach(d => {
        this.allKnownNames.add(d.generic.toLowerCase());
        d.brands.forEach(b => this.allKnownNames.add(b.toLowerCase()));
        d.aliases.forEach(a => this.allKnownNames.add(a.toLowerCase()));
        d.commonMisspellings.forEach(m => this.allKnownNames.add(m.toLowerCase()));
      });

      this.initialized = true;
      console.log(`[FuzzySearch] Loaded ${this.drugNames.length} drugs, ${Object.keys(this.brandMap).length} brand mappings`);
    } catch (e) {
      console.error('[FuzzySearch] Failed to load data files:', e.message);
      console.error('[FuzzySearch] Make sure drug-names.json and brand-generic-map.json are in:', dataDir);
    }
  },

  /**
   * Main resolution function — call this on every search query
   * @param {string} query - Raw user input
   * @returns {object} - { searchTerm, isGeneric, brandInfo, suggestions, corrected, original }
   */
  resolve: async function(query) {
    if (!this.initialized) {
      console.warn('[FuzzySearch] Not initialized, returning raw query');
      return { searchTerm: query, isGeneric: true, brandInfo: null, suggestions: [], corrected: false, original: query };
    }

    const normalized = query.toLowerCase().trim();
    const result = {
      searchTerm: query,
      isGeneric: true,
      brandInfo: null,
      suggestions: [],
      corrected: false,
      original: query,
    };

    // Step 1: Check if it's a known generic name (exact match)
    if (this.genericSet.has(normalized)) {
      result.searchTerm = normalized;
      result.isGeneric = true;
      return result;
    }

    // Step 2: Check if it's a known brand name
    if (this.brandMap[normalized]) {
      const brand = this.brandMap[normalized];
      result.searchTerm = brand.generic;
      result.isGeneric = false;
      result.brandInfo = brand;
      return result;
    }

    // Step 3: Check against misspellings in the dictionary
    const misspellingMatch = this._checkMisspellings(normalized);
    if (misspellingMatch) {
      result.searchTerm = misspellingMatch.generic;
      result.corrected = true;
      result.isGeneric = true;
      // Also check if the original was a brand misspelling
      const brandCheck = this._findDrugByMisspelling(normalized);
      if (brandCheck) {
        result.brandInfo = {
          generic: brandCheck.generic,
          drugClass: brandCheck.drugClass,
          primaryUse: brandCheck.primaryUse,
        };
      }
      return result;
    }

    // Step 4: Simple Levenshtein distance check against known names
    const levenshteinMatch = this._levenshteinSearch(normalized);
    if (levenshteinMatch) {
      result.searchTerm = levenshteinMatch.generic;
      result.corrected = true;
      result.suggestions = [levenshteinMatch.generic];
      return result;
    }

    // Step 5: Fall back to RxNorm approximate matching API
    try {
      const rxnormResults = await this._rxnormApproximateMatch(normalized);
      if (rxnormResults && rxnormResults.length > 0) {
        // Use the top result as the search term
        result.searchTerm = rxnormResults[0].toLowerCase();
        result.corrected = true;
        result.suggestions = rxnormResults.slice(0, 5);
        return result;
      }
    } catch (e) {
      console.warn('[FuzzySearch] RxNorm API fallback failed:', e.message);
    }

    // Nothing matched — return the original query and let data sources try
    return result;
  },

  /**
   * Get spelling suggestions for a query (for the "Did you mean?" endpoint)
   * @param {string} query
   * @returns {Array} - Array of suggestion strings
   */
  getSuggestions: async function(query) {
    if (!this.initialized) return [];
    const normalized = query.toLowerCase().trim();

    const suggestions = [];

    // Check misspellings
    const misspellingMatch = this._checkMisspellings(normalized);
    if (misspellingMatch) {
      suggestions.push(misspellingMatch.generic);
    }

    // Check Levenshtein
    const levMatches = this._levenshteinSearchMultiple(normalized, 3);
    levMatches.forEach(m => {
      if (!suggestions.includes(m.generic)) {
        suggestions.push(m.generic);
      }
    });

    // If still nothing, try RxNorm
    if (suggestions.length === 0) {
      try {
        const rxnormResults = await this._rxnormApproximateMatch(normalized);
        if (rxnormResults) {
          rxnormResults.forEach(r => {
            if (!suggestions.includes(r.toLowerCase())) {
              suggestions.push(r.toLowerCase());
            }
          });
        }
      } catch (e) {
        // Silently fail — no suggestions available
      }
    }

    return suggestions.slice(0, 5);
  },

  /**
   * Check if a query matches any known misspelling
   */
  _checkMisspellings: function(query) {
    for (const drug of this.drugNames) {
      if (drug.commonMisspellings.includes(query)) {
        return drug;
      }
      // Also check aliases
      if (drug.aliases.includes(query)) {
        return drug;
      }
    }
    return null;
  },

  /**
   * Find the drug entry that contains a misspelling
   */
  _findDrugByMisspelling: function(query) {
    for (const drug of this.drugNames) {
      if (drug.commonMisspellings.includes(query) || drug.aliases.includes(query)) {
        return drug;
      }
    }
    return null;
  },

  /**
   * Levenshtein distance calculation
   */
  _levenshtein: function(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  },

  /**
   * Search by Levenshtein distance — find closest match
   */
  _levenshteinSearch: function(query) {
    let bestMatch = null;
    let bestDistance = Infinity;

    // Max distance scales with query length: short words need closer match
    const maxDistance = query.length <= 5 ? 1 : query.length <= 8 ? 2 : 3;

    for (const drug of this.drugNames) {
      const dist = this._levenshtein(query, drug.generic);
      if (dist < bestDistance && dist <= maxDistance) {
        bestDistance = dist;
        bestMatch = drug;
      }

      // Also check brands
      for (const brand of drug.brands) {
        const bDist = this._levenshtein(query, brand.toLowerCase());
        if (bDist < bestDistance && bDist <= maxDistance) {
          bestDistance = bDist;
          bestMatch = drug;
        }
      }
    }

    return bestMatch;
  },

  /**
   * Search by Levenshtein distance — return top N matches
   */
  _levenshteinSearchMultiple: function(query, n) {
    const matches = [];
    const maxDistance = query.length <= 5 ? 2 : query.length <= 8 ? 3 : 4;

    for (const drug of this.drugNames) {
      const dist = this._levenshtein(query, drug.generic);
      if (dist <= maxDistance) {
        matches.push({ drug, distance: dist, generic: drug.generic });
      }

      for (const brand of drug.brands) {
        const bDist = this._levenshtein(query, brand.toLowerCase());
        if (bDist <= maxDistance) {
          matches.push({ drug, distance: bDist, generic: drug.generic });
        }
      }
    }

    // Sort by distance, take top N, deduplicate
    matches.sort((a, b) => a.distance - b.distance);
    const seen = new Set();
    return matches.filter(m => {
      if (seen.has(m.generic)) return false;
      seen.add(m.generic);
      return true;
    }).slice(0, n);
  },

  /**
   * Call the RxNorm getApproximateMatch API
   * Free, no API key needed, maintained by NLM/NIH
   */
  _rxnormApproximateMatch: function(query) {
    // Check cache first
    if (this.cache.has(query)) {
      return Promise.resolve(this.cache.get(query));
    }

    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=5`;

    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const candidates = [];

            if (parsed.approximateGroup && parsed.approximateGroup.candidate) {
              parsed.approximateGroup.candidate.forEach(c => {
                if (c.rxcui && c.name) {
                  // Extract just the ingredient name (first word before any dose info)
                  const name = c.name.split(' ')[0];
                  if (!candidates.includes(name) && name.length > 2) {
                    candidates.push(name);
                  }
                }
              });
            }

            // Cache the result
            if (this.cache.size >= this.cacheMaxSize) {
              // Remove oldest entry
              const firstKey = this.cache.keys().next().value;
              this.cache.delete(firstKey);
            }
            this.cache.set(query, candidates);

            resolve(candidates);
          } catch (e) {
            reject(new Error('Failed to parse RxNorm response'));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('RxNorm API timeout'));
      });
    });
  },

  /**
   * Get brand info for a drug name (for banner display on server-rendered pages)
   * @param {string} query
   * @returns {object|null}
   */
  getBrandInfo: function(query) {
    if (!this.initialized || !query) return null;
    return this.brandMap[query.toLowerCase().trim()] || null;
  },

  /**
   * Get stats about the dictionary
   */
  stats: function() {
    return {
      totalDrugs: this.drugNames.length,
      totalBrandMappings: Object.keys(this.brandMap).length,
      cacheSize: this.cache.size,
      initialized: this.initialized,
    };
  },
};

module.exports = FuzzySearch;
