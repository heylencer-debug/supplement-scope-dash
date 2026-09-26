'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const P5b = require('../phase5b-web-research');
const { fakeSupabase } = require('./helpers/fake-supabase');
const F = require('./fixtures/web-pages');

const NOW = Date.parse('2026-09-27T12:00:00Z');
const CAT = 'cat-1';

function db(extra = {}, opts = {}) {
  return fakeSupabase({
    products: [
      { asin: 'B0ABCDEF12', brand: 'Calmwell', title: 'Calmwell Magnesium Gummies', bsr_current: 10, category_id: CAT, feature_bullets_text: F.amazonListingText, description_text: null },
      { asin: 'B0RESTEASY', brand: 'RestEasy', title: 'RestEasy Gummies', bsr_current: 20, category_id: CAT, feature_bullets_text: 'Raspberry flavour sleep gummies for adults.', description_text: null },
      { asin: 'B0NIGHTLY1', brand: 'Nightly Minerals', title: 'Nightly', bsr_current: 30, category_id: CAT },
    ],
    dovive_p5_sources: [{ asin: 'B0ABCDEF12', keyword: 'magnesium gummies', source_type: 'brand_site', source_url: 'https://www.calmwell.com/products/x' }],
    dovive_web_research: [],
    ...extra,
  }, opts);
}

const PAGES = {
  'https://gummyreviews.com/best': F.affiliateReview,
  'https://healthnewsdaily.example/best': F.syndicatedCopy,
  'https://calmwell.com/products/magnesium-gummies': F.brandPage,
  'https://sleepblog.example/blog/resteasy': F.sponsoredPost,
  'https://mineralguide.org/magnesium-gummies': F.independentGuide,
  'https://old.reddit.com/r/Supplements/comments/abc/calmwell': F.redditThread,
  'https://blocked.example/secret/page': F.independentGuide,
};

const SEARCH = {
  best_of: ['https://gummyreviews.com/best', 'https://healthnewsdaily.example/best', 'https://www.amazon.com/dp/B0ABCDEF12'],
  review: ['https://gummyreviews.com/best', 'https://sleepblog.example/blog/resteasy'],
  buying_guide: ['https://mineralguide.org/magnesium-gummies', 'https://blocked.example/secret/page'],
  forum: ['https://www.reddit.com/r/Supplements/comments/abc/calmwell'],
  brand_site: ['https://calmwell.com/products/magnesium-gummies'],
};

// Quotes each fixture really contains (plus one invented quote to be dropped).
const EXTRACT = {
  'https://gummyreviews.com/best': {
    ingredient_claims: [
      { claim: 'glycinate improves sleep quality', ingredient: 'magnesium glycinate', quote: 'Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep' },
      { claim: 'invented', ingredient: 'magnesium glycinate', quote: 'this sentence is not on the page at all' },
    ],
    comparison_criteria: [{ criterion: 'elemental magnesium per serving', quote: 'We compared elemental magnesium per serving' }],
    weaknesses: [{ product: 'RestEasy', point: 'added sugar per serving', quote: 'the 4 grams of added sugar per serving' }],
    pricing: [{ product: 'Calmwell', price_text: '$24.99', quote: 'Calmwell costs $24.99 for 60 gummies' }],
  },
  'https://calmwell.com/products/magnesium-gummies': {
    ingredient_claims: [{ claim: 'glycinate supports restful sleep quality', ingredient: 'magnesium glycinate', quote: 'Clinically studied magnesium glycinate supports restful sleep' }],
    strengths: [{ product: 'Calmwell', point: 'third-party tested for purity', quote: 'Third-party tested for purity and potency' }],
  },
  'https://mineralguide.org/magnesium-gummies': {
    comparison_criteria: [{ criterion: 'elemental magnesium per serving', quote: 'check the elemental magnesium per serving before anything else' }],
    ingredient_claims: [{ claim: 'glycinate better absorbed than oxide', ingredient: 'magnesium glycinate', quote: 'glycinate and citrate are better absorbed than oxide in most studies' }],
  },
  'https://www.reddit.com/r/Supplements/comments/abc/calmwell': {
    weaknesses: [{ product: 'Calmwell', point: 'bitter aftertaste', quote: 'the bitter aftertaste is real' }],
  },
  'https://sleepblog.example/blog/resteasy': {
    strengths: [{ product: 'RestEasy', point: 'raspberry taste', quote: 'They taste like fresh raspberries' }],
  },
};

