#!/usr/bin/env node
/**
 * RxGator Medicare & Drug Policy News Crawler
 *
 * Monitors multiple sources for Medicare/prescription drug news:
 *   1. CMS.gov Newsroom RSS (press releases)
 *   2. Federal Register API (rules, proposed rules, notices from CMS)
 *   3. FDA Drug Safety Communications RSS
 *   4. AARP Medicare news (web scrape)
 *
 * When it finds new stories, it:
 *   - Saves a report to /var/www/rxaggregator/data/news-reports/
 *   - Emails a digest to the configured address
 *   - Drafts article outlines for promising stories
 *
 * Usage:
 *   node medicare-news-crawler.js                  # Full run (check + email + save)
 *   node medicare-news-crawler.js --check-only     # Check sources, print results, no email
 *   node medicare-news-crawler.js --since 7        # Look back N days (default: 7)
 *   node medicare-news-crawler.js --json           # Output JSON instead of formatted text
 *
 * Config:
 *   Set EMAIL_TO, EMAIL_FROM, and SMTP credentials in environment or .env file.
 *   Falls back to saving reports locally if email is not configured.
 *
 * Scheduled via Claude scheduled task: Weekly, Mondays at 10 AM ET.
 */

try { require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") }); } catch {}
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────
const CONFIG = {
  lookbackDays: 7,
  reportDir: path.join(__dirname, '..', 'data', 'news-reports'),
  seenFile: path.join(__dirname, '..', 'data', 'news-seen.json'),
  emailTo: process.env.EMAIL_TO || 'mattovereem@ameritech.net',
  emailFrom: process.env.EMAIL_FROM || 'rxgator@rxgator.info',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',

  // Keywords that signal a story is relevant to RxGator's audience
  keywords: [
    'medicare part d', 'part d', 'prescription drug', 'drug pricing',
    'drug price', 'drug cost', 'pharmacy benefit', 'formulary',
    'out-of-pocket', 'copay', 'copayment', 'deductible', 'premium',
    'insulin', 'generic drug', 'brand-name drug', 'biosimilar',
    'inflation reduction act', 'drug negotiation', 'price negotiation',
    'prescription assistance', 'low-income subsidy', 'extra help',
    'medicare advantage', 'open enrollment', 'donut hole',
    'coverage gap', 'catastrophic coverage', 'drug recall',
    'fda approval', 'drug safety', 'pharmaceutical',
    'pbm', 'pharmacy benefit manager', 'prior authorization',
    'step therapy', 'medication', 'rx', 'prescription',
    'senior', 'elderly', 'beneficiary', 'enrollee',
    'subsidy', 'rebate', 'discount', 'savings',
    'medicaid', 'dual eligible', 'medigap'
  ],

  // High-priority keywords that boost a story's relevance score
  highPriority: [
    'medicare part d', 'drug pricing', 'prescription drug cost',
    'insulin', 'out-of-pocket cap', 'premium increase',
    'inflation reduction act', 'drug negotiation', 'open enrollment',
    'drug recall', 'subsidy ending', 'subsidy end'
  ],

  // Sources
  sources: {
    fdaDrugs: {
      name: 'FDA Drug News',
      url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml',
      type: 'rss'
    },
    fdaPressReleases: {
      name: 'FDA Press Releases',
      url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
      type: 'rss'
    },
    federalRegister: {
      name: 'Federal Register (CMS)',
      url: 'https://www.federalregister.gov/api/v1/documents.json',
      type: 'api',
      params: {
        'conditions[agencies][]': 'centers-for-medicare-medicaid-services',
        'conditions[term]': 'Medicare drug',
        'per_page': 20,
        'order': 'newest'
      }
    },
    federalRegisterHHS: {
      name: 'Federal Register (HHS)',
      url: 'https://www.federalregister.gov/api/v1/documents.json',
      type: 'api',
      params: {
        'conditions[agencies][]': 'health-and-human-services-department',
        'conditions[term]': 'prescription drug Medicare',
        'per_page': 10,
        'order': 'newest'
      }
    }
  }
};

// ─── CLI Args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const jsonOutput = args.includes('--json');
const sinceIdx = args.indexOf('--since');
if (sinceIdx !== -1 && args[sinceIdx + 1]) {
  CONFIG.lookbackDays = parseInt(args[sinceIdx + 1], 10) || 7;
}

// ─── Helpers ────────────────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'RxGator-NewsCrawler/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
    };
    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pubDate: get('pubDate'),
      date: get('pubDate') ? new Date(get('pubDate')) : null
    });
  }
  return items;
}

