'use strict';
// utils/evidence-source.js — one read layer, two backends (Scout tables | RnD views).
const test = require('node:test');
const assert = require('node:assert/strict');
const { recordingSupabase } = require('./helpers/recording-supabase');
const ES = require('../utils/evidence-source');

const CAT = 'cat-1';
const ACTIVE = { active: true, why: '2 selected competitors', ranks: new Map([['B1', 1], ['B2', 2]]) };
const INACTIVE = { active: false, why: 'selection not populated for this category', ranks: new Map() };

function scout(respond) {
  const dash = recordingSupabase(respond);
  const dovive = recordingSupabase(respond);
  return { dash, dovive, ev: ES.createEvidenceSource({ dash, dovive, backend: 'scout' }) };
}
function rnd(respond) {
  const dash = recordingSupabase(respond);
  const dovive = recordingSupabase(respond);
  const rndClient = recordingSupabase(respond);
  return { dash, dovive, rndClient, ev: ES.createEvidenceSource({ dash, dovive, backend: 'rnd', rndClient }) };
}

// ── backend selection ──────────────────────────────────────────────────────

test('backend: default scout; env SCOUT_EVIDENCE_SOURCE picks it; unknown value throws', () => {
  assert.equal(ES.backendFromEnv({}), 'scout');
  assert.equal(ES.backendFromEnv({ SCOUT_EVIDENCE_SOURCE: ' RnD ' }), 'rnd');
  assert.equal(ES.createEvidenceSource({ env: {} }).backend, 'scout');
  assert.equal(ES.createEvidenceSource({ env: { SCOUT_EVIDENCE_SOURCE: 'scout' } }).backend, 'scout');
  assert.throws(() => ES.createEvidenceSource({ env: { SCOUT_EVIDENCE_SOURCE: 'dash' } }), /must be 'scout' or 'rnd' \(got 'dash'\)/);
});

test('rnd with no RnD client throws a clear error — never falls back to Scout', () => {
  assert.throws(
    () => ES.createEvidenceSource({ env: { SCOUT_EVIDENCE_SOURCE: 'rnd' } }),
    /SCOUT_EVIDENCE_SOURCE=rnd but RnD client unavailable: RND_SUPABASE_URL and RND_SUPABASE_ANON_KEY are not set — refusing to read formula evidence from Scout instead/,
  );
  assert.throws(
    () => ES.createEvidenceSource({ env: { SCOUT_EVIDENCE_SOURCE: 'rnd', RND_SUPABASE_URL: 'u' } }),
    /RND_SUPABASE_ANON_KEY is not set/,
  );
  assert.throws(() => ES.createEvidenceSource({ backend: 'rnd', rndClient: null, env: {} }), /refusing to read formula evidence from Scout/);
});

test('rnd with the env set builds a read-only RnD client', () => {
  const ev = ES.createEvidenceSource({ env: { SCOUT_EVIDENCE_SOURCE: 'rnd', RND_SUPABASE_URL: 'https://x.supabase.co', RND_SUPABASE_ANON_KEY: 'k' } });
  assert.equal(ev.backend, 'rnd');
  assert.equal(ev.describe().products, 'rnd:v_formula_products');
});

test('applyOps refuses anything that is not a read filter', () => {
  const db = recordingSupabase();
  assert.throws(() => ES.applyOps(db.from('products'), [['update', { x: 1 }]]), /'update' is not a read filter/);
  assert.throws(() => ES.applyOps(db.from('products'), [['delete']]), /not a read filter/);
});

test('describe(): every item maps to its Scout table or §5 view', () => {
  const s = ES.createEvidenceSource({ dash: {}, dovive: {}, backend: 'scout' }).describe();
  assert.equal(s.products, 'scout:products');
  assert.equal(s.briefCurrent, 'scout:formula_briefs');
  const r = ES.createEvidenceSource({ backend: 'rnd', rndClient: {} }).describe();
  assert.deepEqual(r, {
    products: 'rnd:v_formula_products', roster: 'rnd:v_formula_roster', labelFacts: 'rnd:v_formula_label_facts',
    labelPanels: 'rnd:v_formula_label_facts+v_formula_listing', listingClaims: 'rnd:v_formula_roster+v_formula_listing',
    marketSignals: 'rnd:v_formula_keepa', reviewThemes: 'rnd:v_formula_review_themes', webClaims: 'rnd:v_formula_claims',
    creativeVerdicts: 'rnd:v_formula_creative', deepResearch: 'rnd:v_formula_deep_research', p5Sources: 'rnd:v_formula_p5_sources',
    packaging: 'rnd:v_formula_packaging', productIntel: 'rnd:v_formula_product_intel', briefCurrent: 'rnd:v_formula_brief_current',
    rawReviews: 'scout:dovive_reviews',
  });
});