function fakeModel(calls, { failWith } = {}) {
  return async (prompt) => {
    calls.push(prompt);
    if (failWith) throw failWith;
    const pages = [...prompt.matchAll(/=== PAGE (P\d+) ===\nURL: (\S+)/g)].map((m) => ({ id: m[1], url: m[2] }));
    return { content: JSON.stringify({ pages: pages.map((p) => ({ id: p.id, ...(EXTRACT[p.url] || {}) })) }), cost: 0.01 };
  };
}

function deps(dbs, over = {}) {
  const calls = { search: [], fetch: [], text: [], model: [], usage: [] };
  const d = {
    dovive: dbs,
    dash: dbs,
    now: () => NOW,
    log: () => {},
    resolveCategory: async () => ({ id: CAT, name: 'Magnesium Gummies', method: 'exact' }),
    loadSelection: async () => ({ active: false, why: 'selection not populated for this category', ranks: new Map() }),
    search: async (q) => { calls.search.push(q); return { ok: true, status: 200, results: (SEARCH[q.intent] || []).map((url, i) => ({ url, title: `r${i}` })), cost_usd: 0.005 }; },
    fetchPage: async (url) => { calls.fetch.push(url); return PAGES[url] ? { ok: true, status: 200, html: PAGES[url], via: 'http' } : { ok: false, status: 404, error: 'HTTP 404' }; },
    fetchText: async (url) => { calls.text.push(url); return url === 'https://blocked.example/robots.txt' ? { ok: true, text: 'User-agent: *\nDisallow: /secret' } : { ok: false, status: 404, text: '' }; },
    callModel: fakeModel(calls.model),
    recordUsage: async (row) => { calls.usage.push(row); },
    pricing: require('../utils/ai-usage').PRICING,
    ...over,
  };
  return { d, calls };
}

const baseOpts = (o = {}) => ({ ...P5b.parseOptions(['--keyword', 'magnesium gummies'], { PERPLEXITY_API_KEY: 'k', OPENROUTER_API_KEY: 'k' }), ...o });

test('parseOptions: defaults and caps from env', () => {
  const o = P5b.parseOptions(['--keyword', 'x', '--dry-run'], { P5B_MAX_QUERIES: '5', P5B_MAX_PAGES: '7', P5B_VERIFY: '1' });
  assert.equal(o.maxQueries, 5);
  assert.equal(o.maxPages, 7);
  assert.equal(o.verify, true);
  assert.equal(o.dryRun, true);
  assert.equal(o.freshDays, 30);
  assert.equal(o.hasSearchKey, false);
  const d = P5b.parseOptions(['--keyword', 'x'], {});
  assert.equal(d.maxQueries, 12);
  assert.equal(d.maxPages, 20);
  assert.equal(d.verify, false);
  assert.equal(d.model, 'anthropic/claude-sonnet-5');
});

test('pre-flight: migration 014 missing → stops before any search, fetch or model call', async () => {
  const dbs = db({}, { missing: ['dovive_web_research'] });
  const { d, calls } = deps(dbs);
  const r = await P5b.research(baseOpts(), d);
  assert.equal(r.aborted, 'table_missing');
  assert.equal(calls.search.length + calls.fetch.length + calls.model.length + calls.text.length, 0);
});

