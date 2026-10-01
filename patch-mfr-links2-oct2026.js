/**
 * patch-mfr-links2-oct2026.js
 *
 * Second link-fix pass, from the check-mfr-links.js run on 2026-10-01. Replaces program
 * links that returned 404, did not resolve, or landed on an error page. Changes the url
 * only (plus name and text for one entry, see PrEP below). Leaves every other field alone.
 *
 * Replacement pages were opened on 2026-10-01 and loaded. Entries marked needsReview
 * returned 403 or no readable text to an automated fetch. Confirm them in a browser.
 *
 * SAFE TO RE-RUN. A program is changed only when found by its current name. Anything not
 * found is reported as a WARN and left alone. Backs up both files first.
 * USAGE (from /var/www/rxaggregator):
 *   node /var/www/rxaggregator/patch-mfr-links2-oct2026.js --dry-run
 *   node /var/www/rxaggregator/patch-mfr-links2-oct2026.js
 * Restart the app afterward: it loads manufacturer_assistance.json at startup.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || __dirname;
const DRY_RUN = process.argv.includes('--dry-run');
const CHECKED_ON = '2026-10-01';
const MFR_PATH = path.join(BASE, 'manufacturer_assistance.json');
const PAP_PATH = path.join(BASE, 'public', 'pap-database.json');
const NOVO_PAP = 'https://www.novocare.com/diabetes/help-with-costs/pap.html';

const mfr = JSON.parse(fs.readFileSync(MFR_PATH, 'utf8'));
const pap = JSON.parse(fs.readFileSync(PAP_PATH, 'utf8'));
const log = [];

/** Change fields on one program found by name, or warn. */
function setProgram(drugKey, programName, changes, needsReview) {
  const entry = mfr[drugKey];
  if (!entry) { log.push('WARN: ' + drugKey + ' not in manufacturer_assistance.json'); return; }
  const names = [programName, changes.name].filter(Boolean);
  const prog = entry.programs.find(p => names.includes(p.name));
  if (!prog) { log.push('WARN: ' + drugKey + ' has no program "' + programName + '" - left alone'); return; }
  Object.assign(prog, changes, { linkCheckedOn: CHECKED_ON });
  if (needsReview) prog.needsReview = true;
  log.push('SET: ' + drugKey + ' / ' + (changes.name || programName) + (needsReview ? '  (needsReview)' : ''));
}

setProgram('canagliflozin', 'Invokana Savings Card',
  { url: 'https://www.invokana.com/savings-and-cost-support/' });
setProgram('insulin glargine', 'Sanofi Insulins Valyou Savings Program',
  { url: 'https://www.lantus.com/sign-up-for-savings' });
setProgram('liraglutide', 'Novo Nordisk Patient Assistance Program', { url: NOVO_PAP });
setProgram('liraglutide', 'Victoza Savings Card',
  { url: 'https://www.novocare.com/diabetes/products/victoza.html' }, true);
setProgram('sacubitril/valsartan', 'Entresto Savings Card',
  { url: 'https://enrollsupport.entresto.com/' }, true);
setProgram('sacubitril/valsartan', 'Novartis Patient Assistance Foundation',
  { url: 'https://pap.novartis.com/' });
setProgram('sitagliptin', 'Januvia Savings Card',
  { url: 'https://www.januvia.com/special-offers/' }, true);

// The Ready, Set, PrEP site no longer resolves, and HIV.gov's access page does not mention it.
// Point to the HIV.gov page that lists manufacturer programs for PrEP medicines instead.
setProgram('emtricitabine/tenofovir disoproxil fumarate', 'Ready, Set, PrEP (Federal Program)', {
  name: 'HIV.gov: Resources for Accessing PrEP',
  savings: 'Lists manufacturer patient assistance and co-pay programs for PrEP medicines.',
  eligibility: 'Each program sets its own rules. Check the program page.',
  url: 'https://www.hiv.gov/hiv-basics/hiv-prevention/using-hiv-medication-to-reduce-risk/pre-exposure-prophylaxis/accessing'
});

// pap-database.json: Takeda link redirects to helpathandpap.com.
const lis = pap.drugs.find(d => String(d.generic_name).toLowerCase() === 'lisdexamfetamine');
if (lis && lis.pap) { lis.pap.application_url = 'https://www.helpathandpap.com/'; log.push('SET: pap-database / lisdexamfetamine'); }
else log.push('WARN: pap-database has no lisdexamfetamine pap object - left alone');
pap.version = '1.0.2';
pap.lastUpdated = CHECKED_ON;

/** Serialize pap-database in its existing style: one drug per line. */
function serializePap(db) {
  const parts = Object.keys(db).map(k => {
    if (k === 'drugs') return '  "drugs": [\n' + db.drugs.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]';
    return '  ' + JSON.stringify(k) + ': ' + JSON.stringify(db[k], null, 2).replace(/\n/g, '\n  ');
  });
  return '{\n' + parts.join(',\n') + '\n}\n';
}

console.log('--- PLAN ---');
log.forEach(l => console.log(l));
if (DRY_RUN) { console.log('\nDRY RUN: nothing written.'); process.exit(0); }

const mfrOut = JSON.stringify(mfr, null, 2) + '\n';
const papOut = serializePap(pap);
JSON.parse(mfrOut); JSON.parse(papOut); // throws before any write if invalid

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(MFR_PATH, MFR_PATH + '.pre-mfrlinks2-' + stamp + '.bak');
fs.copyFileSync(PAP_PATH, PAP_PATH + '.pre-mfrlinks2-' + stamp + '.bak');
fs.writeFileSync(MFR_PATH, mfrOut, 'utf8');
fs.writeFileSync(PAP_PATH, papOut, 'utf8');
console.log('\nWritten. Backups: *.pre-mfrlinks2-' + stamp + '.bak');
console.log('Next: restart the app, then run node /var/www/rxaggregator/check-mfr-links.js again.');
