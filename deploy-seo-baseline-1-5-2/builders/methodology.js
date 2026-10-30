'use strict';
/**
 * methodology.js — build /methodology.html (EN) and /metodologia.html (ES) from the live privacy.html shell,
 * so header, nav, footer, fonts, and text-size controls match the rest of the site.
 * Only statements the site already makes elsewhere (About, FAQ, Terms) are used.
 */
const { ORIGIN, SOURCE_COUNT } = require('../lib/config');
const { SOURCES, CAT } = require('../lib/sources');

const COPY = {
  en: {
    lang: 'en', file: '/methodology.html', twin: '/metodologia.html',
    title: 'Methodology: How RXGator Finds and Ranks Drug Prices — RXGator',
    desc: 'How RXGator works: the ' + SOURCE_COUNT + ' data sources it searches, what each one provides, how fresh the data is, and how results are ranked.',
    h1: 'How RXGator Works: Data Sources and Methodology',
    short: '<strong>The short version:</strong> RXGator searches ' + SOURCE_COUNT + ' data sources at once and ranks results from lowest price to highest. It is free for consumers today. Affiliate relationships, sponsorships, and partnerships do not change the ranking order.',
    h2Src: 'The ' + SOURCE_COUNT + ' Data Sources', srcIntro: 'RXGator groups its sources into three kinds. Government benchmarks show what pharmacies pay or what programs allow. They are not always prices you can get at the counter.',
    thSource: 'Source', thWhat: 'What it provides', cap: 'RXGator data sources by category',
    inferred: 'Description based on how the source is labeled in RXGator. Check the FAQ for details.',
    h2Fresh: 'How Fresh Is the Data?', fresh: [
      '<strong>Cost Plus Drugs, Medicare Part D, RxNorm, MedlinePlus, openFDA</strong> — queried in real time on every search.',
      '<strong>NADAC</strong> — CMS publishes new NADAC data weekly. RXGator shows the benchmark from its most recent update.',
      '<strong>GoodRx and SingleCare</strong> — cached data, updated periodically. Prices are recent but may be hours or days old.',
      '<strong>Walmart, Costco, Amazon RxPass</strong> — built-in lists, updated when program pricing changes (typically quarterly).',
      '<strong>Federal Upper Limit</strong> — updated monthly from CMS data.',
      '<strong>All other sources</strong> — refreshed on their own schedules. Cached sources can be hours or days old.'],
    freshNote: 'See the <a href="/faq.html">FAQ</a> for the full answer to "How often are prices updated?"',
    h2Limits: 'What the Prices Do and Do Not Mean', limits: [
      'Costco figures are estimates based on published reporting, not quotes from a store.',
      'Discount card prices change by pharmacy, location, and day. Your price at the counter can differ.',
      'Benchmarks such as NADAC, Federal Upper Limit, VA Federal Supply Schedule, and Texas WAC show costs inside the supply chain. They are not retail prices.',
      'Always verify the final price at the pharmacy counter.'],
    h2Fund: 'How RXGator Is Funded', fund: 'RXGator is funded by community support, advertising, and affiliate commissions. Affiliate commissions never change how results are ranked. The <a href="/faq.html">FAQ</a> explains each one.',
    h2Fix: 'Report a Problem', fix: 'If a price or a description looks wrong, email <a href="mailto:info@rxgator.info">info@rxgator.info</a>.',
    med: 'This page is not medical advice. Talk to your doctor or pharmacist before you change any medication.',
    nav: { Home: 'Home', About: 'About', FAQ: 'FAQ', Privacy: 'Privacy Policy', Terms: 'Terms of Use', Support: 'Support Us', Search: 'Search Drugs' },
  },
  es: {
    lang: 'es', file: '/metodologia.html', twin: '/methodology.html',
    title: 'Metodología: Cómo RXGator Encuentra y Ordena los Precios — RXGator',
    desc: 'Cómo funciona RXGator: las ' + SOURCE_COUNT + ' fuentes de datos que busca, qué ofrece cada una, qué tan actuales son los datos y cómo se ordenan los resultados.',
    h1: 'Cómo Funciona RXGator: Fuentes de Datos y Metodología',
    short: '<strong>En resumen:</strong> RXGator busca en ' + SOURCE_COUNT + ' fuentes de datos a la vez y ordena los resultados del precio más bajo al más alto. Hoy es gratis para los consumidores. Las relaciones de afiliados, patrocinios y asociaciones no cambian el orden.',
    h2Src: 'Las ' + SOURCE_COUNT + ' Fuentes de Datos', srcIntro: 'RXGator agrupa sus fuentes en tres tipos. Las referencias del gobierno muestran lo que pagan las farmacias o lo que permiten los programas. No siempre son precios que usted pueda obtener en el mostrador.',
    thSource: 'Fuente', thWhat: 'Qué ofrece', cap: 'Fuentes de datos de RXGator por categoría',
    inferred: 'Descripción basada en cómo se rotula la fuente en RXGator. Consulte las preguntas frecuentes para más detalles.',
    h2Fresh: '¿Qué Tan Actuales Son los Datos?', fresh: [
      '<strong>Cost Plus Drugs, Medicare Parte D, RxNorm, MedlinePlus, openFDA</strong> — se consultan en tiempo real en cada búsqueda.',
      '<strong>NADAC</strong> — CMS publica datos nuevos de NADAC cada semana. RXGator muestra la referencia de su actualización más reciente.',
      '<strong>GoodRx y SingleCare</strong> — datos en caché, actualizados periódicamente. Los precios son recientes pero pueden tener horas o días.',
      '<strong>Walmart, Costco, Amazon RxPass</strong> — listas integradas, actualizadas cuando cambian los precios del programa (normalmente cada trimestre).',
      '<strong>Límite Superior Federal</strong> — se actualiza cada mes con datos de CMS.',
      '<strong>Las demás fuentes</strong> — se actualizan según su propio calendario. Las fuentes en caché pueden tener horas o días.'],
    freshNote: 'Consulte las <a href="/faq.html">preguntas frecuentes</a> para la respuesta completa a "¿Con qué frecuencia se actualizan los precios?"',
    h2Limits: 'Qué Significan y Qué No Significan los Precios', limits: [
      'Las cifras de Costco son estimados basados en informes publicados, no cotizaciones de la tienda.',
      'Los precios de las tarjetas de descuento cambian según la farmacia, la ubicación y el día. Su precio en el mostrador puede ser distinto.',
      'Referencias como NADAC, el Límite Superior Federal, la lista de precios federal del VA y el WAC de Texas muestran costos dentro de la cadena de suministro. No son precios de venta.',
      'Siempre verifique el precio final en el mostrador de la farmacia.'],
    h2Fund: 'Cómo Se Financia RXGator', fund: 'RXGator se financia con apoyo de la comunidad, publicidad y comisiones de afiliados. Las comisiones de afiliados nunca cambian el orden de los resultados. Las <a href="/faq.html">preguntas frecuentes</a> explican cada uno.',
    h2Fix: 'Reportar un Problema', fix: 'Si un precio o una descripción parece incorrecto, escriba a <a href="mailto:info@rxgator.info">info@rxgator.info</a>.',
    med: 'Esta página no es consejo médico. Hable con su médico o farmacéutico antes de cambiar cualquier medicamento.',
    nav: { Home: 'Inicio', About: 'Acerca de', FAQ: 'Preguntas frecuentes', Privacy: 'Política de privacidad', Terms: 'Términos de uso', Support: 'Apóyenos', Search: 'Buscar medicamentos' },
  },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TABLE_CSS = '<style>\n.table-wrap{overflow-x:auto;margin:1rem 0}\n.src-table{border-collapse:collapse;width:100%;font-size:.95rem}\n.src-table caption{text-align:left;font-weight:700;padding:.5rem 0;color:var(--navy,#0B3B5C)}\n.src-table th,.src-table td{border:1px solid #D5D8DC;padding:.5rem .7rem;text-align:left;vertical-align:top}\n.src-table th{background:var(--pale,#F4F8F9)}\n</style>';

function sourceTable(c) {
  let html = '';
  for (const key of Object.keys(CAT)) {
    const rows = SOURCES.filter((s) => s.cat === key).map((s) =>
      '        <tr><th scope="row">' + esc(s.name) + '</th><td>' + esc(s[c.lang]) + (s.inferred ? ' <em>(' + esc(c.inferred) + ')</em>' : '') + '</td></tr>').join('\n');
    html += '  <div class="table-wrap">\n    <table class="src-table">\n      <caption>' + esc(CAT[key][c.lang]) + ' (' + SOURCES.filter((s) => s.cat === key).length + ')</caption>\n'
      + '      <thead><tr><th scope="col">' + c.thSource + '</th><th scope="col">' + c.thWhat + '</th></tr></thead>\n      <tbody>\n' + rows + '\n      </tbody>\n    </table>\n  </div>\n';
  }
  return html;
}

function mainBlock(c) {
  return '<main id="main-content">\n<div class="content">\n  <h1>' + c.h1 + '</h1>\n  <div class="highlight">' + c.short + '</div>\n\n'
    + '  <h2>' + c.h2Src + '</h2>\n  <p>' + c.srcIntro + '</p>\n' + sourceTable(c) + '\n'
    + '  <h2>' + c.h2Fresh + '</h2>\n  <ul>\n' + c.fresh.map((l) => '    <li>' + l + '</li>').join('\n') + '\n  </ul>\n  <p>' + c.freshNote + '</p>\n\n'
    + '  <h2>' + c.h2Limits + '</h2>\n  <ul>\n' + c.limits.map((l) => '    <li>' + l + '</li>').join('\n') + '\n  </ul>\n\n'
    + '  <h2>' + c.h2Fund + '</h2>\n  <p>' + c.fund + '</p>\n\n  <h2>' + c.h2Fix + '</h2>\n  <p>' + c.fix + '</p>\n\n  <p><em>' + c.med + '</em></p>\n</div>\n</main>';
}

/** @param {string} shell the current privacy.html source @returns {{rel:string, content:string}[]} */
function build(shell) {
  const mStart = shell.indexOf('<main');
  const mEnd = shell.indexOf('</main>');
  if (mStart === -1 || mEnd === -1) throw new Error('privacy.html has no <main> block; cannot build the methodology pages from it');
  return Object.values(COPY).map((c) => {
    let html = shell.slice(0, mStart) + mainBlock(c) + shell.slice(mEnd + '</main>'.length);
    html = html.replace('<html lang="en">', '<html lang="' + c.lang + '">')
      .replace(/<title>[^<]*<\/title>/, '<title>' + esc(c.title) + '</title>')
      .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(c.desc).replace(/"/g, '&quot;') + '$2')
      .replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + ORIGIN + c.file + '$2');
    const alt = '\n<link rel="alternate" hreflang="en" href="' + ORIGIN + '/methodology.html">\n<link rel="alternate" hreflang="es" href="' + ORIGIN + '/metodologia.html">';
    html = html.replace(/(<link rel="canonical"[^>]*>)/, '$1' + alt).replace('</head>', TABLE_CSS + '\n</head>');
    const labels = [['Home', '>Home</a>'], ['About', '>About</a>'], ['FAQ', '>FAQ</a>'], ['Privacy', '>Privacy Policy</a>'], ['Terms', '>Terms of Use</a>'], ['Support', '>Support Us</a>'], ['Search', '>Search Drugs</a>']];
    if (c.lang === 'es') for (const [k, needle] of labels) html = html.split(needle).join('>' + c.nav[k] + '</a>');
    html = html.replace('<span class="footer-medical">This tool is not medical advice. Always consult your doctor or pharmacist before making changes to your medications.</span>',
      c.lang === 'es' ? '<span class="footer-medical">Esta herramienta no es consejo médico. Siempre consulte a su médico o farmacéutico antes de hacer cambios en sus medicamentos.</span>' : '<span class="footer-medical">This tool is not medical advice. Always consult your doctor or pharmacist before making changes to your medications.</span>');
    return { rel: c.file, content: html };
  });
}

module.exports = { build };
