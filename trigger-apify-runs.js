#!/usr/bin/env node
/**
 * trigger-apify-runs.js
 *
 * Triggers both Apify scrapers (RxSaver + Blink Health), waits for them
 * to finish, then runs import-apify-data.js to update the cache files.
 *
 * Usage:
 *   APIFY_TOKEN="your-token" node trigger-apify-runs.js
 *   APIFY_TOKEN="your-token" node trigger-apify-runs.js --no-import  # trigger only, skip import
 *
 * Designed to be called by a cron job or Cowork scheduled task.
 *
 * Deployment:
 *   Place in /var/www/rxaggregator/ alongside import-apify-data.js
 */

const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

// --- Configuration ---
const ACTORS = {
  rxsaver: {
    actorId: 'apify~web-scraper',
    label: 'Web Scraper (RxSaver)'
  },
  blink: {
    actorId: 'apify~playwright-scraper',
    label: 'Playwright Scraper (Blink Health)'
  }
};

const POLL_INTERVAL_MS = 60000;  // Check every 60 seconds
const MAX_WAIT_MS = 3600000;     // Give up after 60 minutes

// --- Parse CLI args ---
const args = process.argv.slice(2);
const skipImport = args.includes('--no-import');

// --- HTTP helpers ---
function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// --- Trigger a run ---
async function triggerRun(actorId, token) {
  const url = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;
  const result = await httpsRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, '{}');

  if (result.status !== 201) {
    throw new Error(`Failed to trigger run: HTTP ${result.status}`);
  }

  return result.data.data;
}

// --- Check run status ---
async function checkRunStatus(runId, token) {
  const url = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const result = await httpsGet(url);
  return result.data;
}

// --- Wait for a run to finish ---
async function waitForRun(runId, label, token) {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const run = await checkRunStatus(runId, token);
    const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);

    if (run.status === 'SUCCEEDED') {
      console.log(`  [${label}] Completed in ${elapsed} min. Results: ${run.stats.itemCount || 0}`);
      return run;
    }

    if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status === 'TIMED-OUT') {
      throw new Error(`${label} ended with status: ${run.status}`);
    }

    console.log(`  [${label}] Still running... (${elapsed} min, status: ${run.status})`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`${label} timed out after ${MAX_WAIT_MS / 60000} minutes`);
}

// --- Sleep helper ---
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Main ---
async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('ERROR: APIFY_TOKEN environment variable is required.');
    process.exit(1);
  }

  console.log('=== RxGator Apify Run Trigger ===');
  console.log(`  Time: ${new Date().toISOString()}\n`);

  // 1. Trigger both runs
  const runs = {};
  for (const [key, actor] of Object.entries(ACTORS)) {
    try {
      console.log(`  Triggering ${actor.label}...`);
      const run = await triggerRun(actor.actorId, token);
      runs[key] = { runId: run.id, label: actor.label };
      console.log(`  Started run: ${run.id}`);
    } catch (err) {
      console.error(`  ERROR triggering ${actor.label}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n  Both scrapers running. Waiting for completion...\n');

  // 2. Wait for both to finish
  const results = {};
  let anyFailed = false;

  for (const [key, info] of Object.entries(runs)) {
    try {
      results[key] = await waitForRun(info.runId, info.label, token);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.error('\n  Some scrapers failed. Check Apify console for details.');
    process.exit(1);
  }

  console.log('\n  All scrapers complete.\n');

  // 3. Run import
  if (skipImport) {
    console.log('  --no-import flag set. Skipping import step.');
    console.log('  Run manually: APIFY_TOKEN="..." node import-apify-data.js');
  } else {
    console.log('  Running import...\n');
    try {
      const importScript = path.join(__dirname, 'import-apify-data.js');
      execSync(`node "${importScript}"`, {
        stdio: 'inherit',
        env: { ...process.env, APIFY_TOKEN: token }
      });

      // 4. Restart PM2
      console.log('\n  Restarting PM2...');
      execSync('pm2 restart rxaggregator', { stdio: 'inherit' });
      console.log('  PM2 restarted.');
    } catch (err) {
      console.error(`  ERROR during import/restart: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
