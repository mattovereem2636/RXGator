/**
 * patch-mfr-links-oct2026.js
 *
 * Data-only fix for manufacturer assistance links and text.
 *   1. manufacturer_assistance.json: fix dead or wrong links, drop dollar amounts that
 *      disagree with the official pages, correct eligibility text, add darolutamide
 *      (Nubeqa) and vibegron (Gemtesa).
 *   2. public/pap-database.json: fix the Novo Nordisk PAP link and wording, the BMS PAP
 *      link, and remove stale retail prices from notes.
 *
 * Source of truth: official manufacturer pages opened on 2026-10-01 (see CHECKED_ON).
 * Entries marked needsReview could not be fully read by an automated fetch. Confirm them
 * in a browser.
 *
 * SAFE TO RE-RUN: a program is replaced only when its current name matches an old or new
 * name. Anything else is left alone and reported as a WARN. Backs up both files first.
 * USAGE (from /var/www/rxaggregator):
 *   node patch-mfr-links-oct2026.js --dry-run
 *   node patch-mfr-links-oct2026.js
 * The app loads manufacturer_assistance.json at startup: restart the app after applying.
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const CHECKED_ON = '2026-10-01';
const MFR_PATH = path.join(__dirname, 'manufacturer_assistance.json');
const PAP_PATH = path.join(__dirname, 'public', 'pap-database.json');
const NEUTRAL_SAVINGS = 'Savings program available. See the program page for current terms.';

const mfr = JSON.parse(fs.readFileSync(MFR_PATH, 'utf8'));
const pap = JSON.parse(fs.readFileSync(PAP_PATH, 'utf8'));
const log = [];

/** Replace one program (matched by old or new name) or warn. Appends when allowed. */
function upsertProgram(drugKey, oldNames, program, opts) {
  const entry = mfr[drugKey];
  if (!entry) { log.push('WARN: ' + drugKey + ' not in manufacturer_assistance.json'); return; }
  const names = oldNames.concat(program.name);
  const idx = entry.programs.findIndex(p => names.includes(p.name));
  const next = Object.assign({}, program, { linkCheckedOn: CHECKED_ON });
  if (idx === -1) {
    if (opts && opts.append) { entry.programs.push(next); log.push('ADD: ' + drugKey + ' / ' + program.name); }
    else log.push('WARN: ' + drugKey + ' has no program named any of [' + names.join('; ') + '] - left alone');
    return;
  }
  entry.programs[idx] = next;
  log.push('SET: ' + drugKey + ' / ' + program.name);
}

// ---- empagliflozin (Jardiance) ----
upsertProgram('empagliflozin', ['Jardiance Savings Card'], {
  name: 'Jardiance Savings Card', type: 'copay_card', savings: NEUTRAL_SAVINGS,
  eligibility: 'Check the program page for current eligibility rules and covered conditions.',
  url: 'https://patient.boehringer-ingelheim.com/us/products/jardiance/savings'
});
upsertProgram('empagliflozin', ['Boehringer Ingelheim Cares Foundation'], {
  name: 'Boehringer Ingelheim Cares Foundation', type: 'patient_assistance',
  savings: 'Free medication for qualifying patients',
  eligibility: 'Check the program page for income, coverage, and covered medicines.',
  url: 'https://bicares.com/', needsReview: true
});

// ---- tirzepatide (Mounjaro, Zepbound) ----
upsertProgram('tirzepatide', ['Mounjaro Savings Card'], {
  name: 'Mounjaro Savings Card', type: 'copay_card', savings: NEUTRAL_SAVINGS,
  eligibility: 'Commercial insurance required. Not available with Medicare, Medicaid, or other government coverage.',
  url: 'https://mounjaro.lilly.com/savings-resources'
});
upsertProgram('tirzepatide', ['Lilly Cares Foundation'], {
  name: 'Lilly Cares Foundation', type: 'patient_assistance',
  savings: 'Free medication for qualifying patients',
  eligibility: 'Check the program page to see whether this medicine is covered and for income and coverage rules.',
  url: 'https://www.lillycares.com/', needsReview: true
});
upsertProgram('tirzepatide', [], {
  name: 'LillyDirect self-pay option', type: 'info',
  savings: 'Self-pay pricing without insurance. See the program page.',
  eligibility: 'Prescription required. Self-pay only.',
  url: 'https://www.lilly.com/lillydirect/mounjaro'
}, { append: true });

// ---- semaglutide (Ozempic, Rybelsus, Wegovy) ----
upsertProgram('semaglutide', ['Ozempic Savings Card'], {
  name: 'Novo Nordisk Diabetes Savings Card (Ozempic, Rybelsus)', type: 'copay_card', savings: NEUTRAL_SAVINGS,
  eligibility: 'Commercial, Health Exchange, FEHB, and state employee plans. Not available with Medicare, Medicaid, VA, DoD, or TRICARE.',
  url: 'https://www.novocare.com/eligibility/diabetes-savings-card.html'
});
upsertProgram('semaglutide', ['Novo Nordisk Patient Assistance Program'], {
  name: 'Novo Nordisk Patient Assistance Program', type: 'patient_assistance',
  savings: 'Free medication for qualifying patients',
  eligibility: 'For people with Medicare or no insurance who meet income limits (limits vary by product). Not available with commercial insurance. Some medicines leave the program in 2026, so check the current list.',
  url: 'https://www.novocare.com/diabetes/help-with-costs/pap.html'
});

