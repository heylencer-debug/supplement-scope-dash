'use strict';

// Review-round fixes (H1–H6, M2–M5) on P5b web research.
const test = require('node:test');
const assert = require('node:assert/strict');

const SC = require('../utils/source-classify');
const WR = require('../utils/web-research');
const CR = require('../utils/cert-registry-web');

// ─── H3 brand domains: exact only ───────────────────────────────────────────

test('H3: brand-owned only on the P5-confirmed domain or an exact brand-slug domain — never a prefix', () => {
  const brands = [{ brand: 'Nature Made' }, { brand: 'Health Plus' }, { brand: 'Garden of Life' }, { brand: 'Calmwell', domain: 'shop.calmwell-store.com' }];
  assert.equal(SC.brandHostMatch('nature.com', brands), null);
  assert.equal(SC.brandHostMatch('health.com', brands), null);
  assert.equal(SC.brandHostMatch('garden.com', brands), null);
  assert.equal(SC.brandHostMatch('naturemadefan.com', brands), null);
  assert.equal(SC.brandHostMatch('www.naturemade.com', brands).brand, 'Nature Made');
  assert.equal(SC.brandHostMatch('gardenoflife.com', brands).brand, 'Garden of Life');
  assert.equal(SC.brandHostMatch('calmwell-store.com', brands).brand, 'Calmwell');
  const t = SC.classifyPageType({ url: 'https://www.nature.com/articles/x', title: 'Magnesium and sleep', headings: [], text: '' }, { brands });
  assert.notEqual(t.page_type, 'brand_page');
  const o = SC.classifyOwnership({ url: 'https://www.health.com/best-magnesium', page_type: 'review_article', text: 'x '.repeat(200), full_text: 'x '.repeat(200), links: [] }, { brands });
  assert.equal(o.ownership, 'independent');
});

// ─── H4 copied marketing: distinctive passages only ─────────────────────────

test('H4: short or shared phrases are not "copied Amazon marketing"; a distinctive passage in ≤ 2 listings is', () => {
  const shared = 'Third party tested and gluten free gummies made in a GMP facility.';
  const listings = [
    { asin: 'B01', brand: 'A', text: `${shared} Our unique citrus-bloom chelate blend dissolves in forty seconds flat for bedtime calm.` },
    { asin: 'B02', brand: 'B', text: shared },
    { asin: 'B03', brand: 'C', text: shared },
  ];
  assert.equal(SC.copiedMarketingMatch('gluten free', listings), null);
  assert.equal(SC.copiedMarketingMatch('third party tested', listings), null);
  assert.equal(SC.copiedMarketingMatch('Third party tested and gluten free gummies made in a GMP facility', listings), null, 'in 3 listings → not distinctive');
  const hit = SC.copiedMarketingMatch('unique citrus-bloom chelate blend dissolves in forty seconds flat', listings);
  assert.equal(hit.asin, 'B01');
  assert.equal(hit.listings, 1);
});

// ─── H5 PubMed: never on the ingredient alone; negations skipped ────────────

test('H5: no outcome term → no PubMed search, target not_checked; negated claims are not targets', async () => {
  assert.equal(CR.pubmedSearch('magnesium glycinate', 'clinically proven'), null);
  assert.equal(CR.pubmedSearch('magnesium glycinate', 'magnesium glycinate is clinically proven'), null);
  assert.ok(CR.pubmedSearch('magnesium glycinate', 'clinically proven to improve sleep').outcomes.includes('sleep'));
  assert.deepEqual(CR.detectVerifiableClaim('no studies show it works'), []);
  assert.deepEqual(CR.detectVerifiableClaim('this is not clinically proven'), []);
  assert.deepEqual(CR.detectVerifiableClaim("it isn't third-party tested"), []);
  assert.equal(CR.detectVerifiableClaim('clinically proven to help sleep')[0].claim_type, 'clinically_proven');

  const t = WR.buildVerificationTargets({ ingredient_claims: [{ label: 'magnesium glycinate is clinically proven', ingredient: 'magnesium glycinate', products: [], quotes: [], independent_sources: 1 }] });
  assert.equal(t[0].pubmed, null);
  assert.match(t[0].note, /No outcome to search/);
  let called = 0;
  const out = await CR.runVerification(t, { fetchText: async () => { called++; return { ok: true, text: '{"esearchresult":{"count":"99","idlist":["1"]}}' }; } });
  assert.equal(out[0].status, 'not_checked');
  assert.equal(called, 0, 'nothing fetched, so nothing can be "supported"');
  // malformed PubMed body is not a "not_found"
  const t2 = [{ kind: 'literature', ingredient: 'magnesium', pubmed: CR.pubmedSearch('magnesium', 'improves sleep'), status: 'not_checked' }];
  const out2 = await CR.runVerification(t2, { fetchText: async () => ({ ok: true, text: '<html>error</html>' }) });
  assert.equal(out2[0].status, 'not_checked');
});

// ─── H6 NSF: unavailable ≠ not found; generic claims never not_found ────────

