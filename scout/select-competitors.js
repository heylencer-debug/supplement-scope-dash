/**
 * select-competitors.js — pick the 40 established competitors for a category
 * and write the choice (with its reasons) onto `products`.
 *
 * Runs inside migrate-keepa-to-dash.js, right after cohort tagging (it needs
 * P1's search signals, Keepa's sales/variation/promotion data and the cohort
 * metrics, all of which exist at that point). The scoring itself is pure and
 * lives in utils/competitor-selection.js — this file only gathers inputs and
 * writes outputs.
 *
 * Works BEFORE migration 011 is applied, in two senses:
 *   - inputs: every Keepa signal is re-read from dovive_keepa.raw_json (which
 *     already stores parentAsin, variations, coupon, deals, stats), so the new
 *     dovive_keepa columns are optional; dovive_research.selection_signals is
 *     optional too (legacy rows just have no search provenance);
 *   - outputs: if the products selection columns are missing, the write is
 *     skipped with one warning and downstream phases keep "top N by BSR".
 *
 * Standalone (no Keepa/AI spend — reads + writes Supabase only):
 *   node select-competitors.js "<keyword>"            compute + write
 *   node select-competitors.js "<keyword>" --dry-run  compute + print, no writes
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { classifyCohort } = require('./utils/cohort');
const { extractKeepaSignals } = require('./utils/keepa-signals');
const { selectCompetitors, usableDisplayedReviews } = require('./utils/competitor-selection');

const isMissingColumn = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(error.message || ''));

async function fetchAll(builderFactory, pageSize = 500) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builderFactory().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: out, error: null };
}

/**
 * Legacy Bright Data rows (before the 2026-09-26 strict-boolean fix in
 * bright-data-amazon.js) have is_sponsored=true on EVERY row — 361/361 across
 * 10 keywords, read-only check — because the search record's `sponsored`
 * string was coerced with !!. For those rows trust the stored product
 * record's own `sponsored` field instead; every other row keeps is_sponsored.
 */
function legacySponsored(r) {
  if (!r.is_sponsored) return false;
  if (r.source === 'bright-data-fallback-v1' && !r.selection_signals) return r.bd_sponsored === 'true';
  return true;
}

/** dovive_research rows for the keyword; selection_signals only when the column exists. */
async function loadResearch(dovive, keyword) {
  const base = 'asin, source, is_sponsored, rank_position, bd_parent_asin:raw_json->>parent_asin, bd_sponsored:raw_json->>sponsored';
  let res = await fetchAll(() => dovive.from('dovive_research').select(`${base}, selection_signals`).eq('keyword', keyword));
  if (isMissingColumn(res.error)) res = await fetchAll(() => dovive.from('dovive_research').select(base).eq('keyword', keyword));
  if (res.error) throw new Error(`dovive_research read failed: ${res.error.message}`);
  return res.data;
}

