/**
 * utils/formula-reads.js — the formula phases' evidence reads, expressed on
 * utils/evidence-source.js.
 *
 * Every phase script runs on load (it calls run() at the bottom), so a test
 * can not require it to watch its queries. The reads therefore live here, one
 * function per read the phase issues, and the phase calls them with its
 * evidence source. Each function carries the phase's ORIGINAL chain verbatim
 * (same select string, filters, order, limit) — test/evidence-phase-*.test.js
 * assert the Scout backend issues exactly that, call for call.
 *
 * Only reads live here. Writes, and the reads a phase does right before a
 * write to merge into the row (read-merge-write), stay in the phase on Scout.
 */

'use strict';

const { P7_PRODUCT_COLUMNS, P9_ALL_PRODUCT_COLUMNS } = require('./formula-inputs');

// ── P5 — Deep Research (phase5-deep-research.js) ──────────────────────────

const P5_PRODUCT_SELECT = `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, supplement_facts_raw, other_ingredients,
             claims_on_label, feature_bullets_text, marketing_analysis, review_analysis, cohort`;

const BSR_ASC = ['order', 'bsr_current', { ascending: true }];
const HAS_BSR = ['not', 'bsr_current', 'is', null];

/** Pool A: established cohort, best BSR first. `selection` scopes it when active. */
function p5Established(ev, categoryId, selection, n) {
  return ev.products(categoryId, P5_PRODUCT_SELECT, { selection, ops: [['eq', 'cohort', 'established'], HAS_BSR, BSR_ASC, ['limit', n]] });
}

/** Pool A fallback fill: best BSR overall. */
function p5BestBsr(ev, categoryId, selection, n) {
  return ev.products(categoryId, P5_PRODUCT_SELECT, { selection, ops: [HAS_BSR, BSR_ASC, ['limit', n]] });
}

/** Pool B: emerging cohort, best BSR first. `selection` null = outside the selection (P5's top-up). */
function p5Emerging(ev, categoryId, selection, n) {
  return ev.products(categoryId, P5_PRODUCT_SELECT, { selection, ops: [['eq', 'cohort', 'emerging'], HAS_BSR, BSR_ASC, ['limit', n]] });
}

/** Pool B fallback fill: <500 reviews with real revenue. */
function p5LowReviewEarners(ev, categoryId, selection, n) {
  return ev.products(categoryId, P5_PRODUCT_SELECT, {
    selection, ops: [HAS_BSR, ['lt', 'rating_count', 500], ['gt', 'monthly_revenue', 0], BSR_ASC, ['limit', n]],
  });
}

/** Grounding: the listing (dovive_research shape) for the exact session keyword. */
function p5Listing(ev, asin, keyword, categoryId) {
  return ev.listingClaims(asin, { keyword, categoryId });
}

/** Grounding: label panels (≤8, image order; pre-013 retry inside the layer). */
function p5LabelPanels(ev, asin, categoryId) {
  return ev.labelPanels(asin, { categoryId });
}

/** Grounding: top 40 reviews by helpfulness (Scout dovive_reviews in both backends). */
function p5Reviews(ev, asin) {
  return ev.rawReviews(asin, 'rating, title, body, verified_purchase, helpful_votes', {
    ops: [['order', 'helpful_votes', { ascending: false }], ['limit', 40]],
  });
}

/** Grounding: Keepa price/BSR row. */
function p5Keepa(ev, asin) {
  return ev.marketSignals(asin);
}

// ── P6 — Product Intelligence (phase6-product-intelligence.js) ─────────────

const P6_PRODUCT_COLUMNS = `id, asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg,
             price, monthly_revenue, monthly_sales, rating_value, rating_count,
             serving_size, servings_per_container, supplement_facts_raw,
             feature_bullets_text, claims_on_label, marketing_analysis`;

/** Every product in the category, BSR asc (nulls last), `limit(topN)`. Not selection-scoped: market metrics use them all. */
function p6Products(ev, categoryId, topN) {
  return ev.products(categoryId, P6_PRODUCT_COLUMNS, {
    ops: [['order', 'bsr_current', { ascending: true, nullsFirst: false }], ['limit', topN]],
  });
}

/** Raw review slice for a batch: helpful desc, 20 per ASIN (Scout dovive_reviews in both backends). */
function p6RawReviews(ev, asins) {
  return ev.rawReviews(asins, 'asin, rating, title, body, helpful_votes', {
    ops: [['order', 'helpful_votes', { ascending: false }], ['limit', asins.length * 20]],
  });
}

/** P3b product-scope syntheses for a batch, staleness-checked against `reviewsClient`. */
function p6ProductSyntheses(ev, { keyword, asins, reviewsClient }) {
  return ev.reviewThemes({ scope: 'product', keyword, asins, reviewsClient });
}

// ── P7 — Market Intelligence (phase6-market-analysis.js) ───────────────────

