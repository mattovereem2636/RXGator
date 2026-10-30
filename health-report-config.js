/**
 * health-report-config.js — traffic that /api/health/report leaves out of the search-quality rates.
 *
 * WHY (2026-10-14): the zero-result rate read 11.63%. 18 of the 19 zero-result rows came from an
 * Alibaba Cloud crawler (one IP per request, 8–30 s apart). Real users were at 0.87%. Earlier
 * spikes (2026-09-18, 2026-09-24) came from test searches run on the server itself. Those searches
 * say nothing about what users find, so the report counts them separately instead.
 *
 * Edit the lists here, not in health-report.js. Restart the app after a change.
 * IP ranges come from RDAP lookups on 2026-10-14 (Alibaba Cloud LLC).
 */
'use strict';

/** Exact addresses: the RxGator server and loopback. */
const SERVER_IPS = ['74.208.32.197'];
const LOOPBACK_IPS = ['127.0.0.1', '::1', 'localhost'];

/** Inclusive IPv4 ranges for known crawlers. */
const CRAWLER_RANGES = [
  { name: 'Alibaba Cloud', start: '47.74.0.0', end: '47.87.255.255' },
  { name: 'Alibaba Cloud', start: '47.235.0.0', end: '47.246.255.255' },
];

/** Column names the search log may use for the visitor IP (logSearch writes column 2). */
const IP_COLUMN_NAMES = ['ip', 'ip_address', 'client_ip', 'remote_ip', 'remote_addr'];

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const BYTE_MAX = 255;

/** @returns {number|null} The IPv4 address as an unsigned integer, or null when it is not IPv4. */
function ipv4ToInt(ip) {
  const m = IPV4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > BYTE_MAX)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

const RANGES = CRAWLER_RANGES.map((r) => ({ name: r.name, start: ipv4ToInt(r.start), end: ipv4ToInt(r.end) }));

/**
 * Normalize a logged IP: first entry of an X-Forwarded-For list, no quotes, no IPv4-mapped prefix.
 * @param {string} raw
 * @returns {string}
 */
function normalizeIp(raw) {
  return String(raw || '').split(',')[0].replace(/"/g, '').trim().replace(/^::ffff:/i, '').toLowerCase();
}

/**
 * Classify one logged IP.
 * @param {string} raw - The IP cell from search_log.csv.
 * @returns {'server'|'loopback'|'crawler'|null} null means a normal visitor.
 */
function classifyIp(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return null;
  if (SERVER_IPS.includes(ip)) return 'server';
  if (LOOPBACK_IPS.includes(ip)) return 'loopback';
  const n = ipv4ToInt(ip);
  if (n !== null && RANGES.some((r) => n >= r.start && n <= r.end)) return 'crawler';
  return null;
}

module.exports = { SERVER_IPS, LOOPBACK_IPS, CRAWLER_RANGES, IP_COLUMN_NAMES, classifyIp, normalizeIp };
