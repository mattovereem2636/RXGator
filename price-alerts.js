/**
 * RxGator — Price Alerts
 * Lets users subscribe to price-drop alerts for a drug, delivered via
 * Resend (same service the weekly drug-gap report already uses).
 * @module price-alerts
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data', 'alerts_subscribers.json');
const ENV_FILE = path.join(__dirname, '.env.healthcheck');
const PORT = process.env.PORT || 3100;
const DROP_THRESHOLD_PCT = 3;

function loadEnv(file) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

function loadSubscribers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Alerts] Failed to load subscribers:', err.message);
  }
  return [];
}

function saveSubscribers(subs) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(subs, null, 2));
}

async function sendAlertEmail(to, subject, body) {
  const env = loadEnv(ENV_FILE);
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Alerts] RESEND_API_KEY not set in .env.healthcheck — skipping email.');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RxGator Alerts <onboarding@resend.dev>',
        to: [to],
        subject,
        text: body,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[Alerts] Failed to send email:', err.message);
    return false;
  }
}

/**
 * Look up the current lowest price for a drug by calling RxGator's own
 * /api/search endpoint — reuses all existing source-aggregation logic
 * instead of duplicating it.
 */
async function getLowestPrice(drug, zip) {
  const qs = new URLSearchParams({ drug });
  if (zip) qs.set('zip', zip);
  const url = `http://localhost:${PORT}/api/search?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
  const data = await res.json();
  const prices = (data.pricingResults || [])
    .map(p => (p.priceFor30 != null ? p.priceFor30 : (p.unitPrice != null ? p.unitPrice : p.priceForQuantity)))
    .filter(p => typeof p === 'number' && p > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

module.exports = function (app) {
  /**
   * POST /api/alerts/subscribe  { email, drug, zip? }
   */
  app.post('/api/alerts/subscribe', async (req, res) => {
    const body = req.body || {};
    const email = body.email;
    const drug = body.drug;
    const zip = body.zip;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!drug || !String(drug).trim()) {
      return res.status(400).json({ error: 'drug is required', code: 'MISSING_DRUG' });
    }

    const subs = loadSubscribers();
    const normalizedDrug = String(drug).trim().toLowerCase();
    const existing = subs.find(s => s.email === email && s.drug === normalizedDrug);
    if (existing) {
      return res.json({ status: 'already_subscribed', drug: normalizedDrug, email });
    }

    let lastPrice = null;
    try {
      lastPrice = await getLowestPrice(normalizedDrug, zip);
    } catch (err) {
      console.error('[Alerts] Initial price lookup failed:', err.message);
    }

    const token = crypto.randomBytes(24).toString('hex');
    subs.push({
      email,
      drug: normalizedDrug,
      zip: zip || null,
      lastPrice,
      token,
      subscribedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });
    saveSubscribers(subs);

    res.json({ status: 'subscribed', drug: normalizedDrug, email, currentPrice: lastPrice });
  });

  /**
   * GET /api/alerts/unsubscribe?token=xxx
   */
  app.get('/api/alerts/unsubscribe', (req, res) => {
    const token = String(req.query.token || '');
    const subs = loadSubscribers();
    const idx = subs.findIndex(s => s.token === token);
    if (idx === -1) {
      return res.status(404).send('Subscription not found or already removed.');
    }
    const removed = subs.splice(idx, 1)[0];
    saveSubscribers(subs);
    res.send('You have been unsubscribed from price alerts for ' + removed.drug + '.');
  });

  /**
   * GET /api/alerts/status?email=xxx
   */
  app.get('/api/alerts/status', (req, res) => {
    const email = String(req.query.email || '');
    if (!email) {
      return res.status(400).json({ error: 'email query param is required', code: 'MISSING_EMAIL' });
    }
    const subs = loadSubscribers().filter(s => s.email === email);
    res.json({
      email,
      subscriptions: subs.map(s => ({ drug: s.drug, zip: s.zip, lastPrice: s.lastPrice, subscribedAt: s.subscribedAt })),
    });
  });

  /**
   * POST /api/alerts/trigger  (admin — Bearer HEALTH_TOKEN if set)
   * Re-checks price for every subscription; emails and updates lastPrice
   * on any drop greater than DROP_THRESHOLD_PCT.
   */
  app.post('/api/alerts/trigger', async (req, res) => {
    const healthToken = process.env.HEALTH_TOKEN;
    if (healthToken) {
      const auth = req.headers.authorization;
      if (!auth || auth !== 'Bearer ' + healthToken) return res.status(401).json({ error: 'Unauthorized' });
    }

    const subs = loadSubscribers();
    let checked = 0;
    let alerted = 0;

    for (const sub of subs) {
      checked++;
      try {
        const currentPrice = await getLowestPrice(sub.drug, sub.zip);
        sub.lastCheckedAt = new Date().toISOString();
        if (currentPrice == null) continue;

        if (sub.lastPrice != null && sub.lastPrice > 0) {
          const dropPct = ((sub.lastPrice - currentPrice) / sub.lastPrice) * 100;
          if (dropPct >= DROP_THRESHOLD_PCT) {
            const sent = await sendAlertEmail(
              sub.email,
              'Price drop alert: ' + sub.drug,
              'Good news \u2014 the price for ' + sub.drug + ' dropped from $' + sub.lastPrice.toFixed(2) + ' to $' + currentPrice.toFixed(2) + ' (' + dropPct.toFixed(1) + '% off).\n\n' +
              'Check current prices: https://rxgator.info/app?drug=' + encodeURIComponent(sub.drug) + '\n\n' +
              'Unsubscribe: https://rxgator.info/api/alerts/unsubscribe?token=' + sub.token
            );
            if (sent) alerted++;
          }
        }
        sub.lastPrice = currentPrice;
      } catch (err) {
        console.error('[Alerts] Trigger check failed for ' + sub.email + '/' + sub.drug + ':', err.message);
      }
    }

    saveSubscribers(subs);
    res.json({ checked, alerted });
  });
};
