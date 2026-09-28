/**
 * utils/market-intel-store.js — read side of P7's market report.
 *
 * P7 (phase6-market-analysis.js) saves its report into
 * `formula_briefs.ingredients.market_intelligence` =
 *   { ai_market_analysis, generated_at, grok_model, products_analyzed, review_coverage }
 * (one formula_briefs row per category; P9 preserves the key across its
 * delete-and-reinsert).
 *
 * Before 2026-09-29 P9 and P10 looked for it in a `market_intelligence`
 * table and in `formula_briefs.brief_type` / `generated_at` columns — none of
 * which exist in Scout's DB — so both ran with no market context, and P7's
 * own "already done" check (also on `brief_type`) never skipped. Every
 * consumer now reads the key from here, the one place it is written.
 *
 * FAIL-OPEN: query error, no row, or no report text → null.
 */

'use strict';

const TABLE = 'formula_briefs';
const KEY = 'market_intelligence';

/** The P7 payload out of a formula_briefs.ingredients object, or null. */
function extractMarketIntel(ingredients, { table = TABLE } = {}) {
  const mi = ingredients && typeof ingredients === 'object' ? ingredients[KEY] : null;
  if (!mi || typeof mi !== 'object') return null;
  const text = typeof mi.ai_market_analysis === 'string' ? mi.ai_market_analysis.trim() : '';
  if (!text) return null;
  return {
    ai_market_analysis: mi.ai_market_analysis,
    generated_at: mi.generated_at || null,
    model: mi.grok_model || null,
    products_analyzed: mi.products_analyzed ?? null,
    review_coverage: mi.review_coverage ?? null,
    source: `${table}.ingredients.${KEY}`,
  };
}

/**
 * Newest formula_briefs row for the category → its P7 report, or null.
 * `table` defaults to Scout's formula_briefs; utils/evidence-source.js passes
 * 'v_formula_brief_current' (same columns) for the RnD backend.
 */
async function fetchMarketIntel(client, categoryId, { table = TABLE } = {}) {
  try {
    if (!client || !categoryId) return null;
    const { data, error } = await client.from(table)
      .select('id, ingredients, created_at')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return extractMarketIntel(data[0].ingredients, { table });
  } catch {
    return null;
  }
}

module.exports = { TABLE, KEY, extractMarketIntel, fetchMarketIntel };
