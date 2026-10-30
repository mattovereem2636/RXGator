'use strict';
/**
 * config.js — every constant the 1.5.2 SEO bundle uses, in one place.
 * Change SOURCE_COUNT here and every page, the methodology pages, the FAQ, and llms.txt follow.
 */
const path = require('path');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const PUBLIC_DIR = path.join(BASE, 'public');
const ORIGIN = 'https://rxgator.info';

/** Release bookkeeping. NEW_DATE defaults to today in Chicago; override with --date=YYYY-MM-DD. */
// Renumbered 2026-10-14: 1.5.2 shipped as the Brand Banner Fix, so this bundle is 1.5.3. File names keep "1-5-2".
const RELEASE = { OLD_VERSION: '1.5.2', NEW_VERSION: '1.5.3', TITLE: 'Search Hygiene' };

/**
 * The one number the site quotes. 22 = the sources /api/health lists on 2026-10-08.
 * ASSUMPTION: Matt confirms 22 is the number he wants to publish.
 */
const SOURCE_COUNT = 22;
const SOURCE_WORDS = { en: 'twenty-two', es: 'veintidós' };
const OLD_COUNTS = [8, 12, 16, 18, 19, 20];

/** Routes the server answers that have no .html file of the same name. */
const KNOWN_ROUTES = ['/', '/app', '/pap-finder', '/part-d-optimizer', '/articles/', '/articles'];

/** Files the page loader never touches. */
const SKIP_FILE = /(\.pre-|\.bak|^google[0-9a-f]+\.html$)/i;
const SKIP_DIR = new Set(['node_modules', '_to_delete', 'backups', '_from_server', '.git']);

/** Pages that are the same page as "/" and must canonical to it. */
const HOME_PAGES = ['/index.html', '/landing.html'];

/** Exact href values that do not resolve today -> the page that does. Applied to every page. */
const LINK_MAP = {
  '/faq': '/faq.html',
  '/about': '/about.html',
  '/privacy': '/privacy.html',
  '/terms': '/terms.html',
  '/search': '/app',
  '/articles': '/articles/',
  '/articles.html': '/articles/',
  '/contact': 'mailto:info@rxgator.info',
  '/methodology': '/methodology.html',
  '/lost-insurance': '/lost-insurance.html',
  '/perdi-mi-seguro': '/perdi-mi-seguro.html',
  '/articles/goodrx-vs-singlecare': '/articles/goodrx-vs-singlecare.html',
  '/articles/walmart-4-dollar-list': '/articles/walmart-4-dollar-list.html',
  '/articles/walmart-4-dollar-prescriptions.html': '/articles/walmart-4-dollar-list.html',
  '/articles/walmart-4-dollar-drug-list': '/articles/walmart-4-dollar-list.html',
  '/articles/cost-plus-drugs-review': '/articles/cost-plus-drugs-review.html',
  '/articles/cost-plus-drugs-mark-cuban.html': '/articles/cost-plus-drugs-review.html',
  '/articles/cost-plus-drugs-explained.html': '/articles/cost-plus-drugs-review.html',
  '/articles/rx-outreach-nonprofit-pharmacy.html': '/articles/rx-outreach-nonprofit-pharmacy-review.html',
  '/articles/how-to-save-on-prescriptions-without-insurance.html': '/articles/save-on-prescriptions-uninsured.html',
  '/articles/uninsured-prescription-savings.html': '/articles/save-on-prescriptions-uninsured.html',
  '/articles/prescription-assistance-programs.html': '/articles/patient-assistance-programs-complete-guide.html',
  '/articles/patient-assistance-programs.html': '/articles/patient-assistance-programs-free-medications.html',
  '/articles/medicare-part-d-save-money.html': '/articles/medicare-part-d-enrollment-guide.html',
  '/articles/generic-vs-brand-name.html': '/articles/generic-vs-brand-name-drugs.html',
  '/articles/prescription-discount-cards-explained.html': '/articles/prescription-drug-coupons-how-they-work.html',
  '/articles/prescription-discount-cards-compared.html': '/articles/goodrx-vs-singlecare.html',
  '/articles/nadac-explained': '/articles/what-pharmacy-pays-for-your-medication.html',
  '/articles/drug-pricing': '/articles/',
  '/drugs/lisinopril/cost-without-insurance': '/articles/lisinopril-cost-without-insurance.html',
  '/drugs/lisinopril-cost-without-insurance': '/articles/lisinopril-cost-without-insurance.html',
  '/drugs/amlodipine/cost-without-insurance': '/articles/amlodipine-cost-without-insurance.html',
  '/drugs/amlodipine-cost-without-insurance': '/articles/amlodipine-cost-without-insurance.html',
  '/drugs/losartan': '/articles/losartan-cost-without-insurance.html',
  '/drugs/losartan/cost-without-insurance': '/articles/losartan-cost-without-insurance.html',
};

/** Related-article cards that point at articles RxGator never wrote. The whole card is removed. */
const UNLINK = [
  '/articles/how-to-use-rxgator',
  '/articles/how-to-use-goodrx',
  '/articles/rosuvastatin-cost-without-insurance',
  '/articles/how-to-save-on-blood-pressure-medication',
  '/articles/pantoprazole-cost-without-insurance',
  '/articles/goodrx-vs-cost-plus-drugs',
  '/articles/nexium-generic-esomeprazole-cost',
  '/discount-cards',
  '/editorial-policy',
];

/** Link shapes that need a pattern, not an exact match. /app does not read ?drug=, so the param is dropped. */
const LINK_PATTERNS = [
  [/href="\/search\?drug=[^"]*"/g, 'href="/app"', 'search?drug= -> /app'],
];

/** hreflang targets that name a Spanish page that does not exist -> the one that does. */
const DEAD_ALTERNATES = {
  '/articles/es/costo-cobra-seguro.html': '/articles/es/costo-seguro-cobra.html',
  '/articles/es/programas-asistencia-medicamentos-gratis-guia.html': '/articles/es/guia-completa-programas-asistencia-paciente.html',
};

module.exports = {
  BASE, PUBLIC_DIR, ORIGIN, RELEASE, SOURCE_COUNT, SOURCE_WORDS, OLD_COUNTS, KNOWN_ROUTES,
  SKIP_FILE, SKIP_DIR, HOME_PAGES, LINK_MAP, LINK_PATTERNS, UNLINK, DEAD_ALTERNATES,
};
