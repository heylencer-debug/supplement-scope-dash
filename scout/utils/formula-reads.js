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

module.exports = {
  P6_PRODUCT_COLUMNS, p6Products, p6RawReviews, p6ProductSyntheses,
};
