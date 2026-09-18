require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const fuzzySearch = require('./fuzzy-search');
fuzzySearch.init(path.join(__dirname, 'data'));

// Global error handlers — log and exit for clean PM2 restart
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});


const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? true
    : ['https://rxgator.info', 'https://www.rxgator.info'],
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200,
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com", "https://cloud.umami.is"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cloud.umami.is", "https://pagead2.googlesyndication.com", "https://ep1.adtrafficquality.google"],
      frameSrc: ["https://googleads.g.doubleclick.net"],
    },
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
require("./health-report")(app);
require('./pharmacy-locator')(app);
require('./price-alerts')(app);
require('./drug-interactions')(app);
require("./trumprx-prices")(app);
require("./nadac-prices")(app);
require("./healthwarehouse-prices")(app);

// Rate limiting for search API — 30 requests per minute per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many searches. Please wait a minute and try again.' },
  validate: false,
  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

// Rate limiting for feedback — 5 submissions per 15 minutes per IP
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please wait and try again.' },
  validate: false,
  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

const PORT = process.env.PORT || 3100;
const LOG_FILE = path.join(__dirname, 'search_log.csv');

// Initialize log file with headers if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, 'timestamp,ip,user,drug,quantity,zip,sources_hit,lowest_price,lowest_source,autocomplete,corrected_from,lang\n');
}


// Mount route modules
require('./search-handler')(app, { searchLimiter, LOG_FILE });
require('./log-viewer')(app, { feedbackLimiter, LOG_FILE });
require('./admin-routes')(app);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});


app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   RxGator Prototype v0.5                 ║`);
  console.log(`  ║   http://localhost:${PORT}                  ║`);
  console.log(`  ║                                          ║`);
  console.log(`  ║   Data Sources (22):                     ║`);
  console.log(`  ║   ✓ Cost Plus Drugs (live API)           ║`);
  console.log(`  ║   ✓ NADAC 2026 (pharmacy costs, 6327 drugs)     ║`);
  console.log(`  ║   ✓ Medicaid FUL (federal upper limit)  ║`);
  console.log(`  ║   ✓ openFDA (drug normalization)        ║`);
  console.log(`  ║   ✓ RxNorm (NLM - drug matching)        ║`);
  console.log(`  ║   ✓ MedlinePlus (NLM - drug info)       ║`);
  console.log(`  ║   ✓ Medicare Part D (CMS - live API)    ║`);
  console.log(`  ║   ✓ SingleCare (Apify cache)            ║`);
  console.log(`  ║   ✓ GoodRx (Apify cache)                ║`);
  console.log(`  ║   ✓ Amazon RxPass (built-in, 55 drugs)  ║`);
  console.log(`  ║   ✓ Walmart Rx Program (built-in)       ║`);
  console.log(`  ║   ✓ Costco Pharmacy (estimated)         ║`);
  console.log(`  ║   ✓ Rx Outreach (nonprofit, 1189 drugs) ║`);
  console.log(`  ║   ✓ VA FSS (govt benchmark, 4660 drugs) ║`);
  console.log(`  ║   ✓ IRA Negotiated (Medicare, 40 drugs) ║`);
  console.log(`  ║   ✓ TX WAC (mfr list price, 16K drugs)  ║`);
  console.log(`  ║   ✓ RxSaver (Apify cache, 194 drugs)    ║`);
  console.log(`  ║   ✓ Blink Health (Apify cache, 69 drugs)║`);
  console.log(`  ║   ✓ FedRx (govt deals, 841 drugs)      ║`);
  console.log(`  ║   ✓ HealthWarehouse (online, 930 drugs) ║`);
  console.log(`  ║   ✓ Inside Rx (Apify cache)              ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
