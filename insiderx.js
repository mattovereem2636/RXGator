/**
 * insiderx.js — RxGator cache module for Inside Rx (Source #22)
 *
 * Inside Rx is owned by Express Scripts Strategic Development, Inc. and is
 * that PBM's only public-facing consumer price surface (express-scripts.com
 * itself is entirely behind a member login).
 *
 * Follows the same pattern as blink.js and rxsaver.js:
 *   - Loads insiderx_cache.json at startup
 *   - Builds a search index keyed on normalized drug names
 *   - Exposes search(drugName) and stats() functions
 *   - Results pushed into allPrices array as consumer-actionable prices
 *
 * NOTE ON ACQUISITION: unlike RxSaver, Inside Rx's per-pharmacy price list
 * is not present in the initial page HTML — it loads client-side after a
 * ZIP/location is set (confirmed by direct inspection of
 * insiderx.com/drugs/{slug}/savings-card). Populate insiderx_cache.json via
 * a headless-browser Apify actor (Puppeteer/Playwright), the same pattern
 * already used for blink_cache.json — not a plain HTTP scrape.
 *
 * Deploy to: /var/www/rxaggregator/insiderx.js
 * Cache at:  /var/www/rxaggregator/data/insiderx_cache.json
 */

const fs = require('fs');
const path = require('path');

// --- Load cache ---
const CACHE_PATH = path.join(__dirname, 'data', 'insiderx_cache.json');
let cache = null;
let searchIndex = new Map();

function loadCache() {
    try {
        const raw = fs.readFileSync(CACHE_PATH, 'utf8');
        cache = JSON.parse(raw);

        // Build search index: multiple keys per drug for fuzzy matching
        searchIndex.clear();
        for (const [slug, drug] of Object.entries(cache.drugs)) {
            if (!drug || !drug.name) continue;
            // Index by slug (e.g., "lisinopril", "atorvastatin-calcium")
            searchIndex.set(slug.toLowerCase(), drug);

            // Index by cleaned name (e.g., "lisinopril", "atorvastatin calcium")
            const cleanName = drug.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            searchIndex.set(cleanName, drug);

            // Index by name with hyphens replaced by spaces
            const dehyphenated = slug.replace(/-/g, ' ');
            if (dehyphenated !== slug) {
                searchIndex.set(dehyphenated, drug);
            }

            // Index by first word only (for drugs like "atorvastatin-calcium" → search "atorvastatin")
            const firstWord = slug.split('-')[0];
            if (firstWord.length >= 4 && !searchIndex.has(firstWord)) {
                searchIndex.set(firstWord, drug);
            }
        }

        console.log(`[InsideRx] Loaded ${cache.drugCount} drugs, ${cache.priceCount} prices (cached ${cache.generatedAt})`);
    } catch (err) {
        console.error(`[InsideRx] Failed to load cache: ${err.message}`);
        cache = null;
    }
}

// Load on startup
loadCache();

/**
 * Search for a drug by name.
 *
 * @param {string} drugName - The drug to search for (e.g., "lisinopril", "Atorvastatin")
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
        // Try slug form (spaces → hyphens)
        drug = searchIndex.get(query.replace(/\s+/g, '-'));
    }
    if (!drug) {
        // Try first word match
        const firstWord = query.split(/\s+/)[0];
        if (firstWord.length >= 4) {
            drug = searchIndex.get(firstWord);
        }
    }

    if (!drug) return null;

    // Return all pharmacy prices as individual result entries
    // Each goes into the allPrices array in search-handler.js
    return drug.prices.map(p => ({
        source: 'Inside Rx',
        sourceUrl: drug.url,
        drugName: drug.name,
        strength: drug.strength,
        form: drug.form,
        quantity: drug.quantity,
        pharmacy: p.pharmacy,
        price: p.price,
        priceFormatted: '$' + p.price.toFixed(2),
        type: 'discount card',
        // Static, nationwide — same for every drug/pharmacy. Not per-price data,
        // but carried on each result so the "How do I get this price?" guide
        // can render the card numbers without a second lookup.
        cardBin: cache.cardInfo ? cache.cardInfo.bin : null,
        cardPcn: cache.cardInfo ? cache.cardInfo.pcn : null,
        cardGroup: cache.cardInfo ? cache.cardInfo.group : null,
        cached: true,
        cachedDate: drug.scrapedAt || cache.generatedAt
    }));
}

/**
 * Return cache stats for the /api/insiderx/cache endpoint (if added).
 */
function stats() {
    if (!cache) {
        return { loaded: false, error: 'Cache not loaded' };
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
 * Return the full cache for the /api/insiderx/cache?full=true endpoint (if added).
 */
function fullCache() {
    return cache;
}

/**
 * Reload the cache from disk (useful after SCP-ing a new file).
 */
function reload() {
    loadCache();
    return stats();
}

module.exports = { search, stats, fullCache, reload };
