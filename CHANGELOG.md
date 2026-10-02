# RxGator Changelog

All notable changes to the RxGator application. This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

---

## [1.4.7] — 2026-10-01 (Search Match Fix)

### Added
- `patch-search-match-oct2026.js` — fixes drug-name matching in four source modules, kept for the audit trail.

### Changed
- `rxoutreach.js`, `ira-negotiated.js`, `texas-wac.js`, and `va-fss.js` now match a drug only when the typed text starts the indexed name, or the query begins with the whole indexed name.
- These four modules no longer match short names inside a long query, and no longer match text from the middle of a name.

### Fixed
- A search for a combination drug no longer returns unrelated drugs from these four sources. A Descovy search returned tenofovir disoproxil and methylphenidate LA rows from Rx Outreach.

### Known Issues
- The Walmart and Amazon RxPass lists in `retail-sources.js` and two lookups in `govt-data.js` use the same loose two-way match. They are not fixed.
- Text from the middle of a drug name (for example "statin") no longer finds a drug in these four sources.
- About a dozen manufacturer links return 403 to automated requests. Confirm each one by hand.

---

## [1.4.6] — 2026-10-01 (Manufacturer Program Corrections)

### Added
- `patch-mfr-links3-oct2026.js` — third data pass, kept for the audit trail.

### Changed
- Replaced the Januvia savings card in `manufacturer_assistance.json` with the Merck Patient Assistance Program. The old card link redirected to a 404 page.
- Replaced the second Ready, Set, PrEP entry (the Descovy entry) with the same HIV.gov page used in 1.4.5. The 1.4.5 change covered only the Truvada entry.
- Removed the Bristol Myers Squibb program from the aripiprazole entry in `public/pap-database.json` (now 1.0.3). BMS does not run an Abilify program.

### Fixed
- The aripiprazole note now states that the Otsuka Patient Assistance Foundation covers only the Abilify Maintena and Abilify Asimtufii injections, not tablets.

### Known Issues
- About a dozen links return 403 to automated requests. These include Lilly, Bayer, AbbVie, and AstraZeneca pages. They load in a browser. Confirm each one by hand.
- Victoza, Entresto, BI Cares, Lilly Cares, bmspaf.org, and Gemtesa still carry `needsReview` in the data.
- Dollar amounts remain in the program text for the 13 drugs not reviewed in 1.4.4.

---

## [1.4.5] — 2026-10-01 (Manufacturer Link Cleanup)

### Added
- `patch-mfr-links2-oct2026.js` — second link-fix pass, kept for the audit trail.

### Changed
- Replaced the program links for Invokana, Sanofi insulins (Lantus), Victoza, the Novo Nordisk assistance program (liraglutide entry), Entresto, the Novartis Patient Assistance Foundation, and Januvia in `manufacturer_assistance.json`.
- Replaced the Ready, Set, PrEP entry with an HIV.gov page that lists manufacturer programs for PrEP medicines. The Ready, Set, PrEP site no longer resolves.
- Replaced the Takeda Help at Hand link in `public/pap-database.json` (now 1.0.2).

### Fixed
- Nine program links returned 404, did not resolve, or landed on an error page. `check-mfr-links.js` found them in the 1.4.4 run.

### Known Issues
- Three new links need a browser check, because automated tools could not read them: Victoza, Entresto, and Januvia. Each carries `needsReview` in the data.
- About a dozen links return 403 to automated requests. These include Lilly, Bayer, AbbVie, and AstraZeneca pages. They load in a browser. Confirm each one by hand.
- The `pap-database.json` BMS link for aripiprazole returns 404, and `jjpaf.org` timed out. Both are not fixed. The aripiprazole entry may belong to a different manufacturer.
- Takeda reports that some products leave Help at Hand on 2026-12-31.
- Dollar amounts remain in the program text for the 13 drugs not reviewed in 1.4.4.

---

## [1.4.4] — 2026-10-01 (Manufacturer Links and Dictionary Fix)

### Added
- Dictionary entries for vibegron (Gemtesa), darolutamide (Nubeqa), and amphetamine/dextroamphetamine (Adderall). The 1.4.2 brand alias builds its index from these entries.
- Dictionary entries for dupilumab (Dupixent) and fostemsavir (Rukobia), from the October gap patch.
- Manufacturer assistance entries for darolutamide (Nubeqa) and vibegron (Gemtesa) in `manufacturer_assistance.json`.
- `check-mfr-links.js` — a read-only checker for every program link in `manufacturer_assistance.json` and `public/pap-database.json`. Run it with each quarterly content audit.
- `patch-dictionary-oct2026b.js` and `patch-mfr-links-oct2026.js` — data patches for this release, kept for the audit trail.

### Changed
- Corrected program links and eligibility text for empagliflozin, tirzepatide, semaglutide, and apixaban in `manufacturer_assistance.json`.
- Replaced dollar amounts in program text with a pointer to the program page. The official pages show different amounts, and those amounts change.
- Corrected the Novo Nordisk and BMS patient assistance links in `public/pap-database.json` (now 1.0.1). Removed stale retail prices from its notes.

