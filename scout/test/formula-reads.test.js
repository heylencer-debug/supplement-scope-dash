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
