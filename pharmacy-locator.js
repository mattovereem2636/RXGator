/**
 * RxGator — Pharmacy Locator
 * Finds nearby pharmacies via the free NPPES NPI Registry (CMS) and flags
 * known discount-program chains.
 * @module pharmacy-locator
 */

'use strict';

const { fetchJSON } = require('./utils');

const DISCOUNT_CHAINS = [
  { match: /walmart/i, program: 'Walmart $4 Generics List' },
  { match: /sam'?s club/i, program: 'Walmart $4 Generics List' },
  { match: /costco/i, program: 'Costco Member Pharmacy (no membership required for Rx)' },
  { match: /meijer/i, program: 'Meijer Free Generics' },
  { match: /kroger/i, program: 'Kroger Rx Savings Club' },
  { match: /publix/i, program: 'Publix Free/Low-Cost Generics' },
  { match: /h-?e-?b/i, program: 'H-E-B Generics Program' },
];

function tagDiscountProgram(name) {
  for (const chain of DISCOUNT_CHAINS) {
    if (chain.match.test(name || '')) return chain.program;
  }
  return null;
}

/**
 * Query the NPPES NPI Registry for retail pharmacies in a ZIP code.
 * @param {string} zip - 5-digit ZIP code.
 * @param {number} limit - Max results.
 * @returns {Promise<Array<Object>>} Pharmacy records.
 */
async function queryPharmacies(zip, limit) {
  const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&postal_code=${encodeURIComponent(zip)}&taxonomy_description=${encodeURIComponent('Pharmacy')}&enumeration_type=NPI-2&limit=${limit}`;
  const data = await fetchJSON(url);
  const results = data.results || [];

  const pharmacies = results.map(r => {
    const addresses = r.addresses || [];
    const address = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0] || {};
    const name = (r.basic && r.basic.organization_name) || 'Unknown Pharmacy';
    const discountProgram = tagDiscountProgram(name);
    return {
      npi: r.number,
      name,
      address: address.address_1 || null,
      address2: address.address_2 || null,
      city: address.city || null,
      state: address.state || null,
      zip: address.postal_code ? address.postal_code.slice(0, 5) : null,
      phone: address.telephone_number || null,
      isDiscountChain: !!discountProgram,
      discountProgram,
    };
  });

  pharmacies.sort((a, b) => {
    if (a.isDiscountChain !== b.isDiscountChain) return a.isDiscountChain ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return pharmacies;
}

module.exports = function (app) {
  /**
   * GET /api/pharmacies?zip=60025&limit=20
   * Returns nearby pharmacies, discount chains sorted first.
   */
  app.get('/api/pharmacies', async (req, res) => {
    const zip = String(req.query.zip || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'zip must be a 5-digit ZIP code', code: 'INVALID_ZIP' });
    }

    try {
      const pharmacies = await queryPharmacies(zip, limit);
      res.json({ zip, count: pharmacies.length, pharmacies });
    } catch (err) {
      console.error('Pharmacy locator error:', err.message);
      res.status(500).json({ error: 'Failed to locate pharmacies', code: 'PHARMACY_LOOKUP_FAILED' });
    }
  });
};
