/**
 * RxGator — Log Viewer & Feedback Routes
 * Search log analytics dashboard, CSV export, and tester feedback system.
 * @module log-viewer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fsPromises = require('fs').promises;
const { escapeHtml, csvEscape } = require('./utils');

/** Feedback log file path. */
const FEEDBACK_FILE = path.join(__dirname, 'feedback_log.csv');

if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, 'timestamp,ip,user,helpful,drug,comment\n');
}

/**
 * Mount log viewer, CSV export, and feedback routes on the Express app.
 * @param {Object} app - Express application instance.
 * @param {Object} deps - Dependencies from server.js.
 * @param {Function} deps.feedbackLimiter - Rate limiter for feedback submissions.
 * @param {string} deps.LOG_FILE - Path to the search log CSV file.
 */
module.exports = function(app, { feedbackLimiter, LOG_FILE }) {

  // ============================================================
  // SEARCH LOG VIEWER (admin — protected by Nginx Basic Auth)
  // ============================================================

  app.get('/api/log', async (req, res) => {
    try {
      const log = await fsPromises.readFile(LOG_FILE, 'utf8');
      const lines = log.trim().split('\n');
      const entries = lines.slice(1).reverse();

      const parsed = entries.filter(l => l.trim()).map(line => {
        const cols = line.split(',');
        if (cols.length < 8) return null;
        return {
          timestamp: cols[0],
          ip: (cols[1] || '').replace(/"/g, ''),
          user: (cols[2] || '').replace(/"/g, ''),
          drug: (cols[3] || '').replace(/"/g, ''),
          quantity: cols[4],
          zip: cols[5] || '',
          hits: cols[6],
          price: (cols[7] || '').replace(/"/g, ''),
          source: (cols[8] || '').replace(/"/g, ''),
          autocomplete: cols[9] === '1',
          correctedFrom: (cols[10] || '').replace(/"/g, ''),
          lang: cols[11] || 'en',
        };
      }).filter(Boolean);

      const drugCounts = {};
      parsed.forEach(p => {
        const d = p.drug.toLowerCase();
        drugCounts[d] = (drugCounts[d] || 0) + 1;
      });
      const topDrugs = Object.entries(drugCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      const uniqueIPs = new Set(parsed.map(p => p.ip));
      const acCount = parsed.filter(p => p.autocomplete).length;
      const acRate = parsed.length > 0 ? ((acCount / parsed.length) * 100).toFixed(1) : '0.0';
      const zeroCount = parsed.filter(p => p.hits === '0' || p.hits === 0).length;
      const zeroRate = parsed.length > 0 ? ((zeroCount / parsed.length) * 100).toFixed(1) : '0.0';
      const correctedCount = parsed.filter(p => p.correctedFrom).length;

      res.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RxGator — Search Log</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F4F6F7; color: #2C3E50; }
  .header { background: linear-gradient(135deg, #1B4F72 0%, #2E75B6 100%); color: #fff; padding: 1.5rem; text-align: center; }
  .header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .header p { font-size: 0.85rem; opacity: 0.8; }
  .container { max-width: 1100px; margin: 1.5rem auto; padding: 0 1rem; }
  .stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .stat-card { background: #fff; border-radius: 8px; padding: 1rem 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); flex: 1; min-width: 140px; }
  .stat-card .num { font-size: 2rem; font-weight: 700; color: #1B4F72; }
  .stat-card .label { font-size: 0.78rem; color: #5D6D7E; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 1.5rem; overflow: hidden; }
  .section h2 { padding: 0.75rem 1.25rem; background: #F2F7FA; font-size: 0.95rem; color: #1B4F72; border-bottom: 1px solid #D6EAF8; }
  .top-drugs { padding: 0.75rem 1.25rem; }
  .top-drug { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #F4F6F7; font-size: 0.9rem; }
  .top-drug:last-child { border-bottom: none; }
  .top-drug .name { font-weight: 600; text-transform: capitalize; }
  .top-drug .count { color: #2E75B6; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th { background: #1B4F72; color: #fff; padding: 0.6rem 0.75rem; text-align: left; font-weight: 600; letter-spacing: 0.3px; position: sticky; top: 0; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #F4F6F7; }
  tr:nth-child(even) td { background: #F9FBFC; }
  tr:hover td { background: #EBF5FB; }
  .drug-name { font-weight: 600; text-transform: capitalize; }
  .price { font-weight: 700; color: #1E8449; }
  .time { color: #5D6D7E; font-size: 0.78rem; }
  .back-link { display: inline-block; margin: 1rem 0; color: #2E75B6; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  .back-link:hover { text-decoration: underline; }
  .empty { padding: 2rem; text-align: center; color: #5D6D7E; }
  .export-btn { float: right; padding: 0.4rem 0.8rem; background: #2E75B6; color: #fff; border: none; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer; text-decoration: none; }
  .export-btn:hover { background: #1B4F72; }
  @media (max-width: 600px) { .stats { flex-direction: column; } table { font-size: 0.75rem; } th, td { padding: 0.4rem; } }
</style>
</head>
<body>
<div class="header">
  <h1>RxGator — Search Log</h1>
  <p>Tester activity and search analytics</p>
</div>
<div class="container">
  <a class="back-link" href="/">&larr; Back to search</a>

  <div class="stats">
    <div class="stat-card"><div class="num">${parsed.length}</div><div class="label">Total Searches</div></div>
    <div class="stat-card"><div class="num">${uniqueIPs.size}</div><div class="label">Unique IPs</div></div>
    <div class="stat-card"><div class="num">${acRate}%</div><div class="label">Autocomplete Rate</div></div>
    <div class="stat-card"><div class="num">${zeroRate}%</div><div class="label">Zero-Result Rate</div></div>
    <div class="stat-card"><div class="num">${correctedCount}</div><div class="label">Fuzzy Corrections</div></div>
    <div class="stat-card"><div class="num">${topDrugs.length > 0 ? escapeHtml(topDrugs[0][0]) : '—'}</div><div class="label">Most Searched Drug</div></div>
  </div>

  <div class="section">
    <h2>Top Searched Drugs</h2>
    <div class="top-drugs">
      ${topDrugs.length > 0 ? topDrugs.map(([drug, count]) =>
        `<div class="top-drug"><span class="name">${escapeHtml(drug)}</span><span class="count">${count} search${count > 1 ? 'es' : ''}</span></div>`
      ).join('') : '<div class="empty">No searches yet</div>'}
    </div>
  </div>

  <div class="section">
    <h2>Search History <a class="export-btn" href="/api/log/csv" download="rxgator_search_log.csv">Export CSV</a></h2>
    ${parsed.length > 0 ? `<div style="max-height:500px; overflow-y:auto;">
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Drug</th><th>Qty</th><th>Results</th><th>Lowest Price</th><th>Best Source</th></tr></thead>
      <tbody>
        ${parsed.map(p => {
          const d = new Date(p.timestamp);
          const timeStr = d.toLocaleDateString('en-US', {month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
          return `<tr>
            <td class="time">${escapeHtml(timeStr)}</td>
            <td>${escapeHtml(p.user)}</td>
            <td class="drug-name">${escapeHtml(p.drug)}</td>
            <td>${escapeHtml(p.quantity)}-day</td>
            <td>${escapeHtml(p.hits)}</td>
            <td class="price">${p.price ? '$' + escapeHtml(p.price) : '—'}</td>
            <td>${escapeHtml(p.source)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>` : '<div class="empty">No searches recorded yet. Try searching for a drug on the main page.</div>'}
  </div>
</div>
</body>
</html>`);
    } catch (err) {
      res.type('text/html').send('<h1>No search log found</h1><p><a href="/">Back to search</a></p>');
    }
  });

  // CSV export
  app.get('/api/log/csv', async (req, res) => {
    try {
      const log = await fsPromises.readFile(LOG_FILE, 'utf8');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rxgator_search_log.csv');
      res.send(log);
    } catch (err) {
      res.status(404).send('No log file found');
    }
  });

  // ============================================================
  // FEEDBACK SYSTEM
  // ============================================================

  app.post('/api/feedback', feedbackLimiter, async (req, res) => {
    try {
      const { helpful, comment, drug } = req.body;
      const timestamp = new Date().toISOString();
      const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      let user = 'unknown';
      const auth = req.headers['authorization'];
      if (auth && auth.startsWith('Basic ')) {
        try { user = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':')[0]; } catch(e) {}
      }
      const line = `${timestamp},${csvEscape(ip)},${csvEscape(user)},${csvEscape(helpful || '')},${csvEscape(drug || '')},${csvEscape((comment || '').replace(/\n/g, ' '))}\n`;
      await fsPromises.appendFile(FEEDBACK_FILE, line);
      console.log(`[FEEDBACK] ${escapeHtml(user)} on "${escapeHtml(drug || '')}": helpful=${helpful}`);
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('Feedback error:', err.message);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  app.get('/api/feedback', async (req, res) => {
    try {
      const log = await fsPromises.readFile(FEEDBACK_FILE, 'utf8');
      const lines = log.trim().split('\n');
      const entries = lines.slice(1).reverse();
      const parsed = entries.filter(l => l.trim()).map(line => {
        const m = line.match(/^([^,]+),([^,]*),([^,]*),([^,]*),("?[^"]*"?),("?.*"?)$/);
        if (!m) return null;
        return { timestamp: m[1], ip: m[2], user: m[3], helpful: m[4], drug: m[5].replace(/^"|"$/g, ''), comment: m[6].replace(/^"|"$/g, '') };
      }).filter(Boolean);

      const yesCount = parsed.filter(p => p.helpful === 'yes').length;
      const noCount = parsed.filter(p => p.helpful === 'no').length;
      const somewhatCount = parsed.filter(p => p.helpful === 'somewhat').length;

      res.type('text/html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RxGator — Feedback</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#F4F6F7; color:#2C3E50; }
  .header { background:linear-gradient(135deg,#1B4F72,#2E75B6); color:#fff; padding:1.5rem; text-align:center; }
  .header h1 { font-size:1.5rem; margin-bottom:0.25rem; }
  .container { max-width:800px; margin:1.5rem auto; padding:0 1rem; }
  .stats { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; }
  .stat { background:#fff; border-radius:8px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.08); flex:1; min-width:120px; text-align:center; }
  .stat .num { font-size:2rem; font-weight:700; color:#1B4F72; }
  .stat .label { font-size:0.75rem; color:#5D6D7E; text-transform:uppercase; }
  .card { background:#fff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); margin-bottom:0.75rem; padding:1rem 1.25rem; }
  .card .meta { font-size:0.78rem; color:#5D6D7E; margin-bottom:0.3rem; }
  .card .helpful { display:inline-block; padding:0.15rem 0.5rem; border-radius:3px; font-size:0.75rem; font-weight:700; }
  .helpful-yes { background:#D5F5E3; color:#145A32; }
  .helpful-somewhat { background:#FDEBD0; color:#A04000; }
  .helpful-no { background:#FADBD8; color:#C0392B; }
  .card .comment { font-size:0.9rem; margin-top:0.3rem; }
  .back { display:inline-block; margin:1rem 0; color:#2E75B6; text-decoration:none; font-weight:600; }
  .back:hover { text-decoration:underline; }
  .empty { padding:2rem; text-align:center; color:#5D6D7E; }
</style></head><body>
<div class="header"><h1>Tester Feedback</h1><p>${parsed.length} responses collected</p></div>
<div class="container">
  <a class="back" href="/">&larr; Back to search</a> &nbsp; <a class="back" href="/api/log">Search log</a>
  <div class="stats">
    <div class="stat"><div class="num">${yesCount}</div><div class="label">Yes, helpful</div></div>
    <div class="stat"><div class="num">${somewhatCount}</div><div class="label">Somewhat</div></div>
    <div class="stat"><div class="num">${noCount}</div><div class="label">Not helpful</div></div>
    <div class="stat"><div class="num">${parsed.filter(p => p.comment).length}</div><div class="label">With comments</div></div>
  </div>
  ${parsed.length === 0 ? '<div class="empty">No feedback yet.</div>' : parsed.map(p => {
    const d = new Date(p.timestamp);
    const time = d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const hClass = p.helpful === 'yes' ? 'helpful-yes' : (p.helpful === 'no' ? 'helpful-no' : 'helpful-somewhat');
    return `<div class="card">
      <div class="meta">${escapeHtml(time)} &middot; ${escapeHtml(p.user)} ${p.drug ? `&middot; searched <strong>${escapeHtml(p.drug)}</strong>` : ''} ${p.helpful ? `&middot; <span class="helpful ${hClass}">${escapeHtml(p.helpful)}</span>` : ''}</div>
      ${p.comment ? `<div class="comment">${escapeHtml(p.comment)}</div>` : '<div class="comment" style="color:#AEB6BF; font-style:italic;">No comment</div>'}
    </div>`;
  }).join('')}
</div></body></html>`);
    } catch (err) {
      res.type('text/html').send('<h1>No feedback yet</h1><p><a href="/">Back</a></p>');
    }
  });
};
