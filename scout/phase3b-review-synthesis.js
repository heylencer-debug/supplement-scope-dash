/**
 * phase3b-review-synthesis.js — P3b: evidence-counted review synthesis.
 *
 * Runs after P3 (playwright-reviews.js + migrate-reviews-to-dash.js). Reads
 * EVERY collected review for the keyword from dovive_reviews and writes
 * dovive_review_synthesis (migration 012):
 *   - one scope='category' row: coverage ledger, deterministic issue-domain
 *     breakdown, and the themes (complaints / unmet needs / praise) with
 *     supporting review ids, review + distinct-product counts, verified share,
 *     date range, verbatim excerpts, counter-evidence and scope;
 *   - one scope='product' row per ASIN with the same, restricted to that ASIN.
 * Then merges a `review_evidence` block into products.review_analysis
 * (additive — every existing field is kept).
 *
 * P6a / P7 / P8 prefer this over their old 5+5 / random 60+60 samples when a
 * row exists (utils/review-synthesis-store.js), and fall back when not.
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
 *   Re-runs are skipped unless new reviews were scraped after the last
 *   synthesis (or --force).
 *
 * FAIL-OPEN: always exits 0. P3 is retried as a whole by run-pipeline.js on a
 * non-zero exit, which would re-scrape reviews (Bright Data spend) because of
 * a synthesis problem — so errors are logged loudly and the phase moves on;
 * consumers fall back to their old sampling when no row exists.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { withUsageTracking, recordAiUsage, PRICING } = require('./utils/ai-usage');
const RS = require('./utils/review-synthesis');
const { TABLE } = require('./utils/review-synthesis-store');

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const argv = process.argv.slice(2);
const argVal = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
const KEYWORD = argVal('--keyword', argv[0] && !argv[0].startsWith('--') ? argv[0] : null);
const FORCE = argv.includes('--force');
const DRY_RUN = argv.includes('--dry-run');
const NO_MODEL = argv.includes('--no-model');
const BATCH_SIZE = Math.max(10, parseInt(argVal('--batch', '100'), 10) || 100);
const CONCURRENCY = Math.max(1, parseInt(argVal('--concurrency', '3'), 10) || 3);
const MAX_REVIEWS = parseInt(process.env.REVIEW_SYNTHESIS_MAX_REVIEWS || '12000', 10);

const MODEL = process.env.REVIEW_SYNTHESIS_MODEL
  || process.env.ANALYSIS_MODEL
  || (process.env.CHEAP_MODE === 'true' ? (process.env.CHEAP_MODE_MODEL || 'google/gemini-3.7-flash') : null)
  || 'anthropic/claude-sonnet-5';

let _categoryId = null;
// recordAiUsage is fire-and-forget at the call site; collected here and
// awaited before exit so the last batches' ledger rows are not cut off.
const _usageWrites = [];

// ─── Read ───────────────────────────────────────────────────────────────────

// Only the fields the synthesis uses — raw_json is ~2 KB/row, so pull just
// the four raw paths that carry title/date/verified/review id on Bright Data rows.
const SELECT = [
  'id', 'asin', 'rating', 'title', 'body', 'review_date', 'verified_purchase', 'helpful_votes', 'scraped_at',
  'rid:raw_json->raw->>review_id',
  'rheader:raw_json->raw->>review_header',
  'rdate:raw_json->raw->>review_posted_date',
  'rverified:raw_json->raw->>is_verified',
  'rvine:raw_json->raw->>is_amazon_vine',
  'rvariant:raw_json->raw->>variant_name',
  'date_text:raw_json->>date_text',
].join(', ');

async function fetchAllReviewRows(keyword) {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await DOVIVE.from('dovive_reviews')
      .select(SELECT)
      .eq('keyword', keyword)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`dovive_reviews read failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function isCurrent(keyword, latestScrapedAt) {
  try {
    const { data, error } = await DASH.from(TABLE)
      .select('generated_at, prompt_version, status')
      .eq('keyword', keyword).eq('scope', 'category')
      .order('generated_at', { ascending: false }).limit(1);
    if (error || !data || !data.length) return false;
    const row = data[0];
    if (row.prompt_version !== RS.PROMPT_VERSION || row.status !== 'complete') return false;
    return !latestScrapedAt || new Date(row.generated_at) > new Date(latestScrapedAt);
  } catch {
    return false;
  }
}

// ─── Model ─────────────────────────────────────────────────────────────────

class CreditsExhausted extends Error {}

async function callModelOnce(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dovive.com',
      'X-Title': 'DOVIVE Scout P3b Review Synthesis',
    },
    body: JSON.stringify(withUsageTracking({
      model: MODEL,
      max_tokens: 12000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })),
  });
  if (res.status === 402) throw new CreditsExhausted('[ERROR: credits] OpenRouter credits exhausted (402)');
  const j = await res.json();
  if (j.error) throw new Error(`OpenRouter: ${j.error.message || JSON.stringify(j.error)}`);
  _usageWrites.push(recordAiUsage({ phase: 'P3b', model: MODEL, usage: j.usage, categoryId: _categoryId, keyword: KEYWORD }).catch(() => {}));
  return { content: j.choices?.[0]?.message?.content || '', cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null };
}

/** One batch → validated themes. One retry on a transport or parse failure. */
async function runBatch(batch, index, total, preById) {
  const prompt = RS.buildBatchPrompt(batch, { keyword: KEYWORD, preById });
  const ids = batch.map((r) => r.id);
  let cost = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content, cost: c } = await callModelOnce(prompt);
      cost += c || 0;
      const parsed = RS.parseBatchResponse(content, ids);
      if (parsed.ok) {
        console.log(`  batch ${index + 1}/${total}: ${parsed.themes.length} themes${parsed.dropped_ids ? `, ${parsed.dropped_ids} unknown ids dropped` : ''}`);
        return { ok: true, themes: parsed.themes, dropped: parsed.dropped_ids, cost };
      }
      console.warn(`  batch ${index + 1}/${total}: unparseable response (attempt ${attempt})`);
    } catch (e) {
      if (e instanceof CreditsExhausted) throw e;
      console.warn(`  batch ${index + 1}/${total}: ${e.message} (attempt ${attempt})`);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 5000));
  }
  return { ok: false, themes: [], dropped: 0, cost };
}

