// check-blink-health.js
// Blink Health "canary" monitor — run this periodically (e.g. weekly cron)
// to detect if Blink Health reopens public per-drug pricing pages.
//
// BACKGROUND (as of 2026-09-18):
// Blink Health restructured into three product lines, and public per-drug
// pricing pages are gone from ALL of them:
//   1. Quick Save (generic coupons — the old data source for blink_cache.json)
//      is now a marketing page only. The flat URL pattern the cache was
//      built on (blinkhealth.com/{drug-slug}) 404s for every drug, including
//      ones already in the cache (verified with "albuterol").
//   2. BlinkRx (branded meds, e.g. would cover Mounjaro/Gemtesa/Nubeqa) is
//      fully gated behind a doctor-sent prescription + patient login. No
//      public drug directory or price list exists.
//   3. Blink Cash Express (mail-order generics) requires login and is
//      "not accepting new patients at this time."
//
// CONCLUSION: blink_cache.json (204 drugs) cannot currently be refreshed by
// scraping. Treat it as a frozen/legacy dataset — still useful as a last-
// known-price reference, but not livecheckable. This script exists so a
// future site change (Blink reopening public pricing) gets caught quickly
// instead of silently — run it on a schedule and alert on any check flipping
// from its expected state.
//
// Usage: node check-blink-health.js

const https = require('https');

function fetchStatus(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', (err) => resolve({ status: 0, error: err.message }));
  });
}

const CHECKS = [
  {
    name: 'Quick Save legacy drug page (albuterol) — expect 404',
    url: 'https://www.blinkhealth.com/albuterol',
    expectStatus: 404,
  },
  {
    name: 'Quick Save landing page — expect marketing-only page (no drug price table)',
    url: 'https://www.blinkhealth.com/quicksave',
    expectStatus: 200,
    expectBodyNotContains: 'est. price with coupon',
  },
  {
    name: 'BlinkRx homepage — expect login-gated, no public drug directory',
    url: 'https://www.blinkrx.com/',
    expectStatus: 200,
    expectBodyNotContains: 'drug-directory',
  },
  {
    // NOTE: this page is a statically-exported Next.js shell (buildId in
    // __NEXT_DATA__, empty pageProps) — the actual "accepting new patients"
    // text and the /login redirect happen client-side via JS after a runtime
    // API call. A plain HTTP fetch (this script, or `curl`) can NEVER see
    // that text; only a JS-executing browser can. Verified 2026-09-18: raw
    // HTML is 85KB and contains neither "not accepting new patients" nor
    // "login" anywhere, even though the real rendered page shows both. So
    // this check only confirms the page is still up and still the same
    // static-export shell (same nextExport marker) — it can't verify the
    // enrollment-status text. Treat any FLAG here as "go look manually in a
    // real browser," not as a confirmed site change.
    name: 'Blink Cash Express — expect page reachable (enrollment text is JS-rendered, not checkable here)',
    url: 'https://www.blinkhealth.com/cashexpress',
    expectStatus: 200,
    expectBodyContains: 'nextExport',
  },
];

(async () => {
  console.log(`Blink Health canary check — ${new Date().toISOString()}\n`);
  let anyFlagged = false;

  for (const check of CHECKS) {
    const { status, body, error } = await fetchStatus(check.url);
    let ok = true;
    const notes = [];

    if (error) {
      ok = false;
      notes.push(`fetch error: ${error}`);
    } else {
      if (check.expectStatus && status !== check.expectStatus) {
        ok = false;
        notes.push(`expected HTTP ${check.expectStatus}, got ${status}`);
      }
      if (check.expectBodyContains && !body.includes(check.expectBodyContains)) {
        ok = false;
        notes.push(`expected body to contain "${check.expectBodyContains}"`);
      }
      if (check.expectBodyNotContains && body.includes(check.expectBodyNotContains)) {
        ok = false;
        notes.push(`body now contains "${check.expectBodyNotContains}" — site may have changed!`);
      }
    }

    console.log(`${ok ? 'OK  ' : 'FLAG'} ${check.name}`);
    if (!ok) {
      anyFlagged = true;
      notes.forEach((n) => console.log(`       ${n}`));
    }
  }

  console.log('');
  if (anyFlagged) {
    console.log('RESULT: Something changed at Blink Health. Re-investigate manually —');
    console.log('public pricing may have reopened, or a check needs updating.');
    process.exit(1);
  } else {
    console.log('RESULT: No change detected. Blink Health public pricing still unavailable.');
  }
})();
