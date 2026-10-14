#!/usr/bin/env node
/**
 * patch-brand-banner-1-5-2.js — fixes the "Brand Name Search" box on /app (public/app.html).
 *
 * WHY: the box appears whenever RxNorm marks a search as a brand name. It always said the prices
 * "are for the generic equivalent ... FDA-rated as therapeutically equivalent", even for brand-only
 * drugs such as Addyi, where no generic is sold and the price shown is for the brand.
 * The dictionary (data.genericInfo.hasGeneric) is the only part of the app that knows whether a
 * generic is sold, so the new box picks one of three texts from it:
 *   hasGeneric true   -> prices include the generic version (plus the old "ask your doctor" note)
 *   hasGeneric false  -> RXGator records show no US generic; prices are for the brand
 *   no dictionary row -> check the drug name on each price card
 * The box was English only. All of its text now comes from the T table in English and Spanish.
 *
 * Edits three places in app.html, each found by an exact anchor that must occur once:
 *   1. the T table: new keys after the existing brandSearch key
 *   2. a new brandSearchBox() function before renderResults()
 *   3. the old inline box inside renderResults() -> a call to brandSearchBox()
 * Every inline script is compiled before and after the edit. Any failure restores the file.
 * No restart is needed (static file). Visitors may need a hard refresh.
 *
 * USAGE:  node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-brand-banner-1-5-2.js --dry-run
 *         node /var/www/rxaggregator/deploy-brand-banner-1-5-2/patch-brand-banner-1-5-2.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = process.env.RXG_BASE || '/var/www/rxaggregator';
const APP = path.join(BASE, 'public', 'app.html');
const DRY_RUN = process.argv.includes('--dry-run');
const DONE_MARK = 'function brandSearchBox(';

// These strings live inside single-quoted JavaScript in app.html: no apostrophes.
const NEW_KEYS = [
  "  brandSearchIntro: { en: 'You searched for', es: 'Buscó' },",
  "  brandSearchIntroOf: { en: 'a brand name for', es: 'un nombre de marca de' },",
  "  brandSearchGeneric: { en: 'A generic version is sold. Prices below include the generic, which has the same active ingredient.', es: 'Se vende una versión genérica. Los precios abajo incluyen el genérico, que tiene el mismo ingrediente activo.' },",
  "  brandSearchGenericNote: { en: 'If your doctor prescribed the brand-name version, generic prices may not apply. Ask your doctor or pharmacist before you switch between brand and generic.', es: 'Si su médico recetó la versión de marca, los precios del genérico pueden no aplicar. Consulte a su médico o farmacéutico antes de cambiar entre marca y genérico.' },",
  "  brandSearchBrandOnly: { en: 'RXGator records show no generic version sold in the U.S. Prices below are for the brand-name drug.', es: 'Los registros de RXGator no muestran una versión genérica a la venta en EE. UU. Los precios abajo son para el medicamento de marca.' },",
  "  brandSearchUnknown: { en: 'Each price card shows the drug name its source lists. Check it to see whether a price is for the brand or a generic.', es: 'Cada tarjeta de precio muestra el nombre del medicamento que indica su fuente. Revíselo para saber si un precio es de la marca o de un genérico.' },",
].join('\n');

const NEW_FUNCTION = `/**
 * Brand-name search box. WHY: RxNorm can tell that a search was a brand name, but only the
 * dictionary (data.genericInfo.hasGeneric) knows whether a generic is sold. Release 1.5.2.
 */
function brandSearchBox(data, dn) {
  const gi = data.genericInfo;
  const status = gi && gi.hasGeneric === true ? 'generic' : (gi && gi.hasGeneric === false ? 'brandOnly' : 'unknown');
  const textKey = { generic: 'brandSearchGeneric', brandOnly: 'brandSearchBrandOnly', unknown: 'brandSearchUnknown' }[status];
  const note = status === 'generic'
    ? '<div style="font-size:0.8rem; color:var(--gray-500); margin-top:0.3rem; font-style:italic;">' + t('brandSearchGenericNote') + '</div>'
    : '';
  return '<div style="font-size:0.88rem; background:var(--light-blue); padding:0.6rem 0.9rem; border-radius:6px; margin-bottom:0.5rem; line-height:1.5;">'
    + '<strong style="color:var(--navy);">' + t('brandSearch') + '</strong> '
    + t('brandSearchIntro') + ' <strong>' + esc(data.query.drug) + '</strong>, ' + t('brandSearchIntroOf') + ' <strong>' + esc(dn.genericName) + '</strong>. '
    + t(textKey) + note + '</div>';
}