function scoreRelevance(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  let score = 0;
  let matchedKeywords = [];

  for (const kw of CONFIG.highPriority) {
    if (text.includes(kw)) {
      score += 3;
      matchedKeywords.push(kw);
    }
  }
  for (const kw of CONFIG.keywords) {
    if (text.includes(kw) && !matchedKeywords.includes(kw)) {
      score += 1;
      matchedKeywords.push(kw);
    }
  }
  return { score, matchedKeywords };
}

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.seenFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  fs.mkdirSync(path.dirname(CONFIG.seenFile), { recursive: true });
  fs.writeFileSync(CONFIG.seenFile, JSON.stringify(seen, null, 2));
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Source Fetchers ────────────────────────────────────────────────

async function fetchCmsRss(source) {
  try {
    const xml = await fetchUrl(source.url);
    const items = parseRssItems(xml);
    return items.map(item => ({
      source: source.name,
      title: item.title,
      url: item.link,
      description: item.description,
      date: item.date,
      id: item.link || item.title
    }));
  } catch (e) {
    console.error(`  [WARN] Failed to fetch ${source.name}: ${e.message}`);
    return [];
  }
}

async function fetchFederalRegister() {
  const src = CONFIG.sources.federalRegister;
  const cutoff = daysAgo(CONFIG.lookbackDays);
  const dateStr = cutoff.toISOString().split('T')[0];

  const params = new URLSearchParams({
    ...src.params,
    'conditions[publication_date][gte]': dateStr
  });

  try {
    const raw = await fetchUrl(`${src.url}?${params}`);
    const data = JSON.parse(raw);
    if (!data.results) return [];

    return data.results.map(doc => ({
      source: src.name,
      title: doc.title,
      url: doc.html_url,
      description: doc.abstract || '',
      date: doc.publication_date ? new Date(doc.publication_date) : null,
      type: doc.type,
      documentNumber: doc.document_number,
      id: doc.document_number
    }));
  } catch (e) {
    console.error(`  [WARN] Failed to fetch Federal Register: ${e.message}`);
    return [];
  }
}

async function fetchFdaRss() {
  try {
    const xml = await fetchUrl(CONFIG.sources.fdaSafety.url);
    const items = parseRssItems(xml);
    return items.map(item => ({
      source: CONFIG.sources.fdaSafety.name,
      title: item.title,
      url: item.link,
      description: item.description,
      date: item.date,
      id: item.link || item.title
    }));
  } catch (e) {
    console.error(`  [WARN] Failed to fetch FDA Safety: ${e.message}`);
    return [];
  }
}

// ─── Article Outline Generator ──────────────────────────────────────

function generateArticleOutline(story) {
  const slug = slugify(story.title);
  return {
    slug,
    suggestedTitle: story.title,
    suggestedTag: story.source.includes('FDA') ? 'Drug Safety' : 'Medicare & Policy',
    angle: `RxGator angle: How this affects prescription drug costs for consumers. ` +
           `Connect to price comparison, savings strategies, and actionable steps readers can take.`,
    keyPoints: [
      `What happened: ${story.title}`,
      `Who is affected: Medicare beneficiaries / prescription drug consumers`,
      `Dollar impact: Research specific cost changes`,
      `What readers should do: Concrete action steps`,
      `How RxGator helps: Connect to drug price search tool`
    ],
    sources: [story.url],
    matchedKeywords: story.matchedKeywords
  };
}

// ─── Report Builder ─────────────────────────────────────────────────

