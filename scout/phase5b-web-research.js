/**
 * phase5b-web-research.js — P5b: CATEGORY-level web research (runs after P5).
 *
 * P5 researches 5 + 3 products, one Perplexity call each, aimed at brand sites
 * and retailers. P5b reads the rest of the web for the whole keyword: review
 * articles, comparisons, buying guides, specialist blogs, forums and brand
 * pages, and says for every source WHO is speaking.
 *
 *   1. Query plan (≤ P5B_MAX_QUERIES, default 12) from the keyword + the
 *      selected competitors' brands (products.selected when populated, else
 *      top-N by BSR): best-of, review, comparison, brand-vs-brand, buying
 *      guide, reddit, third-party testing, brand sites.
 *   2. Perplexity Search API per query (utils/perplexity.js searchWeb — titles,
 *      URLs, snippets; $5 / 1k requests). Every call → ai_usage_log, phase 'P5b'.
 *   3. Fetch ≤ P5B_MAX_PAGES pages (2 at a time, robots.txt respected, 2 MB
 *      cap, plain HTTP first; Bright Data browser fallback only for blocked
 *      pages unless P5B_BROWSER_FALLBACK=0). Classify page type + ownership
 *      (brand-owned / sponsored / affiliate / independent / unknown, with the
 *      matched marker kept) and mark syndicated copies (5-word shingles,
 *      Jaccard/containment ≥ 0.6) — against each other and against the
 *      competitors' own Amazon bullets + description.
 *   4. Model extraction in batches (P5B_BATCH pages per call): products,
 *      comparison criteria, ingredient claims, strengths, weaknesses, pricing,
 *      evidence links — each with a verbatim quote; items whose quote is not
 *      in the page are dropped and counted.
 *   5. Roll-up: every claim / criterion counted by distinct source website,
 *      split independent / brand-owned / affiliate / sponsored; syndicated
 *      pages and quotes copied from Amazon listings never count.
 *   6. Verification targets for "clinically proven / studied / NSF / USP /
 *      Informed Sport / third-party tested" claims. Checked (PubMed
 *      E-utilities, NSF dietary listing) ONLY when P5B_VERIFY=1.
 *
 * Writes dovive_web_research (migration 014, NOT applied yet), one row per
 * keyword (upsert). P7 (phase6-market-analysis.js) and P9 (phase8-formula-
 * brief.js) prefer its counted claims when a row exists.
 *
 * Usage:
 *   node phase5b-web-research.js --keyword "magnesium gummies"
 *     [--force]      redo even if a complete row is fresher than P5B_FRESH_DAYS (30)
 *     [--dry-run]    plan + cost estimate; NO search, NO page fetch, NO model call,
 *                    no write (reads the competitor list when Supabase env is set)
 *     [--no-model]   search + fetch + classify + dedupe, no extraction model
 *
 * Env: PERPLEXITY_API_KEY, OPENROUTER_API_KEY, P5B_MAX_QUERIES (12), P5B_MAX_PAGES (20),
 *   P5B_FRESH_DAYS (30), P5B_VERIFY (off), P5B_MODEL (else ANALYSIS_MODEL, else
 *   CHEAP_MODE_MODEL under CHEAP_MODE=true, else anthropic/claude-sonnet-5),
 *   P5B_BATCH (4), P5B_PAGE_CHARS (12000), P5B_TOP_BRANDS (10), P5B_BROWSER_FALLBACK (on).
 *
 * RESUME: search results and per-page extractions are stored on the row. A
 * re-run of a partial row re-sends only searches that did not succeed and
 * re-extracts only pages without a successful extraction.
 *
 * FAIL-OPEN: always exits 0. A P5b problem must never make run-pipeline retry
 * the paid P5 before it; consumers fall back to their previous prompts.
 */

'use strict';

const WR = require('./utils/web-research');
const SC = require('./utils/source-classify');
const CR = require('./utils/cert-registry-web');

const TABLE = 'dovive_web_research';
const UA = 'Mozilla/5.0 (compatible; DoviveScout/1.0; +https://dovive.com) research bot';

class CreditsExhausted extends Error {}

