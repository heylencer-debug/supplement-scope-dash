'use strict';
// The formula phases' evidence reads (utils/formula-reads.js). For each phase:
// the 'scout' backend must issue EXACTLY the chain the phase issued before the
// evidence layer (asserted call for call on a recording client), the 'rnd'
// backend the same chain on the §5 view, and the phase file must read through
// the layer rather than a hand-built DASH/DOVIVE select.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { recordingSupabase } = require('./helpers/recording-supabase');
const { createEvidenceSource } = require('../utils/evidence-source');
const FR = require('../utils/formula-reads');

const CAT = 'cat-1';
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function backends(respond) {
  const dash = recordingSupabase(respond);
  const dovive = recordingSupabase(respond);
  const rnd = recordingSupabase(respond);
  return {
    dash, dovive, rnd,
    scout: createEvidenceSource({ dash, dovive, backend: 'scout' }),
    rndEv: createEvidenceSource({ dash, dovive, backend: 'rnd', rndClient: rnd }),
  };
}

/** Evidence reads in a phase file that bypass the layer (writes and merge-reads excluded by the caller). */
function directReads(file, tables) {
  const s = src(file);
  return tables.filter((t) => new RegExp(`(DASH|DOVIVE|DOVIVE_SB|dash|dovive)\\.from\\(\\s*['"]${t}['"]\\s*\\)\\s*\\.select`).test(s));
}

// ── P6 ──────────────────────────────────────────────────────────────────────

test('P6 reads: scout chain identical to the pre-layer phase, rnd on the views', async () => {
  const x = backends();
  await FR.p6Products(x.scout, CAT, 999);
  await FR.p6RawReviews(x.scout, ['B1', 'B2']);
  await FR.p6ProductSyntheses(x.scout, { keyword: 'kw #2', asins: ['B1', 'B2'], reviewsClient: null });
  // phase6-product-intelligence.js before the layer (products :543, reviews :56, synthesis :69)
  assert.deepEqual(x.dash.queries, [
    { table: 'products', calls: [
      ['select', `id, asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg,
             price, monthly_revenue, monthly_sales, rating_value, rating_count,
             serving_size, servings_per_container, supplement_facts_raw,
             feature_bullets_text, claims_on_label, marketing_analysis`],
      ['eq', 'category_id', CAT], ['order', 'bsr_current', { ascending: true, nullsFirst: false }], ['limit', 999],
    ] },
    { table: 'dovive_review_synthesis', calls: [
      ['select', 'asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status'],
      ['eq', 'scope', 'product'], ['eq', 'keyword', 'kw #2'], ['in', 'asin', ['B1', 'B2']], ['range', 0, 499],
    ] },
  ]);
  assert.deepEqual(x.dovive.queries, [{ table: 'dovive_reviews', calls: [
    ['select', 'asin, rating, title, body, helpful_votes'], ['in', 'asin', ['B1', 'B2']],
    ['order', 'helpful_votes', { ascending: false }], ['limit', 40],
  ] }]);

  await FR.p6Products(x.rndEv, CAT, 999);
  await FR.p6ProductSyntheses(x.rndEv, { keyword: 'kw #2', asins: ['B1'] });
  assert.deepEqual(x.rnd.tables(), ['v_formula_products', 'v_formula_review_themes']);
  assert.deepEqual(x.rnd.queries[0].calls.slice(1), x.dash.queries[0].calls.slice(1));
});

