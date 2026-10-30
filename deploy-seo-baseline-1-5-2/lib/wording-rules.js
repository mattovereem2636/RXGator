'use strict';
/**
 * wording-rules.js — exact-text fixes for health and funding claims (EN and ES in the same run).
 * Each rule: { id, files, find, replace, count }. `count` is how many hits we expect per file.
 * A rule that finds a different count stops the run before anything is written.
 */
const HOME = ['/index.html', '/landing.html'];
const APP = ['/app.html'];
const CONFIRM_EN = 'state laws vary, so confirm with your local store';
const CONFIRM_ES = 'las leyes estatales var&iacute;an; confirme con su tienda local';

const rules = [
  // ---- Costco: "federal law" is wrong; practice is state by state ----
  { id: 'costco-home', files: HOME, count: 1,
    find: '<p>Consistently among the cheapest retail pharmacies. No Costco membership required (federal law).</p>',
    replace: '<p>Consistently among the cheapest retail pharmacies. Costco serves non-members at the pharmacy in most states, but ' + CONFIRM_EN + '.</p>' },
  { id: 'costco-badge', files: HOME, count: 1,
    find: '<span class="badge badge-free">No Membership</span>',
    replace: '<span class="badge badge-free">Non-Members OK in Most States</span>' },
  { id: 'costco-lost-ins-en', files: ['/lost-insurance.html'], count: 1,
    find: '<strong>No membership required for the pharmacy</strong> &mdash; federal law.',
    replace: '<strong>No membership needed for the pharmacy in most states</strong> &mdash; ' + CONFIRM_EN + '.' },
  { id: 'costco-lost-ins-es', files: ['/perdi-mi-seguro.html'], count: 1,
    find: '<strong>No se requiere membres&iacute;a para la farmacia</strong> &mdash; es ley federal.',
    replace: '<strong>No se requiere membres&iacute;a para la farmacia en la mayor&iacute;a de los estados</strong> &mdash; ' + CONFIRM_ES + '.' },
  { id: 'costco-guide-en', files: ['/articles/lost-insurance-medication-guide.html'], count: 1,
    find: 'Federal law does not require a Costco membership to use the pharmacy.',
    replace: 'In most states you do not need a Costco membership to use the pharmacy, but ' + CONFIRM_EN + '.' },
  { id: 'costco-guide-es', files: ['/articles/es/perdi-seguro-guia-medicamentos.html'], count: 1,
    find: 'La ley federal no requiere membres&iacute;a de Costco para usar la farmacia.',
    replace: 'En la mayor&iacute;a de los estados no se necesita membres&iacute;a de Costco para usar la farmacia, pero ' + CONFIRM_ES + '.' },
  { id: 'costco-amlodipine', files: ['/articles/amlodipine-cost-without-insurance.html'], count: 1,
    find: 'Federal law requires Costco to allow non-members to use its pharmacy. You do not need a Costco membership to fill prescriptions there,',
    replace: 'In most states, Costco must allow non-members to use its pharmacy, but ' + CONFIRM_EN + '. You usually do not need a Costco membership to fill prescriptions there,' },
  { id: 'costco-lisinopril', files: ['/articles/lisinopril-cost-without-insurance.html'], count: 1,
    find: 'and you do not need a Costco membership to use their pharmacy. Federal law requires Costco to serve non-members at the pharmacy counter.',
    replace: 'and in most states you do not need a Costco membership to use their pharmacy. ' + 'State laws vary, so confirm with your local store.' },
  { id: 'costco-omeprazole-1', files: ['/articles/omeprazole-cost-without-insurance.html'], count: 1,
    find: "Costco's pharmacy is open to non-members for prescription fills (a federal law requirement), and",
    replace: "Costco's pharmacy is open to non-members for prescription fills in most states (" + CONFIRM_EN + "), and" },
  { id: 'costco-omeprazole-2', files: ['/articles/omeprazole-cost-without-insurance.html'], count: 1,
    find: "Costco's <em>pharmacy</em> is legally required to serve non-members.",
    replace: "Costco's <em>pharmacy</em> serves non-members in most states (" + CONFIRM_EN + ")." },
  { id: 'costco-metformin', files: ['/articles/metformin-cost-without-insurance.html'], count: 1,
    find: 'Federal and state regulations in most states require warehouse clubs to allow non-members to access their pharmacies.',
    replace: 'In most states, regulations require warehouse clubs to allow non-members to access their pharmacies, but ' + CONFIRM_EN + '.' },

  // ---- Funding: "free forever" and "every dollar" overpromise next to affiliate and ad income ----
  { id: 'meta-free-forever', files: HOME, count: 3,
    find: 'the actual lowest price. Free forever.">', replace: 'the actual lowest price. Free to use.">' },
  { id: 'support-sub-en', files: HOME, count: 2,
    find: 'RXGator is free and always will be. Every dollar goes directly to data acquisition — adding more pharmacy platforms so more people can find cheaper medication.',
    replace: 'RXGator is free to use today, with no plans to charge consumers. Community support helps pay for data acquisition and hosting, so we can add more pharmacy platforms. The FAQ explains exactly how RXGator is funded.' },
  { id: 'support-sub-es', files: HOME, count: 1,
    find: 'RXGator es gratis y siempre lo será. Cada dólar se destina directamente a la adquisición de datos — agregando más plataformas de farmacias para que más personas encuentren medicamentos más baratos.',
    replace: 'RXGator es gratis hoy y no planeamos cobrar a los consumidores. El apoyo de la comunidad ayuda a pagar la adquisición de datos y el alojamiento, para poder agregar más plataformas de farmacias. Las preguntas frecuentes explican exactamente cómo se financia RXGator.' },
  { id: 'about-p2', files: ['/about.html'], count: 2,
    find: 'No sign-up required. No data sold. Free forever.', replace: 'No sign-up required. No data sold. Free to use.' },
  { id: 'about-p2-es', files: ['/about.html'], count: 1,
    find: 'Sin venta de datos. Gratis para siempre.', replace: 'Sin venta de datos. Gratis para usar.' },
  { id: 'about-h3', files: ['/about.html'], count: 1,
    find: '<h3 data-i18n="freeForever">Free Forever</h3>', replace: '<h3 data-i18n="freeForever">Free to Use</h3>' },
  { id: 'about-h3-i18n', files: ['/about.html'], count: 1,
    find: "freeForever: { en: 'Free Forever', es: 'Gratis Para Siempre' }", replace: "freeForever: { en: 'Free to Use', es: 'Gratis Para Usar' }" },
  { id: 'about-desc', files: ['/about.html'], count: 2,
    find: 'RXGator will never charge consumers to search for drug prices.',
    replace: 'RXGator is free for consumers today, and we have no plans to charge for searching drug prices.' },
  { id: 'about-desc-es', files: ['/about.html'], count: 1,
    find: 'RXGator nunca cobrará a los consumidores por buscar precios de medicamentos.',
    replace: 'RXGator es gratis para los consumidores hoy, y no tenemos planes de cobrar por buscar precios de medicamentos.' },
  { id: 'about-cta', files: ['/about.html'], count: 2,
    find: 'Every dollar goes directly to adding more pharmacy data sources so more people can find cheaper medication.',
    replace: 'Support helps us add more pharmacy data sources so more people can find cheaper medication.' },
  { id: 'about-cta-es', files: ['/about.html'], count: 1,
    find: 'Cada dólar se destina directamente a agregar más fuentes de datos de farmacias para que más personas puedan encontrar medicamentos más baratos.',
    replace: 'El apoyo nos ayuda a agregar más fuentes de datos de farmacias para que más personas puedan encontrar medicamentos más baratos.' },
  { id: 'faq-support', files: ['/faq.html'], count: 1,
    find: '<p>RXGator is funded by community support. Every dollar goes directly to data acquisition — the infrastructure that pulls pricing from discount card platforms.</p>',
    replace: '<p>RXGator is funded by community support, advertising, and affiliate commissions (see "How does RXGator make money?" above). Community contributions help pay for data acquisition — the infrastructure that pulls pricing from discount card platforms.</p>' },
  { id: 'no-ads-en', files: ['/lost-insurance.html'], count: 1,
    find: 'Built in Illinois. Used nationwide. No ads. No affiliate links. Just the lowest prices.',
    replace: 'Built in Illinois. Used nationwide. Just the lowest prices.' },
  { id: 'no-ads-es', files: ['/perdi-mi-seguro.html'], count: 1,
    find: 'Hecho en Illinois. Usado en todo el pa&iacute;s. Sin anuncios. Sin enlaces de afiliados. Solo los precios m&aacute;s bajos.',
    replace: 'Hecho en Illinois. Usado en todo el pa&iacute;s. Solo los precios m&aacute;s bajos.' },

  { id: 'no-ads-hub', files: ['/articles/index.html'], count: 1,
    find: 'No ads, no affiliate links — just the information you need.', replace: 'Just the information you need.' },
  { id: 'no-ads-partd', files: ['/part-d-optimizer.html'], count: 1,
    find: 'Independent prescription drug price comparison. No ads. No affiliate links.', replace: 'Independent prescription drug price comparison.' },

  // ---- "GoodRx only shows GoodRx prices" sits next to "we search GoodRx" ----
  { id: 'goodrx-home-en', files: HOME, count: 2,
    find: 'Because GoodRx only shows GoodRx prices.', replace: 'Because each discount card shows only its own prices.' },
  { id: 'goodrx-home-es', files: HOME, count: 1,
    find: 'Porque GoodRx solo muestra precios de GoodRx.', replace: 'Porque cada tarjeta de descuento solo muestra sus propios precios.' },
  { id: 'goodrx-about-en', files: ['/about.html'], count: 2,
    find: 'GoodRx only shows GoodRx prices. SingleCare only shows SingleCare prices.', replace: 'Each discount card shows only its own prices.' },
  { id: 'goodrx-about-es', files: ['/about.html'], count: 1,
    find: 'GoodRx solo muestra precios de GoodRx. SingleCare solo muestra precios de SingleCare.', replace: 'Cada tarjeta de descuento solo muestra sus propios precios.' },
  { id: 'goodrx-faq-schema', files: ['/faq.html'], count: 1,
    find: 'GoodRx only shows GoodRx prices. RXGator searches', replace: 'Each discount card shows only its own prices. RXGator searches' },
  { id: 'goodrx-faq-body', files: ['/faq.html'], count: 1,
    find: '<strong>GoodRx only shows GoodRx prices.</strong> SingleCare only shows SingleCare prices. Walmart',
    replace: '<strong>Each discount card shows only its own prices.</strong> Walmart' },

  // ---- NADAC is weekly, not "always current" ----
  { id: 'nadac-weekly', files: ['/faq.html'], count: 1,
    find: '<li><strong>Cost Plus Drugs, NADAC, Medicare Part D, RxNorm, MedlinePlus, openFDA</strong> — queried in real time on every search. Always current.</li>',
    replace: '<li><strong>Cost Plus Drugs, Medicare Part D, RxNorm, MedlinePlus, openFDA</strong> — queried in real time on every search.</li>\n        <li><strong>NADAC</strong> — CMS publishes new NADAC data weekly. RXGator shows the benchmark from its most recent update.</li>' },

  // ---- Homepage example: label the Costco figure as an estimate ----
  { id: 'callout-label', files: HOME, count: 1,
    find: '<div class="label">Costco Pharmacy</div>', replace: '<div class="label">Costco Pharmacy (estimate)</div>' },
  { id: 'callout-note-en', files: HOME, count: 2,
    find: 'Same drug. Same day. Same zip code. RXGator found the difference.',
    replace: 'Illustrative example: the same generic drug can cost very different amounts at different pharmacies.' },
  { id: 'callout-note-es', files: HOME, count: 1,
    find: 'Mismo medicamento. Mismo día. Mismo código postal. RXGator encontró la diferencia.',
    replace: 'Ejemplo ilustrativo: el mismo medicamento genérico puede costar cantidades muy distintas en diferentes farmacias.' },
  { id: 'callout-small', files: HOME, count: 1,
    find: 'that’s why RXGator searches all options.</p>',
    replace: 'that’s why RXGator searches all options. The Costco figure is an estimate based on published reporting, not a quote from a store.</p>' },

  // ---- Search app (/app.html): the same claims appear inside its script strings ----
  // The files here are JavaScript strings, so no apostrophes in the new text. — is the literal escape in the source.
  { id: 'app-costco-summary', files: APP, count: 1,
    find: "summary: 'No Costco membership required to use the pharmacy (federal law).',",
    replace: "summary: 'Costco pharmacies serve non-members in most states (state laws vary, so confirm with your local store).'," },
  { id: 'app-costco-step1', files: APP, count: 1,
    find: "'Walk into any <strong>Costco pharmacy</strong> \\u2014 you do NOT need a Costco membership.',",
    replace: "'Walk into a <strong>Costco pharmacy</strong> \\u2014 in most states you do not need a Costco membership.'," },
  { id: 'app-costco-step3', files: APP, count: 1,
    find: "'Federal law requires Costco to serve non-members at the pharmacy.',",
    replace: "'Costco serves non-members at the pharmacy in most states. State laws vary, so confirm with your local store.'," },
  { id: 'app-goodrx', files: APP, count: 1,
    find: 'GoodRx only shows GoodRx prices. SingleCare only shows SingleCare. Your pharmacist',
    replace: 'Each discount card shows only its own prices. Your pharmacist' },
  // The loading text names 18 sources. With the count at 22, the list becomes examples.
  { id: 'app-loading-en', files: APP, count: 1,
    find: "loading: { en: 'Querying 22 data sources: Cost Plus Drugs,",
    replace: "loading: { en: 'Querying 22 data sources, including Cost Plus Drugs," },
  { id: 'app-loading-es', files: APP, count: 1,
    find: "es: 'Consultando 22 fuentes de datos: Cost Plus Drugs,",
    replace: "es: 'Consultando 22 fuentes de datos, entre ellas Cost Plus Drugs," },

  // ---- Footer: link the articles hub and the methodology page from the homepage ----
  { id: 'home-footer-links', files: HOME, count: 1,
    find: '<a href="/faq.html">FAQ</a> &middot; <a href="/privacy.html">Privacy Policy</a>',
    replace: '<a href="/faq.html">FAQ</a> &middot; <a href="/articles/">Articles</a> &middot; <a href="/methodology.html">Methodology</a> &middot; <a href="/privacy.html">Privacy Policy</a>' },
];

module.exports = { rules };
