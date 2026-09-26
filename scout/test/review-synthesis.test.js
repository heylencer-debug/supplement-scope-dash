// Run: node --test scout/test/   (from the repo root) — no network, no credits.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const RS = require('../utils/review-synthesis');
const { PRICING } = require('../utils/ai-usage');

// 181 real "magnesium gummies" rows from dovive_reviews (read-only sample,
// 2026-09-26), reviewer names replaced, author ids/links stripped.
const FIXTURE = require(path.join(__dirname, 'fixtures', 'magnesium-gummies-reviews.json'));

// ── helpers ────────────────────────────────────────────────────────────────
let _id = 1;
function row(asin, rating, body, extra = {}) {
  const id = extra.id ?? _id++;
  return {
    id,
    asin,
    rating,
    title: extra.title ?? null,
    body,
    review_date: extra.review_date ?? null,
    verified_purchase: extra.verified ?? false,
    helpful_votes: extra.helpful ?? 0,
    raw_json: { raw: { review_id: extra.rid ?? `R${id}`, review_posted_date: extra.posted ?? null, is_verified: extra.verified ?? false } },
  };
}

function prep(rows) {
  const p = RS.prepareReviews(rows);
  const { analyzed, cap } = RS.applyCap(p.reviews, 0);
  const ledger = RS.buildLedger({ collected: p.reviews, analyzed, cap, stats: p.stats, familyOf: p.familyOf, perProduct: true });
  return { ...p, analyzed, ledger };
}

// ── dates & normalisation ─────────────────────────────────────────────────
test('parseReviewDateLoose handles every shape seen in dovive_reviews', () => {
  assert.equal(RS.parseReviewDateLoose('July 11, 2026'), '2026-07-11');
  assert.equal(RS.parseReviewDateLoose('August 10, 2020Reviewed in the United States on August 10, 2020'), '2020-08-10');
  assert.equal(RS.parseReviewDateLoose('Reviewed in the United States on March 3, 2025'), '2025-03-03');
  assert.equal(RS.parseReviewDateLoose('2025-01-31'), '2025-01-31');
  assert.equal(RS.parseReviewDateLoose(''), null);
  assert.equal(RS.parseReviewDateLoose(null), null);
  assert.equal(RS.parseReviewDateLoose('yesterday'), null);
});

test('normalizeReview reads title / review date / verified from raw_json.raw, never the scrape timestamp', () => {
  const r = FIXTURE.find((x) => x.raw_json.raw.review_posted_date && x.raw_json.raw.is_verified && !x.title);
  assert.ok(r, 'fixture has a Bright Data row with header/date/verified only in raw');
  const n = RS.normalizeReview(r);
  assert.equal(n.title, r.raw_json.raw.review_header);
  assert.equal(n.date, RS.parseReviewDateLoose(r.raw_json.raw.review_posted_date));
  assert.notEqual(n.date, r.raw_json.date_text.slice(0, 10), 'date_text holds the scrape timestamp and must not be used');
  assert.equal(n.verified, true);
  assert.equal(n.review_key, `rid:${r.raw_json.raw.review_id}`);
  // flattened select shape used by the phase script
  const flat = RS.normalizeReview({ id: 9, asin: 'B000000001', rating: 5, body: 'x', rid: 'RZ', rheader: 'Head', rdate: 'June 8, 2026', rverified: 'true', rvine: 'false', date_text: '2026-08-27T21:31:46.728Z' });
  assert.deepEqual([flat.title, flat.date, flat.verified, flat.vine], ['Head', '2026-06-08', true, false]);
});