/** Every product in the category with P7_PRODUCT_COLUMNS, BSR asc (nulls last). Not selection-scoped. */
function p7Products(ev, categoryId) {
  return ev.products(categoryId, P7_PRODUCT_COLUMNS, {
    ops: [['order', 'bsr_current', { ascending: true, nullsFirst: false }]],
  });
}

/** P3b category synthesis (keyword, then category id), staleness-checked against `reviewsClient`. */
function p7CategorySynthesis(ev, { keyword, categoryId, reviewsClient }) {
  return ev.reviewThemes({ scope: 'category', keyword, categoryId, reviewsClient });
}

/** Raw-review fallback, step 1: up to 500 category ASINs. */
function p7CategoryAsins(ev, categoryId) {
  return ev.products(categoryId, 'asin', { ops: [['limit', 500]] });
}

/** Raw-review fallback, step 2: reviews with a body for the first 400 ASINs, ≤3000 (Scout dovive_reviews). */
function p7RawReviews(ev, asins) {
  return ev.rawReviews(asins.slice(0, 400), 'asin, rating, title, body', {
    ops: [['not', 'body', 'is', null], ['limit', 3000]],
  });
}

/** P5b web claims → { row, text }. */
function p7WebEvidence(ev, { keyword, categoryId }) {
  return ev.webClaims({ keyword, categoryId });
}

/** P7b marketing-asset category row, or null. */
function p7MarketingAssets(ev, { keyword, categoryId }) {
  return ev.creativeVerdicts({ keyword, categoryId });
}

// ── P8 — Packaging Intelligence (phase7-packaging-intelligence.js) ─────────

/**
 * Every product in the category, BSR asc; `limit(topN)` only when topN < 999
 * (the phase's own rule — the default 999 means no limit). Not selection-scoped.
 */
function p8Products(ev, categoryId, topN) {
  const ops = [['order', 'bsr_current', { ascending: true }]];
  if (topN < 999) ops.push(['limit', topN]);
  return ev.products(categoryId, 'id, asin, title, brand, bsr_current, price, main_image_url, feature_bullets_text, supplement_facts_raw', { ops });
}

// ── P9 — Formula Brief (phase8-formula-brief.js) ─────────────────────────

const P9_TOP20_COLUMNS = `
      asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg,
      price, monthly_revenue, monthly_sales, rating_value, rating_count,
      packaging_type, serving_size, servings_per_container,
      claims_on_label, supplement_facts_raw, all_nutrients, other_ingredients,
      proprietary_blends, feature_bullets_text, marketing_analysis, cohort
    `;

const P9_NEW_WINNER_COLUMNS = `
      asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
      rating_count, packaging_type, serving_size, servings_per_container,
      claims_on_label, supplement_facts_raw, all_nutrients, other_ingredients,
      proprietary_blends, feature_bullets_text, marketing_analysis, cohort
    `;

/** Comparison set: selection (when active) or top 50 by BSR, rows with a BSR. */
function p9Top20(ev, categoryId, selection) {
  return ev.products(categoryId, P9_TOP20_COLUMNS, {
    selection, ops: [['not', 'bsr_current', 'is', null], ['order', 'bsr_current', { ascending: true }], ['limit', 50]],
  });
}

/** New winners: BSR < 30k, < 500 reviews, revenue desc, 15. Not selection-scoped. */
function p9NewWinners(ev, categoryId) {
  return ev.products(categoryId, P9_NEW_WINNER_COLUMNS, {
    ops: [['not', 'bsr_current', 'is', null], ['lt', 'bsr_current', 30000], ['lt', 'rating_count', 500],
      ['order', 'monthly_revenue', { ascending: false }], ['limit', 15]],
  });
}

/** Aggregate set: every product with marketing_analysis (P9_ALL_PRODUCT_COLUMNS incl. serving_size). */
function p9AllProducts(ev, categoryId) {
  return ev.products(categoryId, P9_ALL_PRODUCT_COLUMNS, { ops: [['not', 'marketing_analysis', 'is', null]] });
}

/** Exact product count for the category (head request). */
function p9ProductCount(ev, categoryId) {
  return ev.products(categoryId, '*', { selectOptions: { count: 'exact', head: true } });
}

/** P3b category synthesis, staleness-checked against `reviewsClient`. */
function p9CategorySynthesis(ev, { keyword, categoryId, reviewsClient }) {
  return ev.reviewThemes({ scope: 'category', keyword, categoryId, reviewsClient });
}

/** P5 deep research for the exact session keyword, bsr_rank asc, 20. */
function p9P5Research(ev, keyword) {
  return ev.deepResearch({ keyword, columns: 'asin, brand, bsr_rank, pool, benefits, formula_notes, key_strengths, key_weaknesses, competitor_angle, certifications, third_party_tested, full_research, researched_by', ops: [['order', 'bsr_rank', { ascending: true }], ['limit', 20]] });
}

