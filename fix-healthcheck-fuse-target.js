const fs = require('fs');
const path = require('path');

const scriptFile = path.join(__dirname, 'scripts', 'rxgator-health-check.sh');
let content = fs.readFileSync(scriptFile, 'utf8');

const replacements = [
  {
    from: '# Verify Fuse.js script tag exists in index.html (served locally as /fuse.min.js)',
    to: '# Verify Fuse.js script tag exists in app.html (served locally as /fuse.min.js)'
  },
  {
    from: 'FUSE_TAG=$(grep -i \'fuse\' "$APP_DIR/public/index.html" | grep -o \'src="[^"]*"\' 2>/dev/null)',
    to: 'FUSE_TAG=$(grep -i \'fuse\' "$APP_DIR/public/app.html" | grep -o \'src="[^"]*"\' 2>/dev/null)'
  },
  {
    from: 'warn "Fuse.js script tag not found in index.html — autocomplete may be broken"',
    to: 'warn "Fuse.js script tag not found in app.html — autocomplete may be broken"'
  }
];

for (const r of replacements) {
  const count = content.split(r.from).length - 1;
  if (count !== 1) {
    console.error('Aborting: expected exactly 1 occurrence of:\n  ' + r.from + '\nFound: ' + count);
    process.exit(1);
  }
}

for (const r of replacements) {
  content = content.replace(r.from, function () { return r.to; });
}

fs.writeFileSync(scriptFile, content);
console.log('Patched rxgator-health-check.sh — Fuse.js check now targets app.html.');
