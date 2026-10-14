# Add Five Brand-Only Drugs to the Dictionary

**Adds:** flibanserin (Addyi), bremelanotide (Vyleesi), ospemifene (Osphena), relugolix, estradiol, and norethindrone acetate (Myfembree), and relugolix (Orgovyx, a guard entry). All have `hasGeneric: false`, Spanish `primaryUseES`, and common misspellings.
**Effect:** the brand box on these searches says "RXGator records show no generic version sold in the U.S."; autocomplete suggests them. Prices do not change.
**Change type:** data only (`data/drug-names.json`, `data/brand-generic-map.json`, `data/brand-generic-lookup.json`, `data/dictionary-changes.log`). No version bump. Restart needed.

## Before You Start
- Two PowerShell windows open: SSH to root@74.208.32.197, and local.
- Test in a browser, not from the server.

## Steps
1. Run LOCALLY: `scp -r "D:\Projects\RXGator\deploy-dictionary-womens-health" root@74.208.32.197:/var/www/rxaggregator/deploy-dictionary-womens-health`
2. Run on SERVER: `chmod 755 /var/www/rxaggregator/deploy-dictionary-womens-health`
3. Run on SERVER: `node /var/www/rxaggregator/deploy-dictionary-womens-health/patch-dictionary-womens-health.js --dry-run`
   Expect 5 new entries, +5 map keys and +5 lookup keys (addyi, vyleesi, osphena, myfembree, orgovyx), 0 dropped, 0 changed.
4. Run on SERVER: `node /var/www/rxaggregator/deploy-dictionary-womens-health/patch-dictionary-womens-health.js`
5. Run on SERVER: `pm2 restart rxaggregator`
6. Browser: hard refresh `/app`. Search Addyi, Vyleesi, Osphena, Myfembree: each box says "RXGator records show no generic version sold in the U.S." Type "addy" and "myfem": autocomplete shows them with "Brand only". Search Orgovyx: no Myfembree price.
7. Run on SERVER: `git -C /var/www/rxaggregator status --short` then `git -C /var/www/rxaggregator add -A && git -C /var/www/rxaggregator commit -m "data(dictionary): add Addyi, Vyleesi, Osphena, Myfembree and Orgovyx (brand-only)" && git -C /var/www/rxaggregator push`

## Roll Back
The patch prints its backup folder (`/var/www/rxaggregator/data/backups/dictionary-womens-health-<stamp>/`). Copy its three files back into `/var/www/rxaggregator/data/`, then `pm2 restart rxaggregator`.

## Tested
2026-10-14 on the Oct 1 local master (130 entries) with the live builder scripts: dry run, write, idempotent second run, derived-file checks clean, lookup rows correct, no "relugolix" lookup key, and a conflict abort. Not tested on the live 213-entry master (the dry run is that test).

## Known Risk for 1.5.4
A Myfembree search prices under "relugolix". brand-alias.js maps "relugolix" to the Orgovyx brand key. Today no cache holds Orgovyx, so nothing shows. If Orgovyx is ever scraped, Myfembree searches would show the Orgovyx price. The 1.5.4 fallback must try the typed brand first and must not alias "relugolix" for a Myfembree search.
