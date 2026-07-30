#!/usr/bin/env node
// ============================================================
// RxGator Data Source Health Check
// Automated test of all data sources — live APIs and cache files
//
// Usage:
//   node scripts/health-check.js              # Full check, console output
//   node scripts/health-check.js --json       # JSON output (for monitoring)
//   node scripts/health-check.js --quiet      # Only show failures
//
// Schedule via cron:
//   0 6 * * * cd /var/www/rxaggregator && node scripts/health-check.js >> logs/health-check.log 2>&1
//
// Reads source registry from: data-sources.json
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(ROOT, 'data-sources.json');
const LOG_DIR = path.join(ROOT, 'logs');

// Parse CLI flags
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const quietMode = args.includes('--quiet');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const start = Date.now();
    const res = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - start;
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, elapsed, body: await res.text() };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function checkCacheFile(cacheFile) {
  // Resolve relative to root — some paths include "data/" prefix, some don't
  const filePath = path.isAbsolute(cacheFile)
    ? cacheFile
    : path.join(ROOT, cacheFile);

  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'File not found', path: filePath };
  }

  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const ageHours = ((Date.now() - stats.mtimeMs) / 3600000).toFixed(1);
  const ageDays = (ageHours / 24).toFixed(1);

  // Try to parse and count entries
  let entryCount = null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data.medications) {
      entryCount = data.medications.length;
    } else if (data.drugs) {
      entryCount = Object.keys(data.drugs).length;
    } else if (Array.isArray(data)) {
      entryCount = data.length;
    } else {
      entryCount = Object.keys(data).length;
    }
  } catch (e) {
    return { ok: false, error: `Parse error: ${e.message}`, path: filePath, sizeMB };
  }

  // Warn if cache is older than 90 days
  const stale = parseFloat(ageDays) > 90;

  return {
    ok: true,
    stale,
    path: filePath,
    sizeMB,
    ageDays,
    ageHours,
    entryCount,
    lastModified: new Date(stats.mtimeMs).toISOString(),
  };
}

async function checkLiveAPI(source) {
  const url = source.healthCheckUrl;
  if (!url) {
    return { ok: false, error: 'No health check URL configured', skipped: true };
  }

  try {
    const result = await fetchWithTimeout(url, 20000);

    if (!result.ok) {
      // FDA drug shortages API returns 404 when no results — that's OK
      if (source.healthCheckExpect === 'results_or_error' && result.status === 404) {
        return {
          ok: true,
          status: result.status,
          elapsed: result.elapsed,
          note: 'API responded (404 = no matching results, expected behavior)',
        };
      }
      return { ok: false, error: `HTTP ${result.status}`, elapsed: result.elapsed };
    }

    // Validate response structure
    let parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch (e) {
      return { ok: false, error: 'Response is not valid JSON', elapsed: result.elapsed };
    }

    const expect = source.healthCheckExpect;
    let valid = false;

    if (expect === 'results') {
      valid = parsed.results && (Array.isArray(parsed.results) ? parsed.results.length > 0 : true);
    } else if (expect === 'approximateGroup') {
      valid = parsed.approximateGroup && parsed.approximateGroup.candidate;
    } else if (expect === 'feed') {
      valid = parsed.feed && parsed.feed.entry;
    } else if (expect === 'array') {
      valid = Array.isArray(parsed) && parsed.length > 0;
    } else if (expect === 'results_or_error') {
      valid = true; // Any response is fine
    } else {
      valid = true; // No specific expectation — 200 OK is enough
    }

    return {
      ok: valid,
      status: result.status,
      elapsed: result.elapsed,
      error: valid ? null : `Response missing expected field: "${expect}"`,
    };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timeout (20s)' : err.message;
    return { ok: false, error: msg };
  }
}

// ── Main ────────────────────────────────────────────────────