test('freshness: a complete row within P5B_FRESH_DAYS is skipped; --force redoes it', async () => {
  const dbs = db({ dovive_web_research: [{ keyword: 'magnesium gummies', status: 'complete', generated_at: '2026-09-20T00:00:00Z' }] });
  const { d, calls } = deps(dbs);
  const r = await P5b.research(baseOpts(), d);
  assert.equal(r.skipped, 'fresh');
  assert.equal(calls.search.length, 0);
  const { d: d2, calls: c2 } = deps(dbs);
  await P5b.research(baseOpts({ force: true }), d2);
  assert.ok(c2.search.length > 0);
});

test('dry run: prints the plan, zero search / fetch / model / robots calls, nothing written', async () => {
  const dbs = db();
  const { d, calls } = deps(dbs);
  const r = await P5b.research(baseOpts({ dryRun: true }), d);
  assert.equal(r.dryRun, true);
  assert.ok(r.plan.length > 6 && r.plan.length <= 12);
  assert.ok(r.plan.some((q) => q.display === 'Calmwell magnesium gummies site:calmwell.com'), 'brand domain from P5 sources');
  assert.ok(r.estimate.max_usd > r.estimate.typical_usd && r.estimate.typical_usd > 0);
  assert.deepEqual([calls.search.length, calls.fetch.length, calls.model.length, calls.text.length, calls.usage.length], [0, 0, 0, 0, 0]);
  assert.equal(dbs.calls.upserts.length, 0);
  // and without any database at all
  const r2 = await P5b.research(baseOpts({ dryRun: true }), { ...d, dovive: null, dash: null });
  assert.equal(r2.plan.length, 6);
});

test('full run: caps honoured, robots respected, sources classified, copy removed, claims counted by owner', async () => {
  const dbs = db();
  const { d, calls } = deps(dbs);
  const r = await P5b.research(baseOpts({ maxQueries: 12, maxPages: 7 }), d);
  assert.equal(r.status, 'complete');
  assert.ok(calls.search.length <= 12);
  assert.ok(calls.fetch.length <= 7);
  assert.ok(!calls.fetch.includes('https://blocked.example/secret/page'), 'robots.txt disallow respected');
  assert.ok(calls.fetch.includes('https://old.reddit.com/r/Supplements/comments/abc/calmwell'));
  assert.equal(calls.usage.filter((u) => u.model === 'perplexity/search-api').length, calls.search.length);
  assert.ok(calls.usage.every((u) => u.phase === 'P5b'));

  const row = dbs.tables.dovive_web_research[0];
  assert.equal(row.keyword, 'magnesium gummies');
  assert.equal(row.category_id, CAT);
  const L = row.ledger;
  assert.equal(L.robots_disallowed, 1);
  assert.equal(L.fetched, 6);
  assert.equal(L.duplicates_removed, 1);
  assert.equal(L.duplicates_by_kind.syndicated_page, 1);
  assert.equal(L.items_dropped_unquoted.ingredient_claims, 1);
  assert.ok(L.sources_skipped['amazon (listing data already collected by P1)'] >= 1);
  assert.deepEqual(L.by_ownership, { affiliate: 1, brand_owned: 1, sponsored: 1, independent: 2 });

  const src = Object.fromEntries(row.sources.map((s) => [s.url, s]));
  assert.equal(src['https://healthnewsdaily.example/best'].duplicate_of, 'https://gummyreviews.com/best');
  assert.equal(src['https://healthnewsdaily.example/best'].extraction_status, 'skipped_duplicate');
  assert.equal(src['https://calmwell.com/products/magnesium-gummies'].ownership, 'brand_owned');
  assert.ok(src['https://gummyreviews.com/best'].ownership_markers.length >= 1);
  assert.ok(row.sources.every((s) => !('_text' in s)), 'no full page text stored');

  const claim = row.rollup.ingredient_claims.find((g) => /glycinate/.test(g.ingredient || ''));
  assert.ok(claim);
  const crit = row.rollup.comparison_criteria.find((g) => /elemental magnesium/.test(g.label));
  assert.equal(crit.independent_sources, 1);
  assert.equal(crit.affiliate_sources, 1);
  // the affiliate review's claim is the Amazon listing's own sentence → copied marketing, not counted
  const copied = row.rollup.ingredient_claims.find((g) => g.copied_marketing_excluded > 0);
  assert.ok(copied, 'copied-marketing quote excluded');
  assert.ok(row.verification.length >= 1);
  assert.ok(row.verification.every((v) => v.status === 'not_checked'), 'P5B_VERIFY off → nothing checked');
  assert.ok(row.cost_usd > 0);
});

