// P3b end-to-end against an in-memory Supabase fake and a fake model.
// No network, no credits, no database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const RS = require('../utils/review-synthesis');
const { synthesize, CreditsExhausted, parseOptions } = require('../phase3b-review-synthesis');
const { fetchCategorySynthesis, fetchProductSyntheses } = require('../utils/review-synthesis-store');
const { fakeSupabase } = require('./helpers/fake-supabase');

const FIXTURE = require(path.join(__dirname, 'fixtures', 'magnesium-gummies-reviews.json'));
const KW = 'magnesium gummies';
const SCRAPED = '2026-08-27T21:40:00.000Z';

function world({ missing = [] } = {}) {
  const reviews = FIXTURE.map((r) => ({ ...r, keyword: KW, scraped_at: SCRAPED }));
  const asins = [...new Set(reviews.map((r) => r.asin))];
  const dovive = fakeSupabase({ dovive_reviews: reviews });
  const dash = fakeSupabase({
    products: asins.map((a, i) => ({ id: `p${i}`, asin: a, category_id: 'cat1', review_analysis: { legacy: true } })),
    dovive_review_synthesis: [],
  }, { missing });
  return { dovive, dash, reviews };
}

/**
 * Fake model: reads review ids + stars off the batch prompt and returns one
 * complaint theme (≤2★) and one praise theme (≥4★). `behave(callNo)` may throw.
 */
function fakeModel(behave = () => {}) {
  const m = { calls: 0 };
  m.fn = async (prompt) => {
    m.calls++;
    behave(m.calls, prompt);
    if (prompt.includes('THEMES:')) return { content: '{"groups":[]}', cost: 0.001 };
    const neg = []; const pos = [];
    for (const line of prompt.split('\n')) {
      const x = line.match(/^(\d+) \| P\S+ \| (\d)★ \|/);
      if (!x) continue;
      if (Number(x[2]) <= 2) neg.push(Number(x[1])); else if (Number(x[2]) >= 4) pos.push(Number(x[1]));
    }
    const themes = [];
    if (neg.length) themes.push({ label: 'Unpleasant taste', domain: 'taste_texture', polarity: 'complaint', review_ids: neg, opposite_review_ids: [] });
    if (pos.length) themes.push({ label: 'Great taste', domain: 'taste_texture', polarity: 'praise', review_ids: pos, opposite_review_ids: [] });
    return { content: JSON.stringify({ themes }), cost: 0.01 };
  };
  return m;
}

function opts(extra = {}) {
  return { ...parseOptions(['--keyword', KW, '--batch', '25', '--concurrency', '1'], { OPENROUTER_API_KEY: 'x', ANALYSIS_MODEL: 'test/model' }), retryDelayMs: 0, ...extra };
}