function buildReport(stories, newStories) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let report = `# RxGator Medicare & Drug Policy News Report\n`;
  report += `**Generated:** ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET\n`;
  report += `**Period:** Last ${CONFIG.lookbackDays} days\n`;
  report += `**Total stories found:** ${stories.length}\n`;
  report += `**New stories (not previously seen):** ${newStories.length}\n\n`;
  report += `---\n\n`;

  if (newStories.length === 0) {
    report += `No new relevant stories found this period.\n\n`;
    return { report, dateStr };
  }

  // Sort by relevance score descending
  const sorted = [...newStories].sort((a, b) => b.relevanceScore - a.relevanceScore);

  // High-priority stories (score >= 5)
  const highPri = sorted.filter(s => s.relevanceScore >= 5);
  const medPri = sorted.filter(s => s.relevanceScore >= 3 && s.relevanceScore < 5);
  const lowPri = sorted.filter(s => s.relevanceScore < 3);

  if (highPri.length > 0) {
    report += `## HIGH PRIORITY — Article Candidates\n\n`;
    report += `These stories scored highest for RxGator relevance and should be considered for full articles.\n\n`;
    highPri.forEach((story, i) => {
      report += `### ${i + 1}. ${story.title}\n`;
      report += `- **Source:** ${story.source}\n`;
      report += `- **Date:** ${story.date ? story.date.toISOString().split('T')[0] : 'Unknown'}\n`;
      report += `- **Relevance Score:** ${story.relevanceScore}/10+\n`;
      report += `- **Keywords:** ${story.matchedKeywords.join(', ')}\n`;
      report += `- **URL:** ${story.url}\n`;
      report += `- **Summary:** ${story.description.substring(0, 300)}${story.description.length > 300 ? '...' : ''}\n\n`;

      const outline = generateArticleOutline(story);
      report += `**Suggested Article:**\n`;
      report += `- Slug: \`${outline.slug}\`\n`;
      report += `- Tag: ${outline.suggestedTag}\n`;
      report += `- Angle: ${outline.angle}\n`;
      outline.keyPoints.forEach(kp => {
        report += `  - ${kp}\n`;
      });
      report += `\n`;
    });
  }

  if (medPri.length > 0) {
    report += `## MEDIUM PRIORITY — Worth Monitoring\n\n`;
    medPri.forEach((story, i) => {
      report += `${i + 1}. **${story.title}** (Score: ${story.relevanceScore})\n`;
      report += `   Source: ${story.source} | ${story.date ? story.date.toISOString().split('T')[0] : ''}\n`;
      report += `   ${story.url}\n`;
      report += `   Keywords: ${story.matchedKeywords.join(', ')}\n\n`;
    });
  }

  if (lowPri.length > 0) {
    report += `## LOW PRIORITY — Background\n\n`;
    lowPri.forEach((story, i) => {
      report += `${i + 1}. ${story.title} (Score: ${story.relevanceScore}) — ${story.source}\n`;
      report += `   ${story.url}\n\n`;
    });
  }

  return { report, dateStr };
}

// ─── Email Sender ───────────────────────────────────────────────────

