# RxGator

Drug price comparison aggregator. Searches 18+ data sources to find the lowest prescription drug prices for US consumers. Bilingual English/Spanish.

**Live:** [https://rxgator.info](https://rxgator.info)

## Stack

- **Runtime:** Node.js + Express 5
- **Process manager:** PM2
- **Reverse proxy:** Nginx
- **Server:** Ubuntu 22.04 (IONOS VPS)
- **Analytics:** Umami (self-hosted)

## Data Sources (18+)

Live API: Cost Plus Drugs, NADAC, RxNorm, openFDA, MedlinePlus, Medicare Part D, FDA Drug Shortages.
Cached/scraped: SingleCare, GoodRx, Medicaid FUL, Rx Outreach, VA FSS, RxSaver, Blink Health, Manufacturer Assistance.
Static: Walmart $4 List, Amazon RxPass, Costco Pharmacy.

## Setup

1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in values.
3. Run `npm install`.
4. Run `npm start` (or `npm run dev` for watch mode).

## Environment Variables

See `.env.example` for required variables. Key ones: SMTP credentials (SendGrid), Apify API token, PORT, NODE_ENV.

## Deployment

1. SCP changed files to `/var/www/rxaggregator/` on the production server.
2. Run `pm2 restart rxaggregator`.
3. Verify: site loads, search works, EN/ES toggle works, data source links resolve.

## Project Structure

- `server.js` — Main Express application (search pipeline, cache management, admin routes)
- `public/` — Static HTML pages, CSS, client-side JS
- `public/articles/` — SEO article pages (EN + ES)
- `data/` — Drug name dictionaries, brand-generic mappings
- `scripts/` — Health checks, accessibility audits, backups, deployment

## Documentation

- `CHANGELOG.md` — Version history
- `SOURCES.md` — Data source documentation
- `INTEGRATION-GUIDE.md` — API integration details