async function runBatches(batches, preById) {
  const results = new Array(batches.length);
  let next = 0;
  let stop = null;
  async function worker() {
    while (!stop && next < batches.length) {
      const i = next++;
      try {
        results[i] = await runBatch(batches[i], i, batches.length, preById);
      } catch (e) {
        stop = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  for (let i = 0; i < results.length; i++) if (!results[i]) results[i] = { ok: false, themes: [], dropped: 0, cost: 0, skipped: true };
  if (stop) console.error(`  ❌ ${stop.message} — remaining batches skipped; synthesis saved as partial.`);
  return results;
}

// ─── Write ─────────────────────────────────────────────────────────────────

async function upsertRows(rows) {
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await DASH.from(TABLE).upsert(rows.slice(i, i + chunk), { onConflict: 'keyword,scope,asin_key' });
    if (error) throw new Error(`${TABLE} upsert failed: ${error.message}`);
  }
}

async function attachEvidenceToProducts(categoryId, productRows) {
  if (!categoryId) return 0;
  const byAsin = new Map(productRows.map((r) => [r.asin, r]));
  const { data: products, error } = await DASH.from('products')
    .select('id, asin, review_analysis').eq('category_id', categoryId);
  if (error) throw new Error(`products read failed: ${error.message}`);
  let n = 0;
  for (const p of products || []) {
    const row = byAsin.get(p.asin);
    if (!row) continue;
    const evidence = RS.buildProductEvidence(row);
    const { error: upErr } = await DASH.from('products')
      .update({ review_analysis: { ...(p.review_analysis || {}), review_evidence: evidence } })
      .eq('id', p.id);
    if (upErr) console.warn(`  ⚠️ ${p.asin}: review_evidence not saved (${upErr.message})`);
    else n++;
  }
  return n;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (!KEYWORD) {
    console.error('Usage: node phase3b-review-synthesis.js --keyword "magnesium gummies" [--force] [--dry-run] [--no-model]');
    return;
  }
  console.log(`=== P3b Review Synthesis — "${KEYWORD}" ===`);
  console.log(`Model: ${NO_MODEL ? 'none (--no-model)' : MODEL} | batch ${BATCH_SIZE} | cap ${MAX_REVIEWS.toLocaleString()}${DRY_RUN ? ' | DRY RUN' : ''}`);

  try {
    const cat = await resolveCategory(DASH, KEYWORD);
    _categoryId = cat.id;
    console.log(`  → Category (${cat.method}): "${cat.name}" (${cat.id})`);
  } catch (e) {
    console.warn(`  ⚠️ Category not resolved (${e.message}) — synthesis still runs, product rows are not updated.`);
  }

  const rows = await fetchAllReviewRows(KEYWORD);
  if (!rows.length) { console.log('  No reviews collected for this keyword — nothing to synthesise.'); return; }
  const latestScrapedAt = rows.reduce((m, r) => (r.scraped_at && (!m || r.scraped_at > m) ? r.scraped_at : m), null);

  if (!FORCE && !DRY_RUN && await isCurrent(KEYWORD, latestScrapedAt)) {
    console.log('  ✅ Synthesis is newer than the last scraped review — skipping (use --force to redo).');
    return;
  }

  const prepared = RS.prepareReviews(rows);
  const { analyzed, cap } = RS.applyCap(prepared.reviews, MAX_REVIEWS);
  const pre = analyzed.map((r) => RS.preclassifyReview(r));
  const preById = new Map(pre.map((p) => [p.review_id, p]));
  const ledger = RS.buildLedger({ collected: prepared.reviews, analyzed, cap, stats: prepared.stats, familyOf: prepared.familyOf, perProduct: true });
  const domainBreakdown = RS.buildDomainBreakdown(analyzed, pre);

  console.log(`  ${RS.formatLedgerLine(ledger)}`);
  for (const d of domainBreakdown) {
    if (d.reviews_mentioning) console.log(`    ${d.domain.padEnd(18)} ${String(d.negative.count).padStart(5)} negative (${d.negative.products} products) | ${String(d.positive.count).padStart(5)} positive (${d.positive.products} products)`);
  }

  const batches = RS.buildBatches(analyzed, BATCH_SIZE);
  const estimate = RS.estimateSynthesisCost(batches, PRICING[MODEL], { keyword: KEYWORD });
  console.log(`  Theme pass: ${batches.length} calls, est. ${estimate.prompt_tokens.toLocaleString()} prompt + ${estimate.completion_tokens.toLocaleString()} completion tokens${estimate.cost_usd != null ? ` ≈ $${estimate.cost_usd.toFixed(2)}` : ''} on ${MODEL}`);

  if (DRY_RUN) { console.log('  DRY RUN — no model calls, nothing written.'); return; }

  let themes = [];
  let status = 'deterministic_only';
  const themePass = { model: NO_MODEL ? null : MODEL, prompt_version: RS.PROMPT_VERSION, batches: batches.length, batches_ok: 0, batches_failed: 0, reviews_sent: 0, reviews_in_failed_batches: 0, ids_dropped: 0, cost_usd: 0 };

  if (!NO_MODEL && batches.length && process.env.OPENROUTER_API_KEY) {
    const results = await runBatches(batches, preById);
    results.forEach((r, i) => {
      themePass.reviews_sent += batches[i].length;
      themePass.cost_usd += r.cost || 0;
      themePass.ids_dropped += r.dropped || 0;
      if (r.ok) themePass.batches_ok++;
      else { themePass.batches_failed++; themePass.reviews_in_failed_batches += batches[i].length; }
    });
    let merged = RS.mergeThemes(results.filter((r) => r.ok).map((r) => r.themes));
    // Stage 2: one label-only call to join synonyms token overlap misses.
    if (merged.length > 1 && themePass.batches_ok > 1) {
      try {
        const { content, cost } = await callModelOnce(RS.buildLabelMergePrompt(merged, { keyword: KEYWORD }));
        themePass.cost_usd += cost || 0;
        const parsed = RS.extractJson(content);
        const before = merged.length;
        if (parsed && Array.isArray(parsed.groups)) merged = RS.applyLabelGroups(merged, parsed.groups);
        themePass.label_merge = { themes_before: before, themes_after: merged.length };
        console.log(`  label merge: ${before} → ${merged.length} themes`);
      } catch (e) {
        themePass.label_merge = { error: e.message };
        console.warn(`  ⚠️ label merge skipped (${e.message}) — keeping token-overlap merge`);
      }
    }
    themePass.cost_usd = Math.round(themePass.cost_usd * 10000) / 10000;
    themes = RS.finalizeThemes(merged, analyzed, { productsWithReviews: ledger.product_families, reviewsAnalyzed: ledger.reviews_analyzed });
    status = themePass.batches_ok === 0 ? 'deterministic_only' : themePass.batches_failed ? 'partial' : 'complete';
  } else if (!NO_MODEL) {
    console.warn('  ⚠️ No OPENROUTER_API_KEY — writing the deterministic ledger + domain breakdown only.');
  }
  ledger.theme_pass = themePass;

  const generatedAt = new Date().toISOString();
  const base = { keyword: KEYWORD, category_id: _categoryId, generated_at: generatedAt, model: themePass.model, prompt_version: RS.PROMPT_VERSION, status };
  const categoryRow = { ...base, scope: 'category', asin: null, ledger, themes, domain_breakdown: domainBreakdown, cost_usd: themePass.cost_usd };

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
    pLedger.product_family = prepared.familyOf[asin];
    pLedger.family_asins = prepared.families[prepared.familyOf[asin]] || [asin];
    return {
      ...base,
      scope: 'product',
      asin,
      ledger: pLedger,
      themes: RS.projectThemesToProduct(themes, asin, analyzed),
      domain_breakdown: RS.buildDomainBreakdown(inScope, pre),
      cost_usd: null,
    };
  });

  await upsertRows([categoryRow, ...productRows]);
  console.log(`  ✅ Saved ${TABLE}: 1 category row + ${productRows.length} product rows (${themes.length} themes, status ${status})`);
  const attached = await attachEvidenceToProducts(_categoryId, productRows);
  console.log(`  ✅ review_evidence attached to ${attached} dashboard products`);

  for (const t of themes.slice(0, 10)) console.log(`   ${RS.formatThemeLine(t)}`);
}

if (require.main === module) {
  run()
    .catch((e) => { console.error(`\n❌ P3b review synthesis FAILED (non-fatal, consumers fall back to sampling): ${e.message}`); })
    .finally(async () => { await Promise.allSettled(_usageWrites); process.exit(0); });
}

module.exports = { run };
