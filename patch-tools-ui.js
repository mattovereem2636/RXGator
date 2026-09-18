const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.html');
const htmlSnippet = fs.readFileSync(path.join(__dirname, 'tools-ui-section.html'), 'utf8');
const jsSnippet = fs.readFileSync(path.join(__dirname, 'tools-ui-script.html'), 'utf8');

let content = fs.readFileSync(appFile, 'utf8');

const mainAnchor = '</main>';
const scriptAnchor = '<script src="/my-medications.js"></script>';

if ((content.match(/<\/main>/g) || []).length !== 1) {
  console.error('Aborting: </main> anchor is not unique.');
  process.exit(1);
}
if ((content.match(/<script src="\/my-medications\.js"><\/script>/g) || []).length !== 1) {
  console.error('Aborting: my-medications.js script anchor is not unique.');
  process.exit(1);
}
if (content.includes('id="toolsHeading"')) {
  console.log('Already patched (toolsHeading found) — no changes made.');
  process.exit(0);
}

// Use function replacements (not strings) — a string replacement in .replace()
// treats sequences like $& $` $' $1 as special patterns even when the
// search argument is a plain string. Our snippet contains literal $'
// ("Current lowest price: $") which JS was interpreting as "insert everything
// after the match" — duplicating the rest of the file. Functions avoid this.
content = content.replace(mainAnchor, function () { return mainAnchor + '\n' + htmlSnippet; });
content = content.replace(scriptAnchor, function () { return scriptAnchor + '\n' + jsSnippet; });

fs.writeFileSync(appFile, content);
console.log('Patched app.html — tools UI section and script inserted.');