// ---- apixaban (Eliquis) ----
upsertProgram('apixaban', ['Eliquis Free Trial Offer'], {
  name: 'Eliquis Co-pay Card and Free Trial Offer', type: 'copay_card',
  savings: 'Co-pay card, plus a free 30-day trial for new patients. See the program page for current terms.',
  eligibility: 'Commercial insurance required. Not available with Medicare Part D, Medicaid, TRICARE, VA, or DoD coverage.',
  url: 'https://www.eliquis.bmscustomerconnect.com/commercially-insured-patients'
});
upsertProgram('apixaban', ['BMS Patient Assistance Foundation'], {
  name: 'BMS Patient Assistance Foundation', type: 'patient_assistance',
  savings: 'Free medication for qualifying patients',
  eligibility: 'Check the program page for income and coverage rules.',
  url: 'https://www.bmspaf.org/', needsReview: true
});

// ---- new entries ----
function addDrug(key, entry) {
  if (mfr[key]) { log.push('SKIP: ' + key + ' already in manufacturer_assistance.json'); return; }
  entry.programs = entry.programs.map(p => Object.assign({}, p, { linkCheckedOn: CHECKED_ON }));
  mfr[key] = entry;
  log.push('ADD: ' + key);
}
addDrug('darolutamide', {
  brandNames: ['Nubeqa'], manufacturer: 'Bayer',
  programs: [
    { name: 'NUBEQA $0 Co-Pay Card', type: 'copay_card', savings: NEUTRAL_SAVINGS,
      eligibility: 'Commercial prescription insurance required, with no income requirement. Not available with Medicare, Medicaid, or other government coverage.',
      url: 'https://www.nubeqa-us.com/savings-support/nubeqa-copay-card' },
    { name: 'Bayer US Patient Assistance Foundation', type: 'patient_assistance',
      savings: 'Free medication for qualifying patients',
      eligibility: 'For patients without insurance who meet the program requirements.',
      url: 'https://www.patientassistance.bayer.us' }
  ]
});
addDrug('vibegron', {
  brandNames: ['Gemtesa'], manufacturer: 'GEMTESA program',
  programs: [
    { name: 'GEMTESA Savings Program', type: 'copay_card', savings: NEUTRAL_SAVINGS,
      eligibility: 'Must be 18 or older. Check the program page for full eligibility rules.',
      url: 'https://www.gemtesa.com/savings-apply/', needsReview: true }
  ]
});

// ---- pap-database.json ----
function editPap(generic, fn) {
  const d = pap.drugs.find(x => String(x.generic_name).toLowerCase() === generic);
  if (!d) { log.push('WARN: pap-database has no ' + generic); return; }
  if (!d.pap) { log.push('WARN: pap-database ' + generic + ' has no pap object'); return; }
  fn(d); log.push('SET: pap-database / ' + generic);
}
editPap('semaglutide', d => {
  d.pap.application_url = 'https://www.novocare.com/diabetes/help-with-costs/pap.html';
  d.pap.income_limit_pct_fpl = null; // official page: limits vary by product (200-400% FPL)
  d.pap.insurance_requirement = 'No insurance or Medicare (not commercial insurance). Income limits vary by product.';
  d.pap.what_you_get = 'Free medication for qualifying patients. Check the program page for the current list of covered medicines.';
  d.pap.notes = 'One of the most valuable assistance programs given the high retail cost. Commercially insured patients should check the Novo Nordisk savings card instead.';
});
editPap('apixaban', d => {
  d.pap.application_url = 'https://www.bmspaf.org/';
  d.notes = String(d.notes || '').replace(/Retail cost ~\$[\d,\-$]+\/month\.\s*/g, '').trim();
  d.pap.notes = String(d.pap.notes || '').replace(/Retail cost ~\$[\d,\-$]+\/month\.\s*/g, '').trim();
});
editPap('empagliflozin', d => {
  d.pap.notes = String(d.pap.notes || '').replace(/Retail cost ~\$[\d,\-$]+\/month\.\s*/g, '').trim();
});
pap.version = '1.0.1';
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
fs.copyFileSync(MFR_PATH, MFR_PATH + '.pre-mfrlinks-' + stamp + '.bak');
fs.copyFileSync(PAP_PATH, PAP_PATH + '.pre-mfrlinks-' + stamp + '.bak');
fs.writeFileSync(MFR_PATH, mfrOut, 'utf8');
fs.writeFileSync(PAP_PATH, papOut, 'utf8');
console.log('\nWritten. Backups: *.pre-mfrlinks-' + stamp + '.bak');
console.log('Next: restart the app, then open Ozempic, Eliquis, Jardiance, Mounjaro, Nubeqa and Gemtesa in a browser.');