test('resume: a partial row re-sends only failed searches and keeps earlier extractions', async () => {
  const dbs = db();
  let fail = true;
  const { d } = deps(dbs, {
    search: async (q) => (q.intent === 'forum' && fail ? { ok: false, status: 500, error: 'boom', results: [], cost_usd: 0 } : { ok: true, results: (SEARCH[q.intent] || []).map((url) => ({ url })), cost_usd: 0.005 }),
  });
  const r1 = await P5b.research(baseOpts(), d);
  assert.equal(r1.status, 'partial');
  fail = false;
  const { d: d2, calls: c2 } = deps(dbs);
  const r2 = await P5b.research(baseOpts(), d2);
  assert.equal(r2.status, 'complete');
  assert.deepEqual(c2.search.map((q) => q.intent), ['forum'], 'only the failed search is re-sent');
  assert.equal(c2.model.length, 1, 'only the newly found page is extracted');
  assert.ok(r2.row.sources.some((s) => s.extraction_reused));
});

test('OpenRouter 402 mid-run → partial row, remaining batches not attempted, exit path clean', async () => {
  const dbs = db();
  const err = new P5b.CreditsExhausted('credits');
  const { d } = deps(dbs, { callModel: fakeModel([], { failWith: err }) });
  const r = await P5b.research(baseOpts({ batchSize: 1 }), d);
  assert.equal(r.status, 'partial');
  assert.ok(r.ledger.extraction_batches.not_attempted >= 1);
  assert.equal(r.ledger.extracted, 0);
});

test('--no-model: search + classify only, status no_model, no model call', async () => {
  const dbs = db();
  const { d, calls } = deps(dbs);
  const r = await P5b.research(baseOpts({ noModel: true }), d);
  assert.equal(r.status, 'no_model');
  assert.equal(calls.model.length, 0);
  assert.ok(r.ledger.classified > 0);
});

test('competitors: products.selected (ordered by selection_rank) is used when populated, else top by BSR', async () => {
  const dbs = fakeSupabase({ products: [
    { asin: 'A1', brand: 'Low', bsr_current: 1, category_id: CAT, selected: false },
    { asin: 'A2', brand: 'Picked Two', bsr_current: 50, category_id: CAT, selected: true, selection_rank: 2 },
    { asin: 'A3', brand: 'Picked One', bsr_current: 90, category_id: CAT, selected: true, selection_rank: 1 },
  ] });
  const on = await P5b.loadCompetitors({ dash: dbs, categoryId: CAT, topN: 10, loadSelection: async () => ({ active: true, why: '2 selected competitors' }), log: () => {} });
  assert.deepEqual(on.competitors.map((c) => c.brand), ['Picked One', 'Picked Two']);
  assert.match(on.source, /^selection/);
  const off = await P5b.loadCompetitors({ dash: dbs, categoryId: CAT, topN: 10, loadSelection: async () => ({ active: false, why: 'selection columns not migrated (011)' }), log: () => {} });
  assert.equal(off.competitors[0].brand, 'Low');
  assert.match(off.source, /top by BSR/);
});

// ─── Review round: H1, H2, M3, M4, M5 on the runner ─────────────────────────

