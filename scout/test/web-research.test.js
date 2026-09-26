'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SC = require('../utils/source-classify');
const WR = require('../utils/web-research');
const CR = require('../utils/cert-registry-web');
const F = require('./fixtures/web-pages');

const BRANDS = [
  { brand: 'Calmwell', asin: 'B0ABCDEF12', domain: 'calmwell.com' },
  { brand: 'RestEasy', asin: 'B0RESTEASY' },
  { brand: 'Nightly Minerals', asin: 'B0NIGHTLY1' },
  { brand: 'calmwell', asin: 'B0DUPLICAT' },
  { brand: 'Unknown', asin: 'B0UNKNOWN1' },
  { brand: 'Dreamo', asin: 'B0DREAMO01' },
];

function page(url, html) {
  const p = SC.extractPage(html, url);
  const pt = SC.classifyPageType({ url, title: p.title, headings: p.headings, text: p.text }, { brands: BRANDS });
  const own = SC.classifyOwnership({ url, page_type: pt.page_type, text: p.text, full_text: p.full_text, links: p.links }, { brands: BRANDS });
  return { url, ...p, ...pt, ...own };
}

// ─── Query plan ────────────────────────────────────────────────────────────

test('query plan: ≤ 12, spans every intent, strips the session suffix, dedupes brands', () => {
  const plan = WR.buildQueryPlan({ keyword: 'magnesium gummies #3', brands: BRANDS, year: 2026 });
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.map((q) => q.id), plan.map((_, i) => `Q${i + 1}`));
  const intents = new Set(plan.map((q) => q.intent));
  for (const i of ['best_of', 'review', 'comparison', 'buying_guide', 'forum', 'third_party_tested', 'brand_vs_brand', 'brand_site']) assert.ok(intents.has(i), i);
  assert.equal(plan[0].query, 'best magnesium gummies 2026');
  assert.ok(plan.every((q) => !q.query.includes('#3')));
  assert.ok(plan.some((q) => q.query === 'magnesium gummies reddit'));
  assert.ok(plan.some((q) => q.query === 'Calmwell vs RestEasy magnesium gummies'));
  const site = plan.find((q) => q.intent === 'brand_site' && q.brands[0] === 'Calmwell');
  assert.deepEqual(site.domain_filter, ['calmwell.com']);
  assert.equal(site.display, 'Calmwell magnesium gummies site:calmwell.com');
  const noDomain = plan.find((q) => q.intent === 'brand_site' && q.brands[0] === 'RestEasy');
  assert.equal(noDomain.query, 'RestEasy magnesium gummies official site');
  assert.ok(!plan.some((q) => /\bUnknown\b/.test(q.query)), 'placeholder brand names are not searched');
  assert.equal(plan.filter((q) => (q.brands || []).includes('calmwell')).length, 0, 'case-duplicate brand collapsed');
});

test('query plan: a small cap still spans intents; no brands → core intents only', () => {
  const small = WR.buildQueryPlan({ keyword: 'electrolyte powder', brands: BRANDS, year: 2026, max: 5 });
  assert.deepEqual(small.map((q) => q.intent), ['best_of', 'review', 'comparison', 'brand_vs_brand', 'brand_site']);
  const none = WR.buildQueryPlan({ keyword: 'electrolyte powder', brands: [], year: 2026 });
  assert.equal(none.length, 6);
  assert.deepEqual(WR.buildQueryPlan({ keyword: '', brands: BRANDS }), []);
});

// ─── Search results + page selection ───────────────────────────────────────

test('normalizeSearchResults handles Search API and Sonar shapes and dedupes', () => {
  const a = WR.normalizeSearchResults({ results: [{ title: 'A', url: 'https://www.x.com/a?utm_source=z', snippet: 's' }, { url: 'https://x.com/a' }, { url: 'nope' }] });
  assert.equal(a.length, 1);
  assert.equal(a[0].title, 'A');
  const b = WR.normalizeSearchResults({ search_results: [{ title: 'B', url: 'https://y.com/b', date: '2026-01-01' }] });
  assert.equal(b[0].date, '2026-01-01');
  const c = WR.normalizeSearchResults({ citations: ['https://z.com/c'] });
  assert.equal(c[0].url, 'https://z.com/c');
});

