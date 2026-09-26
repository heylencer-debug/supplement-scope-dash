/**
 * phase3b-review-synthesis.js — P3b: evidence-counted review synthesis.
 *
 * NOT YET WIRED INTO run-pipeline.js. It is meant to run at the end of P3,
 * right after migrate-reviews-to-dash.js; the runner line is added on merge.
 * Until then it runs only by hand (below).
 *
 * Reads EVERY collected review for the keyword from dovive_reviews and writes
 * dovive_review_synthesis (migration 012):
 *   - one scope='category' row: coverage ledger (collected / in scope /
 *     themed / rating-only / in failed batches / not attempted), deterministic
 *     issue-domain breakdown, and the themes (complaints / unmet needs /
 *     praise) with supporting review ids, review + distinct-product counts,
 *     verified share, date range, verbatim excerpts, counter-evidence, scope;
 *   - one scope='product' row per ASIN with the same, restricted to that ASIN,
 *     each with its OWN coverage and status.
 * Then merges a `review_evidence` block into products.review_analysis
 * (additive — every existing field is kept).
 *
 * P6a / P7 / P8 / migrate-reviews-to-dash.js prefer this over their old
 * 5+5 / random 60+60 samples when a FRESH row exists (a synthesis older than
 * the latest scrape of the keyword is ignored — utils/review-synthesis-store.js).
 *
 * Usage:
 *   node phase3b-review-synthesis.js --keyword "magnesium gummies"
 *     [--force]          re-synthesise even if a current row exists
 *     [--dry-run]        read + ledger + batch plan + cost estimate; no model, no writes
 *     [--no-model]       deterministic only (ledger + domain breakdown), writes, $0
 *     [--batch 100]      reviews per model call
 *     [--concurrency 3]  parallel model calls
 *
 * Model: REVIEW_SYNTHESIS_MODEL, else ANALYSIS_MODEL (run-pipeline.js sets it
 * to Gemini Flash under --cheap / CHEAP_MODE), else CHEAP_MODE_MODEL when
 * CHEAP_MODE=true is set directly, else anthropic/claude-sonnet-5.
 * Cap: REVIEW_SYNTHESIS_MAX_REVIEWS (default 12,000 unique reviews; the
 * largest keyword today, "hydration powder", has 3,760) — when hit, the
 * ledger says so.
 *
 * SIBLING SESSIONS (READ-FIRST reuse): when SCOUT_REUSE_KEYWORDS is set
 * (comma-separated sibling session labels, optional SCOUT_REUSE_MAX_AGE_DAYS),
 * ASINs of this category that have NO reviews under this keyword are read
 * from the freshest sibling session that has them — the same rule
 * migrate-reviews-to-dash.js uses on the inventory branch. Nothing is copied;
 * the ledger records `reused_from` per sibling keyword.
 *
 * RESUME: per-batch results are stored on the category row (`batch_results`,
 * keyed by a hash of prompt version + model + the batch's sorted review ids).
 * A re-run of a partial synthesis re-sends ONLY the batches that failed, were
 * never attempted (e.g. after a 402) or were suspect.
 *
 * PRE-FLIGHT: before any read-heavy work or model call, the table is probed;
 * if migration 012 is not applied the phase stops with a log line and spends
 * nothing.
 *
 * COST ESTIMATE (not run; chars/4 tokens, utils/ai-usage.js PRICING):
 *   2,000 unique reviews with text → 20 calls ≈ 185k prompt + ≈ 50k completion
 *   tokens (completion assumed 2,500/call — generous), + 1 label-merge call:
 *     anthropic/claude-sonnet-5  ($2 / $10 per M)      ≈ $0.90
 *     google/gemini-3.7-flash    ($0.75 / $3.75 per M) ≈ $0.35   (CHEAP_MODE)
 *   Measured on real data (read-only, prompt sizes computed, no calls):
 *     "magnesium gummies" 1,922 rows → 1,080 unique → 11 calls, 99.6k prompt tok:
 *        ≈ $0.47 Sonnet / ≈ $0.18 Flash
 *     "hydration powder"  9,049 rows → 3,760 unique → 38 calls, 320k prompt tok:
 *        ≈ $1.59 Sonnet / ≈ $0.60 Flash
 *   Re-runs are skipped when a COMPLETE synthesis is newer than the latest
 *   scrape (or --force); partial ones resume.
 *
 * FAIL-OPEN: always exits 0. P3 is retried as a whole by run-pipeline.js on a
 * non-zero exit, which would re-scrape reviews (Bright Data spend) because of
 * a synthesis problem — so errors are logged loudly and the phase moves on;
 * consumers fall back to their old sampling when no row exists.
 */