test('P6 phase file reads through the evidence layer; its merge-write base is the layer write base', () => {
  const s = src('phase6-product-intelligence.js');
  assert.deepEqual(directReads('phase6-product-intelligence.js', ['products', 'dovive_reviews', 'dovive_review_synthesis']), []);
  assert.match(s, /const EV = createEvidenceSource\(\{ dash: DASH, dovive: DOVIVE \}\)/);
  assert.match(s, /p6Products\(EV, CAT_ID, TOP_N\)/);
  assert.match(s, /EV\.selection\(CAT_ID\)/);
  assert.match(s, /EV\.productWriteBase\(/);
  assert.match(s, /DASH\.from\('products'\)\.update\(/, 'the write stays on Scout');
});

// ── P7 ──────────────────────────────────────────────────────────────────────

test('P7 reads: scout chain identical to the pre-layer phase, rnd on the views', async () => {
  const { P7_PRODUCT_COLUMNS } = require('../utils/formula-inputs');
  const x = backends();
  await FR.p7Products(x.scout, CAT);
  await FR.p7CategoryAsins(x.scout, CAT);
  await FR.p7CategorySynthesis(x.scout, { keyword: 'kw', categoryId: CAT, reviewsClient: null });
  await FR.p7WebEvidence(x.scout, { keyword: 'kw', categoryId: CAT });
  await FR.p7MarketingAssets(x.scout, { keyword: 'kw', categoryId: CAT });
  await x.scout.marketIntel(CAT);
  const asins = Array.from({ length: 450 }, (_, i) => `A${i}`);
  await FR.p7RawReviews(x.scout, asins);
  // phase6-market-analysis.js before the layer: products :529-537, fetchRawReviews :131-138,
  // synthesis :547 (store), web :570 (store), assets :572 (store), skip check :520 (store)
  assert.deepEqual(x.dash.queries, [
    { table: 'products', calls: [['select', P7_PRODUCT_COLUMNS], ['eq', 'category_id', CAT], ['order', 'bsr_current', { ascending: true, nullsFirst: false }]] },
    { table: 'products', calls: [['select', 'asin'], ['eq', 'category_id', CAT], ['limit', 500]] },
    { table: 'dovive_review_synthesis', calls: [
      ['select', 'keyword, category_id, scope, asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status'],
      ['eq', 'scope', 'category'], ['eq', 'keyword', 'kw'], ['order', 'generated_at', { ascending: false }], ['limit', 1],
    ] },
    { table: 'dovive_web_research', calls: [
      ['select', 'keyword, category_id, status, ledger, rollup, verification, model, generated_at'],
      ['eq', 'keyword', 'kw'], ['order', 'generated_at', { ascending: false }], ['limit', 1],
    ] },
    { table: 'dovive_web_research', calls: [
      ['select', 'keyword, category_id, status, ledger, rollup, verification, model, generated_at'],
      ['eq', 'category_id', CAT], ['order', 'generated_at', { ascending: false }], ['limit', 1],
    ] },
    { table: 'dovive_marketing_assets', calls: [
      ['select', 'keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at'],
      ['eq', 'scope', 'category'], ['eq', 'keyword', 'kw'], ['order', 'generated_at', { ascending: false }], ['limit', 1],
    ] },
    { table: 'dovive_marketing_assets', calls: [
      ['select', 'keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at'],
      ['eq', 'scope', 'category'], ['eq', 'category_id', CAT], ['order', 'generated_at', { ascending: false }], ['limit', 1],
    ] },
    { table: 'formula_briefs', calls: [['select', 'id, ingredients, created_at'], ['eq', 'category_id', CAT], ['order', 'created_at', { ascending: false }], ['limit', 1]] },
  ]);
  assert.deepEqual(x.dovive.queries, [{ table: 'dovive_reviews', calls: [
    ['select', 'asin, rating, title, body'], ['in', 'asin', asins.slice(0, 400)], ['not', 'body', 'is', null], ['limit', 3000],
  ] }]);

  await FR.p7Products(x.rndEv, CAT);
  await FR.p7CategorySynthesis(x.rndEv, { keyword: 'kw', categoryId: CAT });
  await FR.p7WebEvidence(x.rndEv, { keyword: 'kw', categoryId: CAT });
  await FR.p7MarketingAssets(x.rndEv, { keyword: 'kw', categoryId: CAT });
  await x.rndEv.marketIntel(CAT);
  assert.deepEqual([...new Set(x.rnd.tables())], ['v_formula_products', 'v_formula_review_themes', 'v_formula_claims', 'v_formula_creative', 'v_formula_brief_current']);
  assert.deepEqual(x.rnd.queries[0].calls.slice(1), x.dash.queries[0].calls.slice(1));
});

test('P7 phase file reads through the evidence layer; the formula_briefs patch stays on Scout', () => {
  const f = 'phase6-market-analysis.js';
  const s = src(f);
  assert.deepEqual(directReads(f, ['products', 'dovive_reviews', 'dovive_review_synthesis', 'dovive_web_research', 'dovive_marketing_assets']), []);
  assert.doesNotMatch(s, /fetchCategorySynthesis\(|loadWebEvidence\(|fetchCategoryMarketingAssets\(|fetchMarketIntel\(/);
  assert.match(s, /const EV = createEvidenceSource\(\{ dash: DASH, dovive: DOVIVE \}\)/);
  assert.match(s, /EV\.marketIntel\(CAT_ID\)/);
  assert.match(s, /DASH\.from\('formula_briefs'\)\s*\.select\('id, ingredients'\)/, 'patch read-merge-write stays on Scout');
  assert.match(s, /DASH\.from\('formula_briefs'\)\.update\(/);
});

// ── P8 ──────────────────────────────────────────────────────────────────────

test('P8 reads: scout chain identical to the pre-layer phase (limit only below 999), rnd on the view', async () => {
  const x = backends();
  await FR.p8Products(x.scout, CAT, 999);
  await FR.p8Products(x.scout, CAT, 25);
  const cols = 'id, asin, title, brand, bsr_current, price, main_image_url, feature_bullets_text, supplement_facts_raw';
  // phase7-packaging-intelligence.js before the layer (:247-251)
  assert.deepEqual(x.dash.queries, [
    { table: 'products', calls: [['select', cols], ['eq', 'category_id', CAT], ['order', 'bsr_current', { ascending: true }]] },
    { table: 'products', calls: [['select', cols], ['eq', 'category_id', CAT], ['order', 'bsr_current', { ascending: true }], ['limit', 25]] },
  ]);
  await FR.p8Products(x.rndEv, CAT, 999);
  assert.deepEqual(x.rnd.queries, [{ table: 'v_formula_products', calls: x.dash.queries[0].calls }]);
});

test('P8 phase file reads through the evidence layer; merge-read and writes stay on Scout', () => {
  const f = 'phase7-packaging-intelligence.js';
  const s = src(f);
  assert.match(s, /p8Products\(EV, CAT_ID, TOP_N\)/);
  assert.doesNotMatch(s, /DASH\.from\('products'\)\s*\.select\('id, asin, title/);
  assert.match(s, /DASH\.from\('products'\)\.select\('marketing_analysis'\)\.eq\('id', p\.id\)/, 'per-row merge-read stays on Scout');
  assert.match(s, /DOVIVE\s*\.from\('dovive_packaging_intelligence'\)\s*\.upsert\(/);
});

// ── formula_briefs reads shared by P11 / P12 ──────────────────────────────

const BRIEF_SKIP_CHAIN = [['select', 'ingredients'], ['eq', 'category_id', CAT], ['limit', 1], ['single']];
const BRIEF_FORMULA_CHAIN = [['select', 'id, ingredients'], ['eq', 'category_id', CAT], ['not', 'ingredients', 'is', null], ['limit', 1], ['single']];

test('brief reads (P11/P12): skip row + formula row on formula_briefs, write base == the row under scout', async () => {
  const row = { id: 7, ingredients: { adjusted_formula: 'f' } };
  const x = backends(() => ({ data: row, error: null }));
  await FR.briefSkipRow(x.scout, CAT);
  const { data } = await FR.briefFormulaRow(x.scout, CAT);
  assert.equal(await FR.briefFormulaWriteBase(x.scout, CAT, data), data);
  assert.deepEqual(x.dash.queries, [
    { table: 'formula_briefs', calls: BRIEF_SKIP_CHAIN },
    { table: 'formula_briefs', calls: BRIEF_FORMULA_CHAIN },
  ]);
  // rnd: evidence from the view, write base from Scout with the same chain
  await FR.briefSkipRow(x.rndEv, CAT);
  await FR.briefFormulaRow(x.rndEv, CAT);
  await FR.briefFormulaWriteBase(x.rndEv, CAT, { id: 7, ingredients: {} });
  assert.deepEqual(x.rnd.queries, [
    { table: 'v_formula_brief_current', calls: BRIEF_SKIP_CHAIN },
    { table: 'v_formula_brief_current', calls: BRIEF_FORMULA_CHAIN },
  ]);
  assert.deepEqual(x.dash.queries[2], { table: 'formula_briefs', calls: BRIEF_FORMULA_CHAIN });
});

// ── P11 ─────────────────────────────────────────────────────────────────────

test('P11 reads: scout chain identical to the pre-layer phase, rnd on the views', async () => {
  const x = backends();
  await FR.p11Products(x.scout, CAT);
  await FR.p11P5Research(x.scout, ['B1', 'B2'], 'kw #3');
  await FR.p11P5Sources(x.scout, ['B1', 'B2']);
  // phase10-competitive-benchmarking.js before the layer (products :571-579, P5 :259-265)
  assert.deepEqual(x.dash.queries, [{ table: 'products', calls: [
    ['select', `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, serving_size, servings_per_container,
             supplement_facts_raw, all_nutrients, nutrients_count, marketing_analysis`],
    ['eq', 'category_id', CAT], ['not', 'bsr_current', 'is', null], ['order', 'bsr_current', { ascending: true }], ['limit', 50],
  ] }]);
  assert.deepEqual(x.dovive.queries, [
    { table: 'dovive_phase5_research', calls: [['select', 'asin, competitor_angle, key_strengths, key_weaknesses, certifications'], ['in', 'asin', ['B1', 'B2']], ['ilike', 'keyword', 'kw #3']] },
    { table: 'dovive_p5_sources', calls: [['select', 'asin, source_url, source_type, extracted'], ['in', 'asin', ['B1', 'B2']]] },
  ]);
  await FR.p11Products(x.rndEv, CAT);
  await FR.p11P5Research(x.rndEv, ['B1'], 'kw #3');
  await FR.p11P5Sources(x.rndEv, ['B1']);
  assert.deepEqual(x.rnd.tables(), ['v_formula_products', 'v_formula_deep_research', 'v_formula_p5_sources']);
  assert.deepEqual(x.rnd.queries[0].calls, x.dash.queries[0].calls);
});

test('P11 phase file reads through the evidence layer; the write merges into the Scout write base', () => {
  const f = 'phase10-competitive-benchmarking.js';
  const s = src(f);
  assert.deepEqual(directReads(f, ['products', 'formula_briefs', 'dovive_phase5_research', 'dovive_p5_sources']), []);
  assert.match(s, /briefSkipRow\(EV, CAT_ID\)/);
  assert.match(s, /briefFormulaRow\(EV, CAT_ID\)/);
  assert.match(s, /const writeRow = await briefFormulaWriteBase\(EV, CAT_ID, briefRow\)/);
  assert.match(s, /\.\.\.\(writeRow\.ingredients \|\| \{\}\),\s*competitive_benchmarking/);
  assert.match(s, /\.eq\('id', writeRow\.id\)/);
});

// ── P12 ─────────────────────────────────────────────────────────────────────

test('P12 phase file reads the brief through the evidence layer (shared brief chains above); write merges into the Scout write base', () => {
  const f = 'phase11-fda-compliance.js';
  const s = src(f);
  assert.deepEqual(directReads(f, ['formula_briefs', 'products']), []);
  assert.match(s, /const EV = createEvidenceSource\(\{ dash: DASH \}\)/);
  assert.match(s, /briefSkipRow\(EV, CAT_ID\)/);
  assert.match(s, /const \{ data: briefRow \} = await briefFormulaRow\(EV, CAT_ID\)/);
  assert.match(s, /const writeRow = await briefFormulaWriteBase\(EV, CAT_ID, briefRow\)/);
  assert.match(s, /\.\.\.\(writeRow\.ingredients \|\| \{\}\),\s*fda_compliance/);
  assert.match(s, /\.eq\('id', writeRow\.id\)/);
});
