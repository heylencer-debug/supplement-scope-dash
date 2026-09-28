'use strict';
// P7's market report lives in formula_briefs.ingredients.market_intelligence.
// P7's skip check, P9 and P10 all read it back through utils/market-intel-store.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fakeSupabase } = require('./helpers/fake-supabase');
const { extractMarketIntel, fetchMarketIntel } = require('../utils/market-intel-store');

const P7_PAYLOAD = {
  ai_market_analysis: '# Market report\nCategory is crowded at $25-30.',
  generated_at: '2026-09-28T10:00:00Z',
  grok_model: 'x-model',
  products_analyzed: 80,
  review_coverage: { reviews: 1200 },
};

test('extractMarketIntel reads the key P7 writes', () => {
  const mi = extractMarketIntel({ ai_generated_brief: 'the brief', market_intelligence: P7_PAYLOAD });
  assert.equal(mi.ai_market_analysis, P7_PAYLOAD.ai_market_analysis);
  assert.equal(mi.generated_at, P7_PAYLOAD.generated_at);
  assert.equal(mi.products_analyzed, 80);
  assert.equal(mi.source, 'formula_briefs.ingredients.market_intelligence');
});

test('extractMarketIntel: no key, empty text, or the brief itself → null', () => {
  assert.equal(extractMarketIntel(null), null);
  assert.equal(extractMarketIntel({}), null);
  // the old fallback returned ingredients.ai_generated_brief — the brief is not the market report
  assert.equal(extractMarketIntel({ ai_generated_brief: 'the brief' }), null);
  assert.equal(extractMarketIntel({ market_intelligence: { ai_market_analysis: '   ' } }), null);
  assert.equal(extractMarketIntel({ market_intelligence: 'string' }), null);
});

test('fetchMarketIntel finds the report on the category row', async () => {
  const db = fakeSupabase({
    formula_briefs: [
      { id: 1, category_id: 'other', created_at: '2026-09-28', ingredients: { market_intelligence: { ai_market_analysis: 'wrong category' } } },
      { id: 2, category_id: 'cat', created_at: '2026-09-27', ingredients: { ai_generated_brief: 'brief', market_intelligence: P7_PAYLOAD } },
    ],
  });
  const mi = await fetchMarketIntel(db, 'cat');
  assert.equal(mi.ai_market_analysis, P7_PAYLOAD.ai_market_analysis);
  assert.deepEqual(db.calls.reads, ['formula_briefs']);
});

test('fetchMarketIntel: newest row wins when a category has two', async () => {
  const db = fakeSupabase({
    formula_briefs: [
      { id: 1, category_id: 'cat', created_at: '2026-09-01', ingredients: { market_intelligence: { ai_market_analysis: 'old' } } },
      { id: 2, category_id: 'cat', created_at: '2026-09-20', ingredients: { market_intelligence: { ai_market_analysis: 'new' } } },
    ],
  });
  assert.equal((await fetchMarketIntel(db, 'cat')).ai_market_analysis, 'new');
});

test('fetchMarketIntel fails open: no row, no report, query error, no client', async () => {
  assert.equal(await fetchMarketIntel(fakeSupabase({ formula_briefs: [] }), 'cat'), null);
  assert.equal(await fetchMarketIntel(fakeSupabase({ formula_briefs: [{ id: 1, category_id: 'cat', created_at: 'x', ingredients: { ai_generated_brief: 'b' } }] }), 'cat'), null);
  assert.equal(await fetchMarketIntel(fakeSupabase({}, { missing: ['formula_briefs'] }), 'cat'), null);
  assert.equal(await fetchMarketIntel(null, 'cat'), null);
  assert.equal(await fetchMarketIntel(fakeSupabase({}), null), null);
});

test('P7 skip check, P9 and P10 no longer query the missing table / columns', () => {
  for (const f of ['phase6-market-analysis.js', 'phase8-formula-brief.js', 'phase9-formula-qa.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(src, /from\(\s*['"]market_intelligence['"]\s*\)/, `${f} reads a market_intelligence table`);
    assert.doesNotMatch(src, /\.eq\(\s*['"]brief_type['"]/, `${f} filters on formula_briefs.brief_type`);
    // through the store directly, or through the evidence layer (EV.marketIntel → fetchMarketIntel)
    assert.match(src, /fetchMarketIntel\(DASH, |EV\.marketIntel\(/, `${f} does not read P7's report through the store`);
  }
});