test('selectPagesToFetch: round-robin across queries, URL-deduped, skips Amazon/social/PDF, enforces the page cap', () => {
  const runs = [
    { query_id: 'Q1', intent: 'best_of', results: [{ url: 'https://a.com/1' }, { url: 'https://amazon.com/dp/B0X' }, { url: 'https://a.com/3' }] },
    { query_id: 'Q2', intent: 'review', results: [{ url: 'https://www.a.com/1/' }, { url: 'https://b.com/x.pdf' }, { url: 'https://youtube.com/watch?v=1' }] },
    { query_id: 'Q3', intent: 'forum', results: [{ url: 'https://reddit.com/r/s/1' }, { url: 'https://c.com/2' }] },
  ];
  const { sources, toFetch } = WR.selectPagesToFetch(runs, { maxPages: 3 });
  assert.equal(sources.length, 7);
  assert.deepEqual(sources[0].found_by, ['Q1', 'Q2']);
  assert.deepEqual(toFetch.map((s) => s.url), ['https://a.com/1', 'https://reddit.com/r/s/1', 'https://c.com/2']);
  const byUrl = Object.fromEntries(sources.map((s) => [s.url, s]));
  assert.match(byUrl['https://amazon.com/dp/B0X'].skip_reason, /amazon/);
  assert.equal(byUrl['https://b.com/x.pdf'].skip_reason, 'pdf');
  assert.match(byUrl['https://youtube.com/watch?v=1'].skip_reason, /social/);
  assert.equal(byUrl['https://a.com/3'].fetch_status, 'not_fetched');
  assert.match(byUrl['https://a.com/3'].skip_reason, /P5B_MAX_PAGES/);
  assert.equal(WR.fetchUrlFor('https://www.reddit.com/r/s/comments/1'), 'https://old.reddit.com/r/s/comments/1');
});

test('robots.txt: specific agent group wins, longest rule wins, wildcards', () => {
  const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.json$\n\nUser-agent: OtherBot\nDisallow: /';
  const rules = WR.parseRobots(txt);
  assert.equal(WR.robotsAllows(rules, '/blog/post'), true);
  assert.equal(WR.robotsAllows(rules, '/private/x'), false);
  assert.equal(WR.robotsAllows(rules, '/private/ok/page'), true);
  assert.equal(WR.robotsAllows(rules, '/data.json'), false);
  assert.equal(WR.robotsAllows(WR.parseRobots('User-agent: DoviveScout\nDisallow: /\nUser-agent: *\nDisallow:'), '/a'), false);
  assert.equal(WR.robotsAllows([], '/anything'), true);
});

// ─── Classification ────────────────────────────────────────────────────────

test('extractPage: article text without chrome/scripts, full text keeps the disclosure, links resolved', () => {
  const p = SC.extractPage(F.affiliateReview, 'https://gummyreviews.com/best-magnesium-gummies');
  assert.equal(p.title, 'The 12 Best Magnesium Gummies of 2026, Tested');
  assert.ok(p.text.includes('Our favourite overall is the Calmwell'));
  assert.ok(!p.text.includes('ignore me'));
  assert.ok(!p.text.includes('Home'), 'nav removed from main text');
  assert.ok(p.full_text.includes('we may earn a commission'));
  assert.ok(p.links.some((l) => l.href === 'https://amzn.to/3abcXYZ'));
  assert.equal(p.published, '2026-03-01T10:00:00Z');
  assert.ok(p.word_count > 150);
});

test('affiliate review: review_article + affiliate, with the markers kept as evidence', () => {
  const p = page('https://gummyreviews.com/best-magnesium-gummies', F.affiliateReview);
  assert.equal(p.page_type, 'review_article');
  assert.equal(p.ownership, 'affiliate');
  const kinds = p.markers.map((m) => m.marker);
  assert.ok(kinds.some((m) => /commission/.test(m)), 'disclosure text marker');
  assert.ok(kinds.includes('amzn short link'));
  assert.ok(kinds.includes('Amazon Associates tag='));
  assert.ok(p.markers.find((m) => /commission/.test(m.marker)).snippet.includes('earn a commission'));
});

