// Fixtures in test/fixtures/cert/ are trimmed copies of the live registry
// pages (fetched 2026-09-27). No network in tests: fetch is injected.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../utils/cert-registry');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'cert', f), 'utf8');
const SPORT = fx('nsf-sport-catalogue.html');
const CONTENTS_HIT = fx('nsf-contents-hit.html');
const CONTENTS_EMPTY = fx('nsf-contents-empty.html');

function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    for (const [re, resp] of routes) if (re.test(url)) return typeof resp === 'function' ? resp(url) : { ok: resp.status < 400, status: resp.status, text: async () => resp.body };
    throw new Error('ECONNREFUSED');
  };
}

test('claims map to registries; self-claims have none', () => {
  assert.equal(C.classifyClaim('NSF Certified for Sport'), 'nsf_sport');
  assert.equal(C.classifyClaim('NSF Contents Tested & Certified'), 'nsf_contents');
  assert.equal(C.classifyClaim('NSF'), 'nsf_any');
  assert.equal(C.classifyClaim('USP Verified'), 'usp_verified');
  assert.equal(C.classifyClaim('USP grade ingredients'), null);
  assert.equal(C.classifyClaim('Informed-Choice'), 'informed_choice');
  assert.equal(C.classifyClaim('Informed Sport'), 'informed_sport');
  assert.equal(C.classifyClaim('Non-GMO Project Verified'), 'non_gmo_project');
  assert.equal(C.classifyClaim('Non-GMO'), null);
  assert.equal(C.classifyClaim('USDA Organic'), 'usda_organic');
  for (const c of ['Vegan', 'Gluten-Free', 'GMP', 'Third-Party Tested', 'Kosher', 'Made in USA', 'Plant-Based', '100% Plant-Based']) assert.equal(C.classifyClaim(c), null, c);
  // facility wording is about the factory, never a product certification
  for (const c of ['Manufactured in an NSF Certified Facility', 'NSF Registered GMP Facility', 'Made in a USP-inspected facility', 'Produced in an FDA registered plant']) assert.equal(C.classifyClaim(c), 'facility_claim', c);
});

test('NSF Sport parser reads the live catalogue markup', () => {
  const p = C.ADAPTERS.nsf_sport.parse(SPORT);
  assert.equal(p.recognised, true);
  const liv = p.listings.find((l) => l.company === 'Liquid IV');
  assert.equal(liv.product, 'Liquid IV Hydration Multiplier Sugar Free Raspberry Lemonade');
  assert.equal(liv.url, 'https://www.nsfsport.com/certified-products/listing-detail.php?id=1760191');
});

test('NSF 173 parser reads company + trade designation rows and the empty page', () => {
  const hit = C.ADAPTERS.nsf_contents.parse(CONTENTS_HIT);
  assert.ok(hit.listings.some((l) => l.company === '21st Century HealthCare, Inc.' && l.product === '21st Century D3 50 mcg (2000 IU)'));
  const empty = C.ADAPTERS.nsf_contents.parse(CONTENTS_EMPTY);
  assert.deepEqual(empty, { recognised: true, listings: [] });
});

test('verified only on a registry hit for this brand AND product line', async () => {
  const fetchImpl = fakeFetch([[/nsfsport/, { status: 200, body: SPORT }]]);
  const [hit] = await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand: 'Liquid I.V.', title: 'Liquid I.V. Hydration Multiplier Sugar Free Electrolyte Powder Packets, Raspberry Lemonade' }, { enabled: true, fetchImpl });
  assert.equal(hit.status, 'verified');
  assert.equal(hit.evidence_url, 'https://www.nsfsport.com/certified-products/listing-detail.php?id=1760191');
  assert.equal(hit.match.quality, 'product');
  const [otherProduct] = await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand: 'Liquid I.V.', title: 'Liquid I.V. Sleep Multiplier Melatonin Powder' }, { enabled: true, fetchImpl });
  assert.equal(otherProduct.status, 'not_found', 'the brand is listed, but not this product');
  const [otherFlavour] = await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand: 'Liquid I.V.', title: 'Liquid I.V. Sugar-Free Hydration Multiplier, White Peach' }, { enabled: true, fetchImpl });
  assert.equal(otherFlavour.status, 'not_found', 'every distinctive word of the listing must be in the title — NSF lists per flavour');
  const [otherBrand] = await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand: 'Nature\'s Truth', title: 'Ashwagandha Gummies' }, { enabled: true, fetchImpl });
  assert.equal(otherBrand.status, 'not_found');
});