// ── de-dup & families (the real-data problem) ─────────────────────────────
test('prepareReviews de-duplicates by review_id and groups ASINs that share reviews into one family', () => {
  const p = RS.prepareReviews(FIXTURE);
  const rids = new Set(FIXTURE.map((r) => r.raw_json.raw.review_id));
  assert.equal(p.stats.rows_collected, FIXTURE.length);
  assert.equal(p.reviews.length, rids.size);
  assert.equal(p.stats.duplicate_rows_removed, FIXTURE.length - rids.size);
  assert.ok(p.stats.duplicate_rows_removed > 0, 'the real sample does contain duplicates');
  // B0DHVQ9XWY and B0FH31FF51 carry the identical review pool in the sample
  assert.equal(p.familyOf.B0DHVQ9XWY, p.familyOf.B0FH31FF51);
  const shared = p.reviews.find((r) => r.asins.includes('B0DHVQ9XWY') && r.asins.includes('B0FH31FF51'));
  assert.ok(shared);
  assert.equal(shared.id, Math.min(...shared.row_ids), 'canonical id = smallest row id');
});

test('text fallback key: long identical bodies merge across ASINs, short ones only within an ASIN', () => {
  const long = 'These gummies arrived completely melted into one solid block and I could not separate them at all.';
  const rows = [
    { id: 1, asin: 'A1', rating: 1, body: long, raw_json: {} },
    { id: 2, asin: 'A2', rating: 1, body: long, raw_json: {} },
    { id: 3, asin: 'A1', rating: 5, body: 'Great!', raw_json: {} },
    { id: 4, asin: 'A2', rating: 5, body: 'Great!', raw_json: {} },
  ];
  const p = RS.prepareReviews(rows);
  assert.equal(p.reviews.length, 3);
  assert.equal(p.familyOf.A1, p.familyOf.A2);
});

// ── lexicon ───────────────────────────────────────────────────────────────
test('lexicon assigns issue domains and keeps them apart', () => {
  const cases = [
    ['These taste terrible, gritty, hard to choke down.', ['taste_texture']],
    ['The gummies arrived melted and stuck together in one clump.', ['shipping_condition']],
    ['The front of the bottle says 600mg but the label says 70mg.', ['packaging']],
    ['I contacted the seller for a refund and they never responded.', ['seller_service']],
    ['Way too expensive for what you get.', ['price_value']],
    ['These really helped my leg cramps and my sleep.', ['product_efficacy']],
    ['The seal was broken when it arrived.', ['shipping_condition']],
  ];
  for (const [text, expect] of cases) {
    const got = RS.assignDomains(text);
    for (const d of expect) assert.ok(got.includes(d), `${text} → ${got.join(',')} (expected ${d})`);
  }
  const multi = RS.assignDomains('Arrived melted and the seller would not accept a return.');
  assert.ok(multi.includes('shipping_condition') && multi.includes('seller_service'));
  assert.deepEqual(RS.preclassifyReview({ id: 1, rating: 4, title: null, body: 'Ok I guess.' }).domains, ['other']);
});

test('lexicon hard-codes no ingredient or product-category words', () => {
  const banned = /magnesium|ashwagandha|collagen|creatine|melatonin|electrolyte|vitamin|elderberry|glycinate|citrate|biotin/i;
  for (const row of RS.DOMAIN_LEXICON) for (const re of row.patterns) assert.ok(!banned.test(re.source), `${row.domain}: ${re.source}`);
  for (const row of RS.DOMAIN_LEXICON) assert.ok(RS.ISSUE_DOMAINS.includes(row.domain));
});

test('domain breakdown counts negative vs positive reviews and products per domain', () => {
  const { analyzed } = prep([
    row('A1', 1, 'Tastes awful and bitter.'),
    row('A2', 2, 'Terrible taste, like chalk.'),
    row('A3', 5, 'Delicious taste, my kids love them.'),
    row('A1', 1, 'Arrived melted into a blob.'),
  ]);
  const pre = analyzed.map((r) => RS.preclassifyReview(r));
  const bd = RS.buildDomainBreakdown(analyzed, pre);
  const taste = bd.find((d) => d.domain === 'taste_texture');
  assert.equal(taste.negative.count, 2);
  assert.equal(taste.negative.products, 2);
  assert.equal(taste.positive.count, 1);
  assert.equal(bd.find((d) => d.domain === 'shipping_condition').negative.count, 1);
});