// ── products / roster / selection ───────────────────────────────────────────

test('products: category filter, then selection scope, then the phase chain, in order', async () => {
  const { dash, ev } = scout();
  await ev.products(CAT, 'asin, brand', { selection: ACTIVE, ops: [['not', 'bsr_current', 'is', null], ['order', 'bsr_current', { ascending: true }], ['limit', 5]] });
  assert.deepEqual(dash.queries, [{ table: 'products', calls: [
    ['select', 'asin, brand'], ['eq', 'category_id', CAT], ['eq', 'selected', true], ['order', 'selection_rank', { ascending: true }],
    ['not', 'bsr_current', 'is', null], ['order', 'bsr_current', { ascending: true }], ['limit', 5],
  ] }]);
});

test('products: inactive selection adds nothing; selectOptions pass through for counts', async () => {
  const { dash, ev } = scout(() => ({ data: null, error: null, count: 7 }));
  await ev.products(CAT, 'asin', { selection: INACTIVE, ops: [['limit', 3]] });
  const r = await ev.products(CAT, '*', { selectOptions: { count: 'exact', head: true } });
  assert.equal(r.count, 7);
  assert.deepEqual(dash.callsOn('products'), [
    [['select', 'asin'], ['eq', 'category_id', CAT], ['limit', 3]],
    [['select', '*', { count: 'exact', head: true }], ['eq', 'category_id', CAT]],
  ]);
});

test('products / roster / labelFacts / productIntel read the §5 views under rnd with the same chain', async () => {
  const { dash, dovive, rndClient, ev } = rnd();
  await ev.products(CAT, 'asin', { selection: ACTIVE, ops: [['limit', 2]] });
  await ev.roster(CAT);
  await ev.labelFacts({ categoryId: CAT, asins: ['B1'] });
  await ev.productIntel(CAT, { asins: ['B1'] });
  assert.deepEqual(rndClient.queries, [
    { table: 'v_formula_products', calls: [['select', 'asin'], ['eq', 'category_id', CAT], ['eq', 'selected', true], ['order', 'selection_rank', { ascending: true }], ['limit', 2]] },
    { table: 'v_formula_roster', calls: [['select', ES.ROSTER_COLUMNS], ['eq', 'category_id', CAT]] },
    { table: 'v_formula_label_facts', calls: [['select', ES.LABEL_FACT_COLUMNS], ['eq', 'category_id', CAT], ['in', 'asin', ['B1']]] },
    { table: 'v_formula_product_intel', calls: [['select', 'asin, marketing_analysis'], ['eq', 'category_id', CAT], ['in', 'asin', ['B1']]] },
  ]);
  assert.equal(dash.queries.length + dovive.queries.length, 0, 'rnd read touched Scout');
});

test('selection: products under scout, v_formula_roster under rnd, same columns and filters', async () => {
  const rows = [{ asin: 'B2', selection_rank: 2 }, { asin: 'B1', selection_rank: 1 }];
  const s = scout(() => ({ data: rows, error: null }));
  const sel = await s.ev.selection(CAT);
  assert.equal(sel.active, true);
  assert.equal(sel.ranks.get('B1'), 1);
  const expected = [['select', 'asin, selection_rank'], ['eq', 'category_id', CAT], ['eq', 'selected', true], ['order', 'selection_rank', { ascending: true }], ['limit', 500]];
  assert.deepEqual(s.dash.queries, [{ table: 'products', calls: expected }]);
  const r = rnd(() => ({ data: rows, error: null }));
  assert.equal((await r.ev.selection(CAT)).why, '2 selected competitors');
  assert.deepEqual(r.rndClient.queries, [{ table: 'v_formula_roster', calls: expected }]);
});

// ── P5 per-ASIN grounding ───────────────────────────────────────────────────

