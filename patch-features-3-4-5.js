const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server.js');
let content = fs.readFileSync(file, 'utf8');

const anchor = `require("./health-report")(app);`;
if (!content.includes(anchor)) {
  console.error('Anchor line not found — aborting, no changes made.');
  process.exit(1);
}
if (content.includes(`require('./pharmacy-locator')`)) {
  console.log('Already patched — no changes made.');
  process.exit(0);
}

const insertion = anchor + `\nrequire('./pharmacy-locator')(app);\nrequire('./price-alerts')(app);\nrequire('./drug-interactions')(app);`;
content = content.replace(anchor, insertion);
fs.writeFileSync(file, content);
console.log('Patched server.js — 3 require lines added after health-report.');
