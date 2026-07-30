#!/usr/bin/env node
// ============================================================
// RxGator Accessibility Audit
// Manual WCAG 2.1 AA checks using jsdom DOM inspection
// ============================================================

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, '..', 'public');

const PAGES = [
  'index.html',
  'about.html',
  'faq.html',
  'landing.html',
  'privacy.html',
  'terms.html',
];

function auditPage(filename) {
  const filepath = path.join(PUBLIC, filename);
  const html = fs.readFileSync(filepath, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const findings = [];

  // 1. Check for lang attribute on <html>
  const htmlEl = doc.documentElement;
  if (!htmlEl.getAttribute('lang')) {
    findings.push({ impact: 'serious', rule: 'html-has-lang', msg: '<html> missing lang attribute' });
  }

  // 2. Check all images for alt text
  const images = doc.querySelectorAll('img');
  let missingAlt = 0;
  const missingAltSrcs = [];
  images.forEach(img => {
    if (!img.hasAttribute('alt')) {
      missingAlt++;
      missingAltSrcs.push(img.getAttribute('src') || '(no src)');
    }
  });
  if (missingAlt > 0) {
    findings.push({ impact: 'critical', rule: 'image-alt', msg: `${missingAlt} image(s) missing alt text`, targets: missingAltSrcs.slice(0, 5) });
  }

  // 3. Check form inputs for labels
  const inputs = doc.querySelectorAll('input, select, textarea');
  let unlabeled = 0;
  const unlabeledInputs = [];
  inputs.forEach(input => {
    const type = input.getAttribute('type');
    if (type === 'hidden' || type === 'submit' || type === 'button') return;
    const id = input.getAttribute('id');
    const hasLabel = id && doc.querySelector(`label[for="${id}"]`);
    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    const hasTitle = input.getAttribute('title');
    const wrappedInLabel = input.closest('label');
    if (!hasLabel && !hasAriaLabel && !hasTitle && !wrappedInLabel) {
      unlabeled++;
      unlabeledInputs.push(`${input.tagName.toLowerCase()}[type="${type || 'text'}"]#${id || '(no id)'}`);
    }
  });
  if (unlabeled > 0) {
    findings.push({ impact: 'critical', rule: 'label', msg: `${unlabeled} form input(s) without accessible label`, targets: unlabeledInputs.slice(0, 5) });
  }

  // 4. Check heading hierarchy (no skipped levels)
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let prevLevel = 0;
  const skips = [];
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    if (prevLevel > 0 && level > prevLevel + 1) {
      skips.push(`h${prevLevel} → h${level} (skipped h${prevLevel + 1})`);
    }
    prevLevel = level;
  });
  if (skips.length > 0) {
    findings.push({ impact: 'moderate', rule: 'heading-order', msg: `Heading hierarchy skips: ${skips.join(', ')}`, targets: skips });
  }

  // 5. Check for skip navigation link
  const skipLink = doc.querySelector('a.skip-link, a[href="#main-content"], a[href="#content"], .skip-link');
  const hasMain = doc.querySelector('main, [role="main"], #main-content, #content');
  if (!skipLink) {
    findings.push({ impact: 'moderate', rule: 'skip-link', msg: 'No skip navigation link found' });
  }

  // 6. Check for <main> landmark
  const mainLandmark = doc.querySelector('main, [role="main"]');
  if (!mainLandmark) {
    findings.push({ impact: 'moderate', rule: 'landmark-main', msg: 'No <main> landmark element found' });
  }

  // 7. Check for nav landmark
  const navLandmark = doc.querySelector('nav, [role="navigation"]');

  // 8. Check links without discernible text
  const links = doc.querySelectorAll('a');
  let emptyLinks = 0;
  const emptyLinkHrefs = [];
  links.forEach(a => {
    const text = (a.textContent || '').trim();
    const ariaLabel = a.getAttribute('aria-label');
    const ariaLabelledby = a.getAttribute('aria-labelledby');
    const hasImg = a.querySelector('img[alt]');
    if (!text && !ariaLabel && !ariaLabelledby && !hasImg) {
      emptyLinks++;
      emptyLinkHrefs.push(a.getAttribute('href') || '(no href)');
    }
  });
  if (emptyLinks > 0) {
    findings.push({ impact: 'serious', rule: 'link-name', msg: `${emptyLinks} link(s) without discernible text`, targets: emptyLinkHrefs.slice(0, 5) });
  }

  // 9. Check buttons without discernible text
  const buttons = doc.querySelectorAll('button, [role="button"]');
  let emptyButtons = 0;
  const emptyButtonInfo = [];
  buttons.forEach(btn => {
    const text = (btn.textContent || '').trim();
    const ariaLabel = btn.getAttribute('aria-label');
    if (!text && !ariaLabel) {
      emptyButtons++;
      emptyButtonInfo.push(btn.getAttribute('class') || btn.getAttribute('id') || '(anonymous)');
    }
  });
  if (emptyButtons > 0) {
    findings.push({ impact: 'critical', rule: 'button-name', msg: `${emptyButtons} button(s) without discernible text`, targets: emptyButtonInfo.slice(0, 5) });
  }

  // 10. Check for document title
  const title = doc.querySelector('title');
  if (!title || !title.textContent.trim()) {
    findings.push({ impact: 'serious', rule: 'document-title', msg: 'Page has no <title>' });
  }

  // 11. Check color contrast (basic CSS variable check)
  // We can't do full color contrast without rendering, but check for common patterns
  const style = doc.querySelector('style');
  if (style) {
    const css = style.textContent;
    // Check for very light text on white backgrounds
    if (css.includes('color: #ccc') || css.includes('color: #ddd') || css.includes('color: #eee')) {
      findings.push({ impact: 'serious', rule: 'color-contrast-hint', msg: 'Very light text colors detected in CSS — verify contrast ratio meets 4.5:1 for normal text' });
    }
  }

  // 12. Check for tabindex > 0 (anti-pattern)
  const badTabindex = doc.querySelectorAll('[tabindex]');
  let tabindexIssues = 0;
  badTabindex.forEach(el => {
    const val = parseInt(el.getAttribute('tabindex'));
    if (val > 0) tabindexIssues++;
  });
  if (tabindexIssues > 0) {
    findings.push({ impact: 'moderate', rule: 'tabindex', msg: `${tabindexIssues} element(s) with tabindex > 0 (disrupts natural tab order)` });
  }

  // 13. Check for autocomplete attribute on relevant inputs
  const nameInputs = doc.querySelectorAll('input[type="email"], input[type="tel"], input[name*="name"], input[name*="email"], input[name*="zip"]');
  let missingAutocomplete = 0;
  nameInputs.forEach(input => {
    if (!input.getAttribute('autocomplete')) missingAutocomplete++;
  });
  if (missingAutocomplete > 0) {
    findings.push({ impact: 'minor', rule: 'autocomplete-valid', msg: `${missingAutocomplete} personal-info input(s) missing autocomplete attribute` });
  }

  // 14. Check for ARIA roles used correctly
  const ariaElements = doc.querySelectorAll('[role]');
  const validRoles = ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'search', 'form', 'region', 'alert', 'dialog', 'button', 'link', 'img', 'list', 'listitem', 'tab', 'tablist', 'tabpanel', 'status', 'progressbar', 'menuitem', 'menu', 'presentation', 'none', 'tooltip', 'combobox', 'listbox', 'option', 'group', 'checkbox', 'radio', 'radiogroup', 'switch', 'textbox', 'slider', 'spinbutton', 'tree', 'treeitem', 'grid', 'gridcell', 'row', 'rowgroup', 'columnheader', 'rowheader', 'cell', 'heading', 'log', 'marquee', 'timer', 'separator', 'toolbar', 'figure', 'article', 'definition', 'directory', 'document', 'feed', 'note', 'math', 'term', 'application'];
  let invalidRoles = 0;
  ariaElements.forEach(el => {
    const role = el.getAttribute('role');
    if (!validRoles.includes(role)) invalidRoles++;
  });
  if (invalidRoles > 0) {
    findings.push({ impact: 'serious', rule: 'aria-valid-role', msg: `${invalidRoles} element(s) with invalid ARIA role` });
  }

  // Stats
  const h1Count = doc.querySelectorAll('h1').length;

  dom.window.close();

  return {
    file: filename,
    stats: {
      images: images.length,
      forms: inputs.length,
      headings: headings.length,
      h1Count,
      links: links.length,
      buttons: buttons.length,
      hasSkipLink: !!skipLink,
      hasMainLandmark: !!mainLandmark,
      hasNavLandmark: !!navLandmark,
    },
    findings,
  };
}

