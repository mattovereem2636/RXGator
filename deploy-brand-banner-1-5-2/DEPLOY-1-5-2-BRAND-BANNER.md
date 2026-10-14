# Deploy RxGator 1.5.2 "Brand Banner Fix"

**What it fixes:** the "Brand Name Search" box on `/app` said every brand search showed prices for an FDA-rated generic equivalent. That was false for brand-only drugs such as Addyi. The box now reads the dictionary and shows one of three texts, in English and Spanish.

| Dictionary says | New text (English) |
|---|---|
| a generic is sold | A generic version is sold. Prices below include the generic, which has the same active ingredient. (plus the "ask your doctor" note) |
| no generic | RXGator records show no generic version sold in the U.S. Prices below are for the brand-name drug. |
| no dictionary entry (Addyi today) | Each price card shows the drug name its source lists. Check it to see whether a price is for the brand or a generic. |

**Files changed on the server:** `public/app.html`, `version.json`, `CHANGELOG.md`, `RXGator-VersionLog.html`. No restart is needed.
**Version order:** this ships as 1.5.2. The SEO bundle in `deploy-seo-baseline-1-5-2\` is now 1.5.3.

## Before You Start
- Open two PowerShell windows: one SSH session to root@74.208.32.197, one local window.
- Run every server command with the full paths shown. Other projects share this server.
- Test from a browser, not with curl from the server.

## Step 1: Copy the Folder to the Server
Run LOCALLY:
```
scp -r "D:\Projects\RXGator\deploy-brand-banner-1-5-2" root@74.208.32.197:/var/www/rxaggregator/deploy-brand-banner-1-5-2
```

## Step 2: Take the Pre-Change Snapshot
Run on SERVER. Check the list of changed files first. Stop and send it to Claude if it shows a `.env` file or anything with a token.
```
git -C /var/www/rxaggregator status --short | head -40
```
Run on SERVER:
```
git -C /var/www/rxaggregator add -A && git -C /var/www/rxaggregator commit -m "chore: pre-1.5.2 brand banner snapshot" && git -C /var/www/rxaggregator tag v1.5.1-pre-brand-banner
```
Run on SERVER:
```
tar czf /tmp/rxaggregator-pre-brand-banner-$(date +%Y%m%d-%H%M).tar.gz --exclude=node_modules --exclude='.env*' -C /var/www rxaggregator && ls -la /tmp/rxaggregator-pre-brand-banner-*.tar.gz
```

## Step 3: Dry Run the Text Fix
Run on SERVER:
```
node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-brand-banner-1-5-2.js --dry-run
```
Expect "Inline scripts compile after the patch: yes" and "DRY RUN: nothing written." Stop on any ABORT line and send it to Claude.

## Step 4: Apply the Text Fix
Run on SERVER:
```
node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-brand-banner-1-5-2.js
```

## Step 5: Update the Version, CHANGELOG, and VersionLog
Run on SERVER:
```
node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-v1-5-2-brand-banner.js --dry-run
```
Run on SERVER:
```
node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-v1-5-2-brand-banner.js
```

## Step 6: Check in a Browser
Hard refresh `/app` first (Ctrl+Shift+R).
1. Search "Addyi". The blue box shows the "Each price card shows the drug name..." text. No "generic equivalent" text.
2. Search "Ozempic". Expect the "RXGator records show no generic version..." text.
3. Search "Lipitor". Expect the "A generic version is sold..." text, the italic doctor note, and the green generic banner.
4. Click ES. Repeat search 1. The box is in Spanish.
5. Check that the SingleCare card for Addyi still shows $1,960.02.

## Step 7: Commit and Push
Run on SERVER:
```
git -C /var/www/rxaggregator add public/app.html version.json CHANGELOG.md RXGator-VersionLog.html deploy-brand-banner-1-5-2 && git -C /var/www/rxaggregator commit -m "fix(app): brand search box states generic status from the dictionary (1.5.2)" && git -C /var/www/rxaggregator tag v1.5.2 && git -C /var/www/rxaggregator push && git -C /var/www/rxaggregator push --tags
```

## Roll Back
Each patch prints its backup folder under `/var/www/rxaggregator/backups/`. Copy the files back:
```
cp /var/www/rxaggregator/backups/v1.5.2-brand-banner-<stamp>/app.html /var/www/rxaggregator/public/app.html
cp /var/www/rxaggregator/backups/v1.5.2-<stamp>/version.json /var/www/rxaggregator/backups/v1.5.2-<stamp>/CHANGELOG.md /var/www/rxaggregator/backups/v1.5.2-<stamp>/RXGator-VersionLog.html /var/www/rxaggregator/
```

## Tested
- 2026-10-14, in the cloud workspace, on the Oct 1 copy of the search page (`public/index.html`, which had the same box). The patch applied, all inline scripts compiled, a second run reported "Already applied", and the box rendered all three texts in English and Spanish with the search term escaped.
- The version patch was tested on stand-in files: it refused to run before the text fix, wrote 1.5.1 -> 1.5.2, and refused a second run.
- Not tested: the live `public/app.html` (the dry run in Step 3 is that test) and the live CHANGELOG and VersionLog layout (the Step 5 dry run checks them).
