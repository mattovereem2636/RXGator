'use strict';
/**
 * schema.js — Organization and WebSite structured data for the homepage twins and About.
 * Facts come from the site's own FAQ and footer: operator, location, founder, contact address.
 */
const { ORIGIN } = require('../lib/config');
const { beforeHeadClose } = require('../lib/edit');

const GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization', '@id': ORIGIN + '/#organization', name: 'RXGator', url: ORIGIN + '/',
      logo: ORIGIN + '/logo-primary.png', email: 'info@rxgator.info',
      founder: { '@type': 'Person', name: 'Matt Overeem' },
      parentOrganization: {
        '@type': 'Organization', name: 'Technology Assessment Project LLC',
        address: { '@type': 'PostalAddress', addressLocality: 'Glenview', addressRegion: 'IL', addressCountry: 'US' },
      },
    },
    {
      '@type': 'WebSite', '@id': ORIGIN + '/#website', url: ORIGIN + '/', name: 'RXGator',
      description: 'Free prescription drug price comparison across multiple discount cards, pharmacy programs, and government benchmarks.',
      inLanguage: ['en', 'es'], publisher: { '@id': ORIGIN + '/#organization' },
    },
  ],
};

const TARGETS = ['/index.html', '/landing.html', '/about.html'];

function run(ctx) {
  const block = '<script type="application/ld+json">\n' + JSON.stringify(GRAPH, null, 2) + '\n</script>';
  for (const page of ctx.pages) {
    if (!TARGETS.includes(page.rel) || page.out.includes('/#organization')) continue;
    const [out, n] = beforeHeadClose(page.out, block);
    if (!n) { ctx.miss(page.rel, 'schema', 'no </head>'); continue; }
    page.out = out;
    ctx.log(page.rel, 'schema-org', 1);
  }
}

module.exports = { run };