test('H1: a STALE complete row is re-researched — searches re-sent, no extraction reused, fresh timestamps', async () => {
  const dbs = db();
  const { d } = deps(dbs);
  await P5b.research(baseOpts(), { ...d, now: () => NOW - 40 * 86400000 });
  assert.equal(dbs.tables.dovive_web_research[0].status, 'complete');
  const { d: d2, calls } = deps(dbs);
  const r = await P5b.research(baseOpts(), d2);
  const planned = r.row.ledger.queries_planned;
  assert.equal(calls.search.length, planned, 'every search re-sent');
  assert.equal(r.row.ledger.queries_reused, 0);
  assert.equal(r.row.ledger.extraction_reused, 0);
  assert.ok(calls.model.length > 0);
  assert.ok(r.row.search_runs.every((s) => s.searched_at === new Date(NOW).toISOString()));
});

test('H2: nothing fetched → partial (no_pages_fetched), never complete', async () => {
  const dbs = db();
  const { d } = deps(dbs, { fetchPage: async () => ({ ok: false, status: 500, error: 'HTTP 500' }) });
  const r = await P5b.research(baseOpts(), d);
  assert.equal(r.status, 'partial');
  assert.ok(r.row.ledger.partial_reasons.includes('no_pages_fetched'));
});

test('H2: every extracted item dropped as unquoted → partial (no_items_kept)', async () => {
  const dbs = db();
  const bad = async (prompt) => {
    const ids = [...prompt.matchAll(/=== PAGE (P\d+) ===/g)].map((m) => m[1]);
    return { content: JSON.stringify({ pages: ids.map((id) => ({ id, ingredient_claims: [{ claim: 'x', ingredient: 'y', quote: 'words that are nowhere on any page' }] })) }), cost: 0.01 };
  };
  const { d } = deps(dbs, { callModel: bad });
  const r = await P5b.research(baseOpts(), d);
  assert.equal(r.status, 'partial');
  assert.ok(r.reasons.includes('no_items_kept'));
  assert.ok(r.row.ledger.items_dropped_unquoted.ingredient_claims > 0);
});

test('M2: an unparseable reply is retried with a request for LESS, not the identical prompt', async () => {
  const dbs = db();
  const prompts = [];
  let first = true;
  const good = fakeModel([]);
  const { d } = deps(dbs, { callModel: async (p) => { prompts.push(p); if (first) { first = false; return { content: '{"pages": [ {"id": "P1", "ingredient_claims": [', cost: 0.02 }; } return good(p); } });
  await P5b.research(baseOpts({ batchSize: 20 }), d);
  assert.equal(prompts.length, 2);
  assert.notEqual(prompts[0], prompts[1]);
  assert.ok(prompts[1].startsWith(prompts[0]));
  assert.match(prompts[1], /could not be parsed/);
});

test('M3: a page that failed twice inside the retry window is deferred, not re-sent; the ledger says so', async () => {
  const dbs = db();
  const failing = async () => { throw new Error('upstream 500'); };
  const { d } = deps(dbs, { callModel: failing });
  const r1 = await P5b.research(baseOpts({ batchSize: 20 }), d);
  assert.equal(r1.status, 'partial');
  assert.ok(r1.row.sources.filter((s) => s.extraction_status === 'failed').every((s) => s.extraction_failed_attempts === 1));
  const { d: d2 } = deps(dbs, { callModel: failing });
  await P5b.research(baseOpts({ batchSize: 20 }), { ...d2, now: () => NOW + 3600000 });
  const { d: d3, calls: c3 } = deps(dbs);
  const r3 = await P5b.research(baseOpts({ batchSize: 20 }), { ...d3, now: () => NOW + 7200000 });
  assert.equal(c3.model.length, 0, 'twice-failed pages not paid for again');
  assert.equal(c3.search.length, 0, 'fresh searches reused');
  assert.ok(r3.row.ledger.extraction_deferred > 0);
  assert.ok(r3.reasons.some((x) => /deferred_after_repeated_failures/.test(x)));
  // after P5B_RETRY_AFTER_DAYS the pages are tried again
  const { d: d4, calls: c4 } = deps(dbs);
  const r4 = await P5b.research(baseOpts({ batchSize: 20 }), { ...d4, now: () => NOW + 8 * 86400000 });
  assert.equal(c4.model.length, 1);
  assert.equal(r4.status, 'complete');
});