test('brand page: brand_page + brand_owned by domain (and first-party language)', () => {
  const p = page('https://www.calmwell.com/products/magnesium-gummies', F.brandPage);
  assert.equal(p.page_type, 'brand_page');
  assert.equal(p.ownership, 'brand_owned');
  assert.equal(p.brand, 'Calmwell');
  // unknown domain, first-party language only
  const q = page('https://shop-sleepgood.net/products/gummies', F.brandPage);
  assert.equal(q.ownership, 'brand_owned');
  assert.ok(q.markers.some((m) => /first-party language/.test(m.marker)));
});

test('sponsored post, negated affiliate disclosure, forum and retailer', () => {
  const sp = page('https://sleepblog.example/blog/resteasy', F.sponsoredPost);
  assert.equal(sp.ownership, 'sponsored');
  assert.ok(sp.markers.some((m) => m.kind === 'sponsored' && /sponsored/i.test(m.snippet)));

  const ind = page('https://mineralguide.org/magnesium-gummies', F.independentGuide);
  assert.equal(ind.page_type, 'category_guide');
  assert.equal(ind.ownership, 'independent', '"we do not use affiliate links" is not an affiliate marker');

  const r = page('https://www.reddit.com/r/Supplements/comments/abc/calmwell', F.redditThread);
  assert.equal(r.page_type, 'forum');
  assert.equal(r.ownership, 'independent');

  const w = SC.classifyPageType({ url: 'https://www.walmart.com/ip/123', title: 'Calmwell gummies', text: '' }, { brands: BRANDS });
  assert.equal(w.page_type, 'retailer');
  const own = SC.classifyOwnership({ url: 'https://www.walmart.com/ip/123', page_type: 'retailer', text: 'x'.repeat(300), links: [] }, { brands: BRANDS });
  assert.equal(own.ownership, 'unknown', 'retailer listings are never independent');
});

test('page types from title/heading cues', () => {
  const t = (title, url = 'https://site.com/a') => SC.classifyPageType({ url, title, headings: [], text: '' }, { brands: [] }).page_type;
  assert.equal(t('Calmwell vs RestEasy: which gummy wins?'), 'comparison');
  assert.equal(t('How to choose a magnesium supplement'), 'category_guide');
  assert.equal(t('Top 10 magnesium gummies'), 'review_article');
  assert.equal(t('Magnesium and sleep', 'https://examine.com/supplements/magnesium'), 'specialist_blog');
  assert.equal(t('Brand X launches gummies', 'https://www.prnewswire.com/news-releases/x.html'), 'news');
  assert.equal(t('Hello'), 'other');
});

// ─── Syndication ───────────────────────────────────────────────────────────

test('shingles + Jaccard', () => {
  const a = SC.shingles('the quick brown fox jumps over the lazy dog');
  assert.equal(a.size, 5);
  assert.equal(SC.jaccard(a, a), 1);
  assert.equal(SC.jaccard(a, SC.shingles('completely different words here with nothing shared at all')), 0);
  assert.equal(SC.jaccard(new Set(), a), 0);
});

test('markSyndication: the later copy points at the original; a page copying an Amazon listing is caught', () => {
  const orig = SC.extractPage(F.affiliateReview, 'https://gummyreviews.com/best');
  const copy = SC.extractPage(F.syndicatedCopy, 'https://healthnewsdaily.example/best');
  const guide = SC.extractPage(F.independentGuide, 'https://mineralguide.org/guide');
  const listingCopy = { url: 'https://reseller.example/p', text: `${F.amazonListingText} ${F.amazonListingText}`, published: null };
  // copy listed FIRST (search order) but published later → the original is still the older page
  const pages = [
    { url: 'https://healthnewsdaily.example/best', text: copy.text, published: copy.published },
    { url: 'https://gummyreviews.com/best', text: orig.text, published: orig.published },
    { url: 'https://mineralguide.org/guide', text: guide.text },
    listingCopy,
  ];
  const d = SC.markSyndication(pages, [{ asin: 'B0ABCDEF12', brand: 'Calmwell', text: F.amazonListingText }]);
  assert.equal(d.get('https://healthnewsdaily.example/best').duplicate_of, 'https://gummyreviews.com/best');
  assert.ok(d.get('https://healthnewsdaily.example/best').similarity >= 0.6);
  assert.ok(!d.has('https://gummyreviews.com/best'));
  assert.ok(!d.has('https://mineralguide.org/guide'));
  assert.equal(d.get('https://reseller.example/p').duplicate_of, 'amazon:B0ABCDEF12');
  assert.equal(d.get('https://reseller.example/p').kind, 'amazon_listing_copy');
});

