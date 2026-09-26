/**
 * phase7b-marketing-assets.js — P7b: analyse the ACTUAL packaging and
 * marketing assets (gallery images, A+ modules, brand story, videos) of the
 * competitors, instead of their titles and bullets.
 *
 * Runs per keyword after P4 (runner line in run-pipeline.js P4). Scope: the
 * SELECTED competitors (products.selected, migration 011) when a selection
 * exists, else the top 20 by BSR; capped at P7B_MAX_PRODUCTS (default 40).
 *
 *   1. Asset inventory (no model) — per product: gallery (products.image_urls,
 *      main first), A+ module images + A+ video streams
 *      (dovive_research.raw_json.product_description), brand-story images
 *      (raw_json.from_the_brand), listing videos (raw_json.videos — Amazon
 *      /vdp/ pages) and A+ presence (raw_json.plus_content).
 *   2. Vision pass — ONE OpenRouter call per product with up to
 *      P7B_MAX_IMAGES_PER_PRODUCT (default 8) labelled images, P7B_MAX_APLUS_IMAGES
 *      (default 2) of them reserved for A+/brand images when present. Output is
 *      validated: anything without a seen_on image label (or verbatim text on
 *      an image) is dropped and counted.
 *   3. Category roll-up with counts, and
 *   4. experienced vs claimed — claimed benefits joined with the P3b review
 *      themes (dovive_review_synthesis) by a recorded lexical rule.
 *   5. Writes dovive_marketing_assets (migration 015): one scope='category'
 *      row + one scope='product' row per in-scope ASIN, and a pointer on
 *      products.marketing_asset_analysis.
 *
 * VIDEOS ARE NOT ANALYSED: listing videos are /vdp/ pages and A+ videos are
 * HLS .m3u8 streams; there is no frame or transcript path in this pipeline.
 * They are inventoried and the ledger says videos_analyzed = 0 and why.
 *
 * Usage:
 *   node phase7b-marketing-assets.js --keyword "magnesium gummies"
 *     [--force]      re-analyse every product, even with an unchanged gallery
 *     [--dry-run]    ZERO network: prints the configured plan + a worst-case
 *                    cost estimate from the caps; no DB reads, no model, no writes
 *     [--plan]       read-only: reads the DB, prints the real inventory, the
 *                    per-product plan and its cost estimate; no model, no writes
 *     [--no-model]   inventory + roll-up of already-cached analyses, writes, $0
 *     [--concurrency 3]
 *
 * Model: P7B_MODEL, else ANALYSIS_MODEL (run-pipeline.js sets it to Gemini
 * Flash under --cheap / CHEAP_MODE), else CHEAP_MODE_MODEL when CHEAP_MODE=true
 * is set directly, else ~google/gemini-flash-latest (the vision model P4 OCR
 * uses on OpenRouter).
 *
 * RESUME: each product row stores batch_results.key = sha1(prompt version +
 * ordered image URL list). An unchanged gallery with an OK analysis is never
 * sent again (the model is NOT part of the key — switching model does not
 * re-pay); a failed / not-attempted product is retried next run. The whole
 * phase is skipped when the in-scope plan, the prompt version and the P3b
 * synthesis it joined are all unchanged since a complete run (or --force).
 *
 * PRE-FLIGHT: before any model call the table is probed; if migration 015 is
 * not applied the phase stops and spends nothing. No OPENROUTER_API_KEY →
 * inventory only.
 *
 * COST ESTIMATE (not run — see estimateCost in utils/marketing-assets.js):
 *   per product ≈ 1,050 prompt-text tokens + 8 images × 1,120 tokens (Gemini
 *   default media resolution; ASSUMED, not measured) + 2,000 completion:
 *   40 products ≈ 400k prompt + 80k completion tokens
 *     ~google/gemini-flash-latest / gemini-3.7-flash ($0.75 / $3.75 per M) ≈ $0.60 / keyword
 *     anthropic/claude-sonnet-5 (1,600 tok/image assumed, $2 / $10 per M)   ≈ $1.91 / keyword
 *   Re-runs cost $0 for every product whose gallery is unchanged.
 *
 * FAIL-OPEN: always exits 0 — P4 is retried as a whole by run-pipeline.js on
 * a non-zero exit, which would re-pay the OCR vision pass because of a P7b
 * problem. Consumers (P7, P9, the dashboard) fall back to their previous
 * behaviour when no row exists.
 */