test('labelPanels (scout): dovive_ocr by image_index, and the pre-013 retry on error', async () => {
  const s = scout((t, calls) => (calls[0][1].includes('label_product_match') ? { data: null, error: { message: 'column does not exist' } } : { data: [{ supplement_facts: [] }], error: null }));
  const r = await s.ev.labelPanels('B1');
  assert.deepEqual(r, { data: [{ supplement_facts: [] }], error: null });
  assert.deepEqual(s.dovive.callsOn('dovive_ocr'), [
    [['select', ES.P5_OCR_COLUMNS], ['eq', 'asin', 'B1'], ['order', 'image_index', { ascending: true }], ['limit', 8]],
    [['select', ES.P5_OCR_LEGACY_COLUMNS], ['eq', 'asin', 'B1'], ['order', 'image_index', { ascending: true }], ['limit', 8]],
  ]);
  const ok = scout(() => ({ data: [{ supplement_facts: [1] }], error: null }));
  await ok.ev.labelPanels('B1');
  assert.equal(ok.dovive.queries.length, 1, 'no retry when the first read works');
});

test('labelPanels (rnd): one panel per label-facts row, claims from the listing view, no mismatch verdict', async () => {
  const r = rnd((t) => (t === 'v_formula_label_facts'
    ? { data: [{ asin: 'B1', all_nutrients: [{ name: 'Zinc', amount: '10 mg' }], other_ingredients: 'rice flour' }], error: null }
    : { data: { asin: 'B1', claims_on_label: ['vegan'], certifications: ['NSF'] }, error: null }));
  const out = await r.ev.labelPanels('B1', { categoryId: CAT });
  assert.deepEqual(out.data, [{ supplement_facts: [{ name: 'Zinc', amount: '10 mg' }], other_ingredients: 'rice flour', health_claims: ['vegan'], certifications: ['NSF'], label_product_match: null }]);
  assert.deepEqual(r.rndClient.queries, [
    { table: 'v_formula_label_facts', calls: [['select', 'asin, all_nutrients, other_ingredients'], ['eq', 'asin', 'B1'], ['eq', 'category_id', CAT], ['limit', 8]] },
    { table: 'v_formula_listing', calls: [['select', 'asin, claims_on_label, certifications'], ['eq', 'asin', 'B1'], ['eq', 'category_id', CAT], ['limit', 1], ['maybeSingle']] },
  ]);
});

test('listingClaims (scout): dovive_research by asin + exact session keyword', async () => {
  const s = scout(() => ({ data: { title: 'T' }, error: null }));
  assert.deepEqual((await s.ev.listingClaims('B1', { keyword: 'zinc gummies #2' })).data, { title: 'T' });
  assert.deepEqual(s.dovive.queries, [{ table: 'dovive_research', calls: [
    ['select', ES.P5_RESEARCH_COLUMNS], ['eq', 'asin', 'B1'], ['ilike', 'keyword', 'zinc gummies #2'], ['limit', 1], ['maybeSingle'],
  ] }]);
});

test('listingClaims (rnd): roster + listing views mapped to the dovive_research shape', async () => {
  const r = rnd((t) => (t === 'v_formula_roster'
    ? { data: { asin: 'B1', brand: 'Acme', title: 'Acme Zinc', price: 19.99, rating_value: 4.5, rating_count: 812, bsr_current: 1200 }, error: null }
    : { data: { asin: 'B1', feature_bullets_text: 'Vegan\n  \nNo sugar', description_text: 'desc' }, error: null }));
  const out = await r.ev.listingClaims('B1', { keyword: 'ignored', categoryId: CAT });
  assert.deepEqual(out, { data: { title: 'Acme Zinc', brand: 'Acme', description: 'desc', bullet_points: ['Vegan', 'No sugar'], price: 19.99, rating: 4.5, review_count: 812, bsr: 1200 }, error: null });
  assert.deepEqual(r.rndClient.tables(), ['v_formula_roster', 'v_formula_listing']);
  const none = rnd(() => ({ data: null, error: null }));
  assert.deepEqual(await none.ev.listingClaims('B9'), { data: null, error: null });
  const bad = rnd((t) => (t === 'v_formula_listing' ? { data: null, error: { message: 'boom' } } : { data: {}, error: null }));
  assert.deepEqual(await bad.ev.listingClaims('B9'), { data: null, error: { message: 'boom' } });
});