### Fixed
- Seven program links returned errors or sent patients to a page for healthcare professionals. These covered the Jardiance savings card, the BI Cares link in `manufacturer_assistance.json`, the Ozempic savings card, two Novo Nordisk assistance links, and two BMS assistance links.
- The dictionary lacked the vibegron and darolutamide entries that the 1.4.2 brand alias needs. The cause is not known.

### Known Issues
- Four program links need a browser check. Automated tools could not read them: BI Cares, Lilly Cares, the BMS Patient Assistance Foundation site, and the Gemtesa program terms. Each carries `needsReview` in the data.
- Zepbound has no program of its own. It shows the Mounjaro card.
- `build-dictionary.js` writes both dictionary files from its own list. It erases entries that patch scripts add. Do not run it until those entries move into its list.
- The other 13 drugs in `manufacturer_assistance.json` have not been link-checked. Run `check-mfr-links.js`.
- Adderall returns no prices from SingleCare, GoodRx, Blink Health, Inside Rx, and Health Warehouse. Nubeqa returns one source. The cache key gaps are not investigated.
- The Ozempic page lists tablet form and oral route (Rybelsus data). It also lists recalls from Apollo Care, LLC under "this medication". The matching logic is not reviewed.

---

## [1.4.3] — 2026-09-24 (Secret Hygiene)

### Security
- Removed a hard-coded Apify API token from `refresh-caches.js`. The script now reads `APIFY_TOKEN_REFRESH_CACHES` from the environment or `/var/www/rxaggregator/.env`. GitHub push protection blocked the commit that contained the token, so the token was never published.

### Changed
- `.gitignore` now excludes `.env`, `*.bak`, `*.tar.gz`, `backups/`, and `search_log.csv`. The search log holds visitor IP addresses and no longer belongs in version control. `data/backups/` is untracked for the same reason.

---

## [1.4.2] — 2026-09-24 (Brand-Only Cache Lookup Fix)

### Added
- `brand-alias.js` — maps a brand-only generic to its brand name. An alias exists only when the dictionary entry has `hasGeneric: false` and exactly one brand, so multi-brand drugs and drugs with a real generic are never aliased.

### Fixed
- Cache lookups missed brand-only drugs. Search resolves these drugs to the generic name (for example `vibegron`), but the SingleCare, GoodRx, and RxSaver caches key them by brand name (`gemtesa`, `nubeqa`). The Gemtesa and Nubeqa pricing added in 1.4.0 was unreachable, and every search for these drugs logged zero source hits. `cache-manager.js` (SingleCare, GoodRx) and `rxsaver.js` now try the brand alias when the direct lookup misses. Direct hits are unchanged.

### Notes
- The alias index loads at startup from `data/drug-names.json`. Restart the app after dictionary changes.
- Other cached sources are not changed in this release.

---

## [1.4.1] — 2026-09-24 (Health Check Probe Fix)

### Fixed
- openFDA NDC health probe in `health-report.js` searched `status:Current`, which is not a field in the openFDA NDC dataset. openFDA returns HTTP 404 when a search matches nothing, so `/api/health/report` showed `INVALID_RESPONSE` while the API was healthy. The probe now searches `generic_name:metformin`.

### Notes
- The 5.83% zero-result rate (target under 5%) needed no dictionary change. Vibegron, darolutamide, gemtesa, and nubeqa are already in the dictionary. The six zero-result rows came from test searches run from the server IP on 2026-09-18 during the gap-fix work, and they leave the 7-day window on 2026-09-25.

---

## [1.4.0] — 2026-09-18 (Cache Refresh & Coverage Expansion)

### Added
- Nubeqa and Gemtesa pricing added to `singlecare_cache.json` (34 total drugs, up from 32)
- Mounjaro and Gemtesa pricing added to `rxsaver_cache.json` (270 total drugs, up from 268)
- `scripts/check-blink-health.js` — canary monitor that checks whether Blink Health has reopened public per-drug pricing (currently closed across all three of its product lines: Quick Save, BlinkRx, and Cash Express). Intended to run on a recurring schedule.
- `scripts/add-gap-drugs.js` — one-time merge script that added the above cache entries; retained for audit trail
- `scripts/fix-rxsaver-wrapper.js` — one-time corrective script (see Fixed below); retained for audit trail
- `version.json` — new file tracking `APP_VERSION` / `APP_DATE`; no such tracking existed before this release

### Changed
- `goodrx_cache.json` — refreshed 23 of 30 drugs via the GoodRx Apify actor
- `singlecare_cache.json` — refreshed all 32 pre-existing drugs via the SingleCare Apify actor, plus 2 new entries (34 total)

### Fixed
- `rxsaver_cache.json` wrapper bug: `add-gap-drugs.js` initially added new drug entries as top-level siblings of the `drugs` wrapper object instead of inside it. Corrected via `fix-rxsaver-wrapper.js`. No data was lost — the original 268 entries inside `cache.drugs` were never touched by the bug.
- Root-caused why the health-check endpoint under-reports `rxsaver_cache.json` and `blink_cache.json` size ("entries: 7" for both): the health check counts top-level wrapper keys (`source`, `sourceUrl`, `drugCount`, `drugs`, etc. — 7 of them) instead of the nested `drugs` object. Root cause identified in this release; the health-check script itself is not yet patched (see Known Issues).

