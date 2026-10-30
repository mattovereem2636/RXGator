# RxGator Changelog

All notable changes to the RxGator application. This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

---

## [1.5.5] — 2026-10-29 (Source Count)

### Fixed
- Pages that still said "18+ sources" now say 22, matching the rest of the site: the `/app` title, description, social tags, structured data and browser-tab title; `lost-insurance.html`; `perdi-mi-seguro.html` (Spanish); six articles; and `pap-database.json`. The 1.5.3 audit missed the "18+" wording.
- The "22 Data Sources" box on `/app` named only 18 sources. It now also names Inside Rx, HealthWarehouse, TrumpRx.gov and FDA Drug Shortages.

---

## [1.5.4] — 2026-10-29 (Brand Lookup and Pack Sizes)

### Fixed
- A search for Myfembree now shows its SingleCare price. The search resolved Myfembree to relugolix, and the relugolix brand alias is Orgovyx, a different product. The price lookup now tries the name the user typed first, and it skips the alias when the typed name belongs to a different drug.
- A price for a pack that is not a 30-day or 90-day supply now says "for N units" ("por N unidades" in Spanish), for example Vyleesi (4 pens) and Myfembree (28 tablets). These prices no longer show a made-up 90-day price.
- The SingleCare note no longer says "30-count" when the cache has no package size. It says "package size not listed".
- The "30-day" and "90-day" labels on price cards are now in Spanish on the Spanish page.

### Changed
- `/api/health/report` leaves searches from the server, from loopback, and from the Alibaba Cloud crawler out of the zero-result rate. The report lists how many it left out (`excludedFromRates`). The address lists are in `health-report-config.js`.
- `/app` loads `/data/drug-names.json?v=1.5.4`, so browsers fetch the new dictionary after a release.

### Added
- `health-report-config.js` and `patch-1-5-4-code.js` (the code change, kept for the audit trail).

### Notes
- Autocomplete on `/app` was broken from 1.4.9 to 2026-10-14: `/data/drug-names.json` returned 404. Commit 4a92c7b fixed it with a symlink in `public/data/`. It shipped between releases and is recorded here.

---

## [1.5.3] — 2026-10-29 (Search Hygiene)

### Fixed
- Nine pages named a canonical URL that returns 404: the six August price pages, the Rx Outreach review, `lost-insurance.html`, and `perdi-mi-seguro.html`. Each now names its own URL.
- `index.html` and `landing.html` now both name `/` as canonical.
- Seven English pages gained their Spanish hreflang pair. Two hreflang targets that did not exist now point at the real Spanish pages, and the lost-insurance pair works.
- About 100 internal links that returned 404 now work (the nav and footer on the six price pages, related-article links, `/contact`, `/search`). Seven related cards for articles that were never written are removed.
- One data-source number, 22, replaces 8, 12, 16, 18, 19, and 20 on 124 pages (including the search page), in English and Spanish.
- The Costco "federal law" claim now says "in most states, but state laws vary" on every page and in the search results text.
- "Free forever" and "every dollar goes to data" no longer promise more than the FAQ funding answer says. "GoodRx only shows GoodRx prices" (homepage, About, and search results) and "NADAC is always current" are corrected. "No ads. No affiliate links" is removed because the FAQ discloses affiliate commissions.
- The homepage price example labels the Costco figure as an estimate and calls the example illustrative.

### Added
- `public/methodology.html` and `public/metodologia.html` list all 22 sources, what each provides, how fresh the data is, and how results are ranked.
- `public/llms.txt` for AI assistants, built only from claims the site already makes.
- Organization and WebSite structured data on the homepage and the About page.
- Footer links to Articles and Methodology on the homepage.
- `deploy-seo-baseline-1-5-2/` with the patch, `audit-seo.js` (read-only check), and a sitemap builder.

### Changed
- `public/sitemap.xml` is built from the files on disk and lists every indexable page once (144 URLs; it listed 67). Run `patch-seo-1-5-2.js` again after any deploy that adds pages.

---

## [1.5.2] — 2026-10-14 (Brand Banner Fix)

### Fixed
- The "Brand Name Search" box on `/app` said the prices were for an FDA-rated generic equivalent on every brand search, including brand-only drugs such as Addyi where no generic is sold. The box now reads the dictionary: a generic is sold (prices include it), RXGator records show no U.S. generic (prices are for the brand), or no record (check the drug name on each price card).
- The box is now in English and Spanish. It was English only.

### Data
- SingleCare prices for Addyi (flibanserin), Vyleesi (bremelanotide), Osphena (ospemifene), and Myfembree, imported 2026-10-14 with `import-singlecare-womens-health.js`. Myfembree is cached but does not show yet: RxNorm resolves it to relugolix, which is also Orgovyx.

---

## [1.5.1] — 2026-10-05 (Banner Fix)

### Fixed
- A search for a generic name no longer shows the banner "You searched for the brand name". The 1.5.0 lookup had a row for every generic name, and the banner treated each row as a brand.
- The generic banner no longer shows an empty "Typical savings vs. brand" box when a drug has no savings range on file.

### Changed
- `scripts/build-derived-lookup.js` now makes a lookup key from each brand and each alias. It no longer makes a key from the generic name.
- `public/app.html` prints the savings line of the generic banner only when the lookup has a value.

### Added
- `patch-banner-1-5-1.js` — the banner change, kept for the audit trail.

---

## [1.5.0] — 2026-10-05 (Coverage)

