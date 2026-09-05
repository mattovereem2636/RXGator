/**
 * RxGator — Shared Utility Functions
 * @module utils
 */

'use strict';

/**
 * Escape a string for safe rendering in HTML admin views.
 * Replaces &, <, >, ", and ' with their HTML entity equivalents.
 * @param {string} str - The string to escape.
 * @returns {string} The HTML-escaped string, or empty string if input is falsy.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate a URL scheme. Returns the URL only if it starts with http: or https:.
 * Blocks javascript:, data:, vbscript:, and all other schemes.
 * @param {string} url - The URL to validate.
 * @returns {string} The safe URL or empty string.
 */
function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

/**
 * Escape a value for safe CSV output.
 * Wraps in quotes, doubles internal quotes, and prefixes formula injection characters.
 * @param {string} val - The value to escape.
 * @returns {string} The CSV-safe quoted string.
 */
function csvEscape(val) {
  let s = String(val || '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Fetch a URL and parse the response as JSON with a configurable timeout.
 * @param {string} url - The URL to fetch.
 * @param {number} [timeoutMs=15000] - Timeout in milliseconds.
 * @returns {Promise<Object>} The parsed JSON response.
 * @throws {Error} If the request times out, fails, or returns a non-OK status.
 */
async function fetchJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  escapeHtml,
  safeUrl,
  csvEscape,
  fetchJSON,
};