// ── ledger ────────────────────────────────────────────────────────────────
test('ledger: collected, analyzed, products, families, dates, verified, stars', () => {
  const rows = [
    row('A1', 5, 'Great product works well', { posted: 'January 2, 2024', verified: true, rid: 'X1' }),
    row('A1', 5, 'Great product works well', { posted: 'January 2, 2024', verified: true, rid: 'X1' }), // repeat scrape
    row('A2', 1, 'Did nothing for me at all', { posted: 'March 5, 2026', rid: 'X2' }),
    row('A3', 3, 'It is fine I suppose overall', { rid: 'X3' }),
    row('A4', 4, '', { posted: 'May 1, 2025', verified: true, rid: 'X4' }), // rating only
  ];
  const { ledger } = prep(rows);
  assert.equal(ledger.rows_collected, 5);
  assert.equal(ledger.duplicate_rows_removed, 1);
  assert.equal(ledger.reviews_collected, 4);
  assert.equal(ledger.reviews_analyzed, 4, 'analyzed == collected when no cap');
  assert.equal(ledger.cap_applied, null);
  assert.equal(ledger.reviews_with_text, 3);
  assert.equal(ledger.rating_only_reviews, 1);
  assert.equal(ledger.products_with_reviews, 4);
  assert.equal(ledger.product_families, 4);
  assert.deepEqual(ledger.date_range, { min: '2024-01-02', max: '2026-03-05', undated: 1 });
  assert.deepEqual(ledger.reviews_by_year, { 2024: 1, 2026: 1, 2025: 1, undated: 1 });
  assert.equal(ledger.verified_share, 0.5);
  assert.deepEqual(ledger.star_distribution, { 1: 1, 2: 0, 3: 1, 4: 1, 5: 1 });
  assert.equal(ledger.average_rating, 3.25);
  assert.equal(ledger.per_product.length, 4);
});

test('cap: analyzed < collected only when the cap is hit, and the ledger says so; round-robin across families', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(row('BIG', 5, `review number ${i} is long enough`, { posted: `January ${i + 1}, 2025` }));
  rows.push(row('SMALL', 1, 'only review for the small product'));
  const p = RS.prepareReviews(rows);
  const { analyzed, cap } = RS.applyCap(p.reviews, 4);
  assert.equal(analyzed.length, 4);
  assert.ok(analyzed.some((r) => r.asins.includes('SMALL')), 'small family not crowded out');
  const ledger = RS.buildLedger({ collected: p.reviews, analyzed, cap, stats: p.stats });
  assert.equal(ledger.reviews_collected, 11);
  assert.equal(ledger.reviews_analyzed, 4);
  assert.equal(ledger.cap_applied.max, 4);
  assert.equal(ledger.cap_applied.reviews_dropped, 7);
  assert.match(RS.formatLedgerLine(ledger), /4 of 11 unique reviews analyzed \(capped at 4 — 7 not analyzed\)/);
  assert.equal(RS.applyCap(p.reviews, 100).cap, null);
  ledger.theme_pass = { batches_failed: 1, reviews_in_failed_batches: 3 };
  assert.match(RS.formatLedgerLine(ledger), /Theme extraction PARTIAL: 3 reviews were in failed batches/);
});