// ─── Options ────────────────────────────────────────────────────────────────

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const val = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  const int = (v, d, min = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min ? n : d; };
  return {
    keyword: val('--keyword', argv[0] && !argv[0].startsWith('--') ? argv[0] : null),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    noModel: argv.includes('--no-model'),
    maxQueries: int(env.P5B_MAX_QUERIES, 12, 1),
    maxPages: int(env.P5B_MAX_PAGES, 20, 0),
    freshDays: int(env.P5B_FRESH_DAYS, 30, 0),
    verify: env.P5B_VERIFY === '1',
    batchSize: int(env.P5B_BATCH, 4, 1),
    pageChars: int(env.P5B_PAGE_CHARS, 12000, 1000),
    topBrands: int(env.P5B_TOP_BRANDS, 10, 1),
    concurrency: 2,
    browserFallback: env.P5B_BROWSER_FALLBACK !== '0',
    model: env.P5B_MODEL
      || env.ANALYSIS_MODEL
      || (env.CHEAP_MODE === 'true' ? (env.CHEAP_MODE_MODEL || 'google/gemini-3.7-flash') : null)
      || 'anthropic/claude-sonnet-5',
    hasModelKey: !!env.OPENROUTER_API_KEY,
    hasSearchKey: !!(env.PERPLEXITY_API_KEY && !/^REPLACE_ME/i.test(env.PERPLEXITY_API_KEY)),
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/** Pre-flight + previous row in ONE select. */
async function loadPrevious(dash, keyword) {
  const { data, error } = await dash.from(TABLE)
    .select('keyword, status, generated_at, ledger, sources, search_runs, model')
    .eq('keyword', keyword)
    .limit(1);
  if (error) return { ok: false, missingTable: isMissingTable(error), error };
  return { ok: true, row: (data && data[0]) || null };
}

function isMissingTable(error) {
  return require('./utils/review-synthesis').isMissingTableError(error);
}

const PRODUCT_COLS = 'asin, brand, title, bsr_current, feature_bullets_text, description_text';

/**
 * Selected competitors (products.selected) when populated, else top-N by BSR.
 * Returns { competitors, source } — competitors carry the Amazon copy used by
 * the syndication check.
 */
async function loadCompetitors({ dash, categoryId, topN, loadSelection, log }) {
  if (!dash || !categoryId) return { competitors: [], source: 'none' };
  const sel = loadSelection ? await loadSelection(dash, categoryId) : { active: false, why: 'no loader' };
  if (sel.active) {
    const { data, error } = await dash.from('products').select(PRODUCT_COLS)
      .eq('category_id', categoryId).eq('selected', true)
      .order('selection_rank', { ascending: true }).limit(200);
    if (!error && data && data.length) return { competitors: data, source: `selection (${sel.why})` };
    log(`  ⚠️ selection active but unreadable (${error && error.message}) — falling back to top ${topN} by BSR`);
  }
  const { data, error } = await dash.from('products').select(PRODUCT_COLS)
    .eq('category_id', categoryId)
    .order('bsr_current', { ascending: true, nullsFirst: false })
    .limit(Math.max(topN, 40));
  if (error) { log(`  ⚠️ products read failed (${error.message}) — planning without brands`); return { competitors: [], source: 'none' }; }
  return { competitors: (data || []).filter((p) => p.bsr_current != null), source: `top by BSR (${sel.why || 'no selection'})` };
}

/** Brand sites P5 already confirmed (dovive_p5_sources.source_type = 'brand_site'). */
async function loadBrandDomains({ dovive, keyword, log }) {
  const out = new Map();
  if (!dovive) return out;
  try {
    const { data, error } = await dovive.from('dovive_p5_sources').select('asin, source_url, source_type')
      .eq('keyword', keyword).eq('source_type', 'brand_site').limit(200);
    if (error) { log(`  (brand domains from P5 not read: ${error.message})`); return out; }
    for (const r of data || []) { const h = SC.hostOf(r.source_url); if (h && !out.has(r.asin)) out.set(r.asin, h); }
  } catch (e) { log(`  (brand domains from P5 not read: ${e.message})`); }
  return out;
}

// ─── Network defaults (replaced in tests) ───────────────────────────────────

async function readCapped(res, maxBytes) {
  if (!res.body || !res.body.getReader) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, maxBytes);
}

