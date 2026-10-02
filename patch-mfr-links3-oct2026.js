/**
 * patch-mfr-links3-oct2026.js
 *
 * Third data pass (release 1.4.6). Three fixes, each checked against official pages on 2026-10-01:
 *  1. Januvia: the savings-card link redirects to a 404. Replace the card with the Merck Patient
 *     Assistance Program (https://www.merckhelps.com/JANUVIA), which covers Januvia for people
 *     with no drug coverage. Dollar limits are not restated: the program page states them.
 *  2. Descovy: the second Ready, Set, PrEP entry no longer resolves. Same HIV.gov replacement as 1.4.5.
 *  3. pap-database aripiprazole: no BMS program exists. Otsuka's foundation covers only the
 *     Abilify Maintena and Abilify Asimtufii injections, not oral tablets. Set pap to null.
 *
 * SAFE TO RE-RUN. Anything not found is a WARN and is left alone. Backs up both files first.
 * USAGE (from /var/www/rxaggregator):
 *   node /var/www/rxaggregator/patch-mfr-links3-oct2026.js --dry-run
 *   node /var/www/rxaggregator/patch-mfr-links3-oct2026.js
 * Restart the app afterward: it loads manufacturer_assistance.json at startup.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.RXG_BASE || __dirname;
const DRY_RUN = process.argv.includes('--dry-run');
const CHECKED_ON = '2026-10-01';
const MFR_PATH = path.join(BASE, 'manufacturer_assistance.json');
const PAP_PATH = path.join(BASE, 'public', 'pap-database.json');
const MERCK_URL = 'https://www.merckhelps.com/JANUVIA';
const PREP_URL = 'https://www.hiv.gov/hiv-basics/hiv-prevention/using-hiv-medication-to-reduce-risk/pre-exposure-prophylaxis/accessing';

const mfr = JSON.parse(fs.readFileSync(MFR_PATH, 'utf8'));
const pap = JSON.parse(fs.readFileSync(PAP_PATH, 'utf8'));
const log = [];

// 1. Januvia
const sita = mfr.sitagliptin;
if (!sita) { log.push('WARN: sitagliptin not in manufacturer_assistance.json'); }
else {
  const merckProgram = {
    name: 'Merck Patient Assistance Program',
    type: 'patient_assistance',
    savings: 'Free medicine for eligible people with no prescription coverage.',
    eligibility: 'Uninsured patients under the program income limit. See the program page for current limits.',
    url: MERCK_URL,
    linkCheckedOn: CHECKED_ON
  };
  const before = sita.programs.length;
  sita.programs = sita.programs.filter(p => p.name !== 'Januvia Savings Card');
  const removed = before - sita.programs.length;
  const existing = sita.programs.find(p => /merck/i.test(p.name) && p.type === 'patient_assistance');
  if (existing) { Object.assign(existing, { url: MERCK_URL, linkCheckedOn: CHECKED_ON }); delete existing.needsReview; log.push('SET: sitagliptin / existing Merck PAP url updated; savings card removed=' + removed); }
  else { sita.programs.push(merckProgram); log.push('SET: sitagliptin / added Merck Patient Assistance Program; savings card removed=' + removed); }
}

// 2. Descovy PrEP link
const taf = mfr['emtricitabine/tenofovir alafenamide'];
const prep = taf && taf.programs.find(p => p.name === 'Ready, Set, PrEP (Federal Program)' || p.name === 'HIV.gov: Resources for Accessing PrEP');
if (!prep) { log.push('WARN: Descovy has no Ready, Set, PrEP entry - left alone'); }
else {
  Object.assign(prep, {
    name: 'HIV.gov: Resources for Accessing PrEP',
    savings: 'Lists manufacturer patient assistance and co-pay programs for PrEP medicines.',
    eligibility: 'Each program sets its own rules. Check the program page.',
    url: PREP_URL, linkCheckedOn: CHECKED_ON
  });
  log.push('SET: Descovy / HIV.gov PrEP resources');
}

// 3. aripiprazole in pap-database
const ari = pap.drugs.find(d => String(d.generic_name).toLowerCase() === 'aripiprazole');
if (!ari) { log.push('WARN: pap-database has no aripiprazole entry - left alone'); }
else {
  ari.pap = null;
  ari.manufacturer = 'Otsuka (brand); generic since 2015';
  ari.notes = 'Generic aripiprazole widely available and significantly cheaper. The Otsuka Patient Assistance Foundation covers only the Abilify Maintena and Abilify Asimtufii injections, not tablets. Call 1-855-727-6274.';
  log.push('SET: pap-database / aripiprazole pap=null');
}
pap.version = '1.0.3';
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
if (log.some(l => l.startsWith('WARN'))) { console.error('\n[ABORT] A target was not found. Nothing written. Send the WARN lines to Claude.'); process.exit(1); }

const mfrOut = JSON.stringify(mfr, null, 2) + '\n';
const papOut = serializePap(pap);
JSON.parse(mfrOut); JSON.parse(papOut); // throws before any write if invalid

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(MFR_PATH, MFR_PATH + '.pre-mfrlinks3-' + stamp + '.bak');
fs.copyFileSync(PAP_PATH, PAP_PATH + '.pre-mfrlinks3-' + stamp + '.bak');
fs.writeFileSync(MFR_PATH, mfrOut, 'utf8');
fs.writeFileSync(PAP_PATH, papOut, 'utf8');
console.log('\nWritten. Backups: *.pre-mfrlinks3-' + stamp + '.bak');
console.log('Next: node /var/www/rxaggregator/patch-v1-4-6.js, then restart the app.');