// ── Main ────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  RxGator Accessibility Audit (WCAG 2.1 AA)');
console.log(`  ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════════');

let totalFindings = 0;
const allResults = [];

for (const page of PAGES) {
  const result = auditPage(page);
  allResults.push(result);

  console.log(`\n── ${page} ──`);
  console.log(`  Images: ${result.stats.images} | Inputs: ${result.stats.forms} | Links: ${result.stats.links} | Headings: ${result.stats.headings} (${result.stats.h1Count} h1)`);
  console.log(`  Skip link: ${result.stats.hasSkipLink ? '✅' : '❌'} | <main>: ${result.stats.hasMainLandmark ? '✅' : '❌'} | <nav>: ${result.stats.hasNavLandmark ? '✅' : '❌'}`);

  if (result.findings.length === 0) {
    console.log('  ✅ No issues found');
  } else {
    totalFindings += result.findings.length;
    for (const f of result.findings) {
      const icon = f.impact === 'critical' ? '🔴' :
                   f.impact === 'serious' ? '🟠' :
                   f.impact === 'moderate' ? '🟡' : '⚪';
      console.log(`  ${icon} [${f.impact}] ${f.msg}`);
      if (f.targets) {
        for (const t of f.targets.slice(0, 3)) {
          console.log(`     → ${t}`);
        }
      }
    }
  }
}

// ── Summary ─────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log(`  Total: ${totalFindings} findings across ${PAGES.length} pages`);

// Group by impact
const byCriticality = { critical: 0, serious: 0, moderate: 0, minor: 0 };
for (const r of allResults) {
  for (const f of r.findings) {
    byCriticality[f.impact] = (byCriticality[f.impact] || 0) + 1;
  }
}
console.log(`  🔴 Critical: ${byCriticality.critical} | 🟠 Serious: ${byCriticality.serious} | 🟡 Moderate: ${byCriticality.moderate} | ⚪ Minor: ${byCriticality.minor}`);
console.log('═══════════════════════════════════════════════════════');

// Write results JSON
const outFile = path.join(__dirname, '..', 'logs', 'accessibility-audit.json');
if (!fs.existsSync(path.dirname(outFile))) fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ timestamp: new Date().toISOString(), results: allResults, summary: byCriticality }, null, 2));
console.log(`\nDetailed results written to: logs/accessibility-audit.json`);