test('markSyndication honours rel=canonical among fetched pages', () => {
  const d = SC.markSyndication([
    { url: 'https://a.com/x', text: 'one two three four five six' },
    { url: 'https://b.com/y', text: 'totally different content body text here', canonical: 'https://www.a.com/x/' },
  ]);
  assert.equal(d.get('https://b.com/y').duplicate_of, 'https://a.com/x');
  assert.equal(d.get('https://b.com/y').kind, 'canonical_link');
});

test('copiedMarketingMatch: long quote by shingle containment, short quote by exact phrase', () => {
  const mk = [{ asin: 'B0ABCDEF12', brand: 'Calmwell', text: F.amazonListingText }];
  assert.equal(SC.copiedMarketingMatch('Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep', mk).asin, 'B0ABCDEF12');
  assert.equal(SC.copiedMarketingMatch('made in the USA', mk), null, 'short phrases are category vocabulary, not copying');
  assert.equal(SC.copiedMarketingMatch('the texture never turned chalky in our six week test', mk), null);
});

// ─── Extraction validation ─────────────────────────────────────────────────

test('validateExtraction drops unquoted / paraphrased items and counts them', () => {
  const p = SC.extractPage(F.affiliateReview, 'https://gummyreviews.com/best');
  const raw = {
    products_mentioned: [
      { brand: 'Calmwell', product: 'Magnesium Glycinate Gummies', asin: null, quote: 'Our favourite overall is the Calmwell Magnesium Glycinate Gummies' },
      { brand: 'Fakebrand', product: 'X', quote: 'Fakebrand is the best gummy ever made' },
    ],
    comparison_criteria: [
      { criterion: 'elemental magnesium per serving', quote: 'We compared elemental magnesium per serving, the form of magnesium used' },
      { criterion: 'price', quote: '' },
    ],
    ingredient_claims: [
      { claim: 'glycinate improves sleep', ingredient: 'magnesium glycinate', quote: 'Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep' },
      { claim: 'glycinate cures insomnia', ingredient: 'magnesium glycinate', quote: 'Magnesium glycinate cures insomnia' },
      { claim: 'stitched', ingredient: 'magnesium', quote: 'Our favourite overall ... added sugar per serving' },
    ],
    strengths: [{ product: 'Calmwell', point: 'texture', quote: 'the texture never turned chalky' }],
    weaknesses: [{ product: 'RestEasy', point: 'added sugar', quote: 'the 4 grams of added sugar per serving' }],
    pricing: [
      { product: 'Calmwell', price_text: '$24.99', quote: 'Calmwell costs $24.99 for 60 gummies' },
      { product: 'Calmwell', price_text: '$19.99', quote: 'Calmwell costs $24.99 for 60 gummies' },
    ],
    evidence_links: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/', supports: 'sleep dose', quote: 'sleep study we cite' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/99999999/', supports: 'made up' },
    ],
  };
  const v = WR.validateExtraction(raw, p, { brands: BRANDS });
  assert.equal(v.extraction.products_mentioned.length, 1);
  assert.equal(v.extraction.products_mentioned[0].asin, 'B0ABCDEF12');
  assert.equal(v.extraction.products_mentioned[0].asin_source, 'brand_match');
  assert.equal(v.extraction.comparison_criteria.length, 1);
  // ellipsis-joined quote whose parts both occur in order is kept; the paraphrase is dropped
  assert.equal(v.extraction.ingredient_claims.length, 2);
  assert.ok(!v.extraction.ingredient_claims.some((c) => /cures/.test(c.claim)));
  assert.equal(v.extraction.pricing.length, 1, 'a price not in its own quote is dropped');
  assert.equal(v.extraction.evidence_links.length, 1, 'a link not on the page is dropped');
  assert.deepEqual(v.dropped, { products_mentioned: 1, comparison_criteria: 1, ingredient_claims: 1, pricing: 1, evidence_links: 1 });
});

test('quoteFound normalises quotes/dashes/whitespace but not wording', () => {
  const text = 'It’s the best — really.\n  Truly   great.';
  assert.equal(WR.quoteFound("It's the best - really. Truly great.", text), true);
  assert.equal(WR.quoteFound("It's the best, really.", text), false);
  assert.equal(WR.quoteFound('best', text), false, 'too short to be evidence');
});

