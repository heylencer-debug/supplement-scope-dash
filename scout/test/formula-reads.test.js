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

// ── P13 ─────────────────────────────────────────────────────────────────────

test('P13 reads: the one brief read, scout chain identical, write base == the row under scout', async () => {
  const row = { id: 3, ingredients: { fda_compliance: {} } };
  const x = backends(() => ({ data: row, error: null }));
  const { data } = await FR.p13Brief(x.scout, CAT);
  assert.equal(await FR.p13BriefWriteBase(x.scout, CAT, data), data);
  // phase12-final-signoff.js before the layer (:307-308)
  const chain = [['select', 'id, ingredients'], ['eq', 'category_id', CAT], ['limit', 1], ['maybeSingle']];
  assert.deepEqual(x.dash.queries, [{ table: 'formula_briefs', calls: chain }]);
  await FR.p13Brief(x.rndEv, CAT);
  await FR.p13BriefWriteBase(x.rndEv, CAT, { id: 3, ingredients: {} });
  assert.deepEqual(x.rnd.queries, [{ table: 'v_formula_brief_current', calls: chain }]);
  assert.deepEqual(x.dash.queries[1], { table: 'formula_briefs', calls: chain });
});

test('P13 phase file reads the brief through the evidence layer; final_signoff merges into the Scout write base', () => {
  const s = src('phase12-final-signoff.js');
  assert.deepEqual(directReads('phase12-final-signoff.js', ['formula_briefs']), []);
  assert.match(s, /const \{ data: fb \} = await p13Brief\(EV, cat\.id\)/);
  assert.match(s, /const writeRow = await p13BriefWriteBase\(EV, cat\.id, fb\)/);
  assert.match(s, /\.\.\.\(writeRow\.ingredients \|\| \{\}\),\s*final_signoff/);
  assert.match(s, /\.update\(\{ ingredients: updated \}\)\.eq\('id', writeRow\.id\)/);
});

// ── P5b (module is requirable: its reads are tested in place) ─────────────

test('P5b reads: loadCompetitors / loadBrandDomains issue the pre-layer chains under scout, the views under rnd', async () => {
  const P5b = require('../phase5b-web-research');
  const cols = 'asin, brand, title, bsr_current, feature_bullets_text, description_text';
  const log = () => {};
  const rows = [{ asin: 'B1', brand: 'A', bsr_current: 5 }];
  const x = backends(() => ({ data: rows, error: null }));
  const active = async () => ({ active: true, why: '1 selected competitors' });
  const inactive = async () => ({ active: false, why: 'selection not populated' });

  // no evidence passed → built on dash for the default (scout) backend
  await P5b.loadCompetitors({ dash: x.dash, categoryId: CAT, topN: 10, loadSelection: active, log });
  await P5b.loadCompetitors({ dash: x.dash, categoryId: CAT, topN: 10, loadSelection: inactive, log });
  await P5b.loadBrandDomains({ dovive: x.dovive, keyword: 'kw #2', log });
  // phase5b-web-research.js before the layer (:141-157, :164-165)
  assert.deepEqual(x.dash.queries, [
    { table: 'products', calls: [['select', cols], ['eq', 'category_id', CAT], ['eq', 'selected', true], ['order', 'selection_rank', { ascending: true }], ['limit', 200]] },
    { table: 'products', calls: [['select', cols], ['eq', 'category_id', CAT], ['order', 'bsr_current', { ascending: true, nullsFirst: false }], ['limit', 40]] },
  ]);
  assert.deepEqual(x.dovive.queries, [{ table: 'dovive_p5_sources', calls: [
    ['select', 'asin, source_url, source_type'], ['eq', 'keyword', 'kw #2'], ['eq', 'source_type', 'brand_site'], ['limit', 200],
  ] }]);

  // explicit scout evidence source → identical chains
  const y = backends(() => ({ data: rows, error: null }));
  await P5b.loadCompetitors({ dash: y.dash, evidence: y.scout, categoryId: CAT, topN: 10, loadSelection: active, log });
  await P5b.loadBrandDomains({ dovive: y.dovive, evidence: y.scout, keyword: 'kw #2', log });
  assert.deepEqual(y.dash.queries, x.dash.queries.slice(0, 1));
  assert.deepEqual(y.dovive.queries, x.dovive.queries);

  // rnd → the views, same chains; Scout untouched
  const z = backends(() => ({ data: rows, error: null }));
  await P5b.loadCompetitors({ dash: z.dash, evidence: z.rndEv, categoryId: CAT, topN: 10, loadSelection: active, log });
  await P5b.loadBrandDomains({ dovive: z.dovive, evidence: z.rndEv, keyword: 'kw #2', log });
  assert.deepEqual(z.rnd.queries, [
    { table: 'v_formula_products', calls: x.dash.queries[0].calls },
    { table: 'v_formula_p5_sources', calls: x.dovive.queries[0].calls },
  ]);
  assert.equal(z.dash.queries.length + z.dovive.queries.length, 0);
});