### Known Issues
- 7 GoodRx drugs remain blocked by anti-bot protection even after a residential-proxy retry: apixaban, carvedilol, furosemide, gabapentin, levothyroxine, lisinopril, omeprazole. This is a persistent block on these specific pages, not a transient IP-reputation issue. Old cached values were retained rather than overwritten with empty data.
- `blink_cache.json` (204 drugs) can no longer be refreshed by scraping. Blink Health closed all public per-drug pricing pages across Quick Save, BlinkRx, and Cash Express as of this release. Treat it as a frozen/legacy dataset until a different data-access method exists. `scripts/check-blink-health.js` was added to catch it if this ever reopens.
- `scripts/health-check.js` still reports an inaccurate "entries" count for `rxsaver_cache.json` and `blink_cache.json` (see Fixed above) — needs a follow-up patch to read `Object.keys(cache.drugs).length` instead of `Object.keys(cache).length`. Not fixed in this release; flagging for the next code-review pass.

---

## [1.3.0] — 2026-07-26 (Content Expansion — 10 New Articles)

### Added
- **10 new SEO articles** (bringing total from 31 to 41):
  - lisinopril-cost-without-insurance — Drug Pricing
  - levothyroxine-cost-without-insurance — Drug Pricing
  - ozempic-wegovy-savings-guide — Brand Drugs
  - eliquis-savings-alternatives — Brand Drugs
  - inflation-reduction-act-drug-prices — Industry
  - biosimilars-explained — Education
  - medicare-part-d-enrollment-guide — Medicare
  - va-prescription-benefits-guide — Savings Guide
  - telehealth-prescriptions-guide — Practical Guide
  - how-to-read-pharmacy-receipt — Education

### Changed
- **articles.json** — added 10 new entries (41 total)
- **sitemap.xml** — added 10 new article URLs

---

## [1.2.0] — 2026-07-26 (Code Review — Low-Priority Improvements)

### Added
- **CHANGELOG.md** — this file, documenting project history
- Inline code comments on complex logic in server.js (price normalization, brand→generic resolution, fuzzy matching, unified search pipeline)

### Changed
- **articles.json** — added missing `rx-outreach-nonprofit-pharmacy-review` entry (article existed but wasn't registered)

### Removed
- **metformin-cost.html** — duplicate of `metformin-cost-without-insurance.html` (orphan file, not in articles.json or sitemap)
- Dead code cleanup in server.js: removed commented-out blocks, unused variables, and unreachable code paths

---

## [1.1.0] — 2026-07-26 (Code Review — Medium-Priority Fixes)

### Added
- **data-sources.json** — centralized registry of all 18 data sources with metadata (type, category, health check URLs, cache file paths, critical flag)
- **scripts/health-check.js** — automated health check for all data sources (live API + cache files), supports `--json` and `--quiet` flags, writes to `logs/`
- **SOURCES.md** — developer reference documenting all 18 data sources, API endpoints, auth, rate limits, update procedures
- **scripts/accessibility-audit.js** — custom WCAG 2.1 AA audit (14 checks) using jsdom DOM inspection

### Changed
- **All 6 HTML pages** — accessibility fixes:
  - Added skip navigation links to about.html, landing.html, privacy.html, terms.html, faq.html
  - Added `<main id="main-content">` landmarks to all pages
  - Fixed heading hierarchy in faq.html (div→h2 for section titles)
  - index.html already had skip-link; added main landmark wrapper
- **data-sources.json** — added `"critical": false` for openFDA, MedlinePlus, and FDA Drug Shortages (informational sources)
- **scripts/health-check.js** — non-critical source failures now show as WARN instead of FAIL; overall status DEGRADED instead of UNHEALTHY

### Fixed
- False positive in accessibility audit: expanded ARIA valid roles list (added combobox, listbox, option, group, etc.)

---

## [1.0.0] — 2026-07-25 (Baseline)

### Summary
Production-stable release tagged as `v1.0-baseline` before code review improvements began.

### Features
- Unified drug price search across 18 data sources
- 7 live API integrations (Cost Plus Drugs, NADAC, openFDA, RxNorm, MedlinePlus, Medicare Part D, FDA Shortages)
- 6 cached/scraped sources (SingleCare, GoodRx, Medicaid FUL, Manufacturer Assistance, Rx Outreach, VA FSS)
- 3 additional cached sources (IRA Negotiated Prices, Texas WAC, RxSaver, Blink Health)
- 3 static/hardcoded sources (Walmart $4 List, Amazon RxPass, Costco estimate)
- Brand→generic drug resolution via RxNorm
- Fuzzy drug name matching
- Consumer drug information from MedlinePlus
- Drug shortage alerts from FDA
- Rate limiting (30 requests/minute)
- 30 SEO articles covering drug pricing, savings strategies, and industry explainers
- Mobile-responsive design
- Google AdSense integration
- PM2 process management on Ubuntu VPS (IONOS)

---

*RxGator — Technology Assessment Project LLC*