test('parseExtractionResponse ignores page ids that were not in the batch', () => {
  const r = WR.parseExtractionResponse('```json\n{"pages":[{"id":"P1"},{"id":"P9"}]}\n```', ['P1', 'P2']);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.pages), ['P1']);
  assert.equal(r.unknown_ids, 1);
  assert.equal(WR.parseExtractionResponse('no json', ['P1']).ok, false);
});

// ─── Roll-up ───────────────────────────────────────────────────────────────

test('roll-up counts distinct websites per owner type; syndicated pages and copied marketing never count', () => {
  const claim = (quote, claimText = 'magnesium glycinate improves sleep quality') => ({ claim: claimText, ingredient: 'magnesium glycinate', product: null, quote });
  const ex = (claims, extra = {}) => ({ products_mentioned: [], comparison_criteria: [], ingredient_claims: claims, strengths: [], weaknesses: [], pricing: [], evidence_links: [], ...extra });
  const pages = [
    { url: 'https://guide.org/a', domain: 'guide.org', ownership: 'independent', extraction: ex([claim('glycinate is better absorbed and improves sleep quality for most adults')], { comparison_criteria: [{ criterion: 'elemental magnesium per serving', quote: 'q' }] }) },
    { url: 'https://guide.org/b', domain: 'guide.org', ownership: 'independent', extraction: ex([claim('another page on the same site says sleep quality improves')]) },
    { url: 'https://forum.com/t', domain: 'forum.com', ownership: 'independent', extraction: ex([claim('my sleep quality improved on glycinate', 'magnesium glycinate improved my sleep quality')]) },
    { url: 'https://calmwell.com/p', domain: 'calmwell.com', ownership: 'brand_owned', extraction: ex([claim('Clinically studied magnesium glycinate supports restful sleep')]) },
    { url: 'https://aff.com/r', domain: 'aff.com', ownership: 'affiliate', extraction: ex([claim('glycinate improves sleep quality says our tester')], { comparison_criteria: [{ criterion: 'elemental magnesium per serving', quote: 'q2' }] }) },
    { url: 'https://copy.com/r', domain: 'copy.com', ownership: 'independent', duplicate_of: 'https://aff.com/r', extraction: ex([claim('glycinate improves sleep quality says our tester')]) },
    { url: 'https://blog.com/x', domain: 'blog.com', ownership: 'independent', extraction: ex([claim('Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep')]) },
    { url: 'https://other.com/y', domain: 'other.com', ownership: 'independent', extraction: ex([{ claim: 'citrate helps constipation', ingredient: 'magnesium citrate', product: null, quote: 'citrate helps' }]) },
  ];
  const r = WR.buildRollup(pages, { marketing: [{ asin: 'B0ABCDEF12', brand: 'Calmwell', text: F.amazonListingText }] });
  const g = r.ingredient_claims.find((x) => x.ingredient === 'magnesium glycinate');
  assert.equal(g.independent_sources, 2, 'guide.org (twice) + forum.com; copy.com and blog.com excluded');
  assert.equal(g.brand_owned_sources, 1);
  assert.equal(g.affiliate_sources, 1);
  assert.equal(g.duplicate_sources_excluded, 1);
  assert.equal(g.copied_marketing_excluded, 1);
  assert.equal(g.total_sources, 4);
  assert.equal(g.quotes[0].ownership, 'independent', 'independent quotes shown first');
  assert.ok(r.ingredient_claims.some((x) => x.ingredient === 'magnesium citrate'), 'different ingredient never merged');
  assert.equal(r.copied_marketing_quotes, 1);
  const crit = r.comparison_criteria[0];
  assert.equal(crit.independent_sources, 1);
  assert.equal(crit.affiliate_sources, 1);
});

// ─── Verification ──────────────────────────────────────────────────────────

