/**
 * optum.js — RxGator cache module for Optum Perks (Source #19)
 *
 * Follows the same pattern as blink.js and rxsaver.js:
 *   - Loads optum_cache.json at startup
 *   - Builds a search index keyed on normalized drug names
 *   - Exposes search(drugName), stats(), fullCache(), reload()
 *   - Results pushed into allPrices array as consumer-actionable prices
 *
 * Deploy to: /var/www/rxaggregator/optum.js
 * Cache at:  /var/www/rxaggregator/data/optum_cache.json
 */

const fs = require('fs');
const path = require('path');

// --- Load cache ---
const CACHE_PATH = path.join(__dirname, 'data', 'optum_cache.json');
let cache = null;
let searchIndex = new Map();

function loadCache() {
    try {
        const raw = fs.readFileSync(CACHE_PATH, 'utf8');
        cache = JSON.parse(raw);

        // Build search index: multiple keys per drug for fuzzy matching
        searchIndex.clear();
        for (const [slug, drug] of Object.entries(cache.drugs)) {
            // Index by slug (e.g., "metformin", "folic-acid")
            searchIndex.set(slug.toLowerCase(), drug);

            // Index by cleaned name
            const cleanName = drug.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            searchIndex.set(cleanName, drug);

            // Index by name with hyphens replaced by spaces
            const dehyphenated = slug.replace(/-/g, ' ');
            if (dehyphenated !== slug) {
                searchIndex.set(dehyphenated, drug);
            }

            // Index by first word (for multi-word drugs like "folic-acid" -> "folic")
            const firstWord = slug.split('-')[0];
            if (firstWord.length >= 4 && !searchIndex.has(firstWord)) {
                searchIndex.set(firstWord, drug);
            }
        }

        console.log(`[Optum] Loaded ${cache.drugCount} drugs, ${cache.priceCount} prices (cached ${cache.generatedAt})`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('[Optum] No cache file yet — run optum-scraper.js to populate');
        } else {
            console.error(`[Optum] Failed to load cache: ${err.message}`);
        }
        cache = null;
    }
}

// Load on startup
loadCache();

/**
 * Search for a drug by name.
 *
 * @param {string} drugName - The drug to search for (e.g., "metformin", "Sertraline")
 * @returns {Array|null} - Array of normalized result objects for allPrices, or null if not found
 */
function search(drugName) {
    if (!cache || !drugName) return null;

    // Normalize the search term
    const query = drugName.toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Try exact match first, then slug form, then first-word
    let drug = searchIndex.get(query);
    if (!drug) {
        drug = searchIndex.get(query.replace(/\s+/g, '-'));
    }
    if (!drug) {
        const firstWord = query.split(/\s+/)[0];
        if (firstWord.length >= 4) {
            drug = searchIndex.get(firstWord);
        }
    }

    if (!drug) return null;

    // Return all pharmacy prices as individual result entries
    return drug.prices.map(p => ({
        source: 'Optum Perks',
        sourceUrl: drug.url,
        drugName: drug.name,
        strength: drug.strength,
        form: drug.form,
        quantity: drug.quantity,
        pharmacy: p.pharmacy,
        price: p.price,
        priceFormatted: '$' + p.price.toFixed(2),
        type: p.type,     // "coupon"
        cached: true,
        cachedDate: cache.generatedAt
    }));
}

/**
 * Return cache stats for the /api/optum/cache endpoint.
 */
function stats() {
    if (!cache) {
        return { loaded: false, error: 'Cache not loaded — run optum-scraper.js first' };
    }
    return {
        loaded: true,
        source: cache.source,
        sourceUrl: cache.sourceUrl,
        drugCount: cache.drugCount,
        priceCount: cache.priceCount,
        generatedAt: cache.generatedAt,
        description: cache.description
    };
}

/**
 * Return the full cache for the /api/optum/cache?full=true endpoint.
 */
function fullCache() {
    return cache;
}

/**
 * Reload the cache from disk (useful after the scraper runs or after SCP).
 */
function reload() {
    loadCache();
    return stats();
}

module.exports = { search, stats, fullCache, reload };
