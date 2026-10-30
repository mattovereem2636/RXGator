# RxGator 1.5.2 "Search Hygiene" — Deploy Guide

> **2026-10-14: this bundle is now release 1.5.3.** Release 1.5.2 became the Brand Banner Fix (`deploy-brand-banner-1-5-2\`). `lib/config.js` now says 1.5.2 -> 1.5.3, so `patch-v1-5-2.js` writes version 1.5.3. The file and folder names still say 1-5-2. Deploy this bundle only after 1.5.2 is live.


Source: `Web_Presence_Baseline_2026-10-08.md` (RxGator section). Nothing here has run on the server. Every script was tested against a copy of the live site (HTML mirrored 2026-10-08) and against fixture files for the release bookkeeping.

## What ships by default (static files only, no restart)

| Script | What it does |
|---|---|
| `patch-seo-1-5-2.js` | Fixes canonicals, hreflang, dead links, source count, health and funding wording (EN + ES). Adds methodology pages, `llms.txt`, schema. Rebuilds `sitemap.xml`. |
| `audit-seo.js` | Read-only check. Must print `PROBLEMS: 0`. |
| `patch-v1-5-2.js` | Bumps `version.json`, `CHANGELOG.md`, `RXGator-VersionLog.html` together. Refuses to run if the SEO patch has not run. |

## Optional (separate sign-off, restart needed)

| Script | Why it is optional |
|---|---|
| `patch-landing-redirect.js` | Edits `server.js`: 301 from `/landing.html` to `/`. |
| `patch-costco-note-1-5-2.js` | Edits `retail-sources.js` and `data-sources.json`. AGENTS.md says no edits to pricing-source code without Matt's sign-off. |

## Decisions to confirm before you deploy

1. **Source count = 22.** Taken from live `/api/health` and your notes. Change `SOURCE_COUNT` in `lib/config.js` if the true number differs.
2. **Three source descriptions are inferred** (Inside Rx, HealthWarehouse, FedRx) from health-endpoint labels only. Check them on `/methodology.html` after deploy.
3. **Homepage price example ($1.20 vs $36.52)** is only labeled "Costco Pharmacy (estimate)" and "Illustrative example". Replace it with a verified figure when you have one.
4. **Related-link remaps** point at the closest existing article. Seven cards for articles that were never written are removed.
5. **`/search?drug=X` buttons** now point to `/app`, because `/app` does not read `?drug=`.

## Before you start

Confirm two PowerShell windows are open:

1. SSH session: `ssh root@74.208.32.197`
2. Local terminal at `C:\Users\matto\Downloads`

## Step 1 — Copy the bundle (LOCAL)

```powershell
scp -r "D:\Projects\RXGator\deploy-seo-baseline-1-5-2" root@74.208.32.197:/var/www/rxaggregator/
```

## Step 2 — Snapshot (SERVER)

```bash
cd /var/www/rxaggregator && git add -A && git commit -m "Pre-seo-1-5-2 snapshot" && git tag v1.5.1-pre-seo-1-5-2
tar czf /tmp/rxaggregator-$(date +%Y%m%d-%H%M).tar.gz --exclude=node_modules --exclude=backups -C /var/www rxaggregator
tar tzf /tmp/rxaggregator-*.tar.gz | head -20
```

If the git commit says "nothing to commit", the tag still works. Do not continue until the tarball listing shows files.

## Step 2b — Check for cron jobs that rewrite HTML (SERVER)

The 2026-10-05 notes mention two Aug-14 `sed -i` crons that edit production HTML. A cron like that could undo the patch. Look before you deploy:

```bash
crontab -l | grep -n -i -E "sed|public|html"
```

If a cron touches `public/`, tell me what it does before you continue.

## Step 3 — Dry run and baseline audit (SERVER)

```bash
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-seo-1-5-2.js --dry-run
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/audit-seo.js
```

The audit should list problems (it measured 352 on the 2026-10-08 mirror, with `app.html` included). A `[MISS]` or `[ABORT]` in the dry run means the live files differ from the mirror. Stop and send me the output.

## Step 4 — Apply (SERVER)

```bash
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-seo-1-5-2.js
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/audit-seo.js
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-v1-5-2.js --dry-run
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-v1-5-2.js
```

The audit must say `PROBLEMS: 0` before you run the version patch. No restart is needed for these static files. Backups land in `/var/www/rxaggregator/backups/seo-1-5-2-<stamp>/` and `/var/www/rxaggregator/backups/v1.5.2-<stamp>/`.

## Step 5 — Optional patches (SERVER, only if approved)

```bash
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-landing-redirect.js --dry-run
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-landing-redirect.js
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-costco-note-1-5-2.js --dry-run
node /var/www/rxaggregator/deploy-seo-baseline-1-5-2/patch-costco-note-1-5-2.js
pm2 restart rxaggregator --update-env
```

The redirect patch inserts its route above the `express.static` line and stops if it finds zero or several such lines.

## Step 6 — Verify (LOCAL)

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://rxgator.info/methodology.html
curl.exe -s -o NUL -w "%{http_code}`n" https://rxgator.info/metodologia.html
curl.exe -s -o NUL -w "%{http_code}`n" https://rxgator.info/llms.txt
curl.exe -s https://rxgator.info/sitemap.xml | Select-String -Pattern "<loc>" | Measure-Object
curl.exe -I https://rxgator.info/landing.html
curl.exe -s https://rxgator.info/api/health
```

Expect 200, 200, 200, about 144 `<loc>` entries, and a version of 1.5.2. `landing.html` returns 301 only if you ran the redirect patch.

RxGator checklist in a browser: site loads, all data-source links resolve, EN/ES toggle works on every page (not only the homepage), carousel articles load, FAQ and About render in both languages. Spot-check `/articles/omeprazole-cost-without-insurance.html` (related cards were removed) and one August price page (nav and footer links).

Search Console: resubmit `https://rxgator.info/sitemap.xml`.

## Rollback

```bash
# SERVER — restore the pre-change tree
cd /var/www && tar xzf /tmp/rxaggregator-<STAMP>.tar.gz rxaggregator/public rxaggregator/version.json rxaggregator/CHANGELOG.md rxaggregator/RXGator-VersionLog.html
# or: cd /var/www/rxaggregator && git checkout v1.5.1-pre-seo-1-5-2 -- public version.json CHANGELOG.md RXGator-VersionLog.html
```

If you ran the optional patches, restart with `pm2 restart rxaggregator --update-env` after the restore. Revert first, diagnose second.

## After the sitemap-affecting deploys

The 5 articles drafted 2026-09-23 are not live and carry the same extensionless-link template bug. Deploy them first, then re-run `patch-seo-1-5-2.js`. It fixes them and adds them to the sitemap. Running it again changes nothing else.

## Commit message

```
fix(seo): 1.5.2 search hygiene from 2026-10-08 baseline

Fix 9 canonicals pointing at 404s, ~96 dead internal links, hreflang pairs
and one-sided pairs. Standardize data-source count to 22 (EN + ES). Soften
unsupported Costco, free-forever, GoodRx and NADAC claims. Add methodology
pages, llms.txt, Organization schema. Rebuild sitemap (67 -> 144 URLs).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01R1rU6NQMrjqz9E3q2WkimZ
```

## Not fixed (needs your content or a decision)

- The recall banner is stale. No `/press` page exists. "Last updated" lines are not added.
- `public/app.html` (the search page) now gets the count, Costco, and "GoodRx only shows GoodRx" fixes. Its "This tool queries..." source list still names 18 sources, not 22. Its head copies the homepage canonical and hreflang tags, which robots.txt hides. I left both alone.
- The homepage `/app` SearchAction in JSON-LD points at `?drug=`, which `/app` ignores.
- The FAQ calls NADAC a "live API", while `/api/health` shows a loaded dataset. Pick the true wording.
- `search.html` canonicals to `/app`, which robots.txt blocks. Left as is.
- Spanish homepage URLs do not exist (language toggle is JavaScript only), so the homepage hreflang pair cannot be fixed with static files.
- The new "(estimate)" label and note on the homepage callout are English-only.
