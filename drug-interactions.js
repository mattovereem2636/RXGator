/**
 * RxGator — Drug Interaction Checker
 * Resolves each drug via RxNorm, then cross-references openFDA drug label
 * "drug_interactions" text for mentions of the other drugs in the set.
 * @module drug-interactions
 */

'use strict';

const { fetchJSON } = require('./utils');
const { queryRxNorm } = require('./drug-info');

const MAX_DRUGS = 6;

const SEVERITY_KEYWORDS = [
  { level: 'SEVERE', patterns: [/contraindicat/i, /life-threatening/i, /fatal/i, /do not (use|administer|combine)/i] },
  { level: 'MAJOR', patterns: [/should not be (used|administered) (together|concurrently|with)/i, /serious/i, /avoid concomitant/i] },
  { level: 'MODERATE', patterns: [/caution/i, /monitor/i, /may increase/i, /may decrease/i, /adjust(ed)? dos/i] },
];

function classifySeverity(text) {
  for (const { level, patterns } of SEVERITY_KEYWORDS) {
    if (patterns.some(p => p.test(text))) return level;
  }
  return 'UNKNOWN';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fetch the openFDA drug label for a generic name and return its
 * drug_interactions (or warnings_and_cautions) section text, if present.
 */
async function fetchInteractionLabel(genericName) {
  const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(genericName)}"&limit=1`;
  try {
    const data = await fetchJSON(url);
    const result = data.results && data.results[0];
    const section = (result && (result.drug_interactions || result.warnings_and_cautions)) || null;
    return Array.isArray(section) ? section.join(' ') : (section || null);
  } catch (err) {
    if (err.message && err.message.includes('404')) return null;
    console.error('[Interactions] openFDA label error:', err.message);
    return null;
  }
}

function findMentions(labelText, otherDrugs) {
  if (!labelText) return [];
  const hits = [];
  for (const other of otherDrugs) {
    const names = [other.name, ...(other.brandNames || [])].filter(Boolean);
    for (const n of names) {
      const re = new RegExp(`\\b${escapeRegex(n)}\\b`, 'i');
      if (re.test(labelText)) {
        hits.push(other.name);
        break;
      }
    }
  }
  return hits;
}

module.exports = function (app) {
  /**
   * GET /api/interactions?drugs=metformin,lisinopril,amlodipine
   * Checks each drug's openFDA label for mentions of the others.
   */
  app.get('/api/interactions', async (req, res) => {
    const raw = String(req.query.drugs || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'drugs query param is required (comma-separated)', code: 'MISSING_DRUGS' });
    }
    const names = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
    if (names.length < 2) {
      return res.status(400).json({ error: 'At least 2 drugs are required to check interactions', code: 'TOO_FEW_DRUGS' });
    }
    if (names.length > MAX_DRUGS) {
      return res.status(400).json({ error: `A maximum of ${MAX_DRUGS} drugs can be checked at once`, code: 'TOO_MANY_DRUGS' });
    }

    try {
      const resolved = [];
      for (const name of names) {
        const info = await queryRxNorm(name);
        resolved.push({
          queried: name,
          name: (info && info.name) || name,
          rxcui: (info && info.rxcui) || null,
          brandNames: (info && info.brandNames) || [],
          resolved: !!info,
        });
      }

      const interactions = [];
      for (let i = 0; i < resolved.length; i++) {
        const drug = resolved[i];
        if (!drug.resolved) continue;
        const labelText = await fetchInteractionLabel(drug.name);
        if (!labelText) continue;
        const others = resolved.filter((_, j) => j !== i);
        const mentioned = findMentions(labelText, others);
        for (const mentionedName of mentioned) {
          const excerptMatch = labelText.match(new RegExp(`.{0,120}\\b${escapeRegex(mentionedName)}\\b.{0,120}`, 'i'));
          interactions.push({
            drug: drug.name,
            interactsWith: mentionedName,
            severity: classifySeverity(labelText),
            excerpt: excerptMatch ? excerptMatch[0].trim() : null,
            source: 'openFDA Drug Label',
          });
        }
      }

      res.json({
        query: names,
        resolvedDrugs: resolved,
        interactionsFound: interactions.length,
        interactions,
        disclaimer: 'This is not medical advice. Interaction data is drawn from FDA drug labels and may be incomplete. Always consult your pharmacist or doctor before combining medications.',
      });
    } catch (err) {
      console.error('Drug interaction check error:', err.message);
      res.status(500).json({ error: 'Failed to check interactions', code: 'INTERACTION_CHECK_FAILED' });
    }
  });
};
