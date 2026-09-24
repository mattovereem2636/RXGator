// fix-rxsaver-wrapper.js
// Corrects a bug from add-gap-drugs.js: that script assumed rxsaver_cache.json
// was a flat object (no wrapper), but it actually has the same wrapper shape
// as blink_cache.json: { source, sourceUrl, description, generatedAt,
// drugCount, priceCount, drugs: { ...actual drug entries... } }.
//
// As a result, add-gap-drugs.js added "mounjaro" and "gemtesa" as top-level
// siblings of "drugs" instead of inside it. Nothing was lost — the original
// ~65-70 drugs inside cache.drugs were never touched — but the app almost
// certainly reads cache.drugs[name], so it can't see the 2 new entries yet.
//
// This script:
//   1. Reads the live file.
//   2. Pulls the misplaced top-level "mounjaro" / "gemtesa" entries (if
//      present) into cache.drugs.
//   3. Deletes the misplaced top-level copies.
//   4. Recomputes drugCount / priceCount from the real drugs object so the
//      metadata is accurate (rather than just adding 2, in case the true
//      starting count differs from what we assumed).
//   5. Backs up first, same as always.
//
// Usage: node fix-rxsaver-wrapper.js

const fs = require('fs');
const RXSAVER_CACHE_PATH = '/var/www/rxaggregator/data/rxsaver_cache.json';

function backup(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.replace(/\.json$/, `.bak-${stamp}.json`);
  fs.copyFileSync(path, backupPath);
  console.log(`  Backed up ${path} -> ${backupPath}`);
}

(() => {
  console.log('=== Fixing rxsaver_cache.json wrapper placement ===');
  backup(RXSAVER_CACHE_PATH);

  const cache = JSON.parse(fs.readFileSync(RXSAVER_CACHE_PATH, 'utf8'));

  if (typeof cache.drugs !== 'object' || cache.drugs === null) {
    console.error('FAILED: cache.drugs is not an object — schema is not what we expect. Aborting, no changes written.');
    console.error('Top-level keys found:', Object.keys(cache));
    process.exit(1);
  }

  const misplaced = ['mounjaro', 'gemtesa'];
  let movedCount = 0;
  for (const drug of misplaced) {
    if (Object.prototype.hasOwnProperty.call(cache, drug)) {
      console.log(`  Moving "${drug}" from top-level into cache.drugs`);
      cache.drugs[drug] = cache[drug];
      delete cache[drug];
      movedCount++;
    } else {
      console.log(`  "${drug}" not found at top level (already fixed, or never added) — skipping`);
    }
  }

  const realCount = Object.keys(cache.drugs).length;
  cache.drugCount = realCount;
  cache.priceCount = realCount; // matches blink_cache.json convention (1 price entry summary per drug at this level)
  cache.generatedAt = new Date().toISOString();

  fs.writeFileSync(RXSAVER_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  console.log(`\n  Moved ${movedCount} entr${movedCount === 1 ? 'y' : 'ies'} into cache.drugs`);
  console.log(`  cache.drugs now has ${realCount} total drugs`);
  console.log(`  Wrote ${RXSAVER_CACHE_PATH}`);
  console.log('\nVerify with:');
  console.log(`  node -e "const d=require('${RXSAVER_CACHE_PATH}'); console.log('drugCount:', d.drugCount, 'actual:', Object.keys(d.drugs).length); console.log('mounjaro' in d, 'mounjaro' in d.drugs); console.log(d.drugs.mounjaro, d.drugs.gemtesa)"`);
})();
