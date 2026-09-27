'use strict';
// A truncated (finish_reason 'length') or unparseable theme reply is SPLIT,
// never re-sent identically (2026-09-27 live finding: 11 of 15 batches lost).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { synthesize, parseOptions } = require('../phase3b-review-synthesis');
const RS = require('../utils/review-synthesis');
const { fakeSupabase } = require('./helpers/fake-supabase');
const fixture = require('./fixtures/magnesium-gummies-reviews.json');
const KW = 'magnesium gummies';

function world() {
  const reviews = fixture.map((r) => ({ ...r, keyword: KW, scraped_at: '2026-08-27T21:40:00.000Z' }));
  const asins = [...new Set(reviews.map((r) => r.asin))];
  const dovive = fakeSupabase({ dovive_reviews: reviews });
  const dash = fakeSupabase({
    products: asins.map((a, i) => ({ id: `p${i}`, asin: a, category_id: 'cat1', review_analysis: { legacy: true } })),
    dovive_review_synthesis: [],
  });
  return { dovive, dash, reviews };
}
const reviewLines = (prompt) => prompt.split('\n').filter((l) => /^\d+ \| P\S+ \| \d★ \|/.test(l)).length;
function themesFor(prompt) {
  const neg = []; const pos = [];
  for (const line of prompt.split('\n')) {
    const x = line.match(/^(\d+) \| P\S+ \| (\d)★ \|/);
    if (!x) continue;
    if (Number(x[2]) <= 2) neg.push(Number(x[1])); else if (Number(x[2]) >= 4) pos.push(Number(x[1]));
  }
  const themes = [];
  if (neg.length) themes.push({ label: 'Unpleasant taste', domain: 'taste_texture', polarity: 'complaint', review_ids: neg, opposite_review_ids: [] });
  if (pos.length) themes.push({ label: 'Great taste', domain: 'taste_texture', polarity: 'praise', review_ids: pos, opposite_review_ids: [] });
  return themes;
}
const baseOpts = (batch) => ({ ...parseOptions(['--keyword', KW, '--batch', String(batch), '--concurrency', '1'], { OPENROUTER_API_KEY: 'x', ANALYSIS_MODEL: 'test/model' }), retryDelayMs: 0 });
const deps = (w, fn, logs) => ({ dovive: w.dovive, dash: w.dash, callModel: fn, resolveCategory: async () => ({ id: 'cat1', name: KW, method: 'test' }), log: (m) => logs.push(m), now: () => Date.parse('2026-09-27T00:00:00Z') });

test('a truncated reply is split into halves that each get their own call; nothing is re-sent identically; the batch counts as themed', async () => {
  const w = world();
  const prompts = [];
  const fn = async (prompt) => {
    prompts.push(prompt);
    if (prompt.includes('THEMES:')) return { content: '{"groups":[]}', cost: 0.001, finish_reason: 'stop' };
    if (reviewLines(prompt) > 30) return { content: '{"themes":[{"label":"Unpleasant taste","domain":"taste_texture","polarity":"complaint","review_ids":[1', cost: 0.15, finish_reason: 'length', completion_tokens: 16000 };
    return { content: JSON.stringify({ themes: themesFor(prompt) }), cost: 0.05, finish_reason: 'stop' };
  };
  const logs = [];
  const out = await synthesize(baseOpts(50), deps(w, fn, logs));
  const batches = RS.buildBatches(RS.applyCap(RS.prepareReviews(w.reviews).reviews, 12000).analyzed, 50);
  assert.equal(out.ledger.theme_pass.batches_failed, 0, 'every batch recovered through the split');
  assert.equal(out.status, 'complete');
  assert.equal(out.ledger.reviews_in_failed_batches, 0);
  const batchPrompts = prompts.filter((p) => !p.includes('THEMES:'));
  assert.equal(new Set(batchPrompts).size, batchPrompts.length, 'no identical prompt was ever sent twice');
  const big = batches.filter((b) => b.length > 30).length;
  assert.ok(logs.some((l) => /splitting \d+ reviews into \d+ \+ \d+/.test(l)), 'the split is logged');
  assert.ok(logs.some((l) => /truncated at 16000 output tokens/.test(l)), 'truncation is named with its token count');
  assert.equal(batchPrompts.length, batches.length + big * 2, 'one failed call + two half calls per big batch');
});

test('a small unparseable batch (below the split floor) fails once, is not re-sent, and is counted as failed', async () => {
  const w = world();
  let n = 0;
  const fn = async (prompt) => {
    if (prompt.includes('THEMES:')) return { content: '{"groups":[]}', cost: 0.001, finish_reason: 'stop' };
    n++;
    if (n === 1) return { content: 'not json at all', cost: 0.05, finish_reason: 'stop' };
    return { content: JSON.stringify({ themes: themesFor(prompt) }), cost: 0.05, finish_reason: 'stop' };
  };
  const out = await synthesize(baseOpts(25), deps(w, fn, []));
  assert.equal(out.ledger.theme_pass.batches_failed, 1);
  assert.equal(out.status, 'partial');
  const batches = RS.buildBatches(RS.applyCap(RS.prepareReviews(w.reviews).reviews, 12000).analyzed, 25);
  assert.equal(n, batches.length, 'the unparseable batch was not re-sent (one call per batch)');
});
