// P7b end-to-end against an in-memory Supabase fake and a fake vision model.
// No network, no credits, no database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MA = require('../utils/marketing-assets');
const { run, parseOptions, CreditsExhausted } = require('../phase7b-marketing-assets');
const { fetchCategoryMarketingAssets } = require('../utils/marketing-assets-store');
const { fakeSupabase } = require('./helpers/fake-supabase');
const { PRICING } = require('../utils/ai-usage');

const KW = 'magnesium gummies';
const IMG = (id) => `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;

function world({ n = 5, missing = [] } = {}) {
  const products = [];
  const research = [];
  for (let i = 1; i <= n; i++) {
    const asin = `B0TEST000${i}`;
    products.push({
      id: `p${i}`, asin, category_id: 'cat1', title: `Magnesium Gummies ${i}`, brand: `Brand${i}`, bsr_current: i * 10,
      image_urls: [IMG(`61M${i}`), IMG(`51G${i}a`), IMG(`51G${i}b`)], main_image_url: IMG(`61M${i}`),
      feature_bullets_text: i % 2 ? 'Supports restful sleep.' : 'Great tasting berry flavor.',
    });
    research.push({
      asin, keyword: KW, scraped_at: '2026-09-01T00:00:00Z', images: [], main_image: null, plus: i !== 3,
      pd: i !== 3 ? [{ url: `https://m.media-amazon.com/images/S/aplus-media-library-service-media/0000000${i}-aaaa-bbbb-cccc-dddddddddddd.__CR0_.jpg`, type: 'image' }] : [],
      ftb: [], vids: i === 1 ? ['https://www.amazon.com/vdp/abc'] : [], vcount: i === 1 ? 1 : 0, rvids: [],
    });
  }
  // An unrelated product with a worse BSR, outside the top-N scope.
  products.push({ id: 'p99', asin: 'B0OUTSIDE1', category_id: 'cat1', title: 'x', bsr_current: 99999, image_urls: [IMG('61Z')] });
  const dovive = fakeSupabase({ dovive_research: research });
  const dash = fakeSupabase({ products, dovive_marketing_assets: [] }, { missing });
  return { dovive, dash, products };
}

/** Fake vision model: reads the labels it was sent, answers with evidenced JSON. */
function fakeModel(behave = () => {}) {
  const m = { calls: 0, sent: [] };
  m.fn = async (messages) => {
    m.calls++;
    const parts = messages[0].content;
    const labels = parts.filter((p) => p.type === 'text' && /^Image /.test(p.text)).map((p) => p.text.slice(6, -1));
    m.sent.push(labels);
    behave(m.calls, labels);
    const hasA = labels.find((l) => l.startsWith('a+'));
    return {
      content: JSON.stringify({
        target_audience: { who: 'Adults who sleep badly', cues: ['for adults', 'woman in bed'] },
        main_promise: { text: 'Deep, restful sleep', where_seen: 'main' },
        recurring_messages: [
          { message: 'Supports restful sleep', seen_on: ['main', labels[1]] },
          { message: 'Made up without evidence', seen_on: [] },
        ],
        demonstrated_use_cases: [{ use_case: 'Before bed', evidence: 'nightstand scene', seen_on: [labels[1]] }],
        packaging: { format: 'gummies in a bottle', colours: ['purple'], claims_on_pack: [{ claim: 'Sugar free', seen_on: ['main'] }], certifications_shown: [] },
        comparison_table_claims: hasA ? [{ claim: '3x better absorption', vs_who: 'other brands', seen_on: [hasA] }] : [],
        text_seen: [{ label: 'main', text: 'DEEP SLEEP · SUGAR FREE' }],
        images_unreadable: [],
      }),
      cost: 0.012,
    };
  };
  return m;
}

const SYNTH = {
  keyword: KW, generated_at: '2026-09-26T00:00:00Z', status: 'complete',
  ledger: { distinct_asins: ['B0TEST0001', 'B0TEST0002', 'B0TEST0003', 'B0TEST0004', 'B0TEST0005'] },
  themes: [
    { label: 'Helps me sleep through the night', polarity: 'praise', domain: 'product_efficacy', review_count: 140, distinct_products: { count: 4, asins: ['B0TEST0001', 'B0TEST0002', 'B0TEST0003', 'B0TEST0004'] } },
    { label: 'Too sweet, sugary taste', polarity: 'complaint', domain: 'taste_texture', review_count: 30, distinct_products: { count: 2, asins: ['B0TEST0002', 'B0TEST0004'] } },
  ],
};

function opts(extra = {}, env = {}) {
  return { ...parseOptions(['--keyword', KW, '--concurrency', '1'], { OPENROUTER_API_KEY: 'x', P7B_MODEL: 'google/gemini-3.7-flash', P7B_TOP_BSR: '5', ...env }), retryDelayMs: 0, ...extra };
}