`;

const BOX_START = '${dn.brandSearchResolved ? `';
const BOX_END = "</div>` : ''}";
const BOX_REPLACEMENT = '${dn.brandSearchResolved ? brandSearchBox(data, dn) : \'\'}';
const FUNC_ANCHOR = 'function renderResults(data) {';
const KEY_ANCHOR = "brandSearch: { en: 'Brand Name Search:'";

function abort(msg) { console.error('[ABORT] ' + msg); process.exit(1); }
function countOf(text, s) { return text.split(s).length - 1; }

/** Compiles every inline script (not JSON-LD, not src=). Returns a list of errors. */
function scriptErrors(html) {
  const errors = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m; let n = 0;
  while ((m = re.exec(html)) !== null) {
    n++;
    if (/application\/ld\+json|application\/json/i.test(m[1])) continue;
    try { new vm.Script(m[2], { filename: 'inline-script-' + n }); } catch (e) { errors.push('script ' + n + ': ' + e.message); }
  }
  return errors;
}

function main() {
  if (!fs.existsSync(APP)) abort('Not found: ' + APP);
  const src = fs.readFileSync(APP, 'utf8');
  if (src.includes(DONE_MARK)) { console.log('Already applied (brandSearchBox exists). Nothing to do.'); return; }

  const before = scriptErrors(src);
  if (before.length) abort('app.html inline scripts do not compile BEFORE the patch: ' + before.join('; '));
  if (countOf(src, BOX_START) !== 1) abort('Expected 1 brand box start, found ' + countOf(src, BOX_START) + '.');
  if (countOf(src, FUNC_ANCHOR) !== 1) abort('Expected 1 "' + FUNC_ANCHOR + '", found ' + countOf(src, FUNC_ANCHOR) + '.');
  if (countOf(src, KEY_ANCHOR) !== 1) abort('Expected 1 brandSearch T key, found ' + countOf(src, KEY_ANCHOR) + '.');
  for (const k of ['brandSearchIntro', 'brandSearchGeneric', 'brandSearchBrandOnly', 'brandSearchUnknown']) {
    if (src.includes(k + ':')) abort('T already has a key named ' + k + '. Review by hand.');
  }

  const boxStart = src.indexOf(BOX_START);
  const boxEnd = src.indexOf(BOX_END, boxStart);
  if (boxEnd === -1) abort('Could not find the end of the brand box.');
  const oldBox = src.slice(boxStart, boxEnd + BOX_END.length);
  if (!oldBox.includes('therapeutically equivalent')) abort('The brand box no longer has the old text. Review by hand.');
  if (oldBox.length > 1500) abort('The brand box span is ' + oldBox.length + ' characters; expected under 1500. Review by hand.');

  let out = src.slice(0, boxStart) + BOX_REPLACEMENT + src.slice(boxEnd + BOX_END.length);
  const keyLineEnd = out.indexOf('\n', out.indexOf(KEY_ANCHOR));
  out = out.slice(0, keyLineEnd + 1) + NEW_KEYS + '\n' + out.slice(keyLineEnd + 1);
  const funcAt = out.indexOf(FUNC_ANCHOR);
  out = out.slice(0, funcAt) + NEW_FUNCTION + out.slice(funcAt);

  const after = scriptErrors(out);
  if (after.length) abort('Patched app.html would not compile: ' + after.join('; ') + '. Nothing written.');

  console.log('--- PLAN (' + APP + ', ' + src.length + ' -> ' + out.length + ' chars) ---');
  console.log('1. T table: +6 keys after brandSearch (English and Spanish)');
  console.log('2. New function brandSearchBox() before renderResults()');
  console.log('3. Old box (' + oldBox.length + ' chars) -> ' + BOX_REPLACEMENT);
  console.log('   Old text removed: "...Prices shown below are for the generic equivalent, which contains the same active ingredient and is FDA-rated as therapeutically equivalent."');
  console.log('Inline scripts compile after the patch: yes');
  if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bakDir = path.join(BASE, 'backups', 'v1.5.2-brand-banner-' + stamp);
  fs.mkdirSync(bakDir, { recursive: true });
  const bak = path.join(bakDir, 'app.html');
  fs.copyFileSync(APP, bak);
  const tmp = APP + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, out, 'utf8');
    fs.renameSync(tmp, APP);
    const check = fs.readFileSync(APP, 'utf8');
    if (check !== out) throw new Error('file on disk differs from the planned output');
  } catch (err) {
    fs.copyFileSync(bak, APP);
    try { fs.unlinkSync(tmp); } catch (e) { /* tmp was renamed or never written */ }
    abort('Write failed, app.html restored: ' + err.message);
  }
  console.log('[OK] app.html patched. Backup: ' + bak);
  console.log('NEXT: run patch-v1-5-2-brand-banner.js (version, CHANGELOG, VersionLog). No restart needed.');
}

main();