test('"NSF" alone tries Contents Tested then Certified for Sport', async () => {
  const calls = [];
  const fetchImpl = fakeFetch([[/info\.nsf\.org/, { status: 200, body: CONTENTS_HIT }], [/nsfsport/, { status: 200, body: SPORT }]], calls);
  const [r] = await C.verifyCertifications({ claims: ['NSF'], brand: '21st Century', title: '21st Century D3 50 mcg (2000 IU) Softgels' }, { enabled: true, fetchImpl });
  assert.equal(r.status, 'verified');
  assert.equal(r.claim_key, 'nsf_any');
  assert.equal(r.registry, 'NSF Contents Tested & Certified (NSF/ANSI 173)');
  assert.equal(calls.length, 1, 'stops at the first hit');
});

test('HTTP errors, bot walls and unrecognised pages are registry_unavailable, never not_found', async () => {
  const fetchImpl = fakeFetch([
    [/wetestyoutrust/, { status: 403, body: 'Access denied' }],
    [/quality-supplements/, { status: 200, body: '<html><body>Please enable JavaScript</body></html>' }],
  ]);
  const res = await C.verifyCertifications({ claims: ['Informed Sport', 'USP Verified', 'Non-GMO Project Verified'], brand: 'Acme', title: 'Acme Whey' }, { enabled: true, fetchImpl });
  assert.deepEqual(res.map((r) => r.status), ['registry_unavailable', 'registry_unavailable', 'registry_unavailable']);
  assert.match(res[0].reason, /HTTP 403/);
  assert.match(res[1].reason, /not recognised/);
  assert.match(res[2].reason, /request failed/);
});

test('generic registry: explicit "no results" is not_found', async () => {
  const fetchImpl = fakeFetch([[/choice\.wetestyoutrust/, { status: 200, body: '<div class="results">No products found for your search.</div>' }]]);
  const [r] = await C.verifyCertifications({ claims: ['Informed Choice'], brand: 'Acme', title: 'Acme Whey' }, { enabled: true, fetchImpl });
  assert.equal(r.status, 'not_found');
});

test('USDA Organic has no queryable endpoint → registry_unavailable with the manual-check URL', async () => {
  const [r] = await C.verifyCertifications({ claims: ['USDA Organic'], brand: 'Acme', title: 'x' }, { enabled: true, fetchImpl: fakeFetch([]) });
  assert.equal(r.status, 'registry_unavailable');
  assert.equal(r.scope, 'operation');
  assert.equal(r.evidence_url, 'https://organic.ams.usda.gov/integrity/');
});

test('lookups off (default): no request, registry claims not_checked, others no_registry', async () => {
  const calls = [];
  const res = await C.verifyCertifications({ claims: ['NSF Certified for Sport', 'Vegan', 'vegan', 'Gluten-Free'], brand: 'Acme', title: 'x' }, { enabled: false, fetchImpl: fakeFetch([], calls) });
  assert.equal(calls.length, 0);
  assert.deepEqual(res.map((r) => [r.claim, r.status]), [['NSF Certified for Sport', 'not_checked'], ['Vegan', 'no_registry'], ['Gluten-Free', 'no_registry']]);
});

test('one fetch per registry page per run (shared cache)', async () => {
  const calls = [];
  const fetchImpl = fakeFetch([[/nsfsport/, { status: 200, body: SPORT }]], calls);
  const cache = new Map();
  for (const brand of ['Liquid I.V.', 'Acme', 'Other']) await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand, title: 'Hydration Multiplier' }, { enabled: true, fetchImpl, cache });
  assert.equal(calls.length, 1);
});

test('no brand → registry_unavailable, not a guess', async () => {
  const [r] = await C.verifyCertifications({ claims: ['NSF Certified for Sport'], brand: null, title: 'x' }, { enabled: true, fetchImpl: fakeFetch([]) });
  assert.equal(r.status, 'registry_unavailable');
});

const THORNE = fx('nsf-contents-thorne.html');
const THORNE_NO_CITRAMATE = fx('nsf-contents-thorne-no-citramate.html');

test('live case: "Thorne Magnesium CitraMate" never verifies against "Thorne Magnesium Bisglycinate"', () => {
  const listings = C.ADAPTERS.nsf_contents.parse(THORNE).listings;
  assert.ok(listings.every((l) => l.form), 'NSF 173 rows carry their Product Form');
  const title = 'Thorne Magnesium CitraMate - Magnesium Citrate and Malate - 90 Capsules';
  assert.equal(C.matchListing(listings, { brand: 'Thorne', title }).listing.product, 'Thorne® Magnesium CitraMate™', 'plainest name wins over the (Canada) listing');
  const without = C.ADAPTERS.nsf_contents.parse(THORNE_NO_CITRAMATE).listings;
  assert.equal(C.matchListing(without, { brand: 'Thorne', title }), null);
  // a repeated word counts once: "Magnesium … Magnesium" is still one shared word with Bisglycinate
  assert.equal(C.matchListing(without, { brand: 'Thorne', title: 'Thorne Magnesium Magnesium Magnesium Capsules' }), null);
});

