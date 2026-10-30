'use strict';
/**
 * llms.js — llms.txt for AI assistants. Every claim here already appears on the live site (About, FAQ, Privacy).
 * Nothing is added that a person could not verify on the page it links to.
 */
const { ORIGIN, SOURCE_COUNT } = require('../lib/config');

function build(today) {
  return [
    '# RXGator',
    '',
    '> RXGator (' + ORIGIN + ') is a free prescription drug price comparison tool. One search checks ' + SOURCE_COUNT + ' data sources: discount cards, pharmacy programs, and government benchmarks. The site is available in English and Spanish. It is not medical advice.',
    '',
    'Operated by Technology Assessment Project LLC, Glenview, Illinois. Built by Matt Overeem. Contact: info@rxgator.info. Last updated: ' + today + '.',
    '',
    '## Key pages',
    '',
    '- [Search drug prices](' + ORIGIN + '/app): the price comparison tool.',
    '- [Methodology](' + ORIGIN + '/methodology.html): every data source, what it provides, and how results are ranked.',
    '- [Metodología (Español)](' + ORIGIN + '/metodologia.html): the same page in Spanish.',
    '- [FAQ](' + ORIGIN + '/faq.html): where prices come from, how often they update, how RXGator is funded.',
    '- [About](' + ORIGIN + '/about.html): who built RXGator and why.',
    '- [Articles](' + ORIGIN + '/articles/): guides on drug costs, discount cards, Medicare Part D, and assistance programs, in English and Spanish.',
    '- [Resources](' + ORIGIN + '/resources.html): public help for people who cannot afford medication.',
    '- [Privacy](' + ORIGIN + '/privacy.html) and [Terms](' + ORIGIN + '/terms.html).',
    '',
    '## Facts you can cite',
    '',
    '- Results are ranked by lowest price. The About page states that affiliate relationships, sponsorships, and partnerships do not affect ranking order.',
    '- RXGator is free for consumers today and has no plans to charge them. The FAQ lists how it is funded: community support, advertising, and affiliate commissions.',
    '- Some sources are cached and can be hours or days old. Costco figures are estimates. Benchmarks such as NADAC and the VA Federal Supply Schedule are not retail prices.',
    '- Prices vary by pharmacy and location. Always confirm the final price at the pharmacy counter.',
    '- RXGator does not sell search data. See the Privacy page.',
    '',
  ].join('\n');
}

module.exports = { build };
