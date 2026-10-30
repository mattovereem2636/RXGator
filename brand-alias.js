/**
 * brand-alias.js
 *
 * Maps a brand-only generic name to its brand name so price caches keyed by
 * brand can be found.
 *
 * WHY: for brand-only drugs (dictionary hasGeneric === false) the search
 * resolves to the generic name (e.g. "vibegron") via RxNorm, but the
 * SingleCare, GoodRx, and RxSaver caches key these drugs by brand name
 * (e.g. "gemtesa"). The exact-match lookup missed, so searches logged zero
 * source hits even though pricing existed.
 *
 * SAFETY: an alias is created only when the dictionary entry has
 * hasGeneric === false AND exactly one brand. Multi-brand drugs
 * (e.g. semaglutide) and drugs with a real generic are never aliased, so a
 * search cannot return the wrong product's price.
 *
 * The index loads once, on first use. Restart the app after dictionary changes.
 */
const fs = require('fs');
const path = require('path');

const NAMES_PATH = path.join(__dirname, 'data', 'drug-names.json');

let aliasIndex = null;
let nameIndex = {};   // 1.5.4: any dictionary name (generic, brand, alias) -> its generic

/** Build the generic -> brand index from data/drug-names.json. */
function buildIndex() {
  aliasIndex = {};
  nameIndex = {};
  try {
    const entries = JSON.parse(fs.readFileSync(NAMES_PATH, 'utf8'));
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const g = String(entry.generic || '').toLowerCase().trim();
      for (const raw of [entry.generic].concat(entry.brands || [], entry.aliases || [])) {
        const n = String(raw || '').toLowerCase().trim();
        if (n && g) nameIndex[n] = nameIndex[n] || g;
      }
      if (entry.hasGeneric !== false) continue;
      if (!Array.isArray(entry.brands) || entry.brands.length !== 1) continue;
      const generic = String(entry.generic || '').toLowerCase().trim();
      const brand = String(entry.brands[0] || '').toLowerCase().trim();
      if (generic && brand && generic !== brand) aliasIndex[generic] = brand;
    }
  } catch (err) {
    console.error('[BrandAlias] Could not load ' + NAMES_PATH + ': ' + err.message + ' at ' + new Date().toISOString());
  }
}

/**
 * @param {string} name - A drug name (generic or brand).
 * @returns {string|null} The lowercase brand name for a brand-only generic, else null.
 */
function brandAliasFor(name) {
  if (!aliasIndex) buildIndex();
  const key = String(name || '').toLowerCase().trim();
  return aliasIndex[key] || null;
}

/**
 * Pick the cache key to read: the direct key when present, else the brand alias when present.
 * @param {string} name - Drug name being searched.
 * @param {object} cache - A cache object keyed by lowercase drug name.
 * @returns {string} The key to use (the direct key when nothing better exists).
 */
function resolveCacheKey(name, cache) {
  const key = String(name || '').toLowerCase().trim();
  if (cache[key]) return key;
  const alias = brandAliasFor(key);
  return alias && cache[alias] ? alias : key;
}

/**
 * 1.5.4: pick the cache key, trying the name the user typed first.
 * WHY: "Myfembree" resolves to the generic relugolix, and the relugolix alias is Orgovyx, a different
 * product. The typed name finds the right entry. The alias is skipped when the typed name is a
 * dictionary name of a different drug, so one brand can never show another brand's price.
 * @param {string} resolvedName - The resolved (usually generic) name.
 * @param {string} typedName - The name the user typed, after spelling correction.
 * @param {object} cache - A cache object keyed by lowercase drug name.
 * @returns {string} The key to read (may not exist in the cache).
 */
function resolveTypedCacheKey(resolvedName, typedName, cache) {
  if (!aliasIndex) buildIndex();
  const typed = String(typedName || '').toLowerCase().trim();
  if (typed && cache[typed]) return typed;
  const key = String(resolvedName || '').toLowerCase().trim();
  if (cache[key]) return key;
  const alias = brandAliasFor(key);
  if (!alias || !cache[alias]) return key;
  const typedGeneric = nameIndex[typed];
  if (typed && typed !== alias && typedGeneric && typedGeneric !== key) return key;
  return alias;
}

module.exports = { brandAliasFor, resolveCacheKey, resolveTypedCacheKey };