test('live case: one-word listing "Thorne® Ashwagandha" (Capsule) does not verify "Thorne Ashwagandha Gummies"', () => {
  const listings = C.ADAPTERS.nsf_contents.parse(THORNE).listings;
  assert.equal(C.matchListing(listings, { brand: 'Thorne', title: 'Thorne Ashwagandha Gummies' }), null, 'gummy ≠ capsule');
  assert.equal(C.matchListing(listings, { brand: 'Thorne', title: 'Thorne Ashwagandha - 60 Capsules' }).listing.product, 'Thorne® Ashwagandha');
  assert.equal(C.matchListing(listings, { brand: 'Thorne', title: 'Thorne Ashwagandha' }).listing.product, 'Thorne® Ashwagandha', 'no form on one side → not compared');
});

test('live case: brand "Olly" does not match "Jolly Rancher" listings (word boundaries)', () => {
  const listings = C.ADAPTERS.nsf_sport.parse(SPORT).listings;
  assert.ok(listings.some((l) => /Jolly Rancher/.test(l.product)));
  assert.equal(C.matchListing(listings, { brand: 'Olly', title: 'OLLY Watermelon Jolly Rancher Blue Raspberry Energy' }), null);
  assert.equal(C.matchListing(listings, { brand: 'Olly', title: 'x' }, 'operation'), null);
  assert.ok(C.matchListing(listings, { brand: 'Thorne', title: 'x' }, 'operation'), 'a real brand still matches at operation level');
});

test('dosage forms: sticks and packets are powder; the brand word is not a form', () => {
  assert.equal(C.formOf('Hydration Multiplier Packets'), 'powder');
  assert.equal(C.formOf('Magnesium Bisglycinate Stick'), 'powder');
  assert.equal(C.formOf('Ashwagandha Gummies 60 count'), 'gummy');
  assert.equal(C.formOf('Veggie Caps'), 'capsule');
});

test('Non-GMO Project JavaScript shell (200, nav <li>s, no results in HTML) → registry_unavailable, never not_found', async () => {
  const shell = fx('non-gmo-project-js-shell.html');
  assert.deepEqual(C.ADAPTERS.non_gmo_project.parse(shell).recognised, false);
  const fetchImpl = fakeFetch([[/nongmoproject/, { status: 200, body: shell }]]);
  const [r] = await C.verifyCertifications({ claims: ['Non-GMO Project Verified'], brand: 'Ultima Replenisher', title: 'Ultima Replenisher Tropical Variety' }, { enabled: true, fetchImpl });
  assert.equal(r.status, 'registry_unavailable');
});

test('facility claims are never looked up', async () => {
  const calls = [];
  const [r] = await C.verifyCertifications({ claims: ['Manufactured in an NSF Certified Facility'], brand: 'Acme', title: 'x' }, { enabled: true, fetchImpl: fakeFetch([], calls) });
  assert.equal(calls.length, 0);
  assert.equal(r.claim_key, 'facility_claim');
  assert.equal(r.status, 'no_registry');
});

test('at most 2 requests in flight per registry', async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = async () => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { ok: true, status: 200, text: async () => CONTENTS_EMPTY };
  };
  const cache = new Map();
  const limiters = new Map();
  await Promise.all(['A1', 'B2', 'C3', 'D4', 'E5'].map((brand) => C.verifyCertifications({ claims: ['NSF Contents Tested'], brand, title: 'x' }, { enabled: true, fetchImpl, cache, limiters })));
  assert.equal(peak, 2);
});

test('past the CERT_VERIFY_MAX_MS deadline, no new request: not_checked with the reason', async () => {
  const calls = [];
  const [r] = await C.verifyCertifications({ claims: ['NSF Contents Tested'], brand: 'Acme', title: 'x' }, { enabled: true, fetchImpl: fakeFetch([], calls), deadline: Date.now() - 1 });
  assert.equal(calls.length, 0);
  assert.equal(r.status, 'not_checked');
  assert.match(r.reason, /CERT_VERIFY_MAX_MS/);
});