test('verification targets: registry + literature, lookups built, all start not_checked', () => {
  const rollup = {
    ingredient_claims: [
      { label: 'magnesium glycinate is clinically proven to improve sleep quality', ingredient: 'magnesium glycinate', products: [], quotes: [], independent_sources: 1, brand_owned_sources: 0, affiliate_sources: 0, sponsored_sources: 0 },
    ],
    strengths: [
      { label: 'NSF certified', product: 'Calmwell', products: ['Calmwell'], quotes: [{ quote: 'Calmwell says it is NSF certified' }], independent_sources: 0, brand_owned_sources: 1, affiliate_sources: 0, sponsored_sources: 0 },
      { label: 'third-party tested for purity', product: null, products: [], quotes: [], independent_sources: 0, brand_owned_sources: 1, affiliate_sources: 0, sponsored_sources: 0 },
    ],
  };
  const t = WR.buildVerificationTargets(rollup, { brands: BRANDS });
  const lit = t.find((x) => x.kind === 'literature');
  assert.equal(lit.ingredient, 'magnesium glycinate');
  assert.match(lit.pubmed.api_url, /^https:\/\/eutils\.ncbi\.nlm\.nih\.gov\/entrez\/eutils\/esearch\.fcgi\?db=pubmed/);
  assert.deepEqual(lit.pubmed.outcomes, ['sleep', 'quality']);
  const nsf = t.find((x) => x.registry === 'NSF');
  assert.equal(nsf.brand, 'Calmwell');
  assert.equal(nsf.lookups[0].checkable, true);
  assert.match(nsf.lookups[0].url, /info\.nsf\.org\/Certified\/Dietary\/Listings\.asp\?Company=&TradeName=Calmwell/);
  const any = t.find((x) => x.kind === 'registry' && x.registry === null);
  assert.equal(any.lookups.length, 3);
  assert.ok(any.lookups.every((l) => !l.checkable), 'no brand → nothing checkable');
  assert.ok(t.every((x) => x.status === 'not_checked' && x.evidence_url === null));
});

test('runVerification: supported only with a fetched hit; misses and failures are honest', async () => {
  const targets = [
    { kind: 'literature', ingredient: 'magnesium glycinate', pubmed: CR.pubmedSearch('magnesium glycinate', 'improves sleep'), status: 'not_checked' },
    { kind: 'literature', ingredient: 'unicorn dust', pubmed: CR.pubmedSearch('unicorn dust', 'improves sleep'), status: 'not_checked' },
    { kind: 'registry', registry: 'NSF', brand: 'Calmwell', lookups: CR.registryLookup('NSF', 'Calmwell'), status: 'not_checked' },
    { kind: 'registry', registry: 'NSF', brand: 'RestEasy', lookups: CR.registryLookup('NSF', 'RestEasy'), status: 'not_checked' },
    { kind: 'registry', registry: 'USP', brand: 'Calmwell', lookups: CR.registryLookup('USP', 'Calmwell'), status: 'not_checked' },
  ];
  const fetched = [];
  const fetchText = async (url) => {
    fetched.push(url);
    if (url.includes('unicorn')) return { ok: true, text: '{"esearchresult":{"count":"0","idlist":[]}}' };
    if (url.includes('eutils')) return { ok: true, text: '{"esearchresult":{"count":"12","idlist":["111","222"]}}' };
    if (url.includes('TradeName=Calmwell')) return { ok: true, text: '<td>Calmwell Magnesium</td> Number of matching Products is 3' };
    return { ok: true, text: 'Number of matching Manufacturers is 0 Number of matching Products is 0' };
  };
  const out = await CR.runVerification(targets, { fetchText });
  assert.equal(out[0].status, 'supported');
  assert.equal(out[0].evidence_url, 'https://pubmed.ncbi.nlm.nih.gov/111/');
  assert.match(out[0].note, /does not verify the product/);
  assert.equal(out[1].status, 'not_found');
  assert.equal(out[2].status, 'supported');
  assert.equal(out[3].status, 'not_found');
  assert.equal(out[4].status, 'not_checked', 'USP is not machine-checkable → never fetched');
  assert.ok(!fetched.some((u) => /quality-supplements/.test(u)));
  const failed = await CR.runVerification([targets[0]], { fetchText: async () => ({ ok: false, status: 503, text: '' }) });
  assert.equal(failed[0].status, 'not_checked');
  assert.equal(CR.parseNsfListing('Calmwell ... Number of matching Products is 0', 'Calmwell').hit, false);
});

