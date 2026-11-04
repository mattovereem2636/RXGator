#!/usr/bin/env node
/**
 * fix-article-facts.js — corrects stale facts on four live articles (2026-11-03 release).
 * Medicare Part D 2027 (EN, ES): 2026 cap, premium estimates.
 * Canadian imports (EN, ES): dated note about the customs rule.
 *
 * Exact-match only: if a live page no longer contains the expected text, the script
 * stops and changes nothing. Default is a dry run. Pass --apply to write.
 * Backups: <file>.pre-articles-2026-11-03. Safe to run twice.
 * Usage: node /var/www/rxaggregator/deploy-articles-2026-11-03/fix-article-facts.js [--apply]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ARTICLES = path.join(process.env.RXG_BASE || '/var/www/rxaggregator', 'public', 'articles');
const APPLY = process.argv.includes('--apply');
const SUFFIX = '.pre-articles-2026-11-03';
const NEW_DATE = '2026-11-03';
const MARKER = 'data-fact-update="2026-11-03"';
const KFF_URL = 'https://www.kff.org/medicare/medicare-part-d-premiums-and-cost-sharing-in-2027/';

const PAGES = [
  { file: 'medicare-part-d-changes-2027.html', edits: [
    ['  <li><strong>CMS estimates:</strong> Most enrollees will see premiums increase by about <strong>$10 per month</strong> on average.</li>',
      `  <li ${MARKER}><strong>CMS projection:</strong> The average stand-alone premium rises from $35 to <strong>$36 per month</strong> in 2027.</li>`],
    ['  <li><strong>Kaiser Family Foundation (KFF) estimates:</strong> Some beneficiaries could see increases of <strong>up to $20 per month</strong>, depending on their plan and region.</li>',
      `  <li><strong>KFF analysis (October 30, 2026):</strong> The average rises from $34 to <strong>$51 per month</strong> if enrollees keep their current plans. <a href="${KFF_URL}" rel="noopener">KFF expects the real average to be lower</a> after people switch.</li>`],
    ['<p>That translates to an additional <strong>$120 to $240 per year</strong> in premium costs. The actual increase will vary by plan. Some plans may absorb part of the cost; others may pass it through entirely. You will not know your specific increase until plans publish their 2027 premiums in the fall.</p>',
      '<p>The averages hide a wide range. KFF found that about 10.4 million enrollees without low-income help face a higher premium if they stay put, and about 2.4 million face an increase of more than $50 a month. Check your own plan notice, and see our <a href="/articles/medicare-open-enrollment-2027-drug-plan-check.html">2027 open enrollment guide</a>.</p>'],
    ['<p>For 2026, the cap was adjusted to <strong>$2,150</strong>. For 2027, CMS is expected to set it at approximately <strong>$2,400</strong>, reflecting standard inflation adjustments built into the law.</p>',
      '<p>For 2026, the cap is <strong>$2,100</strong>. For 2027, the cap is <strong>$2,400</strong>, which reflects the yearly adjustment built into the law.</p>'],
    ['$9.8B federal subsidy cut; premiums up $10-$20/mo for most standalone Part D enrollees', '$9.8B federal subsidy cut; KFF projects an average of $51/mo if enrollees stay put, and CMS projects $36/mo'],
    ['Adjusts from ~$2,150 to ~$2,400 (inflation adjustment); still no cap existed before 2025', 'Rises from $2,100 to $2,400; no cap existed before 2025'],
  ] },
  { file: 'es/cambios-medicare-parte-d-2027.html', edits: [
    ['  <li><strong>Estimaciones de CMS:</strong> La mayor&iacute;a de los inscritos ver&aacute;n un aumento de primas de aproximadamente <strong>$10 por mes</strong> en promedio.</li>',
      `  <li ${MARKER}><strong>Proyecci&oacute;n de CMS:</strong> La prima promedio de los planes independientes sube de $35 a <strong>$36 por mes</strong> en 2027.</li>`],
    ['  <li><strong>Estimaciones de Kaiser Family Foundation (KFF):</strong> Algunos beneficiarios podr&iacute;an ver aumentos de <strong>hasta $20 por mes</strong>, dependiendo de su plan y regi&oacute;n.</li>',
      `  <li><strong>An&aacute;lisis de KFF (30 de octubre de 2026):</strong> El promedio sube de $34 a <strong>$51 por mes</strong> si los inscritos conservan sus planes actuales. <a href="${KFF_URL}" rel="noopener">KFF espera que el promedio real sea menor</a> cuando algunas personas cambien de plan.</li>`],
    ['<p>Esto se traduce en un costo adicional de <strong>$120 a $240 por a&ntilde;o</strong> en primas. El aumento real variar&aacute; seg&uacute;n el plan. Algunos planes pueden absorber parte del costo; otros pueden trasladarlo completamente. No sabr&aacute; su aumento espec&iacute;fico hasta que los planes publiquen sus primas de 2027 en el oto&ntilde;o.</p>',
      '<p>Los promedios esconden grandes diferencias. KFF encontr&oacute; que unos 10.4 millones de inscritos sin ayuda por bajos ingresos pagar&aacute;n una prima m&aacute;s alta si no cambian de plan, y unos 2.4 millones enfrentan un aumento de m&aacute;s de $50 al mes. Revise el aviso de su plan y consulte nuestra <a href="/articles/es/inscripcion-abierta-medicare-2027-plan-medicamentos.html">gu&iacute;a de inscripci&oacute;n abierta 2027</a>.</p>'],
    ['<p>Para 2026, el tope se ajust&oacute; a <strong>$2,150</strong>. Para 2027, se espera que CMS lo establezca en aproximadamente <strong>$2,400</strong>, reflejando los ajustes est&aacute;ndar por inflaci&oacute;n integrados en la ley.</p>',
      '<p>Para 2026, el tope es de <strong>$2,100</strong>. Para 2027, el tope es de <strong>$2,400</strong>, seg&uacute;n el ajuste anual que establece la ley.</p>'],
    ['Se eliminan $9,800 millones en subsidio federal; primas suben $10-$20/mes para la mayor&iacute;a de inscritos en planes independientes de Parte D', 'Se eliminan $9,800 millones en subsidio federal; KFF proyecta un promedio de $51/mes si los inscritos no cambian de plan, y CMS proyecta $36/mes'],
    ['Se ajusta de ~$2,150 a ~$2,400 (ajuste por inflaci&oacute;n); antes de 2025 no exist&iacute;a ning&uacute;n tope', 'Sube de $2,100 a $2,400; antes de 2025 no exist&iacute;a ning&uacute;n tope'],
  ] },
  { file: 'buying-prescription-drugs-from-canada.html', edits: [
    ['            <h2>The Legal Reality: It\'s Complicated</h2>',
      `            <p ${MARKER}><strong>Update, November 3, 2026:</strong> A new customs filing requirement for international mail becomes mandatory January 20, 2027, and it could affect mailed medicine. Older enforcement figures on this page may not hold after that date. Read <a href="/articles/canada-drug-imports-customs-rule-2027.html">what the rule means for you</a>.</p>\n\n            <h2>The Legal Reality: It's Complicated</h2>`],
  ] },
  { file: 'es/comprar-medicamentos-recetados-canada.html', edits: [
    ['<h2>La realidad legal: es complicado</h2>',
      `<p ${MARKER}><strong>Actualizaci&oacute;n, 3 de noviembre de 2026:</strong> Un nuevo requisito de aduanas para el correo internacional ser&aacute; obligatorio el 20 de enero de 2027 y podr&iacute;a afectar los medicamentos enviados por correo. Las cifras anteriores sobre el control fronterizo en esta p&aacute;gina podr&iacute;an dejar de ser v&aacute;lidas despu&eacute;s de esa fecha. Lea <a href="/articles/es/importar-medicamentos-canada-regla-aduanas-2027.html">qu&eacute; significa la regla para usted</a>.</p>\n\n<h2>La realidad legal: es complicado</h2>`],
  ] },
];

/** Stop with a clear message. */
function abort(msg) {
  console.error(`[fix-article-facts] ABORT: ${msg} Nothing was written.`);
  process.exit(1);
}

function plan() {
  const out = [];
  for (const page of PAGES) {
    const file = path.join(ARTICLES, page.file);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) { abort(`cannot read ${file}: ${err.message}.`); }
    if (text.includes(MARKER)) { console.log(`[fix-article-facts] ${page.file}: already fixed`); continue; }
    for (const [from, to] of page.edits) {
      if (text.split(from).length !== 2) abort(`${page.file}: expected text not found once: "${from.slice(0, 70)}..."`);
      text = text.split(from).join(to);
    }
    const dated = text.replace(/("dateModified":\s*")\d{4}-\d{2}-\d{2}(")/, `$1${NEW_DATE}$2`);
    out.push({ file, text: dated });
    console.log(`[fix-article-facts] ${page.file}: ${page.edits.length} edit(s) ready`);
  }
  return out;
}

const ready = plan();
if (!APPLY) { console.log('[fix-article-facts] DRY RUN. Add --apply to write.'); process.exit(0); }
for (const { file, text } of ready) {
  if (!fs.existsSync(file + SUFFIX)) fs.copyFileSync(file, file + SUFFIX);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`[fix-article-facts] wrote ${file}`);
}