function deps(w, model, extra = {}) {
  return {
    dovive: w.dovive,
    dash: w.dash,
    callModel: model.fn,
    resolveCategory: async () => ({ id: 'cat1', name: 'Magnesium Gummies', method: 'test' }),
    loadSelection: async () => ({ active: false, why: 'selection not populated for this category', ranks: new Map() }),
    fetchSynthesis: async () => SYNTH,
    pricing: PRICING,
    log: () => {},
    now: () => Date.parse('2026-09-27T10:00:00Z'),
    ...extra,
  };
}

test('dry run is zero-network: no client, no model, no DB — just the plan and the estimate', async () => {
  const explode = new Proxy({}, { get() { throw new Error('network touched in a dry run'); } });
  const lines = [];
  const res = await run(opts({ dryRun: true }), { dovive: explode, dash: explode, callModel: () => { throw new Error('model called'); }, pricing: PRICING, log: (l) => lines.push(l) });
  assert.equal(res.dryRun, true);
  assert.equal(res.modelCalls, 0);
  assert.equal(res.estimate.with_selection.images, 40 * 8);
  assert.ok(res.estimate.with_selection.cost_usd > 0);
  assert.ok(lines.some((l) => /no DB reads, no model calls, nothing written/.test(l)));
});

test('pre-flight: migration 015 missing → stops before any model call, nothing written', async () => {
  const w = world({ missing: ['dovive_marketing_assets'] });
  const m = fakeModel();
  const res = await run(opts(), deps(w, m));
  assert.equal(res.aborted, 'table_missing');
  assert.equal(m.calls, 0);
  assert.equal(w.dash.calls.upserts.length, 0);
  assert.equal(w.dash.calls.updates.length, 0);
});

test('plan mode reads but never calls the model or writes', async () => {
  const w = world();
  const m = fakeModel();
  const res = await run(opts({ planOnly: true }), deps(w, m));
  assert.equal(res.plan, true);
  assert.equal(m.calls, 0);
  assert.equal(w.dash.calls.upserts.length, 0);
  assert.equal(res.entries.length, 5);
  assert.deepEqual(res.entries[0].images, ['main', 'gallery-2', 'gallery-3', 'a+-1']);
});

test('full run: one call per product, validated rows, roll-up, experienced vs claimed, pointers; videos never analysed', async () => {
  const w = world();
  const m = fakeModel();
  const res = await run(opts(), deps(w, m));
  assert.equal(m.calls, 5, 'top 5 by BSR, one call each; the out-of-scope product is not sent');
  assert.ok(!m.sent.flat().includes(undefined));
  assert.equal(res.status, 'complete');
  assert.equal(res.ledger.products, 5);
  assert.equal(res.ledger.products_analyzed, 5);
  assert.equal(res.ledger.images_available, 5 * 3 + 4);
  assert.equal(res.ledger.images_analyzed, 5 * 3 + 4);
  assert.equal(res.ledger.a_plus_available, 4);
  assert.equal(res.ledger.a_plus_analyzed, 4);
  assert.equal(res.ledger.videos_available, 1);
  assert.equal(res.ledger.videos_analyzed, 0);
  assert.equal(res.ledger.claims_dropped_unevidenced, 5, 'the unevidenced message is dropped on every product');
  assert.equal(res.ledger.scope.mode, 'top_bsr');

  const table = w.dash.tables.dovive_marketing_assets;
  assert.equal(table.length, 6);
  const cat = table.find((r) => r.scope === 'category');
  assert.equal(cat.rollup.recurring_messages.find((x) => x.key === 'sleep').products, 5);
  assert.ok(!('_claims' in cat.rollup));
  const byGroup = Object.fromEntries(cat.experienced_vs_claimed.items.map((i) => [i.benefit_group, i]));
  assert.equal(byGroup.sleep.verdict, 'experienced');
  assert.equal(byGroup.sleep.review_support.rule, 'synonym:sleep');
  assert.equal(byGroup.absorption.verdict, 'claimed_only');
  assert.equal(byGroup.absorption.claim_surface, 'comparison_table_only');
  assert.equal(byGroup.taste.verdict, 'contradicted', 'bullets claim taste, reviews only complain about it');

  const p1 = table.find((r) => r.asin === 'B0TEST0001');
  assert.equal(p1.status, 'complete');
  assert.equal(p1.batch_results.key, MA.assetKey(p1.assets.selected_images));
  assert.deepEqual(p1.analysis.recurring_messages.map((x) => x.message), ['Supports restful sleep']);
  assert.deepEqual(p1.assets.per_image.find((x) => x.label === 'main').messages, ['Supports restful sleep']);
  const pointer = w.dash.tables.products.find((p) => p.asin === 'B0TEST0001').marketing_asset_analysis;
  assert.equal(pointer.source, 'dovive_marketing_assets');
  assert.equal(pointer.main_promise, 'Deep, restful sleep');

  // Consumers read it back through the store.
  const row = await fetchCategoryMarketingAssets(w.dash, { keyword: KW });
  assert.equal(row.rollup.products_analyzed, 5);
  assert.match(MA.formatMarketingAssetsForPrompt(row), /EXPERIENCED: Sleep/);
});

