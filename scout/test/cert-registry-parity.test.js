// Fix B (2026-09-29): the labels path (utils/cert-registry.js, CERT_VERIFY=1)
// and P5b web research (utils/cert-registry-web.js) used to parse the NSF
// dietary listing page with two different parsers. Both now go through
// cert-registry.js's ADAPTERS + judgePage(); these tests pin that the two
// public entry points reach the same verdict on the same page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../utils/cert-registry');
const CR = require('../utils/cert-registry-web');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'cert', f), 'utf8');

// Same vocabulary once mapped: P5b says 'supported' where the labels say 'verified'.
const WEB_TO_LABEL = { supported: 'verified', not_found: 'not_found', registry_unavailable: 'registry_unavailable' };

async function labelsVerdict(page, { brand, title }) {
  const fetchImpl = async () => {
    if (page.throws) throw new Error('ECONNRESET');
    return { ok: page.status < 400, status: page.status, text: async () => page.body };
  };
  const [r] = await C.verifyCertifications({ claims: ['NSF Contents Tested & Certified'], brand, title }, { enabled: true, fetchImpl });
  return r.status;
}

async function webVerdict(page, { brand }) {
  const target = { kind: 'registry', registry: 'NSF', brand, lookups: CR.registryLookup('NSF', brand), status: 'not_checked' };
  const fetchText = async () => {
    if (page.throws) throw new Error('ECONNRESET');
    return { ok: page.status < 400, status: page.status, text: page.body };
  };
  const [r] = await CR.runVerification([target], { fetchText });
  return WEB_TO_LABEL[r.status] || r.status;
}

const CASES = [
  { name: 'NSF listing naming the brand and this product', page: { status: 200, body: fx('nsf-contents-hit.html') }, brand: '21st Century', title: '21st Century D3 50 mcg 2000 IU Softgels', want: 'verified' },
  { name: 'Thorne listing (per-flavour / per-market rows)', page: { status: 200, body: fx('nsf-contents-thorne.html') }, brand: 'Thorne', title: 'Thorne Magnesium Bisglycinate Powder', want: 'verified' },
  { name: '"No Matching Products Found"', page: { status: 200, body: fx('nsf-contents-empty.html') }, brand: 'Calmwell', title: 'Calmwell Magnesium Glycinate', want: 'not_found' },
  { name: 'counter says 0', page: { status: 200, body: 'Number of matching Manufacturers is 0 Number of matching Products is 0' }, brand: 'Calmwell', title: 'Calmwell Magnesium', want: 'not_found' },
  { name: 'rows no longer parse but the counter says 1 (layout change)', page: { status: 200, body: '<table><tr><td>Calmwell Magnesium Glycinate</td></tr></table> Number of matching Products is 1' }, brand: 'Calmwell', title: 'Calmwell Magnesium Glycinate Capsules', want: 'verified' },
  { name: 'an error / redesigned page', page: { status: 200, body: '<html>New NSF search experience</html>' }, brand: 'Calmwell', title: 'Calmwell Magnesium', want: 'registry_unavailable' },
  { name: 'HTTP 500', page: { status: 500, body: '' }, brand: 'Calmwell', title: 'Calmwell Magnesium', want: 'registry_unavailable' },
  { name: 'network failure', page: { throws: true }, brand: 'Calmwell', title: 'Calmwell Magnesium', want: 'registry_unavailable' },
];

for (const c of CASES) {
  test(`labels and P5b agree on the NSF page: ${c.name} → ${c.want}`, async () => {
    const labels = await labelsVerdict(c.page, c);
    const web = await webVerdict(c.page, c);
    assert.equal(labels, c.want, 'labels path');
    assert.equal(web, c.want, 'P5b path');
  });
}

test('both entry points parse with the SAME adapter code (one NSF parser, not two)', () => {
  assert.equal(C.ADAPTERS.nsf_contents.parse, C.ADAPTERS.nsf_dietary.parse);
  assert.equal(C.ADAPTERS.nsf_dietary.parse, C.parseNsfDietaryListings);
  // P5b's lookup URL is the adapter's URL (every NSF dietary standard, brand-level).
  assert.equal(CR.registryLookup('NSF', 'Calmwell')[0].url, C.ADAPTERS.nsf_dietary.url({ brand: 'Calmwell' }));
  // parseNsfListing is judgePage in P5b's shape.
  const html = fx('nsf-contents-hit.html');
  assert.deepEqual(CR.parseNsfListing(html, '21st Century'), { available: true, products: 3, hit: C.judgePage('nsf_dietary', { ok: true, body: html }, { brand: '21st Century' }).status === 'verified' });
});

test('the one intended difference is granularity: P5b asks about the BRAND, the labels about THIS product', async () => {
  // 21st Century is on the page, but not with a zinc product.
  const page = { status: 200, body: fx('nsf-contents-hit.html') };
  const who = { brand: '21st Century', title: '21st Century Zinc 50 mg Tablets' };
  assert.equal(await labelsVerdict(page, who), 'not_found', 'product-level: no zinc listing');
  assert.equal(await webVerdict(page, who), 'verified', 'brand-level: the brand is listed');
  // Brand matching is the same word-boundary rule on both sides: "Olly" is not "Jolly".
  const jolly = { status: 200, body: '<table><tr><td>Jolly Vitamins Magnesium</td></tr></table> Number of matching Products is 1' };
  assert.equal(await webVerdict(jolly, { brand: 'Olly' }), 'not_found');
  assert.equal(await labelsVerdict(jolly, { brand: 'Olly', title: 'Olly Magnesium' }), 'not_found');
});