async function sendEmail(subject, body) {
  // Check if nodemailer is available
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.log('  [INFO] nodemailer not installed. Install with: npm install nodemailer');
    console.log('  [INFO] Skipping email, report saved to file.');
    return false;
  }

  if (!CONFIG.smtpHost || !CONFIG.smtpUser) {
    console.log('  [INFO] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.');
    console.log('  [INFO] Skipping email, report saved to file.');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: CONFIG.smtpHost,
      port: CONFIG.smtpPort,
      secure: CONFIG.smtpPort === 465,
      auth: { user: CONFIG.smtpUser, pass: CONFIG.smtpPass }
    });

    await transporter.sendMail({
      from: CONFIG.emailFrom,
      to: CONFIG.emailTo,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>').replace(/#{3}\s(.+)/g, '<h3>$1</h3>')
        .replace(/#{2}\s(.+)/g, '<h2>$1</h2>')
        .replace(/#{1}\s(.+)/g, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    });

    console.log(`  [OK] Email sent to ${CONFIG.emailTo}`);
    return true;
  } catch (e) {
    console.error(`  [WARN] Email failed: ${e.message}`);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  RxGator Medicare & Drug Policy News Crawler');
  console.log(`  Looking back ${CONFIG.lookbackDays} days`);
  console.log('═══════════════════════════════════════════════════════\n');

  const cutoff = daysAgo(CONFIG.lookbackDays);
  const seen = loadSeen();
  const allStories = [];

  // Fetch from all sources
  console.log('Fetching sources...');

  console.log('  [1/4] FDA Drug News...');
  const fdaDrugs = await fetchCmsRss(CONFIG.sources.fdaDrugs);
  console.log(`        Found ${fdaDrugs.length} items`);

  console.log('  [2/4] FDA Press Releases...');
  const fdaPress = await fetchCmsRss(CONFIG.sources.fdaPressReleases);
  console.log(`        Found ${fdaPress.length} items`);

  console.log('  [3/4] Federal Register (CMS)...');
  const fedReg = await fetchFederalRegister();
  console.log(`        Found ${fedReg.length} items`);

  console.log('  [4/4] Federal Register (HHS)...');
  const origParams = CONFIG.sources.federalRegister;
  // Temporarily swap to HHS params
  const savedUrl = CONFIG.sources.federalRegister.url;
  const savedParams = CONFIG.sources.federalRegister.params;
  CONFIG.sources.federalRegister.params = CONFIG.sources.federalRegisterHHS.params;
  const fedRegHHS = await fetchFederalRegister();
  CONFIG.sources.federalRegister.params = savedParams;
  console.log(`        Found ${fedRegHHS.length} items`);

  // Combine all stories (dedup by ID)
  const allRaw = [...fdaDrugs, ...fdaPress, ...fedReg, ...fedRegHHS];
  const seenIds = new Set();
  const rawStories = allRaw.filter(s => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });
  console.log(`\nTotal raw items: ${rawStories.length}`);

  // Filter by date and score relevance
  for (const story of rawStories) {
    // Date filter
    if (story.date && story.date < cutoff) continue;

    // Score relevance
    const { score, matchedKeywords } = scoreRelevance(story.title, story.description);
    if (score === 0) continue; // Not relevant

    story.relevanceScore = score;
    story.matchedKeywords = matchedKeywords;
    allStories.push(story);
  }

  console.log(`Relevant stories (score > 0): ${allStories.length}`);

  // Filter out previously seen stories
  const newStories = allStories.filter(s => !seen[s.id]);
  console.log(`New stories (not seen before): ${newStories.length}\n`);

  // Build report
  const { report, dateStr } = buildReport(allStories, newStories);

  if (jsonOutput) {
    console.log(JSON.stringify({
      date: dateStr,
      lookbackDays: CONFIG.lookbackDays,
      totalRelevant: allStories.length,
      newStories: newStories.length,
      stories: newStories.sort((a, b) => b.relevanceScore - a.relevanceScore).map(s => ({
        title: s.title,
        source: s.source,
        url: s.url,
        date: s.date ? s.date.toISOString().split('T')[0] : null,
        relevanceScore: s.relevanceScore,
        matchedKeywords: s.matchedKeywords
      }))
    }, null, 2));
  } else if (!checkOnly) {
    // Save report to file
    fs.mkdirSync(CONFIG.reportDir, { recursive: true });
    const reportFile = path.join(CONFIG.reportDir, `news-${dateStr}.md`);
    fs.writeFileSync(reportFile, report);
    console.log(`Report saved: ${reportFile}`);

    // Send email if configured
    if (newStories.length > 0) {
      const highPri = newStories.filter(s => s.relevanceScore >= 5);
      const subject = highPri.length > 0
        ? `[RxGator] ${highPri.length} HIGH-PRIORITY Medicare/Drug Stories Found`
        : `[RxGator] ${newStories.length} New Medicare/Drug Stories This Week`;
      await sendEmail(subject, report);
    } else {
      console.log('No new stories — skipping email.');
    }

    // Mark stories as seen
    for (const story of allStories) {
      seen[story.id] = {
        title: story.title,
        date: story.date ? story.date.toISOString() : null,
        firstSeen: new Date().toISOString(),
        score: story.relevanceScore
      };
    }

    // Prune seen entries older than 90 days
    const pruneDate = daysAgo(90);
    for (const [id, entry] of Object.entries(seen)) {
      if (entry.firstSeen && new Date(entry.firstSeen) < pruneDate) {
        delete seen[id];
      }
    }
    saveSeen(seen);
  } else {
    // Check-only mode: just print
    console.log(report);
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Sources checked: 4`);
  console.log(`  Relevant stories: ${allStories.length}`);
  console.log(`  New this period: ${newStories.length}`);
  const highPriCount = newStories.filter(s => s.relevanceScore >= 5).length;
  if (highPriCount > 0) {
    console.log(`  HIGH PRIORITY: ${highPriCount} stories worth writing about`);
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('Crawler failed:', e.message);
  process.exit(1);
});