test('marketSignals: dovive_keepa (scout) / v_formula_keepa (rnd), one row', async () => {
  const s = scout();
  await s.ev.marketSignals('B1');
  const expected = [['select', ES.P5_KEEPA_COLUMNS], ['eq', 'asin', 'B1'], ['limit', 1], ['maybeSingle']];
  assert.deepEqual(s.dovive.queries, [{ table: 'dovive_keepa', calls: expected }]);
  const r = rnd();
  await r.ev.marketSignals('B1');
  assert.deepEqual(r.rndClient.queries, [{ table: 'v_formula_keepa', calls: expected }]);
});

// ── reviews ─────────────────────────────────────────────────────────────────

test('reviewThemes: category + product scope through the store, view name under rnd', async () => {
  const row = { keyword: 'kw', themes: [], generated_at: '2026-09-01' };
  const s = scout(() => ({ data: [row], error: null }));
  assert.deepEqual(await s.ev.reviewThemes({ scope: 'category', keyword: 'kw', categoryId: CAT }), row);
  assert.deepEqual(s.dash.tables(), ['dovive_review_synthesis']);
  const r = rnd(() => ({ data: [{ ...row, asin: 'B1' }], error: null }));
  assert.equal((await r.ev.reviewThemes({ scope: 'category', keyword: 'kw' })).keyword, 'kw');
  const prod = await r.ev.reviewThemes({ scope: 'product', keyword: 'kw', asins: ['B1'] });
  assert.ok(prod.B1);
  assert.deepEqual(r.rndClient.tables(), ['v_formula_review_themes', 'v_formula_review_themes']);
  assert.equal(r.dash.queries.length, 0);
  assert.throws(() => s.ev.reviewThemes({ scope: 'asin' }), /scope must be/);
});

test('reviewThemes (rnd): the staleness guard still reads Scout dovive_reviews via reviewsClient', async () => {
  const r = rnd((t) => (t === 'dovive_reviews'
    ? { data: [{ scraped_at: '2026-09-10' }], error: null }
    : { data: [{ keyword: 'kw', themes: [], generated_at: '2026-09-01' }], error: null }));
  const got = await r.ev.reviewThemes({ scope: 'category', keyword: 'kw', reviewsClient: r.dovive, log: () => {} });
  assert.equal(got, null, 'stale synthesis ignored');
  assert.deepEqual(r.dovive.tables(), ['dovive_reviews']);
});

test('rawReviews: Scout dovive_reviews in BOTH backends (RnD holds no raw reviews)', async () => {
  for (const make of [scout, rnd]) {
    const x = make();
    await x.ev.rawReviews(['B1', 'B2'], 'asin, rating', { ops: [['limit', 3]] });
    await x.ev.rawReviews('B1', 'rating');
    assert.deepEqual(x.dovive.queries, [
      { table: 'dovive_reviews', calls: [['select', 'asin, rating'], ['in', 'asin', ['B1', 'B2']], ['limit', 3]] },
      { table: 'dovive_reviews', calls: [['select', 'rating'], ['eq', 'asin', 'B1']] },
    ]);
    if (x.rndClient) assert.equal(x.rndClient.queries.length, 0);
  }
});

// ── category-level evidence ─────────────────────────────────────────────────

test('webClaims / creativeVerdicts: stores, pointed at the RnD views under rnd', async () => {
  const web = { keyword: 'kw', rollup: { ingredient_claims: [] }, ledger: {}, status: 'complete', generated_at: 'x' };
  const cre = { keyword: 'kw', rollup: { products_analyzed: 3 } };
  const respond = (t) => ({ data: [/claims|web/.test(t) ? web : cre], error: null });
  const s = scout(respond);
  assert.equal((await s.ev.webClaims({ keyword: 'kw', categoryId: CAT }, { log: () => {} })).row, web);
  assert.equal(await s.ev.creativeVerdicts({ keyword: 'kw', categoryId: CAT }), cre);
  assert.deepEqual(s.dash.tables(), ['dovive_web_research', 'dovive_marketing_assets']);
  const r = rnd(respond);
  assert.equal((await r.ev.webClaims({ keyword: 'kw' }, { log: () => {} })).row, web);
  assert.equal(await r.ev.creativeVerdicts({ keyword: 'kw' }), cre);
  assert.deepEqual(r.rndClient.tables(), ['v_formula_claims', 'v_formula_creative']);
  assert.equal(r.dash.queries.length, 0);
});