/** Plain HTTP GET with timeout and byte cap. Never throws. */
async function httpGet(url, { timeoutMs = 15000, maxBytes = 2 * 1024 * 1024, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8' }, redirect: 'follow', signal: ctl.signal });
    const contentType = res.headers.get('content-type') || '';
    const text = await readCapped(res, maxBytes);
    return { ok: res.ok, status: res.status, contentType, text, finalUrl: res.url || url };
  } catch (e) {
    return { ok: false, status: 0, contentType: '', text: '', error: e.name === 'AbortError' ? `timeout ${timeoutMs}ms` : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Plain fetch first; Bright Data browser (reused helper) only for a blocked page. */
function makePageFetcher({ browserFallback, log }) {
  let browser = null;
  let browserTried = false;
  async function viaBrowser(url) {
    if (!browserTried) {
      browserTried = true;
      try {
        const { launchBrowserContext } = require('./utils/bright-data-browser');
        browser = await launchBrowserContext({ label: 'P5b fetch', useProxy: true });
      } catch (e) { log(`  (browser fallback unavailable: ${e.message})`); }
    }
    if (!browser) return null;
    const page = await browser.context.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(800);
      return { ok: true, status: resp ? resp.status() : 200, contentType: 'text/html', html: (await page.content()).slice(0, 2 * 1024 * 1024), via: browser.viaBrightData ? 'browser_brightdata' : 'browser_local' };
    } catch (e) {
      return { ok: false, status: 0, error: e.message, via: 'browser' };
    } finally {
      await page.close().catch(() => {});
    }
  }
  async function fetchPage(url) {
    const r = await httpGet(url);
    const blocked = !r.ok || (r.text && r.text.length < 2000 && /captcha|access denied|are you a robot|cloudflare|enable javascript/i.test(r.text));
    if (!blocked && /html|xml|text\/plain/i.test(r.contentType || 'text/html')) return { ok: true, status: r.status, contentType: r.contentType, html: r.text, via: 'http' };
    if (!blocked) return { ok: false, status: r.status, error: `not html (${r.contentType})`, via: 'http' };
    if (browserFallback && ![404, 410].includes(r.status)) {
      const b = await viaBrowser(url);
      if (b && b.ok) return b;
    }
    return { ok: false, status: r.status, error: r.error || `HTTP ${r.status}${blocked && r.ok ? ' (bot wall)' : ''}`, via: 'http' };
  }
  return { fetchPage, close: async () => { if (browser) await browser.close(); } };
}

function makeOpenRouterCaller({ model, env = process.env, ctx, usageWrites }) {
  const { withUsageTracking, recordAiUsage } = require('./utils/ai-usage');
  return async function callModel(prompt) {
    const key = env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not set');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://dovive.com', 'X-Title': 'DOVIVE Scout P5b Web Research' },
      body: JSON.stringify(withUsageTracking({ model, max_tokens: 12000, temperature: 0, messages: [{ role: 'user', content: prompt }] })),
    });
    if (res.status === 402) throw new CreditsExhausted('[ERROR: credits] OpenRouter credits exhausted (402)');
    const j = await res.json();
    if (j.error) throw new Error(`OpenRouter: ${j.error.message || JSON.stringify(j.error)}`);
    usageWrites.push(recordAiUsage({ phase: 'P5b', model, usage: j.usage, categoryId: ctx.categoryId, keyword: ctx.keyword }).catch(() => {}));
    return { content: j.choices?.[0]?.message?.content || '', cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null };
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function pool(items, n, fn) {
  const queue = items.map((x, i) => [x, i]);
  const out = new Array(items.length);
  async function worker() {
    while (queue.length) {
      const [x, i] = queue.shift();
      out[i] = await fn(x, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const round6 = (x) => Math.round((x || 0) * 1e6) / 1e6;

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * @param {object} opts  from parseOptions
 * @param {object} deps  { dovive, dash, resolveCategory, loadSelection, search, fetchPage,
 *                         fetchText, callModel, recordUsage, pricing, log, now }
 */
async function research(opts, deps) {
  const log = deps.log || console.log;
  const now = deps.now || Date.now;
  const { dovive, dash } = deps;
  const { keyword } = opts;
  if (!keyword) { log('Usage: node phase5b-web-research.js --keyword "magnesium gummies" [--force] [--dry-run] [--no-model]'); return { aborted: 'no_keyword' }; }
  log(`=== P5b Web Research — "${keyword}" ===`);
  log(`Caps: ${opts.maxQueries} searches, ${opts.maxPages} pages | model ${opts.noModel ? 'none (--no-model)' : opts.model} | verify ${opts.verify ? 'on' : 'off'}${opts.dryRun ? ' | DRY RUN' : ''}`);

  // 1. Pre-flight — before any paid call.
  let prevRow = null;
  if (dash) {
    const prev = await loadPrevious(dash, keyword);
    if (!prev.ok) {
      log(`  ❌ ${TABLE} is ${prev.missingTable ? 'missing (migration 014 not applied)' : `not readable (${prev.error && prev.error.message})`} — ${opts.dryRun ? 'dry run continues, nothing would be saved' : 'stopping before any search, fetch or model call; nothing spent'}.`);
      if (!opts.dryRun) return { aborted: prev.missingTable ? 'table_missing' : 'table_unreadable', spent: 0 };
    } else prevRow = prev.row;
  } else if (!opts.dryRun) {
    log('  ❌ No Supabase client — nothing done.');
    return { aborted: 'no_client', spent: 0 };
  }

  if (!opts.force && WR.isFresh(prevRow, opts.freshDays, now())) {
    log(`  ✅ A complete web-research row from ${prevRow.generated_at} is within ${opts.freshDays} days — skipping (use --force to redo).`);
    if (!opts.dryRun) return { skipped: 'fresh', spent: 0 };
  }

  // 2. Category + competitors.
  const ctx = deps.ctx || { keyword, categoryId: null };
  if (dash && deps.resolveCategory) {
    try {
      const cat = await deps.resolveCategory(dash, keyword);
      ctx.categoryId = cat.id;
      log(`  → Category (${cat.method}): "${cat.name}" (${cat.id})`);
    } catch (e) { log(`  ⚠️ Category not resolved (${e.message}) — planning from the keyword alone.`); }
  }
  const { competitors, source: compSource } = await loadCompetitors({ dash, categoryId: ctx.categoryId, topN: opts.topBrands, loadSelection: deps.loadSelection, log });
  const domains = await loadBrandDomains({ dovive, keyword, log });
  const brands = competitors.map((c) => ({ brand: c.brand, asin: c.asin, domain: domains.get(c.asin) || null }));
  const planBrands = WR.uniqueBrands(brands).slice(0, opts.topBrands);
  const marketing = competitors
    .map((c) => ({ asin: c.asin, brand: c.brand, text: [c.feature_bullets_text, c.description_text].filter(Boolean).join('\n') }))
    .filter((m) => m.text.length > 40);
  log(`  Competitors: ${competitors.length} from ${compSource}; ${planBrands.length} brands for queries; ${domains.size} brand sites known from P5; ${marketing.length} Amazon listings for the copy check`);

  // 3. Plan (caps enforced here, before any call).
  const year = new Date(now()).getUTCFullYear();
  const plan = WR.buildQueryPlan({ keyword, brands: planBrands, year, max: opts.maxQueries });
  for (const q of plan) log(`   ${q.id} [${q.intent}] ${q.display}`);
  const estimate = WR.estimateCost({ queries: plan.length, pages: opts.maxPages, pageChars: opts.pageChars, batchSize: opts.batchSize, model: opts.model, pricing: deps.pricing || {} });
  log(`  Estimate: ${plan.length} searches ($${estimate.search_usd.toFixed(3)}) + ≤ ${opts.maxPages} pages in ${estimate.extraction_calls} extraction calls (${estimate.extraction_usd == null ? 'cost unknown' : `≈ $${estimate.extraction_usd.toFixed(2)}`} on ${opts.model}) ≈ ${estimate.total_usd == null ? '?' : `$${estimate.total_usd.toFixed(2)}`} max`);
  if (opts.dryRun) {
    log('  DRY RUN — no search, no page fetch, no model call, nothing written.');
    return { dryRun: true, plan, estimate, searches: 0, fetches: 0, modelCalls: 0 };
  }
  if (!opts.hasSearchKey) { log('  ❌ PERPLEXITY_API_KEY not set — no search possible; nothing written.'); return { aborted: 'no_search_key', spent: 0 }; }

  const cost = { search: 0, extraction: 0 };
  const recordUsage = deps.recordUsage || (async () => {});

  // 4. Search (resume: reuse successful runs of the same query from a partial row).
  const prevRuns = new Map(((prevRow && !opts.force && prevRow.search_runs) || []).filter((r) => r.ok).map((r) => [r.query, r]));
  const searchRuns = [];
  let searches = 0;
  let creditsStop = null;
  for (const q of plan) {
    const reused = prevRuns.get(q.query);
    if (reused) { searchRuns.push({ ...reused, query_id: q.id, intent: q.intent, reused: true, attempted: true }); continue; }
    if (creditsStop) { searchRuns.push({ query_id: q.id, intent: q.intent, query: q.query, ok: false, attempted: false, results: [] }); continue; }
    searches++;
    const r = await deps.search(q);
    cost.search += r.cost_usd || 0;
    if (r.cost_usd) await recordUsage({ phase: 'P5b', model: 'perplexity/search-api', usage: { prompt_tokens: 0, completion_tokens: 0, cost: r.cost_usd }, categoryId: ctx.categoryId, keyword });
    if (r.creditsExhausted) creditsStop = 'Perplexity credits exhausted (402)';
    const results = r.ok ? WR.normalizeSearchResults({ results: r.results }) : [];
    searchRuns.push({ query_id: q.id, intent: q.intent, query: q.query, display: q.display, ok: !!r.ok, attempted: true, status: r.status, error: r.ok ? null : r.error, results });
    log(`   ${q.id}: ${r.ok ? `${results.length} results` : `failed (${r.error})`}`);
  }
  if (!searchRuns.some((r) => r.ok)) { log('  ❌ No search succeeded — nothing written.'); return { aborted: 'no_search_results', spent: round6(cost.search) }; }

  // 5. Pick pages, fetch, classify.
  const { sources, toFetch } = WR.selectPagesToFetch(searchRuns, { maxPages: opts.maxPages });
  const prevSources = new Map(((prevRow && !opts.force && prevRow.sources) || []).map((s) => [s.norm_url, s]));
  const robotsCache = new Map();
  const robotsFor = async (url) => {
    let origin;
    try { origin = new URL(url).origin; } catch { return []; }
    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, (async () => {
        const r = deps.fetchText ? await deps.fetchText(`${origin}/robots.txt`, { timeoutMs: 5000 }) : null;
        return r && r.ok ? WR.parseRobots(r.text) : [];
      })());
    }
    return robotsCache.get(origin);
  };
  let fetches = 0;
  const pages = await pool(toFetch, opts.concurrency, async (s) => {
    const fetchUrl = WR.fetchUrlFor(s.url);
    const u = new URL(fetchUrl);
    if (!WR.robotsAllows(await robotsFor(fetchUrl), `${u.pathname}${u.search}`)) {
      s.fetch_status = 'robots_disallowed';
      return s;
    }
    fetches++;
    const r = await deps.fetchPage(fetchUrl);
    s.fetched_via = r.via || null;
    s.http_status = r.status || null;
    if (!r.ok || !r.html) { s.fetch_status = 'failed'; s.fetch_error = r.error || 'empty'; return s; }
    const parsed = SC.extractPage(r.html, s.url);
    Object.assign(s, { fetch_status: 'fetched', title: parsed.title || s.title, headings: parsed.headings.slice(0, 8), canonical: parsed.canonical, published: parsed.published, site_name: parsed.site_name, word_count: parsed.word_count });
    s._text = parsed.text;
    s._full = parsed.full_text;
    s._links = parsed.links;
    const pt = SC.classifyPageType({ url: s.url, title: s.title, headings: parsed.headings, text: parsed.text }, { brands });
    s.page_type = pt.page_type;
    s.page_type_evidence = pt.evidence;
    const own = SC.classifyOwnership({ url: s.url, page_type: s.page_type, text: parsed.text, full_text: parsed.full_text, links: parsed.links }, { brands });
    s.ownership = own.ownership;
    s.ownership_markers = own.markers.slice(0, 8);
    if (own.brand) s.brand = own.brand;
    return s;
  });
  log(`  Pages: ${sources.length} unique sources, ${fetches} fetched (${pages.filter((p) => p.fetch_status === 'fetched').length} ok, ${pages.filter((p) => p.fetch_status === 'failed').length} failed, ${pages.filter((p) => p.fetch_status === 'robots_disallowed').length} robots-disallowed)`);

  // 6. Syndication — among fetched pages and against the Amazon listings.
  const fetched = pages.filter((p) => p.fetch_status === 'fetched');
  const dups = SC.markSyndication(fetched.map((p) => ({ url: p.url, text: p._text, canonical: p.canonical, published: p.published })), marketing);
  for (const p of fetched) {
    const d = dups.get(p.url);
    if (d) Object.assign(p, { duplicate_of: d.duplicate_of, duplicate_kind: d.kind, duplicate_similarity: d.similarity, duplicate_method: d.method });
  }
  if (dups.size) log(`  Syndication: ${dups.size} page(s) are copies (${[...dups.values()].map((d) => d.kind).join(', ')}) — not counted as independent evidence`);

  // 7. Extraction (resume: keep a previous successful extraction of the same URL).
  const eligible = [];
  for (const p of fetched) {
    const prev = prevSources.get(p.norm_url);
    if (p.duplicate_of) { p.extraction_status = 'skipped_duplicate'; continue; }
    if ((p.word_count || 0) < 40) { p.extraction_status = 'skipped_thin'; continue; }
    if (prev && prev.extraction_status === 'ok' && prev.extraction && prev.prompt_version === WR.PROMPT_VERSION) {
      p.extraction = prev.extraction;
      p.extraction_status = 'ok';
      p.extraction_reused = true;
      continue;
    }
    eligible.push(p);
  }
  const useModel = !opts.noModel && opts.hasModelKey && eligible.length > 0;
  const batches = [];
  for (let i = 0; i < eligible.length; i += opts.batchSize) batches.push(eligible.slice(i, i + opts.batchSize));
  const kept = {};
  const dropped = {};
  const batchStats = { total: batches.length, ok: 0, failed: 0, not_attempted: 0 };
  let modelCalls = 0;
  if (!useModel) {
    for (const p of eligible) p.extraction_status = 'not_attempted';
    batchStats.not_attempted = batches.length;
    if (!opts.noModel && !opts.hasModelKey && eligible.length) log('  ⚠️ No OPENROUTER_API_KEY — sources classified, nothing extracted.');
  } else {
    let stop = null;
    await pool(batches, opts.concurrency, async (batch, bi) => {
      if (stop) { batch.forEach((p) => { p.extraction_status = 'not_attempted'; }); batchStats.not_attempted++; return; }
      const withIds = batch.map((p, k) => ({ id: `P${k + 1}`, url: p.url, title: p.title, text: p._text, page: p }));
      const prompt = WR.buildExtractionPrompt(withIds, { keyword, brands, pageChars: opts.pageChars });
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          modelCalls++;
          const { content, cost: c } = await deps.callModel(prompt);
          cost.extraction += c || 0;
          const parsed = WR.parseExtractionResponse(content, withIds.map((w) => w.id));
          if (!parsed.ok) { log(`  batch ${bi + 1}/${batches.length}: unparseable (attempt ${attempt})`); continue; }
          for (const w of withIds) {
            const raw = parsed.pages[w.id];
            if (!raw) { w.page.extraction_status = 'failed'; w.page.extraction_error = 'page missing from response'; continue; }
            const v = WR.validateExtraction(raw, { text: w.page._text, links: w.page._links }, { brands });
            w.page.extraction = v.extraction;
            w.page.extraction_status = 'ok';
            w.page.extraction_dropped = v.dropped;
            for (const [f, n] of Object.entries(v.dropped)) dropped[f] = (dropped[f] || 0) + n;
          }
          batchStats.ok++;
          log(`  batch ${bi + 1}/${batches.length}: ${withIds.length} pages extracted`);
          return;
        } catch (e) {
          if (e instanceof CreditsExhausted) { stop = e; break; }
          log(`  batch ${bi + 1}/${batches.length}: ${e.message} (attempt ${attempt})`);
        }
      }
      batch.forEach((p) => { if (p.extraction_status !== 'ok') { p.extraction_status = stop ? 'not_attempted' : 'failed'; } });
      if (stop) batchStats.not_attempted++; else batchStats.failed++;
    });
    if (stop) log(`  ❌ ${stop.message} — remaining batches not attempted; row saved as partial and resumes next run.`);
  }
  for (const p of fetched) {
    if (p.extraction_status !== 'ok' || !p.extraction) continue;
    for (const f of WR.FIELDS) kept[f] = (kept[f] || 0) + (p.extraction[f] || []).length;
  }

  // 8. Roll-up + verification.
  const rollup = WR.buildRollup(fetched.filter((p) => p.extraction_status === 'ok').map((p) => ({ url: p.url, domain: p.domain, ownership: p.ownership, page_type: p.page_type, duplicate_of: p.duplicate_of || null, extraction: p.extraction })), { marketing });
  let verification = WR.buildVerificationTargets(rollup, { brands });
  if (opts.verify && verification.length && deps.fetchText) {
    verification = await CR.runVerification(verification, { fetchText: (url) => deps.fetchText(url, { timeoutMs: 15000 }), log });
  }

  // 9. Status + ledger + write.
  const allSearched = searchRuns.every((r) => r.ok);
  const extractedAll = !eligible.some((p) => p.extraction_status !== 'ok');
  const status = (opts.noModel || !opts.hasModelKey) ? 'no_model' : (allSearched && extractedAll && !creditsStop ? 'complete' : 'partial');
  const model = useModel ? opts.model : null;
  const ledger = WR.buildLedger({ plan, searchRuns, sources, pages, extraction: { batches: batchStats, kept, dropped }, rollup, cost, model, searchEngine: 'perplexity/search-api', verification });
  ledger.competitor_source = compSource;
  ledger.estimate = estimate;
  if (creditsStop) ledger.stopped = creditsStop;

  const storedSources = sources.map((s) => {
    const { _text, _full, _links, ...rest } = s;
    return { ...rest, prompt_version: WR.PROMPT_VERSION, excerpt: _text ? _text.slice(0, 600) : null };
  });
  const row = {
    keyword,
    category_id: ctx.categoryId,
    status,
    model,
    prompt_version: WR.PROMPT_VERSION,
    ledger,
    sources: storedSources,
    search_runs: searchRuns,
    rollup,
    verification,
    cost_usd: round6(cost.search + cost.extraction),
    generated_at: new Date(now()).toISOString(),
  };
  const { error } = await dash.from(TABLE).upsert([row], { onConflict: 'keyword' });
  if (error) { log(`  ❌ ${TABLE} upsert failed: ${error.message}`); return { aborted: 'write_failed', row, spent: row.cost_usd, searches, fetches, modelCalls }; }
  log(`  ✅ Saved ${TABLE} (${status}): ${ledger.sources_found} sources / ${ledger.fetched} fetched / ${ledger.classified} classified / ${ledger.extracted} extracted / ${ledger.duplicates_removed} duplicates removed; cost $${row.cost_usd.toFixed(4)}`);
  for (const g of (rollup.ingredient_claims || []).slice(0, 8)) log(`   claim "${g.label}" — ${g.independent_sources} independent / ${g.brand_owned_sources} brand-owned / ${g.affiliate_sources} affiliate`);
  return { status, row, ledger, rollup, verification, searches, fetches, modelCalls };
}

if (require.main === module) {
  require('dotenv').config();
  const usageWrites = [];
  const opts = parseOptions();
  const env = process.env;
  let dovive = null;
  let dash = null;
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    dovive = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    dash = createClient(env.DASH_URL || env.SUPABASE_URL, env.DASH_KEY || env.SUPABASE_KEY);
  } else if (!opts.dryRun) {
    console.log('❌ P5b: SUPABASE_URL / SUPABASE_KEY not set — nothing done (non-fatal).');
  }
  const ctx = { keyword: opts.keyword, categoryId: null };
  const { recordAiUsage, PRICING } = require('./utils/ai-usage');
  const fetcher = opts.dryRun ? null : makePageFetcher({ browserFallback: opts.browserFallback, log: console.log });
  const main = (dash || opts.dryRun)
    ? research(opts, {
      dovive,
      dash,
      ctx,
      resolveCategory: require('./utils/category-resolver').resolveCategory,
      loadSelection: require('./utils/selected-competitors').loadSelection,
      search: (q) => require('./utils/perplexity').searchWeb(q.query, { maxResults: 10, domainFilter: q.domain_filter }),
      fetchPage: fetcher ? fetcher.fetchPage : null,
      fetchText: (url, o) => httpGet(url, { timeoutMs: (o && o.timeoutMs) || 15000, maxBytes: 512 * 1024, accept: '*/*' }),
      callModel: makeOpenRouterCaller({ model: opts.model, ctx, usageWrites }),
      recordUsage: (row) => { const p = recordAiUsage(row).catch(() => {}); usageWrites.push(p); return p; },
      pricing: PRICING,
    })
    : Promise.resolve();
  main
    .catch((e) => { console.error(`\n❌ P5b web research FAILED (non-fatal, consumers fall back): ${e.message}`); })
    .finally(async () => { if (fetcher) await fetcher.close(); await Promise.allSettled(usageWrites); process.exit(0); });
}

module.exports = { research, parseOptions, loadPrevious, loadCompetitors, makePageFetcher, httpGet, TABLE, CreditsExhausted };