### Added
- About 75 common generics in `data/drug-names.json`, each with brands, drug class, primary use, and Spanish text. Examples: ezetimibe, telmisartan, paroxetine, valacyclovir, and sacubitril/valsartan.
- `scripts/build-derived-lookup.js` — generates `data/brand-generic-lookup.json` from the master. Its `--check` mode compares the two files and writes nothing.
- The aliases "ozempic pill", "ozempic tablets", and "wegovy pill" on semaglutide. The Ozempic pill launched in the US on May 4, 2026.
- The optional master fields `typicalSavings` and `pricingNames`. The lookup uses them to price a search the same way as before.
- `patch-coverage-1-5-0.js` and `coverage-1-5-0.json` — the one-time import, kept for the audit trail.

### Changed
- Zantac now belongs to famotidine. Zantac 360 contains famotidine, not ranitidine.
- `retail-sources.js` now reads `data/brand-generic-lookup.json`, which is generated from the master.
- `scripts/add-dictionary-term.js` now refreshes the lookup as well as the map when it adds a brand or an alias.
- Semaglutide, tirzepatide, empagliflozin, apixaban, and rivaroxaban now have `hasGeneric` set to false. No generic of the brand product sells in the US.
- Ticagrelor, mirabegron, sacubitril/valsartan, lisdexamfetamine, and cyclosporine ophthalmic now have `hasGeneric` set to true. Generics launched.

### Removed
- The hand-kept `brand-generic-lookup.json` in the app root, moved to `_to_delete/`.
- The stale `brand-generic-map.json` in the app root, moved to `_to_delete/`. The live copy is in `data/`.

### Known Issues
- The Depakote lookup row still prices as divalproex sodium, but the master entry is valproic acid. A price-coverage check is open.
- Januvia, Lantus, Basaglar, Toujeo, Humalog, and Admelog now search by generic name. Confirm that a generic sells in the US for each.
- The typical savings range of some brands now shows the most common value for the drug, not a value for each brand.
- The health check does not yet test that the map and the lookup match the master.

---

## [1.4.9] — 2026-10-05 (Master Dictionary)

### Added
- `scripts/build-derived-map.js` — generates `data/brand-generic-map.json` from the master dictionary. Its `--check` mode compares the two files and writes nothing.
- `scripts/add-dictionary-term.js` — adds one misspelling, alias, or brand to a master entry. It refuses a term that belongs to another drug and logs each change to `data/dictionary-changes.log`.
- `patch-dictionary-master-oct2026.js` — the one-time migration, kept for the audit trail.

### Changed
- `data/drug-names.json` is now the only dictionary file.
- `data/brand-generic-map.json` is now generated from the master. It holds every brand and alias. Misspellings stay in the master list.
- `public/app.html` now loads `/data/drug-names.json`, the same path the autocomplete already uses.
- `drug-info.js` now reads `data/drug-names.json`.

### Removed
- The `public/` copy of the dictionary, moved to `_to_delete/`.
- `build-dictionary.js` and `build-drug-dictionary.js`, moved to `_to_delete/`. Both rebuilt dictionary files from hard-coded lists and removed patched entries.
- `scripts/add-glp1-drugs.js` and `fix-dictionary-gaps-sept2026.js`, moved to `_to_delete/`. Both wrote the `public/` copy.
- The misspelling keys that earlier hand patches added to the brand map. They stay in the master list.

### Known Issues
- `brand-generic-lookup.json` is still a separate file that `retail-sources.js` reads. It holds about 100 common generics that the master lacks, and 13 naming differences from the master.
- The health check does not yet test that the brand map matches the master. Run `node /var/www/rxaggregator/scripts/build-derived-map.js --check` by hand.
- Terms added with `add-dictionary-term.js` need `pm2 restart rxaggregator` before the search uses them.

---

## [1.4.8] — 2026-10-05 (Gap Report Fix)

### Added
- `patch-gap-report-oct2026.js` — fixes the weekly drug gap report and repairs the dictionary copies, kept for the audit trail.

### Changed
- `find-missing-drugs.js` now reads `data/drug-names.json`, the dictionary that every patch updates.
- `find-missing-drugs.js` now counts only the last 14 days of searches.
- `find-missing-drugs.js` now skips searches from the server IP and from localhost.
- `find-missing-drugs.js` now counts a search with `sources_hit` of 0 as a search with no result.
- The report email now says how many searches fall in the 14-day window.

### Fixed
- The gap report no longer flags drugs that were fixed weeks ago. The 2026-10-04 report flagged Gemtesa, nubeca, and olmesartan from June and July rows.
- The gap report no longer ignores new zero-result searches. Newer log rows write 0, and the old test read only an empty field.
- The darolutamide entry has its misspellings again: nubeca, darolutimide, and darolutomide. The live dictionary did not contain them.
- `public/drug-names.json` now holds the entries that existed only in `data/drug-names.json`.

### Known Issues
- Two copies of the dictionary still exist. `drug-info.js` reads the `public/` copy. The alias index and search read the `data/` copy.
- `build-drug-dictionary.js` writes the `public/` copy and `build-dictionary.js` writes the `data/` copy. Both build from hard-coded lists and can remove patched entries.
- Mounjaro, Ozempic, Zepbound, and Jardiance return only one or two sources. GoodRx and SingleCare prices are not added yet.
- The Walmart and Amazon RxPass lists in `retail-sources.js` and two lookups in `govt-data.js` still use the loose two-way match.

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
