# RxGator Search Upgrade — Integration Guide

## What's In This Package

```
rxgator-search-upgrade/
├── data/
│   ├── drug-names.json          # 130 drugs with generics, brands, aliases, misspellings (ES/EN)
│   └── brand-generic-map.json   # 248 brand/alias → generic lookup entries
├── client/
│   ├── rxgator-autocomplete.js  # Fuse.js-powered autocomplete dropdown
│   ├── rxgator-autocomplete.css # Autocomplete styles (mobile-first, dark mode)
│   ├── rxgator-generic-banner.js  # "Generic Available" banner component
│   └── rxgator-generic-banner.css # Banner styles (mobile-first, dark mode)
├── server/
│   └── fuzzy-search.js          # Server-side fuzzy matching + RxNorm API fallback
├── build-dictionary.js          # Script to rebuild the dictionary (run monthly)
└── INTEGRATION-GUIDE.md         # This file
```

## Step 1: Copy Files to Server

Via SSH, from your server's RxGator root (likely `/var/www/rxaggregator/`):

```bash
# Create directories
mkdir -p data public/js public/css

# Copy data files
cp data/drug-names.json /var/www/rxaggregator/data/
cp data/brand-generic-map.json /var/www/rxaggregator/data/

# Copy client files
cp client/rxgator-autocomplete.js /var/www/rxaggregator/public/js/
cp client/rxgator-autocomplete.css /var/www/rxaggregator/public/css/
cp client/rxgator-generic-banner.js /var/www/rxaggregator/public/js/
cp client/rxgator-generic-banner.css /var/www/rxaggregator/public/css/

# Copy server module
cp server/fuzzy-search.js /var/www/rxaggregator/
```

## Step 2: Add Fuse.js CDN to index.html

In the `<head>` section of `index.html`, add:

```html
<!-- Fuzzy search autocomplete -->
<link rel="stylesheet" href="/css/rxgator-autocomplete.css">
<link rel="stylesheet" href="/css/rxgator-generic-banner.css">
```

Before the closing `</body>` tag, add:

```html
<!-- Fuse.js CDN (8.6KB gzipped, MIT license) -->
<script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0"></script>

<!-- RxGator Search Enhancement -->
<script src="/js/rxgator-autocomplete.js"></script>
<script src="/js/rxgator-generic-banner.js"></script>

<script>
  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', async function() {
    // Initialize autocomplete on the search input
    // CHANGE 'drugSearch' to match your actual search input's ID
    await RxGatorAutocomplete.init('drugSearch');
    await RxGatorGenericBanner.init();
  });
</script>
```

**IMPORTANT:** Replace `'drugSearch'` with the actual `id` attribute of your search input element in index.html.

## Step 3: Wire Generic Banner Into Search Results

Find the place in your JavaScript where search results are rendered (likely in index.html's inline JS or a separate script). After results are displayed, add:

```javascript
// After your existing search results render code:
const brandInfo = RxGatorGenericBanner.check(searchQuery, 'resultsContainer');
// CHANGE 'resultsContainer' to match the ID of your results div

if (brandInfo) {
  console.log('Brand detected:', searchQuery, '→ Generic:', brandInfo.generic);
}
```

## Step 4: Wire Server-Side Fuzzy Search Into server.js

In `server.js`, add near the top with other requires:

```javascript
const fuzzySearch = require('./fuzzy-search');
fuzzySearch.init('./data');  // path to the directory containing drug-names.json
```

Then modify your search endpoint. Find the existing search handler (likely `app.get('/api/search', ...)` or similar) and add the resolution step BEFORE querying data sources:

```javascript
// BEFORE: directly using req.query.drug to search
// AFTER: resolve through fuzzy search first

app.get('/api/search', async (req, res) => {
  const rawQuery = req.query.drug || req.query.q || '';

  // Resolve the query — handles brand→generic, misspellings, and fuzzy matching
  const resolved = await fuzzySearch.resolve(rawQuery);

  // Use resolved.searchTerm instead of rawQuery for all data source queries
  const searchTerm = resolved.searchTerm;

  // Include resolution info in the response so the frontend can show the banner
  // Add this to your existing response object:
  // resolved.brandInfo   → brand-to-generic info for the banner
  // resolved.corrected   → true if spelling was auto-corrected
  // resolved.original    → the original query before correction
  // resolved.suggestions → alternative suggestions

  // ... your existing data source query code, using searchTerm ...
});
```

Add the new suggestion endpoint:

```javascript
// New endpoint for "Did you mean?" suggestions
app.get('/api/suggest', async (req, res) => {
  const query = req.query.q || '';
  const suggestions = await fuzzySearch.getSuggestions(query);
  res.json({ query, suggestions });
});
```

## Step 5: Serve Data Files (if not already)

Make sure your Express/Node server serves the data files. In `server.js`:

```javascript
// Serve data files for client-side autocomplete
app.use('/data', express.static(path.join(__dirname, 'data')));
```

## Step 6: Test

1. **Autocomplete test:** Type "ator" in the search box → should see "Atorvastatin (Lipitor) — Cholesterol"
2. **Misspelling test:** Type "metforman" → should see "Metformin (Glucophage) — Diabetes"
3. **Brand test:** Search for "Lipitor" → should see the green "Generic Available" banner
4. **HCTZ test:** Type "HCTZ" → should see "Hydrochlorothiazide (Microzide) — Blood pressure"
5. **API fallback:** Type a very obscure drug name → should hit RxNorm API and return suggestions
6. **Spanish test:** Toggle to Spanish, search for "Lipitor" → banner should show in Spanish

## Monthly Maintenance

Run `build-dictionary.js` monthly to update the dictionary with any new drugs from RxNorm:

```bash
cd /var/www/rxaggregator
node build-dictionary.js
```

Also review server search logs monthly for failed searches — add new misspellings to the dictionary.

## Files Overview

| File | Size | Purpose |
|------|------|---------|
| drug-names.json | ~65 KB | Full drug dictionary with 130 entries |
| brand-generic-map.json | ~12 KB | Quick brand→generic lookup (248 entries) |
| rxgator-autocomplete.js | ~8 KB | Client-side Fuse.js autocomplete |
| rxgator-autocomplete.css | ~3 KB | Autocomplete styles |
| rxgator-generic-banner.js | ~5 KB | Generic Available banner |
| rxgator-generic-banner.css | ~3 KB | Banner styles |
| fuzzy-search.js | ~8 KB | Server-side fuzzy matching module |
| Fuse.js (CDN) | ~8.6 KB | External dependency (loaded from CDN) |

**Total footprint:** ~105 KB client-side (including Fuse.js), ~73 KB server-side data.
All dependencies are free. Zero ongoing API costs.