'use strict';

const RS = require('./utils/review-synthesis');

const TABLE = 'dovive_review_synthesis';

// Only the fields the synthesis uses — raw_json is ~2 KB/row, so pull just
// the raw paths that carry title/date/verified/review id on Bright Data rows.
const SELECT = [
  'id', 'asin', 'keyword', 'rating', 'title', 'body', 'review_date', 'verified_purchase', 'helpful_votes', 'scraped_at',
  'rid:raw_json->raw->>review_id',
  'rheader:raw_json->raw->>review_header',
  'rdate:raw_json->raw->>review_posted_date',
  'rverified:raw_json->raw->>is_verified',
  'rvine:raw_json->raw->>is_amazon_vine',
  'rvariant:raw_json->raw->>variant_name',
  'date_text:raw_json->>date_text',
].join(', ');

class CreditsExhausted extends Error {}

// ─── Options & dependencies ─────────────────────────────────────────────────

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const val = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const keyword = val('--keyword', argv[0] && !argv[0].startsWith('--') ? argv[0] : null);
  const maxAge = Number(env.SCOUT_REUSE_MAX_AGE_DAYS);
  return {
    keyword,
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    noModel: argv.includes('--no-model'),
    batchSize: Math.max(10, parseInt(val('--batch', '100'), 10) || 100),
    concurrency: Math.max(1, parseInt(val('--concurrency', '3'), 10) || 3),
    maxReviews: parseInt(env.REVIEW_SYNTHESIS_MAX_REVIEWS || '12000', 10),
    model: env.REVIEW_SYNTHESIS_MODEL
      || env.ANALYSIS_MODEL
      || (env.CHEAP_MODE === 'true' ? (env.CHEAP_MODE_MODEL || 'google/gemini-3.7-flash') : null)
      || 'anthropic/claude-sonnet-5',
    hasModelKey: !!env.OPENROUTER_API_KEY,
    reuseKeywords: list(env.SCOUT_REUSE_KEYWORDS).filter((k) => !keyword || k.toLowerCase() !== keyword.toLowerCase()),
    reuseMaxAgeDays: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : null,
  };
}

/** Supabase clients, created lazily so a missing env logs instead of throwing at import. */
function makeClients(env = process.env, log = console.log) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    log('❌ P3b: SUPABASE_URL / SUPABASE_KEY not set — nothing done (non-fatal).');
    return null;
  }
  const { createClient } = require('@supabase/supabase-js');
  return {
    dovive: createClient(env.SUPABASE_URL, env.SUPABASE_KEY),
    dash: createClient(env.DASH_URL || env.SUPABASE_URL, env.DASH_KEY || env.SUPABASE_KEY),
  };
}

/** Default OpenRouter caller (same pattern as every other phase). */
function makeOpenRouterCaller({ model, env = process.env, ctx, usageWrites }) {
  const { withUsageTracking, recordAiUsage } = require('./utils/ai-usage');
  return async function callModel(prompt) {
    const key = env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not set');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P3b Review Synthesis',
      },
      body: JSON.stringify(withUsageTracking({ model, max_tokens: 12000, temperature: 0, messages: [{ role: 'user', content: prompt }] })),
    });
    if (res.status === 402) throw new CreditsExhausted('[ERROR: credits] OpenRouter credits exhausted (402)');
    const j = await res.json();
    if (j.error) throw new Error(`OpenRouter: ${j.error.message || JSON.stringify(j.error)}`);
    usageWrites.push(recordAiUsage({ phase: 'P3b', model, usage: j.usage, categoryId: ctx.categoryId, keyword: ctx.keyword }).catch(() => {}));
    return { content: j.choices?.[0]?.message?.content || '', cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null };
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Pre-flight + previous run in ONE select. Returns
 * { ok:false, missingTable:true } when migration 012 is not applied.
 */