// ── batching & parsing ────────────────────────────────────────────────────
test('batches cover every review with text exactly once and interleave products', () => {
  const p = RS.prepareReviews(FIXTURE);
  const batches = RS.buildBatches(p.reviews, 25);
  const ids = batches.flat().map((r) => r.id);
  const withText = p.reviews.filter((r) => RS.reviewText(r).length >= 15).map((r) => r.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual([...ids].sort((a, b) => a - b), [...withText].sort((a, b) => a - b));
  assert.ok(batches.every((b) => b.length <= 25));
  assert.ok(new Set(batches[0].map((r) => r.family)).size >= 5, 'first batch spans many products');
  const prompt = RS.buildBatchPrompt(batches[0], { keyword: 'magnesium gummies' });
  for (const r of batches[0]) assert.ok(prompt.includes(`\n${r.id} | `), `prompt carries id ${r.id}`);
});

test('parseBatchResponse drops ids that were not in the batch and tolerates fences / R-prefixes', () => {
  const text = '```json\n{"themes":[{"label":"Bitter aftertaste","domain":"taste_texture","polarity":"complaint","review_ids":[1,"R2",99],"opposite_review_ids":[3,1]},{"label":"x","domain":"bogus","polarity":"??","review_ids":[3]},{"label":"empty","review_ids":[42]}]}\n```';
  const out = RS.parseBatchResponse(text, [1, 2, 3]);
  assert.equal(out.ok, true);
  assert.equal(out.themes.length, 2);
  assert.deepEqual(out.themes[0].review_ids, [1, 2]);
  assert.deepEqual(out.themes[0].opposite_review_ids, [3], 'own ids never count as counter-evidence');
  assert.equal(out.themes[1].domain, 'other');
  assert.equal(out.themes[1].polarity, 'complaint');
  assert.equal(out.dropped_ids, 2);
  assert.equal(RS.parseBatchResponse('sorry, no JSON', [1]).ok, false);
});

// ── merge ─────────────────────────────────────────────────────────────────
test('mergeThemes unions similar labels across batches, keeps polarity and distinct problems apart', () => {
  const merged = RS.mergeThemes([
    [
      { label: 'Gummies arrive melted', domain: 'shipping_condition', polarity: 'complaint', review_ids: [1, 2, 3], opposite_review_ids: [] },
      { label: 'Bitter aftertaste', domain: 'taste_texture', polarity: 'complaint', review_ids: [4], opposite_review_ids: [] },
    ],
    [
      { label: 'Gummies arrived melted together', domain: 'shipping_condition', polarity: 'complaint', review_ids: [3, 10], opposite_review_ids: [11] },
      { label: 'Great taste', domain: 'taste_texture', polarity: 'praise', review_ids: [12, 13], opposite_review_ids: [] },
      { label: 'Misleading dose on front label', domain: 'packaging', polarity: 'complaint', review_ids: [14], opposite_review_ids: [] },
    ],
  ]);
  const melt = merged.find((t) => /melt/i.test(t.label));
  assert.deepEqual(melt.review_ids, [1, 2, 3, 10]);
  assert.equal(melt.label, 'Gummies arrive melted', 'canonical label = largest member');
  assert.deepEqual(melt.opposite_review_ids, [11]);
  assert.equal(melt.merged_labels.length, 2);
  assert.equal(merged.length, 4);
  assert.ok(merged.some((t) => t.polarity === 'praise' && t.label === 'Great taste'));
  assert.ok(RS.labelSimilarity('Bitter aftertaste', 'Misleading dose on front label') < 0.5);
});

test('applyLabelGroups joins model-proposed synonyms, validates indices, never mixes polarity', () => {
  const merged = RS.mergeThemes([[
    { label: 'Melted in shipping', domain: 'shipping_condition', polarity: 'complaint', review_ids: [1, 2], opposite_review_ids: [] },
    { label: 'Arrives as one blob', domain: 'shipping_condition', polarity: 'complaint', review_ids: [3], opposite_review_ids: [9] },
    { label: 'Arrived intact', domain: 'shipping_condition', polarity: 'praise', review_ids: [9], opposite_review_ids: [] },
    { label: 'Hard texture', domain: 'taste_texture', polarity: 'complaint', review_ids: [4], opposite_review_ids: [] },
  ]]);
  assert.equal(merged.length, 4, 'token overlap alone does not see these as the same');
  const i = (l) => merged.findIndex((t) => t.label === l);
  const out = RS.applyLabelGroups(merged, [
    { label: 'Gummies arrive melted', members: [i('Melted in shipping'), i('Arrives as one blob'), i('Arrived intact'), 99, 'x'] },
    { label: 'dup', members: [i('Melted in shipping'), i('Hard texture')] }, // index already used → only one left → ignored
  ]);
  const melt = out.find((t) => t.label === 'Gummies arrive melted');
  assert.deepEqual(melt.review_ids, [1, 2, 3]);
  assert.deepEqual(melt.opposite_review_ids, [9]);
  assert.ok(out.some((t) => t.label === 'Arrived intact' && t.polarity === 'praise'), 'praise not swallowed');
  assert.ok(out.some((t) => t.label === 'Hard texture'));
  assert.equal(out.length, 3);
  assert.equal(RS.applyLabelGroups(merged, null).length, 4);
  assert.match(RS.buildLabelMergePrompt(merged, { keyword: 'k' }), /\n0 \| complaint \| shipping_condition \| 2 \| Melted in shipping/);
});

// ── finalize: counts, scope, counter-evidence ─────────────────────────────
function scenario() {
  _id = 1000;
  const rows = [
    // family F1 = two variant ASINs sharing review R-A
    row('V1', 1, 'They taste bitter and chemical.', { rid: 'RA', verified: true, posted: 'May 1, 2025' }),
    row('V2', 1, 'They taste bitter and chemical.', { rid: 'RA', verified: true, posted: 'May 1, 2025' }),
    row('V1', 2, 'Bitter taste, could not finish the bottle.', { rid: 'RB', posted: 'June 1, 2025' }),
    row('P2', 1, 'So bitter. Awful taste.', { rid: 'RC', verified: true, posted: 'July 1, 2026' }),
    row('P3', 5, 'Great taste, like candy.', { rid: 'RD', verified: true }),
    row('P4', 5, 'Tastes great and works.', { rid: 'RE' }),
    row('P5', 1, 'Arrived melted into one blob.', { rid: 'RF', verified: true }),
    row('P6', 5, 'Helped my sleep a lot.', { rid: 'RG' }),
  ];
  const p = prep(rows);
  const id = (rid) => p.reviews.find((r) => r.review_key === `rid:${rid}`).id;
  const merged = RS.mergeThemes([[
    { label: 'Bitter taste', domain: 'taste_texture', polarity: 'complaint', review_ids: [id('RA'), id('RB'), id('RC')], opposite_review_ids: [] },
    { label: 'Great taste', domain: 'taste_texture', polarity: 'praise', review_ids: [id('RD'), id('RE')], opposite_review_ids: [] },
    { label: 'Arrives melted', domain: 'shipping_condition', polarity: 'complaint', review_ids: [id('RF')], opposite_review_ids: [] },
  ]]);
  const themes = RS.finalizeThemes(merged, p.analyzed, { productsWithReviews: p.ledger.product_families, reviewsAnalyzed: p.ledger.reviews_analyzed });
  return { p, id, themes };
}

test('theme counts: unique reviews, distinct product FAMILIES, verified, date range', () => {
  const { p, themes } = scenario();
  assert.equal(p.ledger.products_with_reviews, 7);
  assert.equal(p.ledger.product_families, 6, 'V1+V2 are one family');
  const bitter = themes.find((t) => t.label === 'Bitter taste');
  assert.equal(bitter.review_count, 3, 'RA counted once although stored under two ASINs');
  assert.equal(bitter.distinct_products.count, 2, 'families, not ASINs');
  assert.equal(bitter.distinct_products.asin_count, 3);
  assert.deepEqual(bitter.distinct_products.asins, ['P2', 'V1', 'V2']);
  assert.equal(bitter.verified_count, 2);
  assert.equal(bitter.verified_share, 0.667);
  assert.deepEqual(bitter.date_range, { min: '2025-05-01', max: '2026-07-01', undated: 0 });
  assert.equal(bitter.share_of_analyzed, 0.429);
  assert.ok(bitter.excerpts.length >= 1 && bitter.excerpts.length <= 3);
  for (const e of bitter.excerpts) {
    const src = p.reviews.find((r) => r.id === e.review_id);
    assert.ok(RS.reviewText(src).includes(e.text.replace(/…$/, '')), 'excerpt is verbatim');
  }
});

test('single-product themes are scoped single_product, never category-wide', () => {
  const { themes } = scenario();
  const melt = themes.find((t) => t.label === 'Arrives melted');
  assert.equal(melt.distinct_products.count, 1);
  assert.equal(melt.scope, 'single_product');
  assert.match(RS.formatThemeLine(melt), /ONE product only — not a category conclusion/);
  assert.equal(RS.scopeFor(1, 50), 'single_product');
  assert.equal(RS.scopeFor(2, 50), 'multi_product');
  assert.equal(RS.scopeFor(3, 50), 'multi_product', '3 of 50 is not category-wide');
  assert.equal(RS.scopeFor(12, 50), 'category_wide');
});

test('counter-evidence pairs opposite experiences on the same topic and never nets them off', () => {
  const { id, themes } = scenario();
  const bitter = themes.find((t) => t.label === 'Bitter taste');
  const great = themes.find((t) => t.label === 'Great taste');
  assert.deepEqual(bitter.counter_evidence.review_ids, [id('RD'), id('RE')]);
  assert.equal(bitter.counter_evidence.count, 2);
  assert.equal(bitter.counter_evidence.products, 2);
  assert.deepEqual(bitter.counter_evidence.paired_theme_labels, ['Great taste']);
  assert.equal(great.counter_evidence.count, 3);
  assert.equal(bitter.review_count, 3, 'complaint count unchanged by the opposite reviews');
  const melt = themes.find((t) => t.label === 'Arrives melted');
  assert.equal(melt.counter_evidence.count, 0, 'no pairing across domains');
  assert.match(RS.formatThemeLine(bitter), /conflicting: 2 reviews report the opposite/);
});

test('projectThemesToProduct keeps only that ASIN\'s reviews and the category context', () => {
  const { p, themes } = scenario();
  const v2 = RS.projectThemesToProduct(themes, 'V2', p.analyzed);
  assert.equal(v2.length, 1);
  assert.equal(v2[0].label, 'Bitter taste');
  assert.equal(v2[0].review_count, 1);
  assert.equal(v2[0].category_context.review_count, 3);
  assert.equal(v2[0].category_context.other_products, 1);
  const block = RS.formatProductEvidenceForPrompt({ ledger: { reviews_analyzed: 1 }, themes: v2 });
  assert.match(block, /Bitter taste \[taste\/texture\]: 1 review; also reported on 1 other product/);
});

// ── consumers: P7/P8 selection and fallback ───────────────────────────────
test('selectThemesForBrief: counts in every line, domain floor, fallback when no synthesis', () => {
  assert.equal(RS.selectThemesForBrief(null).available, false);
  assert.equal(RS.selectThemesForBrief({ themes: [] }).available, false);

  const mk = (label, domain, polarity, n, prods, verified, counter = 0, scope = 'category_wide') => ({
    label, domain, polarity, review_count: n, distinct_products: { count: prods, asins: [] }, verified_count: verified, scope,
    counter_evidence: { count: counter }, excerpts: [{ text: 'quote', asin: 'B0TEST0001' }],
  });
  const themes = [];
  for (let i = 0; i < 30; i++) themes.push(mk(`Taste problem ${i}`, 'taste_texture', 'complaint', 100 - i, 5, 10));
  themes.push(mk('Melts in transit', 'shipping_condition', 'complaint', 41, 9, 12, 17));
  themes.push(mk('Seller refused refund', 'seller_service', 'complaint', 2, 1, 1, 0, 'single_product'));
  themes.push(mk('Great taste', 'taste_texture', 'praise', 300, 20, 200));
  const synthesis = { themes, ledger: { reviews_collected: 1080, reviews_analyzed: 1080, rows_collected: 1922, duplicate_rows_removed: 842, products_with_reviews: 37, product_families: 34, date_range: { min: '2018-01-31', max: '2026-08-24' }, verified_share: 0.78, cap_applied: null } };
  const sel = RS.selectThemesForBrief(synthesis, { max: 10 });
  assert.equal(sel.available, true);
  assert.equal(sel.complaints.length, 10);
  assert.ok(sel.complaints.some((t) => t.label === 'Melts in transit'), 'domain floor keeps shipping in');
  assert.ok(sel.complaints.some((t) => t.label === 'Seller refused refund'), 'domain floor keeps service in');
  assert.match(sel.text, /Melts in transit \[arrival condition\] — 41 reviews across 9 products \(12 verified\); category-wide; conflicting: 17 reviews report the opposite\./);
  assert.match(sel.text, /Seller refused refund .*ONE product only/);
  assert.match(sel.ledgerLine, /1,080 of 1,080 unique reviews analyzed; 1,922 scraped rows before removing 842 duplicates; 37 ASINs in 34 product families; Jan 2018–Aug 2026, 78% verified/);

  const withSynth = RS.briefReviewInput(synthesis, { positive: ['p'], critical: ['c'] });
  assert.equal(withSynth.mode, 'synthesis');
  assert.ok(withSynth.evidenceText.length > 0);
  const fallback = RS.briefReviewInput(null, { positive: ['p'], critical: ['c'] });
  assert.equal(fallback.mode, 'sample');
  assert.equal(fallback.evidenceText, '');
  assert.deepEqual(fallback.positive, ['p'], 'fallback passes the old sample through untouched');

  const pp = RS.painPointsFromSynthesis(synthesis, 5);
  assert.equal(pp.length, 5);
  assert.ok(pp.every((p) => p.domain && p.products != null));
  assert.equal(RS.formatPainPointCount(pp.find((p) => p.keyword === 'Taste problem 0')), '100 reviews across 5 products (10 verified)');
  assert.equal(RS.formatPainPointCount({ keyword: 'legacy', mentions: 3 }), '3 mentions', 'legacy pain points unchanged');
});

// ── collector fix ─────────────────────────────────────────────────────────
test('Bright Data normaliseReview reads the dataset\'s real field names', () => {
  const { normaliseReview } = require('../bright-data-amazon');
  const raw = FIXTURE.find((x) => x.raw_json.raw.review_header && x.raw_json.raw.is_verified).raw_json.raw;
  const n = normaliseReview({ ...raw, asin: 'B0CBVZ9B2G', rating: 4, review_text: 'body', timestamp: '2026-08-27T21:31:46.728Z' }, null);
  assert.equal(n.title, raw.review_header);
  assert.equal(n.date_text, raw.review_posted_date);
  assert.equal(n.verified_purchase, true);
});

// ── migrate-reviews-to-dash ───────────────────────────────────────────────
test('migrate-reviews buildReviewAnalysis counts unique reviews and carries review_evidence', () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-key';
  const { buildReviewAnalysis } = require('../migrate-reviews-to-dash');
  const asin = 'B0DHVQ9XWY';
  const rows = FIXTURE.filter((r) => r.asin === asin);
  const unique = new Set(rows.map((r) => r.raw_json.raw.review_id)).size;
  const a = buildReviewAnalysis(rows, { ledger: { reviews_analyzed: unique }, themes: [{ label: 't' }], generated_at: 'x' });
  assert.equal(a.analysis_metadata.total_reviews_analyzed, unique);
  assert.equal(a.analysis_metadata.rows_collected, rows.length);
  assert.equal(a.analysis_metadata.duplicate_rows_removed, rows.length - unique);
  assert.ok(a.sentiment_distribution && a.top_reviews && a.pain_points, 'legacy fields kept');
  assert.equal(a.review_evidence.source, 'dovive_review_synthesis');
  assert.equal(buildReviewAnalysis(rows).review_evidence, undefined);
});

// ── cost estimate (no calls) ──────────────────────────────────────────────
test('cost estimate is computed from the repo PRICING map, per batch', () => {
  const p = RS.prepareReviews(FIXTURE);
  const batches = RS.buildBatches(p.reviews, 100);
  const sonnet = RS.estimateSynthesisCost(batches, PRICING['anthropic/claude-sonnet-5'], { keyword: 'magnesium gummies' });
  const flash = RS.estimateSynthesisCost(batches, PRICING['google/gemini-3.7-flash'], { keyword: 'magnesium gummies' });
  assert.equal(sonnet.batches, batches.length);
  assert.ok(sonnet.prompt_tokens > 0 && sonnet.cost_usd > flash.cost_usd && flash.cost_usd > 0);
  assert.equal(RS.estimateSynthesisCost(batches, null).cost_usd, null);
});