'use strict';

const MA = require('./utils/marketing-assets');

const TABLE = 'dovive_marketing_assets';

const PRODUCT_SELECT = 'id, asin, title, brand, bsr_current, image_urls, main_image_url, has_a_plus_content, video_urls, video_count, feature_bullets_text';
// Only the raw paths that carry assets — raw_json is large.
const RESEARCH_SELECT = [
  'asin', 'keyword', 'scraped_at', 'images', 'main_image',
  'plus:raw_json->plus_content',
  'pd:raw_json->product_description',
  'ftb:raw_json->from_the_brand',
  'vids:raw_json->videos',
  'vcount:raw_json->video_count',
  'rvids:raw_json->review_videos',
].join(', ');

class CreditsExhausted extends Error {}

// ─── Options & dependencies ─────────────────────────────────────────────────

function intEnv(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; }

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const val = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    keyword: val('--keyword', argv[0] && !argv[0].startsWith('--') ? argv[0] : null),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    planOnly: argv.includes('--plan'),
    noModel: argv.includes('--no-model'),
    concurrency: Math.max(1, parseInt(val('--concurrency', env.P7B_CONCURRENCY || '3'), 10) || 3),
    maxProducts: Math.max(1, intEnv(env.P7B_MAX_PRODUCTS, 40)),
    topBsr: Math.max(1, intEnv(env.P7B_TOP_BSR, 20)),
    maxImages: Math.max(1, intEnv(env.P7B_MAX_IMAGES_PER_PRODUCT, 8)),
    maxAplus: intEnv(env.P7B_MAX_APLUS_IMAGES, 2),
    model: env.P7B_MODEL
      || env.ANALYSIS_MODEL
      || (env.CHEAP_MODE === 'true' ? (env.CHEAP_MODE_MODEL || 'google/gemini-3.7-flash') : null)
      || '~google/gemini-flash-latest',
    hasModelKey: !!env.OPENROUTER_API_KEY,
    env,
  };
}

function makeClients(env = process.env, log = console.log) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    log('❌ P7b: SUPABASE_URL / SUPABASE_KEY not set — nothing done (non-fatal).');
    return null;
  }
  const { createClient } = require('@supabase/supabase-js');
  return {
    dovive: createClient(env.SUPABASE_URL, env.SUPABASE_KEY),
    dash: createClient(env.DASH_URL || env.SUPABASE_URL, env.DASH_KEY || env.SUPABASE_KEY),
  };
}

/** OpenRouter multimodal caller — the transport ocr-phase4.js uses (text + image_url parts). */
function makeOpenRouterCaller({ model, env = process.env, ctx, usageWrites }) {
  const { withUsageTracking, recordAiUsage } = require('./utils/ai-usage');
  return async function callModel(messages) {
    const key = env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not set');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P7b Marketing Assets',
      },
      body: JSON.stringify(withUsageTracking({ model, max_tokens: parseInt(env.P7B_MAX_TOKENS || '8000', 10), temperature: 0, messages })),
    });
    if (res.status === 402) throw new CreditsExhausted('[ERROR: credits] OpenRouter credits exhausted (402)');
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    if (j.error) throw new Error(`OpenRouter: ${j.error.message || JSON.stringify(j.error)}`);
    usageWrites.push(recordAiUsage({ phase: 'P7b', model, usage: j.usage, categoryId: ctx.categoryId, keyword: ctx.keyword }).catch(() => {}));
    return { content: j.choices?.[0]?.message?.content || '', cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null };
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/** Pre-flight + previous category row in ONE select. */
async function loadPrevious(dash, keyword) {
  const { data, error } = await dash.from(TABLE)
    .select('generated_at, prompt_version, status, ledger')
    .eq('keyword', keyword).eq('scope', 'category')
    .order('generated_at', { ascending: false }).limit(1);
  if (error) return { ok: false, missingTable: MA.isMissingTableError(error), error };
  return { ok: true, row: (data && data[0]) || null };
}

async function loadPreviousProducts(dash, keyword) {
  const out = {};
  for (let page = 0; ; page++) {
    const { data, error } = await dash.from(TABLE)
      .select('asin, status, analysis, batch_results, model, prompt_version, generated_at')
      .eq('keyword', keyword).eq('scope', 'product')
      .order('asin', { ascending: true }).range(page * 500, page * 500 + 499);
    if (error || !data) break;
    for (const r of data) if (r.asin) out[r.asin] = r;
    if (data.length < 500) break;
  }
  return out;
}