async function loadPrevious(dash, keyword) {
  const { data, error } = await dash.from(TABLE)
    .select('generated_at, prompt_version, status, model, batch_results')
    .eq('keyword', keyword).eq('scope', 'category')
    .order('generated_at', { ascending: false }).limit(1);
  if (error) return { ok: false, missingTable: RS.isMissingTableError(error), error };
  return { ok: true, row: (data && data[0]) || null };
}

async function fetchRows(dovive, build) {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await build().order('id', { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`dovive_reviews read failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * READ-FIRST sibling reuse: for category ASINs with no rows under this
 * keyword, read the freshest sibling session that has them.
 */
async function fetchSiblingRows({ dovive, dash, categoryId, keyword, reuseKeywords, reuseMaxAgeDays, haveAsins, now, log }) {
  if (!reuseKeywords.length || !categoryId) return { rows: [], reusedFrom: {} };
  const { data: prods, error } = await dash.from('products').select('asin').eq('category_id', categoryId);
  if (error) { log(`  ⚠️ sibling reuse skipped (products read failed: ${error.message})`); return { rows: [], reusedFrom: {} }; }
  const need = (prods || []).map((p) => p.asin).filter((a) => a && !haveAsins.has(a));
  if (!need.length) return { rows: [], reusedFrom: {} };
  const cutoff = reuseMaxAgeDays ? new Date(now() - reuseMaxAgeDays * 86400000).toISOString() : null;
  const sibling = [];
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    sibling.push(...await fetchRows(dovive, () => {
      let q = dovive.from('dovive_reviews').select(SELECT)
        .or(reuseKeywords.map((k) => `keyword.ilike.${JSON.stringify(k)}`).join(','))
        .in('asin', chunk);
      if (cutoff) q = q.gte('scraped_at', cutoff);
      return q;
    }));
  }
  const freshest = {};
  for (const r of sibling) {
    const cur = freshest[r.asin];
    if (!cur || (r.scraped_at || '') > cur.at) freshest[r.asin] = { kw: r.keyword, at: r.scraped_at || '' };
  }
  const rows = sibling.filter((r) => freshest[r.asin] && freshest[r.asin].kw === r.keyword);
  const reusedFrom = {};
  for (const r of rows) reusedFrom[r.keyword] = (reusedFrom[r.keyword] || 0) + 1;
  log(`  READ-FIRST reuse: ${Object.keys(freshest).length} ASINs read from sibling sessions (${reuseKeywords.join(', ')})`);
  return { rows, reusedFrom };
}

// ─── Model pass ────────────────────────────────────────────────────────────

/** One batch → { ok, attempted, suspect, themes, dropped, cost }. One retry. */
async function runBatch({ batch, index, total, keyword, preById, callModel, log, retryDelayMs = 5000 }) {
  const prompt = RS.buildBatchPrompt(batch, { keyword, preById });
  const ids = batch.map((r) => r.id);
  let cost = 0;
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content, cost: c } = await callModel(prompt);
      cost += c || 0;
      const parsed = RS.parseBatchResponse(content, ids);
      if (parsed.ok) {
        const suspect = RS.isSuspectBatch(parsed.dropped_ids, batch.length);
        last = { ok: true, attempted: true, suspect, themes: parsed.themes, dropped: parsed.dropped_ids, cost };
        if (!suspect) {
          log(`  batch ${index + 1}/${total}: ${parsed.themes.length} themes${parsed.dropped_ids ? `, ${parsed.dropped_ids} unknown ids dropped` : ''}`);
          return last;
        }
        log(`  batch ${index + 1}/${total}: ${parsed.dropped_ids} unknown ids (> 10% of ${batch.length}) — suspect (attempt ${attempt})`);
      } else {
        log(`  batch ${index + 1}/${total}: unparseable response (attempt ${attempt})`);
      }
    } catch (e) {
      if (e instanceof CreditsExhausted) {
        // Nothing was processed on this call: report the batch as not attempted.
        e.partial = last ? { ...last, cost } : { ok: false, attempted: attempt > 1, themes: [], dropped: 0, cost };
        throw e;
      }
      log(`  batch ${index + 1}/${total}: ${e.message} (attempt ${attempt})`);
    }
    if (attempt === 1 && retryDelayMs) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return last ? { ...last, cost } : { ok: false, attempted: true, themes: [], dropped: 0, cost };
}

async function runBatches({ batches, toRun, keyword, preById, callModel, concurrency, log, retryDelayMs }) {
  const results = {};
  const queue = [...toRun];
  let stop = null;
  async function worker() {
    while (!stop && queue.length) {
      const i = queue.shift();
      try {
        results[i] = await runBatch({ batch: batches[i], index: i, total: batches.length, keyword, preById, callModel, log, retryDelayMs });
      } catch (e) {
        if (e.partial) results[i] = e.partial;
        stop = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toRun.length) }, worker));
  if (stop) log(`  ❌ ${stop.message} — ${queue.length} batch(es) not attempted; synthesis saved as partial and resumes next run.`);
  return { results, stopped: stop };
}

// ─── Writes ────────────────────────────────────────────────────────────────

async function upsertRows(dash, rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await dash.from(TABLE).upsert(rows.slice(i, i + 50), { onConflict: 'keyword,scope,asin_key' });
    if (error) throw new Error(`${TABLE} upsert failed: ${error.message}`);
  }
}

async function attachEvidenceToProducts(dash, categoryId, productRows, log) {
  if (!categoryId) return 0;
  const byAsin = new Map(productRows.map((r) => [r.asin, r]));
  const { data: products, error } = await dash.from('products').select('id, asin, review_analysis').eq('category_id', categoryId);
  if (error) throw new Error(`products read failed: ${error.message}`);
  let n = 0;
  for (const p of products || []) {
    const row = byAsin.get(p.asin);
    if (!row) continue;
    const { error: upErr } = await dash.from('products')
      .update({ review_analysis: { ...(p.review_analysis || {}), review_evidence: RS.buildProductEvidence(row) } })
      .eq('id', p.id);
    if (upErr) log(`  ⚠️ ${p.asin}: review_evidence not saved (${upErr.message})`);
    else n++;
  }
  return n;
}

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * @param {object} opts   from parseOptions
 * @param {object} deps   { dovive, dash, callModel, resolveCategory, pricing, log, now }
 * @returns {Promise<object>} a summary (used by tests and the CLI log)
 */
async function synthesize(opts, deps) {
  const log = deps.log || console.log;
  const now = deps.now || Date.now;
  const { dovive, dash } = deps;
  const { keyword } = opts;
  if (!keyword) { log('Usage: node phase3b-review-synthesis.js --keyword "magnesium gummies" [--force] [--dry-run] [--no-model]'); return { aborted: 'no_keyword' }; }
  log(`=== P3b Review Synthesis — "${keyword}" ===`);
  log(`Model: ${opts.noModel ? 'none (--no-model)' : opts.model} | batch ${opts.batchSize} | cap ${opts.maxReviews.toLocaleString()}${opts.dryRun ? ' | DRY RUN' : ''}`);

  // 1. Pre-flight — BEFORE any model call: is migration 012 applied?
  const prev = await loadPrevious(dash, keyword);
  if (!prev.ok) {
    if (prev.missingTable) {
      log(`  ❌ ${TABLE} does not exist (migration 012 not applied) — ${opts.dryRun ? 'dry run continues, nothing would be saved' : 'stopping before any model call; nothing spent'}.`);
    } else {
      log(`  ❌ ${TABLE} is not readable (${prev.error && prev.error.message}) — ${opts.dryRun ? 'dry run continues' : 'stopping before any model call; nothing spent'}.`);
    }
    if (!opts.dryRun) return { aborted: prev.missingTable ? 'table_missing' : 'table_unreadable', modelCalls: 0 };
  }
  const prevRow = prev.ok ? prev.row : null;

  // 2. Category
  const ctx = deps.ctx || { keyword, categoryId: null };
  try {
    const cat = await deps.resolveCategory(dash, keyword);
    ctx.categoryId = cat.id;
    log(`  → Category (${cat.method}): "${cat.name}" (${cat.id})`);
  } catch (e) {
    log(`  ⚠️ Category not resolved (${e.message}) — synthesis still runs, product rows are not updated.`);
  }

  // 3. Reviews (+ READ-FIRST sibling rows)
  const own = await fetchRows(dovive, () => dovive.from('dovive_reviews').select(SELECT).eq('keyword', keyword));
  const sib = await fetchSiblingRows({ dovive, dash, categoryId: ctx.categoryId, keyword, reuseKeywords: opts.reuseKeywords || [], reuseMaxAgeDays: opts.reuseMaxAgeDays, haveAsins: new Set(own.map((r) => r.asin)), now, log });
  const rows = [...own, ...sib.rows];
  if (!rows.length) { log('  No reviews collected for this keyword — nothing to synthesise.'); return { aborted: 'no_reviews', modelCalls: 0 }; }
  const latestScrapedAt = own.reduce((m, r) => (r.scraped_at && (!m || r.scraped_at > m) ? r.scraped_at : m), null);

  if (!opts.force && !opts.dryRun && prevRow && prevRow.status === 'complete' && prevRow.prompt_version === RS.PROMPT_VERSION
      && !RS.isStaleSynthesis(prevRow.generated_at, latestScrapedAt) && latestScrapedAt) {
    log('  ✅ A complete synthesis is newer than the last scraped review — skipping (use --force to redo).');
    return { skipped: 'current', modelCalls: 0 };
  }

  // 4. Deterministic pass over everything
  const prepared = RS.prepareReviews(rows);
  if (prepared.stats.rows_without_review_id) {
    log(`  ⚠️ ${prepared.stats.rows_without_review_id} rows carry no Amazon review_id — de-duplicated within their ASIN by rating + text only (never joined across ASINs).`);
  }
  const { analyzed, cap } = RS.applyCap(prepared.reviews, opts.maxReviews);
  const pre = analyzed.map((r) => RS.preclassifyReview(r));
  const preById = new Map(pre.map((p) => [p.review_id, p]));
  const ledger = RS.buildLedger({ collected: prepared.reviews, analyzed, cap, stats: prepared.stats, familyOf: prepared.familyOf, perProduct: true });
  ledger.rows_without_review_id = prepared.stats.rows_without_review_id;
  if (Object.keys(sib.reusedFrom).length) ledger.reused_from = sib.reusedFrom;
  const domainBreakdown = RS.buildDomainBreakdown(analyzed, pre);
  for (const d of domainBreakdown) {
    if (d.reviews_mentioning) log(`    ${d.domain.padEnd(18)} ${String(d.negative.count).padStart(5)} negative (${d.negative.products} products) | ${String(d.positive.count).padStart(5)} positive (${d.positive.products} products)`);
  }

  const batches = RS.buildBatches(analyzed, opts.batchSize);
  const pricing = deps.pricing ? deps.pricing[opts.model] : null;
  const estimate = RS.estimateSynthesisCost(batches, pricing, { keyword });

  // 5. Resume cache: reuse successful batches of a previous partial run
  const keys = batches.map((b) => RS.batchKey(b, { model: opts.model }));
  const cache = (prevRow && prevRow.prompt_version === RS.PROMPT_VERSION && !opts.force && prevRow.batch_results) || {};
  const useModel = !opts.noModel && batches.length && opts.hasModelKey;
  const uncached = batches.map((_, i) => i).filter((i) => !(cache[keys[i]] && cache[keys[i]].ok));
  const toRun = useModel ? uncached : [];
  const est = estimate.cost_usd != null ? `≈ $${(estimate.cost_usd * (uncached.length / Math.max(1, batches.length))).toFixed(2)}` : 'cost unknown';
  log(`  Theme pass: ${batches.length} batches, ${batches.length - uncached.length} cached from the last run, ${uncached.length} to send (${est} on ${opts.model})${useModel ? '' : ' — not sent this run (no model)'}`);

  if (opts.dryRun) {
    const cov = RS.themeCoverage(analyzed, null);
    log(`  ${RS.formatLedgerLine({ ...ledger, ...cov })}`);
    log('  DRY RUN — no model calls, nothing written.');
    return { dryRun: true, ledger: { ...ledger, ...cov }, batches: batches.length, toRun: toRun.length, estimate, modelCalls: 0 };
  }

  let modelCalls = 0;
  const callModel = async (prompt) => { modelCalls++; return deps.callModel(prompt); };
  const results = batches.map((_, i) => (cache[keys[i]] && cache[keys[i]].ok && useModel
    ? { ok: true, attempted: false, reused: true, themes: cache[keys[i]].themes, dropped: cache[keys[i]].dropped || 0, cost: 0 }
    : null));
  if (!useModel && !opts.noModel) log('  ⚠️ No OPENROUTER_API_KEY — writing the deterministic ledger + domain breakdown only.');
  let creditsStop = null;
  if (toRun.length) {
    const ran = await runBatches({ batches, toRun, keyword, preById, callModel, concurrency: opts.concurrency, log, retryDelayMs: opts.retryDelayMs ?? 5000 });
    creditsStop = ran.stopped;
    for (const i of toRun) results[i] = ran.results[i] || { ok: false, attempted: false, themes: [], dropped: 0, cost: 0 };
  }
  for (let i = 0; i < results.length; i++) if (!results[i]) results[i] = { ok: false, attempted: false, themes: [], dropped: 0, cost: 0 };

  const { themePass, coverage } = RS.summarizeThemePass(batches, results, { model: useModel ? opts.model : null });

  // 6. Merge (seed-based; every merge logged) + label-only synonym pass
  const mergeLog = [];
  let merged = RS.mergeThemes(results.filter((r) => r.ok).map((r) => r.themes), { onMerge: (m) => mergeLog.push(m) });
  for (const m of mergeLog.slice(0, 50)) log(`    merge: "${m.from}" → "${m.into}" (similarity ${m.similarity})`);
  themePass.token_merges = mergeLog.length;
  if (creditsStop) themePass.stopped = creditsStop.message;
  if (useModel && !creditsStop && merged.length > 1 && themePass.batches_ok > 1) {
    try {
      const { content, cost } = await callModel(RS.buildLabelMergePrompt(merged, { keyword }));
      themePass.cost_usd = Math.round((themePass.cost_usd + (cost || 0)) * 10000) / 10000;
      const parsed = RS.extractJson(content);
      if (parsed && Array.isArray(parsed.groups)) {
        const before = merged.length;
        merged = RS.applyLabelGroups(merged, parsed.groups);
        themePass.label_merge = { themes_before: before, themes_after: merged.length };
        log(`  label merge: ${before} → ${merged.length} themes`);
      } else {
        themePass.label_merge = { error: 'unparseable response — token-overlap merge kept' };
        log('  ⚠️ label merge response unparseable — keeping token-overlap merge');
      }
    } catch (e) {
      themePass.label_merge = { error: e.message };
      log(`  ⚠️ label merge skipped (${e.message}) — keeping token-overlap merge`);
    }
  }

  const cov = RS.themeCoverage(analyzed, coverage);
  Object.assign(ledger, cov);
  ledger.theme_pass = themePass;
  const status = RS.computeStatus(cov);
  const themes = RS.finalizeThemes(merged, analyzed, { productsWithReviews: ledger.product_families, reviewsThemed: cov.reviews_theme_analyzed });
  log(`  ${RS.formatLedgerLine(ledger)}`);

  // Cache only clean successful batches; drop keys no longer in this batch plan.
  const batchResults = {};
  results.forEach((r, i) => { if (r.ok && !r.suspect) batchResults[keys[i]] = { ok: true, themes: r.themes, dropped: r.dropped || 0, n: batches[i].length }; });
  if (!useModel) keys.forEach((k) => { if (cache[k] && cache[k].ok) batchResults[k] = cache[k]; }); // keep a model run's work across a --no-model run

  const generatedAt = new Date(now()).toISOString();
  const base = { keyword, category_id: ctx.categoryId, generated_at: generatedAt, model: themePass.model, prompt_version: RS.PROMPT_VERSION };
  const categoryRow = { ...base, scope: 'category', asin: null, status, ledger, themes, domain_breakdown: domainBreakdown, cost_usd: themePass.cost_usd, batch_results: batchResults };

  const rowsPerAsin = {};
  for (const r of rows) rowsPerAsin[r.asin] = (rowsPerAsin[r.asin] || 0) + 1;
  const productRows = ledger.distinct_asins.map((asin) => {
    const collected = prepared.reviews.filter((r) => r.asins.includes(asin));
    const inScope = analyzed.filter((r) => r.asins.includes(asin));
    const pLedger = RS.buildLedger({
      collected,
      analyzed: inScope,
      cap: cap && inScope.length < collected.length ? { ...cap, reviews_collected: collected.length, reviews_dropped: collected.length - inScope.length } : null,
      stats: { rows_collected: rowsPerAsin[asin] || 0, duplicate_rows_removed: (rowsPerAsin[asin] || 0) - collected.length },
    });
    const pCov = RS.themeCoverage(inScope, coverage);
    Object.assign(pLedger, pCov);
    pLedger.product_family = prepared.familyOf[asin];
    pLedger.family_asins = prepared.families[prepared.familyOf[asin]] || [asin];
    pLedger.theme_pass = { model: themePass.model, prompt_version: themePass.prompt_version, category_status: status };
    return {
      ...base,
      scope: 'product',
      asin,
      status: RS.computeStatus(pCov),
      ledger: pLedger,
      themes: RS.projectThemesToProduct(themes, asin, analyzed),
      domain_breakdown: RS.buildDomainBreakdown(inScope, pre),
      cost_usd: null,
      batch_results: null,
    };
  });

  await upsertRows(dash, [categoryRow, ...productRows]);
  log(`  ✅ Saved ${TABLE}: 1 category row + ${productRows.length} product rows (${themes.length} themes, status ${status})`);
  const attached = await attachEvidenceToProducts(dash, ctx.categoryId, productRows, log);
  log(`  ✅ review_evidence attached to ${attached} dashboard products`);
  for (const t of themes.slice(0, 10)) log(`   ${RS.formatThemeLine(t)}`);

  return { status, ledger, themes, categoryRow, productRows, modelCalls };
}

if (require.main === module) {
  require('dotenv').config();
  const usageWrites = [];
  const clients = makeClients(process.env);
  const opts = parseOptions();
  const ctx = { keyword: opts.keyword, categoryId: null };
  const main = clients
    ? synthesize(opts, {
      ...clients,
      ctx,
      callModel: makeOpenRouterCaller({ model: opts.model, ctx, usageWrites }),
      resolveCategory: require('./utils/category-resolver').resolveCategory,
      pricing: require('./utils/ai-usage').PRICING,
    })
    : Promise.resolve();
  main
    .catch((e) => { console.error(`\n❌ P3b review synthesis FAILED (non-fatal, consumers fall back to sampling): ${e.message}`); })
    .finally(async () => { await Promise.allSettled(usageWrites); process.exit(0); });
}

module.exports = { synthesize, parseOptions, makeClients, loadPrevious, TABLE, CreditsExhausted };
