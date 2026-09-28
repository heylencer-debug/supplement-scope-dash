/**
 * migrate-keepa-to-dash.js
 * Migrates Keepa data from dovive_keepa → supplement-scope-dash products
 * Fields: monthly_sales, monthly_revenue, bsr_30_days_avg, bsr_90_days_avg, price_usd, historical_data
 *
 * Usage:
 *   node migrate-keepa-to-dash.js "magnesium gummies"
 *   node migrate-keepa-to-dash.js --keyword "magnesium gummies"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { classifyCohort } = require('./utils/cohort');
const { runCompetitorSelection } = require('./select-competitors');
const { extractKeepaSignals } = require('./utils/keepa-signals');
const { usableDisplayedReviews } = require('./utils/competitor-selection');

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

// ── Dynamic keyword resolution ────────────────────────────────
const KEYWORD_ARG = require('./utils/keyword-arg').requireKeyword('node migrate-keepa-to-dash.js "<session label>"  (or --keyword "<session label>")');

async function lookupCategoryId(keyword) {
  const cat = await resolveCategory(DASH, keyword);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  return cat.id;
}

function avgBSR(history) {
  if (!history || !Array.isArray(history) || history.length === 0) return null;
  const ranks = history.map(h => h.rank).filter(r => r && r > 0);
  if (ranks.length === 0) return null;
  return Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
}

async function run() {
  const KEYWORD = KEYWORD_ARG;
  console.log(`=== Keepa Migration: dovive → supplement-scope-dash ===`);
  console.log(`Keyword: "${KEYWORD}"\n`);

  const DASH_CAT_ID = await lookupCategoryId(KEYWORD);

  // 1. Get all ASINs in supplement-scope-dash for this category.
  // `rating_count` (2026-09-03) — the cohort classifier's review-count
  // signal. Deliberately sourced from DASH `products.rating_count` (P1
  // Bright Data scrape), NOT `dovive_keepa.review_count`
  // (`stats.current[16]` in keepa-phase2.js's parseKeepa()) — a live check
  // against real market leaders (Nuun/Liquid I.V./LMNT) found the Keepa
  // field stuck at ~45-48 for nearly every ASIN regardless of actual
  // review count (Liquid I.V.'s real ~106k reviews vs Keepa's reported 46),
  // which would have silently zeroed out the whole ESTABLISHED cohort.
  // `products.rating_count` is untouched by this migration's own patch
  // below, so it still holds the real P1-scraped figure. The Keepa field
  // itself is a separate, pre-existing data-quality bug — flagged, not
  // fixed here (out of scope for cohort tagging).
  const { data: dashProducts, error: dashErr } = await DASH
    .from('products')
    .select('id, asin, rating_count, rating_value')
    .eq('category_id', DASH_CAT_ID);

  if (dashErr) throw dashErr;
  console.log(`Found ${dashProducts.length} products in supplement-scope-dash`);

  const asinToId = {};
  const asinToRatingCount = {};
  const asinToRating = {};
  for (const p of dashProducts) {
    if (p.asin) {
      asinToId[p.asin] = p.id;
      asinToRatingCount[p.asin] = p.rating_count;
      asinToRating[p.asin] = p.rating_value;
    }
  }

  // 2. Get ASINs for this keyword from dovive_research (source of truth for keyword→ASIN mapping)
  const { data: researchRows } = await DOVIVE
    .from('dovive_research')
    .select('asin')
    .eq('keyword', KEYWORD);
  const keywordAsins = (researchRows || []).map(r => r.asin);
  if (!keywordAsins.length) {
    console.log('No ASINs found in dovive_research for this keyword.');
    return;
  }
  console.log(`Found ${keywordAsins.length} ASINs in dovive_research for "${KEYWORD}"`);

  // 3. Get Keepa data by ASIN (not keyword — keyword field may be null).
  // listed_since/release_date/review_count are the cohort classifier's raw
  // signals (see utils/cohort.js) — pulled here because this is already the
  // cheap, no-AI-cost, per-ASIN Keepa read the cohort tagging piggybacks on.
  const { data: keepaRows, error: keepaErr } = await DOVIVE
    .from('dovive_keepa')
    // k_parent / k_variations / k_avg90 (2026-09-26, competitor selection):
    // read through raw_json JSON paths, which exist on every Keepa row ever
    // saved — NOT the new dovive_keepa columns from migration 011, which a
    // select would fail on until that migration is applied.
    .select('asin, monthly_sales_est, price_usd, bsr_current, bsr_history_30d, bsr_history_90d, bsr_drops_30d, bsr_drops_90d, monthly_sold_history, listed_since, release_date, review_count, k_parent:raw_json->>parentAsin, k_variations:raw_json->variations, k_avg90:raw_json->stats->avg90, k_current:raw_json->stats->current')
    .in('asin', keywordAsins);

  if (keepaErr) throw keepaErr;
  console.log(`Found ${keepaRows.length} Keepa records\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const cohortCounts = { established: 0, emerging: 0, context: 0 };
  const cohortByAsin = new Map(); // handed to the competitor selection below

  for (const k of keepaRows) {
    const dashId = asinToId[k.asin];
    if (!dashId) {
      skipped++;
      continue;
    }

    const bsr30avg = avgBSR(k.bsr_history_30d);
    const bsr90avg = avgBSR(k.bsr_history_90d);
    const monthlyRevenue = (k.monthly_sales_est && k.price_usd)
      ? Math.round(k.monthly_sales_est * k.price_usd)
      : null;

    // Deterministic, no-AI-cost cohort tag — see utils/cohort.js for the
    // full rationale + env-tunable thresholds. reviewCount comes from
    // products.rating_count (see the select above), not dovive_keepa's own
    // review_count field.
    // 2026-09-26: products.rating_count can hold the rating×10 value
    // keepa-phase2.js used to copy into dovive_research.review_count (756
    // rows) — a "46" would sink Liquid I.V. out of 'established'. Unusable
    // counts fall back to Keepa's own stats.current[17].
    const sig = extractKeepaSignals({ parentAsin: k.k_parent, variations: k.k_variations, stats: { avg90: k.k_avg90, current: k.k_current } });
    const cohortReviews = usableDisplayedReviews({ displayed: asinToRatingCount[k.asin], ratings: [asinToRating[k.asin], sig.rating], keepaOwn: sig.review_count }).count ?? sig.review_count;
    const cohortResult = classifyCohort({
      listedSince: k.listed_since,
      releaseDate: k.release_date,
      reviewCount: cohortReviews,
      monthlySalesEst: k.monthly_sales_est,
      bsrHistory30d: k.bsr_history_30d,
    });
    const { cohort } = cohortResult;
    cohortByAsin.set(k.asin, cohortResult);

    // Variation family + 90-day price (2026-09-26): feeds the dashboard's
    // "Parent ASIN" / "Flavor Options (N)" / "90-Day Avg" fields, which
    // nothing populated before. extractKeepaSignals applies the same
    // Amazon → New → Buy Box price precedence parseKeepa() uses for price_usd.

    const patch = {
      monthly_sales: k.monthly_sales_est,
      monthly_revenue: monthlyRevenue,
      bsr_30_days_avg: bsr30avg,
      bsr_90_days_avg: bsr90avg,
      cohort,
      ...(sig.parent_asin ? { parent_asin: sig.parent_asin } : {}),
      // >1 only: a lone self-listing would hide the modal's flavor_options fallback.
      ...(sig.variation_asins && sig.variation_asins.length > 1 ? { variations_count: sig.variation_asins.length } : {}),
      ...(sig.price_avg_90d ? { price_90_days_avg: sig.price_avg_90d } : {}),
      historical_data: {
        bsr_history_30d: k.bsr_history_30d,
        bsr_history_90d: k.bsr_history_90d,
        bsr_drops_30d: k.bsr_drops_30d,
        bsr_drops_90d: k.bsr_drops_90d,
        monthly_sold_history: k.monthly_sold_history,
        price_usd: k.price_usd,
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await DASH
      .from('products')
      .update(patch)
      .eq('id', dashId);

    if (error) {
      console.error(`  ERROR ${k.asin}:`, error.message);
      errors++;
    } else {
      updated++;
      cohortCounts[cohort] = (cohortCounts[cohort] || 0) + 1;
      if (updated % 20 === 0) console.log(`  ${updated} updated...`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (ASIN not in dash): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Cohort — established: ${cohortCounts.established} · emerging: ${cohortCounts.emerging} · context: ${cohortCounts.context}`);

  // Competitor selection (2026-09-26): pick the 40 established competitors
  // P3/P4/P5/P8 work from — one per variation family, with a written reason,
  // promo and shared-review checks. See select-competitors.js. Never fails
  // the Keepa sync: on any error the downstream phases simply keep their
  // top-N-by-BSR behaviour.
  console.log(`\n=== Competitor selection ===`);
  try {
    await runCompetitorSelection({ dovive: DOVIVE, dash: DASH, keyword: KEYWORD, categoryId: DASH_CAT_ID, cohortByAsin });
  } catch (e) {
    console.error(`  ⚠️ Competitor selection failed (non-fatal — downstream stays on top-N-by-BSR): ${e.message}`);
  }
}

run().catch(console.error);
