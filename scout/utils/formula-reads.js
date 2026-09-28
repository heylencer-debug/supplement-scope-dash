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

const { P7_PRODUCT_COLUMNS } = require('./formula-inputs');

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

module.exports = {
  P6_PRODUCT_COLUMNS, p6Products, p6RawReviews, p6ProductSyntheses,
  p7Products, p7CategorySynthesis, p7CategoryAsins, p7RawReviews, p7WebEvidence, p7MarketingAssets,
  p8Products,
  briefSkipRow, BRIEF_FORMULA_READ, briefFormulaRow, briefFormulaWriteBase,
  P11_PRODUCT_COLUMNS, p11Products, p11P5Research, p11P5Sources,
};