test('M4: fetcher — 403 and bot walls never go to the browser; browser pages capped at P5B_MAX_BROWSER_PAGES', async () => {
  let launches = 0;
  let pagesOpened = 0;
  const html = `<html><body><article>${'<p>plenty of real article words about gummies. </p>'.repeat(40)}</article></body></html>`;
  const launchBrowser = async () => { launches++; return { viaBrightData: true, context: { newPage: async () => { pagesOpened++; return { goto: async () => ({ status: () => 200 }), waitForTimeout: async () => {}, content: async () => html, close: async () => {} }; } }, close: async () => {} }; };
  const responses = { 'https://a.com/403': { ok: false, status: 403, text: '' }, 'https://a.com/wall': { ok: true, status: 200, contentType: 'text/html', text: '<html>Attention Required! captcha</html>' } };
  const httpGetImpl = async (url) => responses[url] || { ok: false, status: 0, error: 'ECONNRESET' };
  const f = P5b.makePageFetcher({ maxBrowserPages: 2, httpGetImpl, launchBrowser });
  const r403 = await f.fetchPage('https://a.com/403');
  assert.equal(r403.blocked, true);
  const wall = await f.fetchPage('https://a.com/wall');
  assert.equal(wall.blocked, true);
  assert.equal(launches, 0, 'no browser for refusals');
  const got = [];
  for (const u of ['https://b.com/1', 'https://b.com/2', 'https://b.com/3']) got.push(await f.fetchPage(u));
  assert.deepEqual(got.map((g) => g.ok), [true, true, false]);
  assert.equal(got[0].via, 'browser_brightdata');
  assert.equal(got[2].browserCapped, true);
  assert.equal(f.browserUsed(), 2);
  assert.equal(pagesOpened, 2);
  // newPage throwing is contained
  const boom = P5b.makePageFetcher({ httpGetImpl, launchBrowser: async () => ({ context: { newPage: async () => { throw new Error('ctx closed'); } }, close: async () => {} }) });
  const r = await boom.fetchPage('https://c.com/x');
  assert.equal(r.ok, false);
  // the ledger counts browser fetches
  const dbs = db();
  const { d } = deps(dbs, { fetchPage: async (url) => (PAGES[url] ? { ok: true, status: 200, html: PAGES[url], via: url.includes('mineralguide') ? 'browser_brightdata' : 'http' } : { ok: false, status: 403, blocked: true, error: 'HTTP 403' }) });
  const res = await P5b.research(baseOpts(), d);
  assert.equal(res.row.ledger.browser_fetches, 1);
});

test('M5: the row is upserted after the searches and after each extraction batch, then finally', async () => {
  const dbs = db();
  const { d } = deps(dbs);
  const r = await P5b.research(baseOpts({ batchSize: 2 }), d);
  const ups = dbs.calls.upserts.filter((u) => u.keyword === 'magnesium gummies');
  const batches = r.row.ledger.extraction_batches.total;
  assert.ok(batches >= 2);
  assert.equal(ups.length, 1 + batches + 1);
  assert.equal(ups[0].ledger.in_progress, 'searched');
  assert.equal(ups[0].status, 'partial');
  assert.match(ups[1].ledger.in_progress, /^extraction batch/);
  assert.equal(ups[ups.length - 1].status, 'complete');
  assert.equal(ups[ups.length - 1].ledger.in_progress, undefined);
});

test('M5: the OpenRouter call times out instead of hanging', async () => {
  const realFetch = global.fetch;
  global.fetch = (url, o) => new Promise((_, reject) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }));
  try {
    const call = P5b.makeOpenRouterCaller({ model: 'm', timeoutMs: 30, env: { OPENROUTER_API_KEY: 'k' }, ctx: {}, usageWrites: [] });
    await assert.rejects(call('p'), /timeout after 30ms/);
  } finally {
    global.fetch = realFetch;
  }
});
