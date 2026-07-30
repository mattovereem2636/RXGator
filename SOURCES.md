# RxGator — Data Source Reference

Quick reference for all data sources powering RxGator's drug price comparison engine. For the machine-readable registry used by the health-check script and server, see `data-sources.json`.

**Last updated:** July 26, 2026  
**Total sources:** 18 (7 live API, 6 cached/scraped, 3 static/hardcoded, 2 informational API)

---

## Live API Sources (queried on every search)

### 1. Cost Plus Drugs
- **What it is:** Mark Cuban's transparent-pricing mail-order pharmacy
- **API endpoint:** `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main`
- **Auth:** None required
- **Rate limit:** Unknown — use conservatively
- **Price type:** Consumer-actionable (mail-order only)
- **Code:** `queryCostPlus()` in server.js
- **Pricing formula:** Drug cost + 15% markup + $5 pharmacy fee + $5 shipping
- **Website:** [costplusdrugs.com](https://costplusdrugs.com)

### 2. NADAC (National Average Drug Acquisition Cost)
- **What it is:** What pharmacies pay on average — retail will be higher
- **API endpoint:** `https://data.medicaid.gov/api/1/datastore/query/{dataset_id}/0`
- **Dataset ID:** `f38d0706-1239-442c-a3cc-40ef1b686ac0` (2025 data)
- **Auth:** None required (open government data)
- **Price type:** Benchmark
- **Code:** `queryNADAC()` in server.js
- **Update schedule:** Weekly by CMS
- **Note:** Check annually for new dataset IDs
- **Website:** [data.medicaid.gov](https://data.medicaid.gov)

### 3. openFDA (Drug Normalization)
- **What it is:** FDA National Drug Code directory — drug identification, not pricing
- **API endpoint:** `https://api.fda.gov/drug/ndc.json`
- **Auth:** None required (240 req/min without key, 120k/day with key)
- **Price type:** Informational only
- **Code:** `queryOpenFDA()` in server.js
- **Used for:** Drug normalization, dosage form data, and Costco price estimation
- **Website:** [open.fda.gov](https://open.fda.gov)

### 4. RxNorm (National Library of Medicine)
- **What it is:** Drug normalization — resolves brand names to generics, assigns RxCUI identifiers
- **API endpoint:** `https://rxnav.nlm.nih.gov/REST/`
- **Auth:** None required
- **Rate limit:** 20 requests/second
- **Price type:** Informational only
- **Code:** `queryRxNorm()` in server.js
- **Update schedule:** Monthly by NLM
- **Key role:** Powers brand→generic resolution and fuzzy drug lookup
- **Website:** [rxnav.nlm.nih.gov](https://rxnav.nlm.nih.gov)

### 5. MedlinePlus (National Library of Medicine)
- **What it is:** Consumer drug information — plain-language descriptions, side effects, usage
- **API endpoint:** `https://connect.medlineplus.gov/service`
- **Auth:** None required
- **Rate limit:** 85 requests/minute
- **Price type:** Informational only
- **Code:** `queryMedlinePlus()` in server.js
- **Dependency:** Requires RxCUI from RxNorm (#4)
- **Website:** [medlineplus.gov](https://medlineplus.gov)

### 6. Medicare Part D Spending Data (CMS)
- **What it is:** Medicare Part D spending — total spending, beneficiary counts, average cost per claim
- **API endpoint:** `https://data.cms.gov/data-api/v1/dataset/{dataset_id}/data`
- **Dataset ID:** `7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b`
- **Auth:** None required (open government data)
- **Price type:** Benchmark
- **Code:** `queryMedicarePartD()` in server.js
- **Data vintage:** 2024 (annual release)
- **Note:** Check for new annual dataset releases
- **Website:** [data.cms.gov](https://data.cms.gov)

### 7. FDA Drug Shortages
- **What it is:** Alerts when drugs have current supply issues
- **API endpoint:** `https://api.fda.gov/drug/shortages.json`
- **Auth:** None required
- **Rate limit:** 240 requests/minute without key
- **Code:** `checkDrugShortage()` in server.js
- **Note:** Returns 404 when no shortage exists — that's normal
- **Website:** [accessdata.fda.gov](https://www.accessdata.fda.gov/scripts/drugshortages/)

---

## Cached/Scraped Sources (loaded at startup)

### 8. SingleCare
- **What it is:** Coupon prices — show at pharmacy counter
- **Cache file:** `singlecare_cache.json`
- **Scrape method:** Apify (periodic)
- **Code:** `querySingleCare()` in server.js
- **Data includes:** Pharmacy-level pricing, price history, side effects
- **Website:** [singlecare.com](https://www.singlecare.com)

### 9. GoodRx
- **What it is:** Coupon prices — show at pharmacy counter
- **Cache file:** `goodrx_cache.json`
- **Scrape method:** Apify (periodic)
- **Code:** `queryGoodRx()` in server.js
- **Data includes:** Pharmacy-level pricing with retail vs. coupon comparison
- **Note:** Filters out mail-order pharmacies for main result
- **Website:** [goodrx.com](https://www.goodrx.com)

### 10. Medicaid Federal Upper Limit (FUL)
- **What it is:** Maximum Medicaid reimbursement for generic drugs (monthly CMS publication)
- **Cache file:** `ful_cache.json`
- **Update method:** `scripts/update_ful.sh` (monthly)
- **Code:** `queryFUL()` in server.js
- **Data includes:** FUL per unit + WAMP (Weighted Average of Manufacturer Prices)
- **Website:** [data.medicaid.gov](https://data.medicaid.gov)

### 11. Manufacturer Assistance Programs
- **What it is:** Patient assistance programs from drug manufacturers — copay cards, free medication
- **Cache file:** `manufacturer_assistance.json`
- **Update method:** Manual curation
- **Code:** `queryMfrAssist()` in server.js
- **Data includes:** Brand names, eligibility criteria, enrollment links

### 12. Rx Outreach
- **What it is:** Nonprofit mail-order pharmacy — free shipping, income-based eligibility
- **Cache file:** `data/rxoutreach_formulary.json`
- **Module:** `rxoutreach.js`
- **Code:** `rxOutreach.search()` 
- **Data includes:** Formulary with pricing by quantity
- **Website:** [rxoutreach.org](https://rxoutreach.org)

### 13. VA Federal Supply Schedule
- **What it is:** Federal government negotiated prices — benchmark, not consumer-available
- **Cache file:** `data/va_fss_formulary.json`
- **Module:** `va-fss.js`
- **Code:** `vaFss.search()`
- **Data includes:** Contract prices by NDC
- **Note:** Shows what the government pays — useful as a "floor" comparison
- **Website:** [va.gov](https://www.va.gov/opal/nac/fss/pharmPrices.asp)

### 14. Medicare Negotiated Prices (IRA)
- **What it is:** Maximum Fair Price under the Inflation Reduction Act
- **Cache file:** `data/ira_negotiated_prices.json`
- **Module:** `ira-negotiated.js`
- **Code:** `iraNegotiated.search()`
- **Data includes:** First batch of 10 drugs with negotiated prices (2026)
- **Note:** More drugs expected in future annual rounds
- **Website:** [cms.gov/inflation-reduction-act](https://www.cms.gov/inflation-reduction-act-and-medicare/drug-price-negotiation)

### 15. Texas DSHS (WAC)
- **What it is:** Wholesale Acquisition Cost — manufacturer list price before discounts
- **Cache file:** `data/texas_wac_formulary.json`
- **Module:** `texas-wac.js`
- **Code:** `texasWac.search()`
- **Note:** WAC is the "sticker price" — actual prices are almost always lower
- **Website:** [dshs.texas.gov](https://www.dshs.texas.gov)

### 16. RxSaver
- **What it is:** Prescription discount prices — coupon-based savings at local pharmacies
- **Cache file:** `data/rxsaver_cache.json`
- **Module:** `rxsaver.js`
- **Scrape method:** Apify (periodic)
- **Code:** `rxsaver.search()`
- **Website:** [rxsaver.com](https://www.rxsaver.com)

### 17. Blink Health
- **What it is:** Pay online for discount, pick up at pharmacy or get delivery
- **Cache file:** `data/blink_cache.json`
- **Module:** `blink.js`
- **Scrape method:** Apify (periodic)
- **Code:** `blink.search()`
- **Website:** [blinkhealth.com](https://www.blinkhealth.com)

---

## Static/Hardcoded Sources (in server.js)

### 18. Walmart Rx Program
- **What it is:** $4/$10/$15 generic drug program — no membership, no coupon
- **Data location:** `WALMART_4_LIST` object in server.js
- **Tiers:** $4/$10 (30/90-day), $9/$24, $15/$38
- **Source:** Official Walmart PDF (effective 9/16/2024)
- **Code:** `queryWalmart()` in server.js
- **Website:** [walmart.com/cp/4-dollar-prescriptions](https://www.walmart.com/cp/4-dollar-prescriptions/1078664)

### Amazon RxPass (embedded in Walmart section results)
- **What it is:** Amazon Prime subscription: $5/month covers 55+ generics
- **Data location:** `AMAZON_RXPASS_DRUGS` object in server.js
- **Code:** `queryAmazonRxPass()` in server.js
- **Note:** Requires Amazon Prime ($139/year). Not per-drug — covers all eligible generics
- **Website:** [pharmacy.amazon.com/rxpass](https://pharmacy.amazon.com/rxpass)

### Costco Pharmacy (Estimated)
- **What it is:** Estimated prices based on NADAC benchmark + markup formula
- **Code:** `estimateCostcoPrice()` in server.js
- **Note:** No Costco membership needed for pharmacy (federal law)
- **Website:** [costco.com/pharmacy](https://www.costco.com/pharmacy/)

---

## How to Add a New Source

1. Decide the source type: live API, cached/scraped, or static
2. Add the source entry to `data-sources.json`
3. If live API: implement `queryNewSource()` in server.js (follow existing patterns)
4. If cached: create a module following `rxsaver.js` or `blink.js` pattern
5. If static: add the data object to server.js
6. Wire it into the `/api/search` endpoint's `Promise.all()` block
7. Add normalization in the `allPrices` assembly section
8. Add to the `sourcesQueried` response object
9. Update this file and `data-sources.json`
10. Run `node scripts/health-check.js` to verify

## How to Refresh Cache Data

- **SingleCare / GoodRx / RxSaver / Blink:** Run the Apify scraper, download results, replace cache file, restart PM2
- **Medicaid FUL:** Run `scripts/update_ful.sh`
- **Drug dictionary:** Run `node build-dictionary.js` from project root
- **Rx Outreach / VA FSS / IRA / Texas WAC:** Re-scrape from source websites, replace JSON in `data/`

## Health Check

Run `node scripts/health-check.js` to test all sources at once. See the script header for cron scheduling.

---

*RxGator — Data Source Reference | July 26, 2026 | Technology Assessment Project LLC*