test('deepResearch / p5Sources / packaging chains (scout tables, rnd views)', async () => {
  const s = scout();
  await s.ev.deepResearch({ keyword: 'kw #2', asins: ['B1'], columns: 'asin, pool', ops: [['limit', 20]] });
  await s.ev.deepResearch({ keyword: 'kw #2', columns: 'asin' });
  await s.ev.p5Sources({ keyword: 'kw #2', columns: 'asin, source_url', ops: [['eq', 'source_type', 'brand_site']] });
  await s.ev.p5Sources({ asins: ['B1'], columns: 'asin' });
  await s.ev.packaging({ keyword: 'kw #2', ops: [['maybeSingle']] });
  assert.deepEqual(s.dovive.queries, [
    { table: 'dovive_phase5_research', calls: [['select', 'asin, pool'], ['in', 'asin', ['B1']], ['ilike', 'keyword', 'kw #2'], ['limit', 20]] },
    { table: 'dovive_phase5_research', calls: [['select', 'asin'], ['ilike', 'keyword', 'kw #2']] },
    { table: 'dovive_p5_sources', calls: [['select', 'asin, source_url'], ['eq', 'keyword', 'kw #2'], ['eq', 'source_type', 'brand_site']] },
    { table: 'dovive_p5_sources', calls: [['select', 'asin'], ['in', 'asin', ['B1']]] },
    { table: 'dovive_packaging_intelligence', calls: [['select', ES.PACKAGING_COLUMNS], ['eq', 'keyword', 'kw #2'], ['maybeSingle']] },
  ]);
  const r = rnd();
  await r.ev.deepResearch({ keyword: 'kw', columns: 'asin' });
  await r.ev.p5Sources({ keyword: 'kw', columns: 'asin' });
  await r.ev.packaging({ keyword: 'kw' });
  assert.deepEqual(r.rndClient.tables(), ['v_formula_deep_research', 'v_formula_p5_sources', 'v_formula_packaging']);
});

// ── brief + write bases ─────────────────────────────────────────────────────

test('briefCurrent: formula_briefs (scout) / v_formula_brief_current (rnd), same chain', async () => {
  const s = scout();
  await s.ev.briefCurrent(CAT, { columns: 'id, ingredients', ops: [['limit', 1], ['maybeSingle']] });
  const expected = [['select', 'id, ingredients'], ['eq', 'category_id', CAT], ['limit', 1], ['maybeSingle']];
  assert.deepEqual(s.dash.queries, [{ table: 'formula_briefs', calls: expected }]);
  const r = rnd();
  await r.ev.briefCurrent(CAT, { columns: 'id, ingredients', ops: [['limit', 1], ['maybeSingle']] });
  assert.deepEqual(r.rndClient.queries, [{ table: 'v_formula_brief_current', calls: expected }]);
});

test('briefWriteBase: scout returns the row already read (no query); rnd reads Scout formula_briefs', async () => {
  const row = { id: 9, ingredients: { a: 1 } };
  const s = scout();
  assert.equal(await s.ev.briefWriteBase(CAT, row, { columns: 'id, ingredients', ops: [['maybeSingle']] }), row);
  assert.equal(s.dash.queries.length, 0);
  const scoutRow = { id: 9, ingredients: { a: 1, qa_report: 'x' } };
  const r = rnd(() => ({ data: scoutRow, error: null }));
  assert.equal(await r.ev.briefWriteBase(CAT, { id: 9, ingredients: {} }, { columns: 'id, ingredients', ops: [['limit', 1], ['maybeSingle']] }), scoutRow);
  assert.deepEqual(r.dash.queries, [{ table: 'formula_briefs', calls: [['select', 'id, ingredients'], ['eq', 'category_id', CAT], ['limit', 1], ['maybeSingle']] }]);
  assert.equal(r.rndClient.queries.length, 0);
});

