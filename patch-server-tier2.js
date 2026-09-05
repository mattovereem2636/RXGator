/**
 * RxGator Tier 2 Server Patch — S-5 + S-6
 * S-5: Trust proxy + fix rate limiter IP handling
 * S-6: Add rate limiters to import/reload/admin routes
 * Date: 2026-08-28
 *
 * Usage: node patch-server-tier2.js [path-to-server.js]
 * IMPORTANT: Apply AFTER patch-tier1-security.js
 */

const fs = require('fs');
const path = require('path');

const serverFile = process.argv[2] || path.join(__dirname, '..', 'rxaggregator', 'server.js');

if (!fs.existsSync(serverFile)) {
  console.error(`[PATCH] File not found: ${serverFile}`);
  process.exit(1);
}

let src = fs.readFileSync(serverFile, 'utf8');
const original = src;
let patchCount = 0;

function applyPatch(label, search, replacement) {
  const idx = src.indexOf(search);
  if (idx === -1) {
    console.error(`[PATCH] FAILED — could not find marker for: ${label}`);
    console.error(`[PATCH] Searched for: ${search.substring(0, 80)}...`);
    process.exit(1);
  }
  const second = src.indexOf(search, idx + 1);
  if (second !== -1) {
    console.error(`[PATCH] FAILED — marker is not unique for: ${label}`);
    process.exit(1);
  }
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
  patchCount++;
  console.log(`[PATCH] Applied: ${label}`);
}

// ============================================================
// PATCH 1: S-5 — Add trust proxy before CORS
// ============================================================
applyPatch(
  'S-5: Add trust proxy',
  `const app = express();
app.use(cors({`,
  `const app = express();
app.set('trust proxy', 1);
app.use(cors({`
);

// ============================================================
// PATCH 2: S-5 — Fix searchLimiter keyGenerator
// ============================================================
applyPatch(
  'S-5: Fix searchLimiter keyGenerator',
  `  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

// Rate limiting for feedback`,
  `  keyGenerator: (req) => req.ip,
});

// Rate limiting for feedback`
);

// ============================================================
// PATCH 3: S-5 — Fix feedbackLimiter keyGenerator
// ============================================================
applyPatch(
  'S-5: Fix feedbackLimiter keyGenerator',
  `  keyGenerator: (req) => req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip,
});

const PORT`,
  `  keyGenerator: (req) => req.ip,
});

// Rate limiting for admin/import routes — 10 requests per 15 minutes per IP
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please wait and try again.' },
  validate: false,
  keyGenerator: (req) => req.ip,
});

const PORT`
);

// ============================================================
// PATCH 4: S-6 — Add adminLimiter to /api/log
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to /api/log',
  "app.get('/api/log', requireAdmin, async (req, res) => {",
  "app.get('/api/log', adminLimiter, requireAdmin, async (req, res) => {"
);

// ============================================================
// PATCH 5: S-6 — Add adminLimiter to /api/log/csv
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to /api/log/csv',
  "app.get('/api/log/csv', requireAdmin, async (req, res) => {",
  "app.get('/api/log/csv', adminLimiter, requireAdmin, async (req, res) => {"
);

// ============================================================
// PATCH 6: S-6 — Add adminLimiter to GET /api/feedback
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to GET /api/feedback',
  "app.get('/api/feedback', requireAdmin, async (req, res) => {",
  "app.get('/api/feedback', adminLimiter, requireAdmin, async (req, res) => {"
);

// ============================================================
// PATCH 7: S-6 — Add adminLimiter to SingleCare import
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to SingleCare import',
  "app.post('/api/singlecare/import', requireAdmin,",
  "app.post('/api/singlecare/import', adminLimiter, requireAdmin,"
);

// ============================================================
// PATCH 8: S-6 — Add adminLimiter to GoodRx import
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to GoodRx import',
  "app.post('/api/goodrx/import', requireAdmin,",
  "app.post('/api/goodrx/import', adminLimiter, requireAdmin,"
);

// ============================================================
// PATCH 9: S-6 — Add adminLimiter to RxSaver reload
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to RxSaver reload',
  "app.post('/api/rxsaver/reload', requireAdmin,",
  "app.post('/api/rxsaver/reload', adminLimiter, requireAdmin,"
);

// ============================================================
// PATCH 10: S-6 — Add adminLimiter to Blink reload
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to Blink reload',
  "app.post('/api/blink/reload', requireAdmin,",
  "app.post('/api/blink/reload', adminLimiter, requireAdmin,"
);

// ============================================================
// PATCH 11: S-6 — Add adminLimiter to Optum reload
// ============================================================
applyPatch(
  'S-6: Add adminLimiter to Optum reload',
  "app.post('/api/optum/reload', requireAdmin,",
  "app.post('/api/optum/reload', adminLimiter, requireAdmin,"
);

// ============================================================
// WRITE
// ============================================================
const backupFile = serverFile + '.pre-tier2-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(backupFile, original);
console.log(`[PATCH] Backup saved: ${backupFile}`);

fs.writeFileSync(serverFile, src);
console.log(`[PATCH] All ${patchCount} patches applied successfully`);
console.log('\n[PATCH] Summary:');
console.log('  - S-5: Added trust proxy, rate limiters now use req.ip');
console.log('  - S-6: Created adminLimiter (10 req/15 min)');
console.log('  - S-6: Applied adminLimiter to all admin/import/reload routes');