test('resume: an unchanged gallery is never re-sent; a changed one is; the whole phase skips when nothing changed', async () => {
  const w = world();
  await run(opts(), deps(w, fakeModel()));

  const again = fakeModel();
  const skipped = await run(opts(), deps(w, again));
  assert.equal(skipped.skipped, 'current');
  assert.equal(again.calls, 0);

  // Same galleries but the P3b synthesis changed → roll-up redone, $0.
  const resynth = fakeModel();
  const r2 = await run(opts(), deps(w, resynth, { fetchSynthesis: async () => ({ ...SYNTH, generated_at: '2026-09-27T00:00:00Z' }) }));
  assert.equal(resynth.calls, 0);
  assert.equal(r2.ledger.products_cached, 5);
  assert.equal(r2.status, 'complete');

  // One product's gallery changes → exactly one call.
  w.dash.tables.products.find((p) => p.asin === 'B0TEST0002').image_urls.push(IMG('51NEW'));
  const changed = fakeModel();
  const r3 = await run(opts(), deps(w, changed, { fetchSynthesis: async () => ({ ...SYNTH, generated_at: '2026-09-27T00:00:00Z' }) }));
  assert.equal(changed.calls, 1);
  assert.equal(r3.ledger.products_cached, 4);

  // --force re-sends everything.
  const forced = fakeModel();
  await run(opts({ force: true }), deps(w, forced));
  assert.equal(forced.calls, 5);
});

test('credits exhausted mid-run → partial, the rest not attempted; the next run sends only those', async () => {
  const w = world();
  const m = fakeModel((n) => { if (n === 3) throw new CreditsExhausted('[ERROR: credits] OpenRouter credits exhausted (402)'); });
  const res = await run(opts(), deps(w, m));
  assert.equal(res.status, 'partial');
  assert.equal(res.ledger.products_analyzed, 2);
  assert.equal(res.ledger.products_not_attempted, 3);
  assert.match(res.ledger.stopped, /credits/);
  const statuses = w.dash.tables.dovive_marketing_assets.filter((r) => r.scope === 'product').map((r) => r.status).sort();
  assert.deepEqual(statuses, ['complete', 'complete', 'not_attempted', 'not_attempted', 'not_attempted']);

  const next = fakeModel();
  const r2 = await run(opts(), deps(w, next));
  assert.equal(next.calls, 3);
  assert.equal(r2.status, 'complete');
});

test('a failing product is recorded as failed (after one retry) and does not stop the others', async () => {
  const w = world();
  const m = fakeModel((n, labels) => { if (labels.includes('a+-1') && m.sent.length <= 2) throw new Error('OpenRouter 400: bad image'); });
  const res = await run(opts(), deps(w, m));
  assert.equal(res.ledger.products_failed, 1);
  assert.equal(res.ledger.products_analyzed, 4);
  assert.equal(res.status, 'partial');
  const failed = w.dash.tables.dovive_marketing_assets.find((r) => r.status === 'failed');
  assert.match(failed.batch_results.error, /bad image/);
  assert.equal(failed.analysis, null);
});

test('scope follows the competitor selection (rank order, capped) when one exists', async () => {
  const w = world();
  const m = fakeModel();
  const ranks = new Map([['B0TEST0004', 1], ['B0OUTSIDE1', 2], ['B0TEST0002', 3]]);
  const res = await run(opts({}, { P7B_MAX_PRODUCTS: '2' }), deps(w, m, { loadSelection: async () => ({ active: true, why: '3 selected competitors', ranks }) }));
  assert.equal(res.ledger.scope.mode, 'selection');
  assert.deepEqual(res.productRows.map((r) => r.asin), ['B0TEST0004', 'B0OUTSIDE1']);
  assert.equal(m.calls, 2);
});

test('no OPENROUTER_API_KEY → inventory only, $0, still written', async () => {
  const w = world();
  const m = fakeModel();
  const res = await run({ ...opts(), hasModelKey: false }, deps(w, m));
  assert.equal(m.calls, 0);
  assert.equal(res.status, 'inventory_only');
  assert.ok(w.dash.tables.dovive_marketing_assets.every((r) => r.scope === 'category' || r.status === 'inventory_only'));
  assert.ok(res.evc.items.every((i) => i.claim_surface === 'bullets_only'), 'only the deterministic bullet claims exist');
});