/** P5 brand-page excerpts for those ASINs (no keyword filter — as before). */
function p9P5Sources(ev, asins) {
  return ev.p5Sources({ asins, columns: 'asin, source_url, raw_html_excerpt' });
}

/** P8 category packaging summary row (maybeSingle). */
function p9PackagingSummary(ev, keyword) {
  return ev.packaging({ keyword, ops: [['maybeSingle']] });
}

/** Raw-review fallback: ≥4★ ('positive') or ≤2★ ('negative') with a body, 100 (Scout dovive_reviews). */
function p9RawReviews(ev, asins, polarity) {
  const star = polarity === 'positive' ? ['gte', 'rating', 4] : ['lte', 'rating', 2];
  return ev.rawReviews(asins, 'asin, rating, title, body', { ops: [star, ['not', 'body', 'is', null], ['limit', 100]] });
}

/** Skip check: does the category's brief already hold AI content? */
function p9BriefSkip(ev, categoryId) {
  return ev.briefCurrent(categoryId, { columns: 'id, created_at, ingredients', ops: [['limit', 1]] });
}

// ── formula_briefs reads shared by P11 / P12 ──────────────────────────────

/** Skip check: the category's brief `ingredients`, one row, `.single()`. */
function briefSkipRow(ev, categoryId) {
  return ev.briefCurrent(categoryId, { columns: 'ingredients', ops: [['limit', 1], ['single']] });
}

/** The chain P11 / P12 load the formula with (and write back by `id`). */
const BRIEF_FORMULA_READ = Object.freeze({
  columns: 'id, ingredients',
  ops: [['not', 'ingredients', 'is', null], ['limit', 1], ['single']],
});

/** The brief row whose formula P11 / P12 analyse. */
function briefFormulaRow(ev, categoryId) {
  return ev.briefCurrent(categoryId, BRIEF_FORMULA_READ);
}

/** The Scout row the new key is merged into (== `row` under 'scout', no query). */
function briefFormulaWriteBase(ev, categoryId, row) {
  return ev.briefWriteBase(categoryId, row, BRIEF_FORMULA_READ);
}

// ── P11 — Competitive Formula Benchmarking (phase10-competitive-benchmarking.js) ──

const P11_PRODUCT_COLUMNS = `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, serving_size, servings_per_container,
             supplement_facts_raw, all_nutrients, nutrients_count, marketing_analysis`;

/** Top 50 by BSR with a BSR. Not selection-scoped. */
function p11Products(ev, categoryId) {
  return ev.products(categoryId, P11_PRODUCT_COLUMNS, {
    ops: [['not', 'bsr_current', 'is', null], ['order', 'bsr_current', { ascending: true }], ['limit', 50]],
  });
}

/** P5 research rows for the competitors with a formula, exact session keyword. */
function p11P5Research(ev, asins, keyword) {
  return ev.deepResearch({ asins, keyword, columns: 'asin, competitor_angle, key_strengths, key_weaknesses, certifications' });
}

/** P5 off-Amazon sources for those ASINs (no keyword filter — as before). */
function p11P5Sources(ev, asins) {
  return ev.p5Sources({ asins, columns: 'asin, source_url, source_type, extracted' });
}

// ── P13 — Final Sign-off (phase12-final-signoff.js) ───────────────────────

/** P13 reads the brief once — for its inputs, its skip check and its write — `.maybeSingle()`. */
const P13_BRIEF_READ = Object.freeze({ columns: 'id, ingredients', ops: [['limit', 1], ['maybeSingle']] });

function p13Brief(ev, categoryId) {
  return ev.briefCurrent(categoryId, P13_BRIEF_READ);
}

/** The Scout row final_signoff is merged into (== `row` under 'scout', no query). */
function p13BriefWriteBase(ev, categoryId, row) {
  return ev.briefWriteBase(categoryId, row, P13_BRIEF_READ);
}

module.exports = {
  P5_PRODUCT_SELECT, p5Established, p5BestBsr, p5Emerging, p5LowReviewEarners,
  p5Listing, p5LabelPanels, p5Reviews, p5Keepa,
  P6_PRODUCT_COLUMNS, p6Products, p6RawReviews, p6ProductSyntheses,
  p7Products, p7CategorySynthesis, p7CategoryAsins, p7RawReviews, p7WebEvidence, p7MarketingAssets,
  p8Products,
  P9_TOP20_COLUMNS, P9_NEW_WINNER_COLUMNS, p9Top20, p9NewWinners, p9AllProducts, p9ProductCount,
  p9CategorySynthesis, p9P5Research, p9P5Sources, p9PackagingSummary, p9RawReviews, p9BriefSkip,
  briefSkipRow, BRIEF_FORMULA_READ, briefFormulaRow, briefFormulaWriteBase,
  P11_PRODUCT_COLUMNS, p11Products, p11P5Research, p11P5Sources,
  P13_BRIEF_READ, p13Brief, p13BriefWriteBase,
};