async function fetchProducts(dash, categoryId) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await dash.from('products').select(PRODUCT_SELECT)
      .eq('category_id', categoryId).order('id', { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`products read failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function fetchResearch(dovive, asins) {
  const byAsin = {};
  for (let i = 0; i < asins.length; i += 100) {
    const { data, error } = await dovive.from('dovive_research').select(RESEARCH_SELECT).in('asin', asins.slice(i, i + 100));
    if (error) throw new Error(`dovive_research read failed: ${error.message}`);
    for (const r of data || []) (byAsin[r.asin] = byAsin[r.asin] || []).push(r);
  }
  return byAsin;
}

/** Selection first (ordered by selection_rank), else top-N by BSR. */
function pickScope(products, selection, { maxProducts, topBsr }) {
  const dedup = [];
  const seen = new Set();
  for (const p of products) if (p.asin && !seen.has(p.asin)) { seen.add(p.asin); dedup.push(p); }
  if (selection && selection.active) {
    const rows = dedup.filter((p) => selection.ranks.has(p.asin))
      .sort((a, b) => selection.ranks.get(a.asin) - selection.ranks.get(b.asin))
      .slice(0, maxProducts);
    return { mode: 'selection', why: selection.why, rows, ranks: selection.ranks };
  }
  const rows = dedup.slice().sort((a, b) => (a.bsr_current ?? Infinity) - (b.bsr_current ?? Infinity) || a.asin.localeCompare(b.asin))
    .slice(0, Math.min(topBsr, maxProducts));
  return { mode: 'top_bsr', why: selection ? selection.why : 'no selection', rows, ranks: null };
}

// ─── Model pass ────────────────────────────────────────────────────────────

async function analyseProduct({ entry, keyword, callModel, log, retryDelayMs = 5000 }) {
  const messages = MA.buildVisionMessages({ keyword, product: entry.inv, images: entry.images });
  const labels = entry.images.map((i) => i.label);
  let cost = 0;
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content, cost: c } = await callModel(messages);
      cost += c || 0;
      const parsed = MA.parseVisionResponse(content, labels);
      if (parsed.ok) return { ok: true, attempted: true, analysis: parsed.analysis, cost, attempts: attempt };
      lastError = 'unparseable response';
      log(`  ${entry.inv.asin}: unparseable response (attempt ${attempt})`);
    } catch (e) {
      if (e instanceof CreditsExhausted) {
        e.partial = { ok: false, attempted: attempt > 1, cost, attempts: attempt - 1, error: e.message };
        throw e;
      }
      lastError = e.message;
      log(`  ${entry.inv.asin}: ${e.message} (attempt ${attempt})`);
    }
    if (attempt === 1 && retryDelayMs) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return { ok: false, attempted: true, analysis: null, cost, attempts: 2, error: lastError };
}

async function runProducts({ entries, toRun, keyword, callModel, concurrency, log, retryDelayMs }) {
  const results = {};
  const queue = [...toRun];
  let stop = null;
  async function worker() {
    while (!stop && queue.length) {
      const i = queue.shift();
      try {
        results[i] = await analyseProduct({ entry: entries[i], keyword, callModel, log, retryDelayMs });
        const r = results[i];
        const a = r.analysis;
        log(`  ${entries[i].inv.asin}: ${r.ok ? `${entries[i].images.length} images → ${a.recurring_messages.length} messages, ${a.demonstrated_use_cases.length} use cases, ${a.comparison_table_claims.length} comparison claims${a.validation.dropped_total ? `, ${a.validation.dropped_total} unevidenced items dropped` : ''}` : `FAILED (${r.error})`}`);
      } catch (e) {
        if (e.partial) results[i] = e.partial;
        stop = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toRun.length) }, worker));
  if (stop) log(`  ❌ ${stop.message} — ${queue.length} product(s) not attempted; saved as partial, resumes next run.`);
  return { results, stopped: stop };
}

// ─── Writes ────────────────────────────────────────────────────────────────

async function upsertRows(dash, rows) {
  for (let i = 0; i < rows.length; i += 25) {
    const { error } = await dash.from(TABLE).upsert(rows.slice(i, i + 25), { onConflict: 'keyword,scope,asin_key' });
    if (error) throw new Error(`${TABLE} upsert failed: ${error.message}`);
  }
}

async function writePointers(dash, entries, rowsByAsin, log) {
  const probe = await dash.from('products').select('marketing_asset_analysis').limit(1);
  if (probe.error) {
    log(`  ⚠️ products.marketing_asset_analysis not available (${probe.error.message}) — pointers skipped (migration 015).`);
    return 0;
  }
  let n = 0;
  for (const e of entries) {
    const row = rowsByAsin[e.inv.asin];
    if (!row || !e.product.id) continue;
    const a = row.analysis;
    const pointer = {
      source: TABLE,
      keyword: row.keyword,
      status: row.status,
      prompt_version: row.prompt_version,
      generated_at: row.generated_at,
      images_analyzed: row.ledger.images_analyzed,
      main_promise: a && a.main_promise ? a.main_promise.text : null,
      target_audience: a && a.target_audience ? a.target_audience.who : null,
      recurring_messages: a ? a.recurring_messages.length : 0,
    };
    const { error } = await dash.from('products').update({ marketing_asset_analysis: pointer }).eq('id', e.product.id);
    if (error) log(`  ⚠️ ${e.inv.asin}: pointer not saved (${error.message})`);
    else n++;
  }
  return n;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function productStatus(result, images) {
  if (!images.length) return 'no_images';
  if (!result) return 'inventory_only';
  if (result.ok) return 'complete';
  return result.attempted ? 'failed' : 'not_attempted';
}

/**
 * @param {object} opts  from parseOptions
 * @param {object} deps  { dovive, dash, callModel, resolveCategory, loadSelection, fetchSynthesis, pricing, log, now }
 */
async function run(opts, deps = {}) {
  const log = deps.log || console.log;
  const now = deps.now || Date.now;
  const { keyword } = opts;
  if (!keyword) { log('Usage: node phase7b-marketing-assets.js --keyword "magnesium gummies" [--force] [--dry-run] [--plan] [--no-model]'); return { aborted: 'no_keyword', modelCalls: 0 }; }
  log(`=== P7b Marketing Assets — "${keyword}" ===`);
  log(`Model: ${opts.noModel ? 'none (--no-model)' : opts.model} | ≤ ${opts.maxProducts} products (top ${opts.topBsr} by BSR without a selection) | ≤ ${opts.maxImages} images/product (${opts.maxAplus} reserved for A+)${opts.dryRun ? ' | DRY RUN (zero network)' : opts.planOnly ? ' | PLAN (read-only)' : ''}`);

  // 0. Dry run: ZERO network — the configured plan and a worst-case estimate.
  if (opts.dryRun) {
    const worst = MA.estimateCost(Array(opts.maxProducts).fill(opts.maxImages), { model: opts.model, pricing: deps.pricing, env: opts.env || {} });
    const noSel = MA.estimateCost(Array(Math.min(opts.topBsr, opts.maxProducts)).fill(opts.maxImages), { model: opts.model, pricing: deps.pricing, env: opts.env || {} });
    const fmt = (e) => `${e.calls} calls, ${e.images} images, ≈ ${e.prompt_tokens.toLocaleString('en-US')} prompt + ${e.completion_tokens.toLocaleString('en-US')} completion tokens (${e.tokens_per_image} tokens/image assumed) → ${e.cost_usd == null ? 'cost unknown (model not in PRICING)' : `≈ $${e.cost_usd.toFixed(2)}`}`;
    log(`  With a competitor selection (worst case): ${fmt(worst)}`);
    log(`  Without a selection (top ${Math.min(opts.topBsr, opts.maxProducts)} by BSR):    ${fmt(noSel)}`);
    log('  Products whose gallery is unchanged since an OK analysis are not re-sent ($0). Use --plan for the real per-product plan (read-only).');
    log('  DRY RUN — no DB reads, no model calls, nothing written.');
    return { dryRun: true, modelCalls: 0, estimate: { with_selection: worst, without_selection: noSel } };
  }

  const { dovive, dash } = deps;

  // 1. Pre-flight — BEFORE any model call: is migration 015 applied?
  const prev = await loadPrevious(dash, keyword);
  if (!prev.ok) {
    log(`  ❌ ${TABLE} ${prev.missingTable ? 'does not exist (migration 015 not applied)' : `is not readable (${prev.error && prev.error.message})`} — ${opts.planOnly ? 'plan continues, nothing would be saved' : 'stopping before any model call; nothing spent'}.`);
    if (!opts.planOnly) return { aborted: prev.missingTable ? 'table_missing' : 'table_unreadable', modelCalls: 0 };
  }
  const prevRow = prev.ok ? prev.row : null;

  // 2. Category
  const ctx = deps.ctx || { keyword, categoryId: null };
  try {
    const cat = await deps.resolveCategory(dash, keyword);
    ctx.categoryId = cat.id;
    log(`  → Category (${cat.method}): "${cat.name}" (${cat.id})`);
  } catch (e) {
    log(`  ❌ Category not resolved (${e.message}) — nothing to analyse.`);
    return { aborted: 'no_category', modelCalls: 0 };
  }

  // 3. Scope: selection, else top-N by BSR
  const selection = deps.loadSelection ? await deps.loadSelection(dash, ctx.categoryId) : { active: false, why: 'selection loader not provided', ranks: new Map() };
  const all = await fetchProducts(dash, ctx.categoryId);
  const scope = pickScope(all, selection, opts);
  log(`  Scope: ${scope.mode === 'selection' ? `${scope.rows.length} selected competitors (${scope.why})` : `top ${scope.rows.length} by BSR (${scope.why})`} of ${all.length} products in the category`);
  if (!scope.rows.length) { log('  No products in scope — nothing to analyse.'); return { aborted: 'no_products', modelCalls: 0 }; }

  // 4. Inventory (no model)
  const research = await fetchResearch(dovive, scope.rows.map((p) => p.asin));
  const entries = scope.rows.map((product) => {
    const inv = MA.buildInventory(product, MA.pickResearchRow(research[product.asin], keyword));
    const images = MA.selectImagesForCall(inv, opts);
    return { product, inv, images, key: images.length ? MA.assetKey(images) : null, rank: scope.ranks ? scope.ranks.get(product.asin) : null };
  });

  // 5. Resume: an OK analysis for the same image list is reused, never re-sent.
  const prevProducts = prev.ok ? await loadPreviousProducts(dash, keyword) : {};
  const useModel = !opts.noModel && opts.hasModelKey;
  const results = entries.map((e) => {
    const p = prevProducts[e.inv.asin];
    const br = p && p.batch_results;
    if (!opts.force && e.key && br && br.ok && br.key === e.key && p.prompt_version === MA.PROMPT_VERSION && p.analysis) {
      return { ok: true, cached: true, attempted: false, analysis: p.analysis, cost: 0, model: p.model || br.model || null, analyzed_at: br.analyzed_at || p.generated_at };
    }
    return null;
  });
  const toRun = entries.map((_, i) => i).filter((i) => entries[i].images.length && !results[i]);

  // 6. P3b synthesis (for experienced vs claimed) + skip-when-fresh
  const synthesis = deps.fetchSynthesis ? await deps.fetchSynthesis(dash, { keyword, categoryId: ctx.categoryId, reviewsClient: dovive, log }) : null;
  const digest = MA.planDigest(entries);
  const synthesisAt = (synthesis && synthesis.generated_at) || null;
  if (!opts.force && !opts.planOnly && !toRun.length && prevRow && prevRow.status === 'complete' && prevRow.prompt_version === MA.PROMPT_VERSION
      && prevRow.ledger && prevRow.ledger.plan_digest === digest && (prevRow.ledger.synthesis_generated_at || null) === synthesisAt) {
    log('  ✅ Every in-scope gallery is unchanged and the review synthesis is the same as the last complete run — skipping (use --force to redo).');
    return { skipped: 'current', modelCalls: 0 };
  }

  const pricing = deps.pricing || null;
  const estimate = MA.estimateCost(toRun.map((i) => entries[i]), { model: opts.model, pricing, env: opts.env || {} });
  const pre = MA.buildAssetLedger(entries.map((e) => ({ inv: e.inv, images: e.images, result: null })));
  log(`  Inventory: ${pre.gallery_images_available} gallery + ${pre.a_plus_images_available} A+ + ${pre.brand_story_images_available} brand-story images; A+ on ${pre.a_plus_available}/${entries.length} products (${pre.a_plus_unknown} unknown); ${pre.videos_available} videos on ${pre.products_with_videos} products (not analysed: no frame/transcript path)`);
  log(`  Vision pass: ${entries.filter((e) => e.images.length).length} products with images, ${results.filter(Boolean).length} cached from an earlier run, ${toRun.length} to send (${estimate.images} images, ${estimate.cost_usd == null ? 'cost unknown' : `≈ $${estimate.cost_usd.toFixed(2)}`} on ${opts.model})${useModel ? '' : ' — not sent this run (no model)'}`);

  if (opts.planOnly) {
    for (const e of entries) {
      const cached = results[entries.indexOf(e)] ? 'cached' : e.images.length ? 'send' : 'no images';
      log(`    ${e.inv.asin}${e.rank != null ? ` #${e.rank}` : ''} bsr ${e.inv.bsr ?? '–'} | gallery ${e.inv.gallery.length}, A+ ${e.inv.a_plus.images.length}${e.inv.a_plus.available == null ? '?' : ''}, brand ${e.inv.brand_story.length}, videos ${e.inv.videos.listing_count}+${e.inv.videos.a_plus_streams} | sending ${e.images.map((i) => i.label).join(',') || '-'} | ${cached}`);
    }
    log('  PLAN — read-only: no model calls, nothing written.');
    return { plan: true, modelCalls: 0, ledger: pre, estimate, entries: entries.map((e) => ({ asin: e.inv.asin, images: e.images.map((i) => i.label), key: e.key })) };
  }
  if (!useModel && !opts.noModel) log('  ⚠️ No OPENROUTER_API_KEY — writing the inventory (and any cached analyses) only.');

  // 7. Model pass
  let modelCalls = 0;
  const callModel = async (messages) => { modelCalls++; return deps.callModel(messages); };
  let creditsStop = null;
  let runCost = 0;
  if (useModel && toRun.length) {
    const ran = await runProducts({ entries, toRun, keyword, callModel, concurrency: opts.concurrency, log, retryDelayMs: opts.retryDelayMs ?? 5000 });
    creditsStop = ran.stopped;
    for (const i of toRun) {
      results[i] = ran.results[i] || { ok: false, attempted: false, cost: 0, error: creditsStop ? 'not attempted (credits exhausted)' : 'not attempted' };
      runCost += results[i].cost || 0;
    }
  }

  // 8. Roll-up + experienced vs claimed (pure)
  const rollupFull = MA.buildRollup(entries.map((e, i) => ({ asin: e.inv.asin, analysis: results[i] && results[i].ok ? results[i].analysis : null, bullets_text: e.product.feature_bullets_text })));
  const evc = MA.buildExperiencedVsClaimed(rollupFull, synthesis);
  const rollup = MA.publicRollup(rollupFull);
  const ledger = MA.buildAssetLedger(entries.map((e, i) => ({ inv: e.inv, images: e.images, result: results[i] })), { scope: { mode: scope.mode, why: scope.why, products_in_category: all.length, products_in_scope: entries.length, max_products: opts.maxProducts } });
  Object.assign(ledger, {
    model: useModel ? opts.model : null,
    model_calls: modelCalls,
    cost_usd_this_run: Math.round(runCost * 10000) / 10000,
    max_images_per_product: opts.maxImages,
    max_a_plus_images: opts.maxAplus,
    plan_digest: digest,
    synthesis_generated_at: synthesisAt,
    synthesis_status: synthesis ? synthesis.status || null : null,
    stopped: creditsStop ? creditsStop.message : null,
  });
  const status = MA.computeCategoryStatus(ledger);
  log(`  Ledger: ${ledger.products_analyzed}/${ledger.products} products analysed (${ledger.products_cached} cached, ${ledger.products_failed} failed, ${ledger.products_not_attempted} not attempted); ${ledger.images_analyzed}/${ledger.images_available} images read (${ledger.a_plus_images_analyzed}/${ledger.a_plus_images_available} A+); videos ${ledger.videos_analyzed}/${ledger.videos_available}; ${ledger.claims_dropped_unevidenced} unevidenced items dropped — status ${status}`);
  log(`  Experienced vs claimed${evc.available ? '' : ' (no P3b synthesis — every claim is no_review_signal)'}: ${evc.counts.experienced} experienced, ${evc.counts.claimed_only} claimed only, ${evc.counts.contradicted} contradicted, ${evc.counts.no_review_signal} no review signal`);
  for (const it of evc.items.slice(0, 10)) log(`    ${it.verdict.padEnd(16)} ${it.claim} — ${it.products_claiming} products${it.review_support ? ` ↔ "${it.review_support.theme_label}" (${it.review_support.review_count} reviews, ${it.review_support.rule})` : ''}`);

  // 9. Rows
  const generatedAt = new Date(now()).toISOString();
  const base = { keyword, category_id: ctx.categoryId, generated_at: generatedAt, prompt_version: MA.PROMPT_VERSION };
  const rowsByAsin = {};
  const productRows = entries.map((e, i) => {
    const r = results[i];
    const st = productStatus(r, e.images);
    const one = MA.buildAssetLedger([{ inv: e.inv, images: e.images, result: r }]);
    const row = {
      ...base,
      scope: 'product',
      asin: e.inv.asin,
      ledger: one,
      assets: { ...e.inv, selected_images: e.images, selection_rank: e.rank, per_image: MA.perImageView(e.images, r && r.ok ? r.analysis : null) },
      analysis: r && r.ok ? r.analysis : null,
      rollup: null,
      experienced_vs_claimed: null,
      batch_results: { key: e.key, ok: !!(r && r.ok), status: st, cached: !!(r && r.cached), attempts: r ? r.attempts || 0 : 0, error: r && !r.ok ? r.error || null : null, cost_usd: r ? r.cost || 0 : 0, model: r ? (r.cached ? r.model : opts.model) : null, analyzed_at: r && r.ok ? (r.cached ? r.analyzed_at : generatedAt) : null },
      status: st,
      model: r && r.ok ? (r.cached ? r.model : opts.model) : null,
      cost_usd: r && !r.cached ? r.cost || 0 : 0,
    };
    rowsByAsin[e.inv.asin] = row;
    return row;
  });
  const categoryRow = {
    ...base,
    scope: 'category',
    asin: null,
    ledger,
    assets: { products: entries.map((e, i) => ({ asin: e.inv.asin, title: e.inv.title, brand: e.inv.brand, bsr: e.inv.bsr, selection_rank: e.rank, gallery: e.inv.gallery.length, a_plus: e.inv.a_plus.available, a_plus_images: e.inv.a_plus.images.length, videos: e.inv.videos.listing_count + e.inv.videos.a_plus_streams, images_sent: e.images.length, status: productRows[i].status })) },
    analysis: null,
    rollup,
    experienced_vs_claimed: evc,
    batch_results: Object.fromEntries(productRows.map((r) => [r.asin, { key: r.batch_results.key, ok: r.batch_results.ok, status: r.status }])),
    status,
    model: useModel ? opts.model : null,
    cost_usd: ledger.cost_usd_this_run,
  };

  await upsertRows(dash, [categoryRow, ...productRows]);
  log(`  ✅ Saved ${TABLE}: 1 category row + ${productRows.length} product rows (status ${status})`);
  const pointers = await writePointers(dash, entries, rowsByAsin, log);
  log(`  ✅ products.marketing_asset_analysis pointer on ${pointers} products`);
  return { status, ledger, rollup, evc, categoryRow, productRows, modelCalls };
}

if (require.main === module) {
  require('dotenv').config(); // a local file read — no network
  const env = process.env;
  const opts = parseOptions(process.argv.slice(2), env);
  const usageWrites = [];
  let main;
  if (opts.dryRun) {
    // Zero network: no Supabase clients are created, no model caller exists.
    main = run(opts, { pricing: require('./utils/ai-usage').PRICING });
  } else {
    const clients = makeClients(env);
    const ctx = { keyword: opts.keyword, categoryId: null };
    main = clients
      ? run(opts, {
        ...clients,
        ctx,
        callModel: makeOpenRouterCaller({ model: opts.model, env, ctx, usageWrites }),
        resolveCategory: require('./utils/category-resolver').resolveCategory,
        loadSelection: require('./utils/selected-competitors').loadSelection,
        fetchSynthesis: require('./utils/review-synthesis-store').fetchCategorySynthesis,
        pricing: require('./utils/ai-usage').PRICING,
      })
      : Promise.resolve();
  }
  main
    .catch((e) => { console.error(`\n❌ P7b marketing assets FAILED (non-fatal, consumers fall back): ${e.message}`); })
    .finally(async () => { await Promise.allSettled(usageWrites); process.exit(0); });
}

module.exports = { run, parseOptions, pickScope, loadPrevious, makeClients, TABLE, RESEARCH_SELECT, PRODUCT_SELECT, CreditsExhausted };