async function loadKeepa(dovive, asins) {
  const cols = 'asin, brand, title, monthly_sales_est, price_usd, bsr_current, rating, listed_since, release_date, bsr_history_30d, raw_json';
  const extra = ', parent_asin, variation_asins, coupon_active, lightning_deal_active, sns_discount_pct, price_avg_90d';
  const out = [];
  for (let i = 0; i < asins.length; i += 100) {
    const chunk = asins.slice(i, i + 100);
    let { data, error } = await dovive.from('dovive_keepa').select(cols + extra).in('asin', chunk);
    if (isMissingColumn(error)) ({ data, error } = await dovive.from('dovive_keepa').select(cols).in('asin', chunk));
    if (error) throw new Error(`dovive_keepa read failed: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

/**
 * Build candidates from the three sources, run the pure selector, write.
 *
 * @param {object} args
 * @param {object} args.dovive   supabase client (dovive_* tables)
 * @param {object} args.dash     supabase client (products)
 * @param {string} args.keyword  full session label, e.g. "electrolyte powder #3"
 * @param {string} args.categoryId
 * @param {Map<string, object>} [args.cohortByAsin]  classifyCohort() output per ASIN, when the caller already has it
 * @param {boolean} [args.dryRun]
 * @param {(msg: string) => void} [args.log]
 */
async function runCompetitorSelection({ dovive, dash, keyword, categoryId, cohortByAsin, dryRun = false, poolLimit = null, log = console.log }) {
  let research = await loadResearch(dovive, keyword);
  if (poolLimit) {
    // Dry-run simulation of a smaller P1 pool: keep the best-ranked rows.
    const rankOf = (r) => r.selection_signals?.pool_rank ?? r.rank_position ?? Infinity;
    research = [...research].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, poolLimit);
  }
  if (!research.length) { log('  Selection: no dovive_research rows for this keyword — skipped'); return null; }

  const { data: products, error: pErr } = await fetchAll(() => dash.from('products')
    .select('id, asin, title, brand, rating_count, rating_value, bsr_current, bsr_90_days_avg, price, monthly_sales')
    .eq('category_id', categoryId));
  if (pErr) throw new Error(`products read failed: ${pErr.message}`);
  const productByAsin = new Map(products.map((p) => [p.asin, p]));

  const asins = [...new Set(research.map((r) => r.asin).filter((a) => productByAsin.has(a)))];
  const keepaByAsin = new Map((await loadKeepa(dovive, asins)).map((k) => [k.asin, k]));

  const candidates = [];
  for (const r of research) {
    const p = productByAsin.get(r.asin);
    if (!p) continue;
    const k = keepaByAsin.get(r.asin) || {};
    // raw_json first: it is present on every Keepa row ever saved, the new
    // columns only on rows parsed after migration 011.
    const sig = k.raw_json ? extractKeepaSignals(k.raw_json) : {
      parent_asin: k.parent_asin ?? null,
      variation_asins: k.variation_asins ?? null,
      review_count: null,
      rating: k.rating ?? null,
      price_current: k.price_avg_90d != null ? (k.price_usd ?? null) : null, // same Keepa row as the average
      price_avg_90d: k.price_avg_90d ?? null,
      bsr_avg_90d: null,
      coupon_active: !!k.coupon_active,
      lightning_deal_active: !!k.lightning_deal_active,
      sns_discount_pct: k.sns_discount_pct ?? null,
    };
    const s = r.selection_signals || {};
    const cohort = cohortByAsin?.get(r.asin) || classifyCohort({
      listedSince: k.listed_since,
      releaseDate: k.release_date,
      // Never the rating×10-corrupted page count (see usableDisplayedReviews).
      reviewCount: usableDisplayedReviews({ displayed: p.rating_count, ratings: [p.rating_value, sig.rating], keepaOwn: sig.review_count }).count ?? sig.review_count,
      monthlySalesEst: k.monthly_sales_est,
      bsrHistory30d: k.bsr_history_30d,
    });
    candidates.push({
      asin: r.asin,
      title: p.title || k.title,
      // products.brand is empty on many P1 rows; Keepa's brand fills it so
      // product-line grouping and the brand cap still apply.
      brand: p.brand || k.brand || null,
      parentAsin: sig.parent_asin || r.bd_parent_asin || null,
      variationAsins: sig.variation_asins || [],
      reviewsDisplayed: p.rating_count,
      ratingDisplayed: p.rating_value,
      reviewsOwn: sig.review_count,
      ratingOwn: sig.rating ?? k.rating,
      monthlySales: k.monthly_sales_est ?? p.monthly_sales,
      bsrCurrent: k.bsr_current ?? p.bsr_current,
      bsr90Avg: p.bsr_90_days_avg ?? sig.bsr_avg_90d,
      // Both from Keepa stats (same source, same precedence) — a P1 page
      // price against a Keepa average would flag noise as a promotion.
      priceCurrent: sig.price_current,
      price90Avg: sig.price_avg_90d,
      couponActive: sig.coupon_active,
      dealActive: sig.lightning_deal_active,
      snsDiscountPct: sig.sns_discount_pct,
      isSponsored: legacySponsored(r),
      searchQueries: s.search_queries || [],
      serpPositions: s.serp_positions || {},
      sponsoredIn: s.sponsored_in || [],
      cohort,
    });
  }

  const result = selectCompetitors(candidates);
  const { stats } = result;
  log(`  Selection: ${stats.candidates} candidates → ${stats.families} families → ${stats.eligible} eligible → ${stats.selected} selected`
    + ` | promo-flagged ${stats.promo_flagged_selected} · shared-reviews ${stats.shared_reviews_selected}`
    + ` | excluded ${JSON.stringify(stats.excluded)}`);

  if (dryRun) return result;

  // Write the five selection columns; a missing column means migration 011 is
  // not applied yet — say so once and leave downstream on top-N-by-BSR.
  let written = 0;
  let failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < result.rows.length; i += 10) {
    const batch = result.rows.slice(i, i + 10);
    const outcomes = await Promise.all(batch.map((row) => dash.from('products').update({
      selected: row.selected,
      selection_rank: row.selection_rank,
      selection_reason: row.selection_reason,
      promo_flag: row.promo_flag,
      shared_reviews_with: row.shared_reviews_with,
      updated_at: now,
    }).eq('category_id', categoryId).eq('asin', row.asin)));
    const missing = outcomes.find((o) => isMissingColumn(o.error));
    if (missing) {
      log(`  ⚠️ Selection NOT written — products selection columns are missing (apply scout/migrations/011_competitor_selection.sql). Downstream phases stay on top-N-by-BSR. (${missing.error.message})`);
      return result;
    }
    for (const o of outcomes) { if (o.error) { failed++; log(`  ⚠️ selection write error: ${o.error.message}`); } else written++; }
  }

  // Clear a stale selection on category rows this run did not consider
  // (e.g. products left over from an earlier run of the same category).
  const poolAsins = new Set(result.rows.map((r) => r.asin));
  const { data: stale } = await dash.from('products').select('asin').eq('category_id', categoryId).eq('selected', true);
  const staleAsins = (stale || []).map((r) => r.asin).filter((a) => !poolAsins.has(a));
  if (staleAsins.length) {
    await dash.from('products').update({ selected: false, selection_rank: null }).eq('category_id', categoryId).in('asin', staleAsins);
    log(`  Selection: cleared stale selected=true on ${staleAsins.length} product(s) outside this run's pool`);
  }

  log(`  Selection written: ${written} rows${failed ? ` (${failed} failed)` : ''}`);
  return result;
}

module.exports = { runCompetitorSelection };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const keyword = args.find((a) => !a.startsWith('--'));
    if (!keyword) { console.error('Usage: node select-competitors.js "<keyword>" [--dry-run]'); process.exit(1); }
    const dryRun = args.includes('--dry-run');
    const pi = args.indexOf('--pool-limit');
    const poolLimit = pi >= 0 ? parseInt(args[pi + 1], 10) : null;
    if (poolLimit && !dryRun) { console.error('--pool-limit is a dry-run simulation only'); process.exit(1); }
    const dovive = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const dash = createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
    const cat = await resolveCategory(dash, keyword);
    console.log(`=== Competitor selection — "${keyword}" → ${cat.name} (${cat.id})${dryRun ? ' [dry run]' : ''} ===`);
    const result = await runCompetitorSelection({ dovive, dash, keyword, categoryId: cat.id, dryRun, poolLimit });
    if (result && dryRun) {
      for (const r of result.rows.filter((x) => x.selected)) console.log(`  ${String(r.selection_rank).padStart(2)}. ${r.asin}  ${r.selection_reason.summary}`);
      const byBrand = {};
      for (const r of result.rows.filter((x) => x.selected)) { const b = r.selection_reason.brand || '?'; byBrand[b] = (byBrand[b] || 0) + 1; }
      console.log(`  Slots by brand (top): ${Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b, n]) => `${b}=${n}`).join(', ')}`);
    }
  })().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
}