function deps(w, model, extra = {}) {
  return {
    dovive: w.dovive,
    dash: w.dash,
    callModel: model.fn,
    resolveCategory: async () => ({ id: 'cat1', name: KW, method: 'test' }),
    log: () => {},
    now: () => Date.parse('2026-09-26T00:00:00Z'),
    ...extra,
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ── M1 ─────────────────────────────────────────────────────────────────────
test('M1: missing table aborts BEFORE any model call and writes nothing', async () => {
  const w = world({ missing: ['dovive_review_synthesis'] });
  const model = fakeModel();
  const logs = [];
  const out = await synthesize(opts(), deps(w, model, { log: (s) => logs.push(s) }));
  assert.equal(out.aborted, 'table_missing');
  assert.equal(model.calls, 0);
  assert.equal(w.dash.calls.upserts.length, 0);
  assert.equal(w.dash.calls.updates.length, 0);
  assert.ok(!w.dovive.calls.reads.includes('dovive_reviews'), 'does not even read the reviews');
  assert.ok(logs.some((l) => /migration 012 not applied/.test(l)));
  assert.equal(RS.isMissingTableError({ code: '42P01', message: 'relation "x" does not exist' }), true);
  assert.equal(RS.isMissingTableError({ code: '23505', message: 'duplicate key' }), false);
});

// ── H2 + H1 ────────────────────────────────────────────────────────────────
test('H2/H1: themed = successful batch sizes only; failed batch is counted and propagates to product ledgers', async () => {
  const w = world();
  const model = fakeModel((n, prompt) => { if (!prompt.includes('THEMES:') && (n === 2 || n === 3)) throw new Error('boom'); }); // batch 2 fails both attempts
  const out = await synthesize(opts(), deps(w, model));
  const l = out.ledger;
  const tp = l.theme_pass;
  const batches = RS.buildBatches(RS.applyCap(RS.prepareReviews(w.reviews).reviews, 12000).analyzed, 25);
  assert.equal(tp.batches, batches.length);
  assert.equal(tp.batches_failed, 1);
  assert.equal(l.reviews_in_failed_batches, batches[1].length);
  assert.equal(l.reviews_theme_analyzed, sum(batches.filter((_, i) => i !== 1).map((b) => b.length)));
  assert.equal(l.rating_only_reviews, l.reviews_analyzed - sum(batches.map((b) => b.length)));
  assert.equal(l.reviews_theme_analyzed + l.reviews_in_failed_batches + l.rating_only_reviews, l.reviews_analyzed);
  assert.equal(out.status, 'partial');
  assert.match(RS.formatLedgerLine(l), new RegExp(`${l.reviews_collected} unique reviews collected · ${l.reviews_theme_analyzed} themed · ${l.rating_only_reviews} rating-only · ${l.reviews_in_failed_batches} in failed batches`));
  assert.match(RS.formatLedgerLine(l), /PARTIAL/);
  // share denominator = themed reviews
  const t = out.themes.find((x) => x.label === 'Unpleasant taste');
  assert.equal(t.share_of_analyzed, Math.round((t.review_count / l.reviews_theme_analyzed) * 1000) / 1000);

  // H1 — per product
  const failedIds = new Set(batches[1].map((r) => r.id));
  const hit = out.productRows.find((p) => RS.prepareReviews(w.reviews).reviews.some((r) => failedIds.has(r.id) && r.asins.includes(p.asin)));
  assert.ok(hit.ledger.reviews_in_failed_batches > 0);
  assert.equal(hit.status, 'partial');
  assert.equal(hit.ledger.theme_pass.category_status, 'partial');
  const ev = RS.buildProductEvidence(hit);
  assert.equal(ev.status, 'partial');
  const block = RS.formatProductEvidenceForPrompt(hit);
  assert.ok(!/^All /.test(block), 'never claims all reviews were analyzed');
  assert.match(block, /\d+ in failed batches \(.*\) — PARTIAL, counts are a lower bound/);
  // the evidence merged into products.review_analysis carries the status
  const upd = w.dash.calls.updates.find((u) => u.table === 'products' && u.payload.review_analysis.review_evidence.status === 'partial');
  assert.ok(upd && upd.payload.review_analysis.legacy === true, 'legacy fields kept');
});

test('H2: after a 402 the remaining batches are NOT counted as sent; themes not attempted is reported', async () => {
  const w = world();
  const model = fakeModel((n) => { if (n >= 3) throw new CreditsExhausted('[ERROR: credits] 402'); });
  const out = await synthesize(opts(), deps(w, model));
  const tp = out.ledger.theme_pass;
  const batches = RS.buildBatches(RS.applyCap(RS.prepareReviews(w.reviews).reviews, 12000).analyzed, 25);
  assert.equal(tp.batches_ok, 2);
  assert.equal(tp.batches_failed, 0);
  assert.equal(tp.batches_not_attempted, batches.length - 2);
  assert.equal(tp.reviews_sent, batches[0].length + batches[1].length);
  assert.equal(out.ledger.reviews_themes_not_attempted, sum(batches.slice(2).map((b) => b.length)));
  assert.equal(out.status, 'partial');
  assert.match(RS.formatLedgerLine(out.ledger), /themes not attempted for \d+ reviews/);
  assert.equal(model.calls, 3, 'no label merge / no further calls after the 402');
});

// ── resume ─────────────────────────────────────────────────────────────────
test('resume: a partial run re-sends ONLY the batches that did not succeed; a complete run is skipped', async () => {
  const w = world();
  const first = fakeModel((n) => { if (n >= 3) throw new CreditsExhausted('402'); });
  const r1 = await synthesize(opts(), deps(w, first));
  const nBatches = r1.ledger.theme_pass.batches;
  assert.equal(Object.keys(w.dash.tables.dovive_review_synthesis.find((r) => r.scope === 'category').batch_results).length, 2);

  const second = fakeModel();
  const r2 = await synthesize(opts(), deps(w, second, { now: () => Date.parse('2026-09-27T00:00:00Z') }));
  assert.equal(r2.ledger.theme_pass.batches_reused, 2);
  assert.equal(r2.ledger.theme_pass.reviews_sent, sum(RS.buildBatches(RS.applyCap(RS.prepareReviews(w.reviews).reviews, 12000).analyzed, 25).slice(2).map((b) => b.length)));
  assert.equal(second.calls, (nBatches - 2) + 1, 'missing batches + one label-merge call');
  assert.equal(r2.status, 'complete');
  assert.equal(r2.ledger.reviews_theme_analyzed + r2.ledger.rating_only_reviews, r2.ledger.reviews_analyzed);

  const third = fakeModel();
  const r3 = await synthesize(opts(), deps(w, third));
  assert.equal(r3.skipped, 'current');
  assert.equal(third.calls, 0);
});

test('suspect batch (>10% unknown ids) downgrades status and is not cached', async () => {
  const w = world();
  const model = fakeModel();
  const inner = model.fn;
  let n = 0;
  model.fn = async (p) => {
    const r = await inner(p);
    n++;
    if (n <= 1 && !p.includes('THEMES:')) { // batch 1's one call cites many unknown ids (a suspect reply is never re-sent identically — 2026-09-27)
      const j = JSON.parse(r.content);
      j.themes[0].review_ids.push(...Array.from({ length: 10 }, (_, k) => 900000 + k));
      return { ...r, content: JSON.stringify(j) };
    }
    return r;
  };
  const out = await synthesize(opts(), deps(w, model));
  assert.equal(out.ledger.theme_pass.batches_with_dropped_ids, 1);
  assert.equal(out.status, 'partial');
  const cat = w.dash.tables.dovive_review_synthesis.find((r) => r.scope === 'category');
  assert.equal(Object.keys(cat.batch_results).length, out.ledger.theme_pass.batches - 1);
});

test('--no-model: nothing sent, headline says themes not attempted, status deterministic_only', async () => {
  const w = world();
  const model = fakeModel();
  const out = await synthesize(opts({ noModel: true }), deps(w, model));
  assert.equal(model.calls, 0);
  assert.equal(out.status, 'deterministic_only');
  assert.equal(out.ledger.reviews_theme_analyzed, null);
  assert.match(RS.formatLedgerLine(out.ledger), /themes not attempted for \d+ reviews/);
  assert.ok(out.productRows.every((p) => p.status === 'deterministic_only' || p.ledger.reviews_with_text === 0));
});

test('--dry-run: no model, no writes', async () => {
  const w = world();
  const model = fakeModel();
  const out = await synthesize(opts({ dryRun: true }), deps(w, model));
  assert.equal(out.dryRun, true);
  assert.equal(model.calls, 0);
  assert.equal(w.dash.calls.upserts.length + w.dash.calls.updates.length, 0);
});

// ── sibling sessions ───────────────────────────────────────────────────────
test('SCOUT_REUSE_KEYWORDS: category ASINs with no own reviews are read from the freshest sibling session only', async () => {
  const w = world();
  w.dash.tables.products.push({ id: 'pX', asin: 'B0SIBLING1', category_id: 'cat1', review_analysis: null });
  const sib = (kw, at, id) => ({ id, asin: 'B0SIBLING1', keyword: kw, rating: 1, body: `Arrived melted into one lump, session ${kw}.`, scraped_at: at, raw_json: { raw: { review_id: `RS${id}` } } });
  w.dovive.tables.dovive_reviews.push(sib('Magnesium Gummies #2', '2026-09-20T00:00:00Z', 990001), sib('magnesium gummies #3', '2026-09-01T00:00:00Z', 990002));
  const o = { ...opts({ noModel: true }), ...parseOptions(['--keyword', KW, '--no-model'], { SCOUT_REUSE_KEYWORDS: 'magnesium gummies #2, magnesium gummies #3', SCOUT_REUSE_MAX_AGE_DAYS: '60' }) };
  const out = await synthesize(o, deps(w, fakeModel()));
  assert.deepEqual(out.ledger.reused_from, { 'Magnesium Gummies #2': 1 });
  assert.ok(out.ledger.distinct_asins.includes('B0SIBLING1'));
});

// ── M2 ─────────────────────────────────────────────────────────────────────
test('M2: consumers ignore a synthesis older than the latest scrape, and say so', async () => {
  const reviews = fakeSupabase({ dovive_reviews: [{ keyword: KW, scraped_at: '2026-09-20T00:00:00Z' }] });
  const store = fakeSupabase({
    dovive_review_synthesis: [
      { keyword: KW, scope: 'category', asin: null, themes: [{ label: 'x' }], ledger: {}, generated_at: '2026-09-10T00:00:00Z' },
      { keyword: KW, scope: 'product', asin: 'A1', themes: [], ledger: {}, generated_at: '2026-09-10T00:00:00Z' },
    ],
  });
  const logs = [];
  assert.equal(await fetchCategorySynthesis(store, { keyword: KW, reviewsClient: reviews, log: (s) => logs.push(s) }), null);
  assert.deepEqual(await fetchProductSyntheses(store, { keyword: KW, reviewsClient: reviews, log: (s) => logs.push(s) }), {});
  assert.equal(logs.filter((l) => /Ignoring .* review synthesis .* scraped again/.test(l)).length, 2);

  store.tables.dovive_review_synthesis.forEach((r) => { r.generated_at = '2026-09-21T00:00:00Z'; });
  assert.ok(await fetchCategorySynthesis(store, { keyword: KW, reviewsClient: reviews }));
  assert.ok((await fetchProductSyntheses(store, { keyword: KW, reviewsClient: reviews })).A1);
  // no reviews client → no staleness check (back-compat)
  store.tables.dovive_review_synthesis.forEach((r) => { r.generated_at = '2026-01-01T00:00:00Z'; });
  assert.ok(await fetchCategorySynthesis(store, { keyword: KW }));
  // missing table → null, never throws
  const gone = fakeSupabase({}, { missing: ['dovive_review_synthesis'] });
  assert.equal(await fetchCategorySynthesis(gone, { keyword: KW, reviewsClient: reviews }), null);
});