test('detectVerifiableClaim', () => {
  assert.deepEqual(CR.detectVerifiableClaim('NSF Certified for Sport').map((d) => d.registry), ['NSF Certified for Sport']);
  assert.deepEqual(CR.detectVerifiableClaim('USP Verified and Informed Choice').map((d) => d.registry), ['USP', 'Informed Choice']);
  assert.equal(CR.detectVerifiableClaim('studies show it works')[0].claim_type, 'studied');
  assert.equal(CR.detectVerifiableClaim('tastes great').length, 0);
});

// ─── Ledger / consumer text / freshness / cost ─────────────────────────────

test('webEvidenceText uses "n independent / n brand-owned" wording and is empty without a row', () => {
  assert.equal(WR.webEvidenceText(null), '');
  assert.equal(WR.webEvidenceText({ rollup: { ingredient_claims: [] } }), '');
  const row = {
    ledger: { queries_run: 12, sources_found: 40, fetched: 18, extracted: 15, duplicates_removed: 2, copied_marketing_quotes: 1, by_ownership: { independent: 6, brand_owned: 4, affiliate: 3 } },
    rollup: {
      ingredient_claims: [{ label: 'glycinate improves sleep', ingredient: 'magnesium glycinate', independent_sources: 3, brand_owned_sources: 1, affiliate_sources: 2, sponsored_sources: 0, unknown_sources: 0, duplicate_sources_excluded: 1, copied_marketing_excluded: 0, quotes: [{ quote: 'it helped', domain: 'guide.org', ownership: 'independent' }] }],
      comparison_criteria: [{ label: 'dose per serving', independent_sources: 2, brand_owned_sources: 0, affiliate_sources: 0, sponsored_sources: 0, unknown_sources: 0 }],
    },
    verification: [{ claim: 'glycinate improves sleep', status: 'supported', evidence_url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }, { claim: 'x', status: 'not_checked' }],
  };
  const t = WR.webEvidenceText(row);
  assert.match(t, /"glycinate improves sleep" \[magnesium glycinate\] — 3 independent \/ 1 brand-owned \/ 2 affiliate; 1 copied\/syndicated not counted\./);
  assert.match(t, /e\.g\. "it helped" \(guide\.org, independent\)/);
  assert.match(t, /dose per serving — 2 independent \/ 0 brand-owned\./);
  assert.match(t, /6 independent, 4 brand-owned, 3 affiliate, 0 sponsored, 0 unknown/);
  assert.match(t, /→ supported \(https:\/\/pubmed/);
  assert.ok(!t.includes('"x"'), 'unchecked targets are not presented as checks');
});

test('isFresh: complete + within the window only', () => {
  const now = Date.parse('2026-09-27T00:00:00Z');
  assert.equal(WR.isFresh({ status: 'complete', generated_at: '2026-09-10T00:00:00Z' }, 30, now), true);
  assert.equal(WR.isFresh({ status: 'complete', generated_at: '2026-08-01T00:00:00Z' }, 30, now), false);
  assert.equal(WR.isFresh({ status: 'partial', generated_at: '2026-09-26T00:00:00Z' }, 30, now), false);
  assert.equal(WR.isFresh(null, 30, now), false);
});

test('estimateCost: typical and an honest MAX (every batch retried once, every reply at the token cap)', () => {
  const { PRICING } = require('../utils/ai-usage');
  const p = PRICING['anthropic/claude-sonnet-5'];
  const e = WR.estimateCost({ queries: 12, pages: 20, model: 'anthropic/claude-sonnet-5', pricing: PRICING, maxTokens: 6000 });
  assert.equal(e.search_usd, 0.06);
  assert.equal(e.extraction_calls, 5);
  assert.equal(e.max_extraction_calls, 10);
  const promptPerCall = Math.round(4 * (12000 + 400) / 4 + 700);
  const worst = 0.06 + 10 * (promptPerCall * p.prompt + 6000 * p.completion);
  assert.ok(Math.abs(e.max_usd - worst) < 1e-6, `${e.max_usd} vs ${worst}`);
  assert.ok(e.max_usd > 2 * e.typical_usd, 'the max is not the typical run');
  const capped = WR.estimateCost({ queries: 12, pages: 20, model: 'anthropic/claude-sonnet-5', pricing: PRICING, maxTokens: 12000 });
  assert.ok(capped.max_usd > e.max_usd, 'the token cap drives the ceiling');
  assert.equal(WR.estimateCost({ queries: 1, pages: 1, model: 'nope', pricing: PRICING }).max_usd, null);
});
