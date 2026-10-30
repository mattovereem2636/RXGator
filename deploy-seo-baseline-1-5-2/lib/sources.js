'use strict';
/**
 * sources.js — the data sources RXGator names publicly. One list feeds the methodology pages and llms.txt.
 * Names match the list /api/health returned on 2026-10-08 (22 entries). Descriptions reuse the site's own
 * wording (data-sources.json, FAQ). UNVERIFIED: the three marked `inferred` come from health-endpoint labels only.
 */
const { SOURCE_COUNT } = require('./config');

const CAT = {
  consumer: { en: 'Consumer pricing: discount cards, pharmacies, programs', es: 'Precios para consumidores: tarjetas de descuento, farmacias, programas' },
  govt: { en: 'Government benchmarks and programs', es: 'Referencias y programas del gobierno' },
  info: { en: 'Drug information', es: 'Información de medicamentos' },
};

/* eslint-disable max-len */
const SOURCES = [
  { cat: 'consumer', name: 'Cost Plus Drugs', en: 'Transparent-pricing mail-order pharmacy. Price is cost plus a published markup and fees.', es: 'Farmacia por correo con precios transparentes. El precio es el costo más un margen y cargos publicados.' },
  { cat: 'consumer', name: 'GoodRx', en: 'Discount card prices at major pharmacies (cached data).', es: 'Precios de tarjeta de descuento en las principales farmacias (datos en caché).' },
  { cat: 'consumer', name: 'SingleCare', en: 'Discount card prices (cached data).', es: 'Precios de tarjeta de descuento (datos en caché).' },
  { cat: 'consumer', name: 'RxSaver', en: 'Discount card prices at local pharmacies (cached data).', es: 'Precios de tarjeta de descuento en farmacias locales (datos en caché).' },
  { cat: 'consumer', name: 'Blink Health', en: 'Discount prices you pay online, then pick up or have delivered (cached data).', es: 'Precios con descuento que se pagan en línea y se recogen o se reciben a domicilio (datos en caché).' },
  { cat: 'consumer', name: 'Inside Rx', en: 'Discount card prices (cached data).', es: 'Precios de tarjeta de descuento (datos en caché).', inferred: true },
  { cat: 'consumer', name: 'HealthWarehouse', en: 'Online pharmacy prices.', es: 'Precios de una farmacia en línea.', inferred: true },
  { cat: 'consumer', name: 'Walmart Rx Program', en: 'Walmart low-cost generic drug program (built-in list, updated when program pricing changes).', es: 'Programa de medicamentos genéricos de bajo costo de Walmart (lista integrada, actualizada cuando cambian los precios del programa).' },
  { cat: 'consumer', name: 'Amazon RxPass', en: 'Prime subscription that covers a set of generics (built-in list).', es: 'Suscripción Prime que cubre un conjunto de genéricos (lista integrada).' },
  { cat: 'consumer', name: 'Costco Pharmacy (estimated)', en: 'Estimated cash prices based on published reporting. These are estimates, not store quotes.', es: 'Precios en efectivo estimados según informes publicados. Son estimados, no cotizaciones de la tienda.' },
  { cat: 'consumer', name: 'Rx Outreach', en: 'Nonprofit mail-order pharmacy with income-based eligibility.', es: 'Farmacia sin fines de lucro por correo, con elegibilidad según ingresos.' },
  { cat: 'govt', name: 'NADAC', en: 'National Average Drug Acquisition Cost: what pharmacies pay on average. A benchmark, not a retail price. CMS publishes it weekly.', es: 'Costo Promedio Nacional de Adquisición de Medicamentos: lo que pagan las farmacias en promedio. Es una referencia, no un precio de venta. CMS lo publica cada semana.' },
  { cat: 'govt', name: 'Medicaid Federal Upper Limit', en: 'Maximum Medicaid reimbursement for generics. CMS publishes it monthly.', es: 'Reembolso máximo de Medicaid para genéricos. CMS lo publica cada mes.' },
  { cat: 'govt', name: 'Medicare Part D (CMS)', en: 'Medicare Part D spending data per drug.', es: 'Datos de gasto de Medicare Parte D por medicamento.' },
  { cat: 'govt', name: 'VA Federal Supply Schedule', en: 'Federal negotiated prices. A benchmark only; not available to consumers.', es: 'Precios negociados por el gobierno federal. Solo una referencia; no están disponibles para los consumidores.' },
  { cat: 'govt', name: 'Medicare Negotiated Prices (IRA)', en: 'Maximum Fair Prices negotiated under the Inflation Reduction Act for Medicare Part D.', es: 'Precios Máximos Justos negociados bajo la Ley de Reducción de la Inflación para Medicare Parte D.' },
  { cat: 'govt', name: 'Texas DSHS (WAC)', en: 'Wholesale Acquisition Cost: the manufacturer list price before discounts.', es: 'Costo de Adquisición Mayorista: el precio de lista del fabricante antes de descuentos.' },
  { cat: 'govt', name: 'FedRx', en: 'Government-negotiated deal pricing.', es: 'Precios de acuerdos negociados por el gobierno.', inferred: true },
  { cat: 'info', name: 'openFDA', en: 'Drug safety and identification data from the FDA.', es: 'Datos de seguridad e identificación de medicamentos de la FDA.' },
  { cat: 'info', name: 'RxNorm (NLM)', en: 'Drug name matching and brand-to-generic resolution from the National Library of Medicine.', es: 'Coincidencia de nombres de medicamentos y resolución de marca a genérico de la Biblioteca Nacional de Medicina.' },
  { cat: 'info', name: 'MedlinePlus (NLM)', en: 'Plain-language drug information from the National Library of Medicine.', es: 'Información de medicamentos en lenguaje sencillo de la Biblioteca Nacional de Medicina.' },
  { cat: 'info', name: 'FDA Drug Shortages', en: 'Current drug shortage listings from the FDA.', es: 'Listas actuales de escasez de medicamentos de la FDA.' },
];

if (SOURCES.length !== SOURCE_COUNT) {
  throw new Error('sources.js lists ' + SOURCES.length + ' sources but SOURCE_COUNT is ' + SOURCE_COUNT + '. Fix one of them.');
}

module.exports = { SOURCES, CAT };