test('P5b main wires the evidence source and its selection; the web-research pre-flight/upsert stay on dash', () => {
  const s = src('phase5b-web-research.js');
  assert.deepEqual(directReads('phase5b-web-research.js', ['products', 'dovive_p5_sources']), []);
  assert.match(s, /evidence = createEvidenceSource\(\{ dash, dovive \}\)/);
  assert.match(s, /loadSelection: evidence \? \(_client, categoryId\) => evidence\.selection\(categoryId\)/);
  assert.match(s, /dash\.from\(TABLE\)\s*\.select\('keyword, status, generated_at, ledger, sources, search_runs, model'\)/);
  assert.match(s, /dash\.from\(TABLE\)\.upsert\(/);
});

// ── P5 ──────────────────────────────────────────────────────────────────────

test('P5 pool reads: scout chains identical to the old productsQuery() pattern, rnd on the view', async () => {
  const x = backends();
  const sel = { active: true, why: '2', ranks: new Map([['B1', 1]]) };
  await FR.p5Established(x.scout, CAT, sel, 5);
  await FR.p5BestBsr(x.scout, CAT, sel, 7);
  await FR.p5Emerging(x.scout, CAT, sel, 3);
  await FR.p5Emerging(x.scout, CAT, null, 43);
  await FR.p5LowReviewEarners(x.scout, CAT, { active: false }, 4);
  const S = ['select', FR.P5_PRODUCT_SELECT];
  const C = ['eq', 'category_id', CAT];
  const SEL = [['eq', 'selected', true], ['order', 'selection_rank', { ascending: true }]];
  const NN = ['not', 'bsr_current', 'is', null];
  const BSR = ['order', 'bsr_current', { ascending: true }];
  // phase5-deep-research.js before the layer (:872-935)
  assert.deepEqual(x.dash.callsOn('products'), [
    [S, C, ...SEL, ['eq', 'cohort', 'established'], NN, BSR, ['limit', 5]],
    [S, C, ...SEL, NN, BSR, ['limit', 7]],
    [S, C, ...SEL, ['eq', 'cohort', 'emerging'], NN, BSR, ['limit', 3]],
    [S, C, ['eq', 'cohort', 'emerging'], NN, BSR, ['limit', 43]],
    [S, C, NN, ['lt', 'rating_count', 500], ['gt', 'monthly_revenue', 0], BSR, ['limit', 4]],
  ]);
  assert.match(FR.P5_PRODUCT_SELECT, /other_ingredients,[\s\S]*review_analysis, cohort$/);
  await FR.p5Established(x.rndEv, CAT, sel, 5);
  assert.deepEqual(x.rnd.queries, [{ table: 'v_formula_products', calls: x.dash.callsOn('products')[0] }]);
});

test('P5 grounding reads: the four dovive_* chains under scout (legacy OCR retry in the layer), views + Scout reviews under rnd', async () => {
  const x = backends();
  await FR.p5Listing(x.scout, 'B1', 'kw #4', CAT);
  await FR.p5LabelPanels(x.scout, 'B1', CAT);
  await FR.p5Reviews(x.scout, 'B1');
  await FR.p5Keepa(x.scout, 'B1');
  // phase5-deep-research.js before the layer (:192-202)
  assert.deepEqual(x.dovive.queries, [
    { table: 'dovive_research', calls: [['select', 'title, brand, description, bullet_points, price, rating, review_count, bsr'], ['eq', 'asin', 'B1'], ['ilike', 'keyword', 'kw #4'], ['limit', 1], ['maybeSingle']] },
    { table: 'dovive_ocr', calls: [['select', 'supplement_facts, other_ingredients, health_claims, certifications, label_product_match'], ['eq', 'asin', 'B1'], ['order', 'image_index', { ascending: true }], ['limit', 8]] },
    { table: 'dovive_reviews', calls: [['select', 'rating, title, body, verified_purchase, helpful_votes'], ['eq', 'asin', 'B1'], ['order', 'helpful_votes', { ascending: false }], ['limit', 40]] },
    { table: 'dovive_keepa', calls: [['select', 'price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d'], ['eq', 'asin', 'B1'], ['limit', 1], ['maybeSingle']] },
  ]);
  assert.equal(x.dash.queries.length, 0);

  const y = backends(() => ({ data: [], error: null }));
  await FR.p5Listing(y.rndEv, 'B1', 'kw #4', CAT);
  await FR.p5LabelPanels(y.rndEv, 'B1', CAT);
  await FR.p5Reviews(y.rndEv, 'B1');
  await FR.p5Keepa(y.rndEv, 'B1');
  assert.deepEqual(y.rnd.tables(), ['v_formula_roster', 'v_formula_listing', 'v_formula_label_facts', 'v_formula_listing', 'v_formula_keepa']);
  assert.deepEqual(y.dovive.tables(), ['dovive_reviews']);
});

test('P5 phase file reads through the evidence layer; skip check and writes stay on Scout', () => {
  const s = src('phase5-deep-research.js');
  assert.deepEqual(directReads('phase5-deep-research.js', ['dovive_research', 'dovive_ocr', 'dovive_reviews', 'dovive_keepa']), []);
  assert.doesNotMatch(s, /DASH\.from\('products'\)\s*\.select\(PRODUCT_SELECT\)|productsQuery\(\)/);
  assert.match(s, /const EV = createEvidenceSource\(\{ dash: DASH, dovive: DOVIVE \}\)/);
  assert.match(s, /EV\.selection\(categoryId\)/);
  assert.match(s, /fetchGroundingData\(product\.asin, KEYWORD, categoryId\)/);
  assert.match(s, /\.filter\(\(r\) => !\(r\.label_product_match && r\.label_product_match\.verdict === 'mismatch'\)\)/, 'mismatch filter kept');
  assert.match(s, /DOVIVE\.from\('dovive_phase5_research'\)\s*\.select\('asin, pool, researched_by'\)/, 'already-researched check stays on Scout');
  assert.match(s, /DASH\.from\('products'\)\s*\.select\('marketing_analysis'\)/, 'mirror merge-read stays on Scout');
});
