# RxGator Changelog

All notable changes to the RxGator application. This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

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