test('productWriteBase: scout maps the rows read (no query); rnd reads Scout products by id', async () => {
  const rows = [{ id: 'p1', marketing_analysis: { a: 1 } }, { id: 'p2' }];
  const s = scout();
  const m = await s.ev.productWriteBase(rows);
  assert.equal(m.get('p1'), rows[0]);
  assert.equal(s.dash.queries.length, 0);
  const r = rnd(() => ({ data: [{ id: 'p1', marketing_analysis: { scout: true } }], error: null }));
  const mr = await r.ev.productWriteBase(rows);
  assert.deepEqual(mr.get('p1'), { id: 'p1', marketing_analysis: { scout: true } });
  assert.equal(mr.has('p2'), false);
  assert.deepEqual(r.dash.queries, [{ table: 'products', calls: [['select', 'id, marketing_analysis'], ['in', 'id', ['p1', 'p2']]] }]);
  const bad = rnd(() => ({ data: null, error: { message: 'nope' } }));
  await assert.rejects(bad.ev.productWriteBase(rows), /Scout write base for products not readable: nope/);
});

test('marketIntel: the store on formula_briefs (scout) / v_formula_brief_current (rnd)', async () => {
  const brief = { id: 1, created_at: 'x', ingredients: { market_intelligence: { ai_market_analysis: 'report' } } };
  const s = scout(() => ({ data: [brief], error: null }));
  const mi = await s.ev.marketIntel(CAT);
  assert.equal(mi.source, 'formula_briefs.ingredients.market_intelligence');
  const expected = [['select', 'id, ingredients, created_at'], ['eq', 'category_id', CAT], ['order', 'created_at', { ascending: false }], ['limit', 1]];
  assert.deepEqual(s.dash.queries, [{ table: 'formula_briefs', calls: expected }]);
  const r = rnd(() => ({ data: [brief], error: null }));
  assert.equal((await r.ev.marketIntel(CAT)).source, 'v_formula_brief_current.ingredients.market_intelligence');
  assert.deepEqual(r.rndClient.queries, [{ table: 'v_formula_brief_current', calls: expected }]);
});

test('scout backend with a missing client fails loudly on the read that needs it', () => {
  const ev = ES.createEvidenceSource({ dash: recordingSupabase(), backend: 'scout' });
  assert.throws(() => ev.marketSignals('B1'), /Scout DOVIVE client was not provided/);
});

test('scout backend never builds or touches an RnD client, even with RND_* set', async () => {
  const dash = recordingSupabase();
  const dovive = recordingSupabase();
  const trap = { from() { throw new Error('RnD client touched under scout'); } };
  const env = { RND_SUPABASE_URL: 'https://x.supabase.co', RND_SUPABASE_ANON_KEY: 'k' };
  for (const e of [env, { ...env, SCOUT_EVIDENCE_SOURCE: '' }, { ...env, SCOUT_EVIDENCE_SOURCE: '  Scout ' }]) {
    const ev = ES.createEvidenceSource({ dash, dovive, env: e, rndClient: trap });
    assert.equal(ev.backend, 'scout');
    await ev.products('c', 'asin');
    await ev.roster('c');
    await ev.selection('c');
    await ev.labelFacts({ categoryId: 'c' });
    await ev.labelPanels('B1', { categoryId: 'c' });
    await ev.listingClaims('B1', { keyword: 'kw', categoryId: 'c' });
    await ev.marketSignals('B1');
    await ev.reviewThemes({ scope: 'category', keyword: 'kw' });
    await ev.reviewThemes({ scope: 'product', keyword: 'kw', asins: ['B1'] });
    await ev.rawReviews('B1', 'rating');
    await ev.webClaims({ keyword: 'kw' }, { log: () => {} });
    await ev.creativeVerdicts({ keyword: 'kw' });
    await ev.deepResearch({ keyword: 'kw', columns: 'asin' });
    await ev.p5Sources({ keyword: 'kw', columns: 'asin' });
    await ev.packaging({ keyword: 'kw' });
    await ev.productIntel('c');
    await ev.briefCurrent('c', { columns: 'id' });
    await ev.marketIntel('c');
    const n = dash.queries.length + dovive.queries.length;
    assert.equal(await ev.briefWriteBase('c', { id: 1 }, { columns: 'id' }).then((r) => r.id), 1);
    await ev.productWriteBase([{ id: 1 }]);
    assert.equal(dash.queries.length + dovive.queries.length, n, 'write bases issue no query under scout');
  }
});
