const fs = require('fs');
const path = require('path');

const scriptFile = path.join(__dirname, 'scripts', 'rxgator-health-check.sh');
let content = fs.readFileSync(scriptFile, 'utf8');

const replacements = [
  {
    // log() used plain echo, so literal \n embedded in warn()/fail() messages
    // (used to build multi-item WARNINGS/FAILURES summaries) rendered as literal
    // backslash-n text in health-check.log instead of real line breaks.
    from: 'log() {\n  echo "$1" >> "$LOG_FILE"\n  REPORT="$REPORT$1\\n"\n}',
    to: 'log() {\n  echo -e "$1" >> "$LOG_FILE"\n  REPORT="$REPORT$1\\n"\n}'
  },
  {
    // pm2 logs --nostream always prints a header line like
    // "/root/.pm2/logs/rxaggregator-error.log last 50 lines:" even when there
    // are zero real errors. That header contains the substring "error" (from
    // the log filename itself), which the keyword grep below was matching as
    // a permanent false-positive "1 error line" on every single run.
    from: 'ERR_LOG=$(pm2 logs "$PM2_PROCESS" --err --nostream --lines 50 2>&1 | grep -v "^$" | grep -v "TAILING")',
    to: 'ERR_LOG=$(pm2 logs "$PM2_PROCESS" --err --nostream --lines 50 2>&1 | grep -v "^$" | grep -v "TAILING" | grep -v "last 50 lines:")'
  }
];

for (const r of replacements) {
  const count = content.split(r.from).length - 1;
  if (count !== 1) {
    console.error('Aborting: expected exactly 1 occurrence of:\n  ' + JSON.stringify(r.from) + '\nFound: ' + count);
    process.exit(1);
  }
}

for (const r of replacements) {
  content = content.replace(r.from, function () { return r.to; });
}

fs.writeFileSync(scriptFile, content);
console.log('Patched rxgator-health-check.sh -- fixed error-log false-positive and log formatting.');