test('H6: NSF page without the listing counter → registry_unavailable; generic third-party claim missing from NSF → not_checked', async () => {
  assert.deepEqual(CR.parseNsfListing('<html>Service temporarily unavailable</html>', 'Calmwell'), { available: false, products: 0, hit: false });
  assert.ok(CR.STATUSES.includes('registry_unavailable'));
  const nsf = { kind: 'registry', registry: 'NSF', brand: 'Calmwell', lookups: CR.registryLookup('NSF', 'Calmwell'), status: 'not_checked' };
  const redesign = await CR.runVerification([nsf], { fetchText: async () => ({ ok: true, text: '<html>New NSF search experience</html>' }) });
  assert.equal(redesign[0].status, 'registry_unavailable');
  const down = await CR.runVerification([nsf], { fetchText: async () => ({ ok: false, status: 500, text: '' }) });
  assert.equal(down[0].status, 'registry_unavailable');
  const miss = 'Number of matching Manufacturers is 0 Number of matching Products is 0';
  const named = await CR.runVerification([nsf], { fetchText: async () => ({ ok: true, text: miss }) });
  assert.equal(named[0].status, 'not_found', 'a claim that NAMES NSF can be not_found');
  const generic = { kind: 'registry', registry: null, brand: 'Calmwell', lookups: CR.registryLookup(null, 'Calmwell'), status: 'not_checked' };
  const g = await CR.runVerification([generic], { fetchText: async () => ({ ok: true, text: miss }) });
  assert.equal(g[0].status, 'not_checked');
  assert.match(g[0].note, /other testing labs/);
});

// ─── H1 / M3 resume rules ───────────────────────────────────────────────────

test('H1/M3: items are reused by their own age; twice-failed items wait out the retry window', () => {
  const now = Date.parse('2026-09-27T00:00:00Z');
  const w = { freshDays: 30, retryAfterDays: 7, now };
  assert.equal(WR.reusableSearch({ ok: true, searched_at: '2026-09-20T00:00:00Z' }, w), true);
  assert.equal(WR.reusableSearch({ ok: true, searched_at: '2026-08-01T00:00:00Z' }, w), false, 'stale');
  assert.equal(WR.reusableSearch({ ok: true }, w), false, 'no timestamp = stale');
  assert.equal(WR.deferredSearch({ ok: false, failed_attempts: 2, last_attempt_at: '2026-09-25T00:00:00Z' }, w), true);
  assert.equal(WR.deferredSearch({ ok: false, failed_attempts: 1, last_attempt_at: '2026-09-25T00:00:00Z' }, w), false);
  assert.equal(WR.deferredSearch({ ok: false, failed_attempts: 2, last_attempt_at: '2026-09-10T00:00:00Z' }, w), false, 'window passed');
  assert.equal(WR.reusableExtraction({ extraction_status: 'ok', extraction: {}, prompt_version: WR.PROMPT_VERSION, extracted_at: '2026-09-26T00:00:00Z' }, w), true);
  assert.equal(WR.reusableExtraction({ extraction_status: 'ok', extraction: {}, prompt_version: 'old', extracted_at: '2026-09-26T00:00:00Z' }, w), false);
  assert.equal(WR.deferredExtraction({ extraction_status: 'failed', extraction_failed_attempts: 2, last_extraction_attempt_at: '2026-09-26T00:00:00Z' }, w), true);
  assert.equal(WR.nextFailedAttempts(1, '2026-09-26T00:00:00Z', w), 2);
  assert.equal(WR.nextFailedAttempts(5, '2026-08-01T00:00:00Z', w), 1, 'counter restarts after the window');
});

// ─── H2 status ──────────────────────────────────────────────────────────────

test('H2: complete requires pages read AND kept items; otherwise partial with reasons', () => {
  const ok = [{ ok: true }];
  assert.equal(WR.decideStatus({ searchRuns: ok, fetched: 3, keptTotal: 4 }).status, 'complete');
  const a = WR.decideStatus({ searchRuns: ok, fetched: 0, keptTotal: 0 });
  assert.equal(a.status, 'partial');
  assert.ok(a.reasons.includes('no_pages_fetched'));
  const b = WR.decideStatus({ searchRuns: ok, fetched: 5, keptTotal: 0 });
  assert.deepEqual(b.reasons, ['no_items_kept']);
  assert.equal(WR.decideStatus({ searchRuns: ok, fetched: 5, keptTotal: 2, deferredPages: 1 }).status, 'partial');
  assert.equal(WR.decideStatus({ noModel: true, searchRuns: ok, fetched: 5, keptTotal: 0 }).status, 'no_model');
});

// ─── M4 fetch verdicts ──────────────────────────────────────────────────────

test('M4: the browser is allowed only for network errors and JS shells — never for 403 / bot walls', () => {
  const big = `<html><body><article>${'<p>real words here about magnesium gummies and sleep. </p>'.repeat(40)}</article></body></html>`;
  assert.deepEqual(WR.classifyFetch({ ok: true, status: 200, contentType: 'text/html', text: big }), { kind: 'ok', browserOk: false });
  assert.equal(WR.classifyFetch({ ok: false, status: 403, text: '' }).kind, 'blocked');
  assert.equal(WR.classifyFetch({ ok: false, status: 429, text: '' }).browserOk, false);
  assert.equal(WR.classifyFetch({ ok: false, status: 503, text: 'Just a moment... cf-browser-verification' }).kind, 'blocked');
  assert.equal(WR.classifyFetch({ ok: true, status: 200, contentType: 'text/html', text: '<html><body>Please verify you are a human (captcha)</body></html>' }).kind, 'blocked');
  assert.equal(WR.classifyFetch({ ok: false, status: 0, error: 'ECONNRESET' }).browserOk, true);
  const shell = WR.classifyFetch({ ok: true, status: 200, contentType: 'text/html', text: '<html><body><noscript>You need to enable JavaScript</noscript><div id="root"></div></body></html>' });
  assert.equal(shell.kind, 'js_shell');
  assert.equal(shell.browserOk, true);
  assert.equal(WR.classifyFetch({ ok: true, status: 200, contentType: 'application/pdf', text: '%PDF' }).kind, 'not_html');
  assert.equal(WR.classifyFetch({ ok: false, status: 500, text: 'oops' }).browserOk, false);
});