async function runHealthCheck() {
  // Load registry
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error('ERROR: data-sources.json not found at', REGISTRY_FILE);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  const sources = registry.sources;
  const timestamp = new Date().toISOString();
  const results = {};
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let skipCount = 0;

  if (!jsonOutput && !quietMode) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RxGator Data Source Health Check');
    console.log(`  ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════\n');
  }

  for (const [key, source] of Object.entries(sources)) {
    let result;

    // critical defaults to true if not specified
    const isCritical = source.critical !== false;

    if (source.type === 'live_api') {
      // Check live API
      result = await checkLiveAPI(source);
      if (result.ok) {
        result.status_label = result.stale ? 'WARN' : 'PASS';
      } else if (result.skipped) {
        result.status_label = 'SKIP';
        skipCount++;
      } else {
        // Non-critical failures become warnings instead of failures
        result.status_label = isCritical ? 'FAIL' : 'WARN';
        if (!isCritical) result.note = (result.note ? result.note + ' | ' : '') + 'Non-critical source — treated as warning';
      }
    } else if (source.cacheFile) {
      // Check cache file
      result = checkCacheFile(source.cacheFile);
      if (result.ok) {
        result.status_label = result.stale ? 'WARN' : 'PASS';
      } else {
        result.status_label = isCritical ? 'FAIL' : 'WARN';
        if (!isCritical) result.note = (result.note ? result.note + ' | ' : '') + 'Non-critical source — treated as warning';
      }
    } else {
      // Static/hardcoded — no file or API to check
      result = { ok: true, status_label: 'PASS', note: 'Static data hardcoded in server.js' };
    }

    // Count
    if (result.status_label === 'PASS') passCount++;
    else if (result.status_label === 'FAIL') failCount++;
    else if (result.status_label === 'WARN') warnCount++;

    results[key] = {
      name: source.name,
      type: source.type,
      category: source.category,
      ...result,
    };

    // Console output
    if (!jsonOutput) {
      const icon = result.status_label === 'PASS' ? '✅' :
                   result.status_label === 'WARN' ? '⚠️' :
                   result.status_label === 'FAIL' ? '❌' : '⏭️';

      if (quietMode && result.status_label === 'PASS') continue;

      const details = [];
      if (result.elapsed) details.push(`${result.elapsed}ms`);
      if (result.entryCount) details.push(`${result.entryCount} entries`);
      if (result.sizeMB) details.push(`${result.sizeMB}MB`);
      if (result.ageDays) details.push(`${result.ageDays} days old`);
      if (result.error) details.push(result.error);
      if (result.note) details.push(result.note);
      if (result.stale) details.push('STALE — consider refreshing');

      console.log(`${icon} [${result.status_label}] ${source.name}`);
      if (details.length > 0) {
        console.log(`         ${details.join(' | ')}`);
      }
    }
  }

  // Summary
  const summary = {
    timestamp,
    total: Object.keys(results).length,
    pass: passCount,
    fail: failCount,
    warn: warnCount,
    skip: skipCount,
    overallStatus: failCount === 0 ? (warnCount > 0 ? 'DEGRADED' : 'HEALTHY') : 'UNHEALTHY',
  };

  if (jsonOutput) {
    const output = { summary, results };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings, ${skipCount} skipped`);
    console.log(`  Overall: ${summary.overallStatus}`);
    console.log('═══════════════════════════════════════════════════════');
  }

  // Write log file
  const logFile = path.join(LOG_DIR, 'health-check.log');
  const logEntry = `${timestamp} | ${summary.overallStatus} | Pass: ${passCount} Fail: ${failCount} Warn: ${warnCount}\n`;
  fs.appendFileSync(logFile, logEntry);

  // Write latest results JSON (for monitoring dashboards)
  const latestFile = path.join(LOG_DIR, 'health-check-latest.json');
  fs.writeFileSync(latestFile, JSON.stringify({ summary, results }, null, 2));

  // Exit code: 0 = healthy, 1 = failures
  process.exit(failCount > 0 ? 1 : 0);
}

runHealthCheck().catch(err => {
  console.error('Health check crashed:', err);
  process.exit(2);
});
