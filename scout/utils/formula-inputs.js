/**
 * utils/formula-inputs.js — product columns the formula phases select, next to
 * the pure helpers that read them, so a unit test can prove every field a
 * helper reads is actually in the select.
 *
 * History (fixed 2026-09-29): P7's dosage table read `all_nutrients` and P9's
 * serving-size distribution read `serving_size`, neither of which their
 * selects asked for, so both sections were always empty; P10's flavour scan
 * read a jsonb key nothing writes instead of the other_ingredients column.
 */

'use strict';

/** Split a supabase select string into column names. */
function selectColumns(select) {
  return String(select).split(',').map((c) => c.trim()).filter(Boolean);
}

// P7 (phase6-market-analysis.js) — every product in the category, BSR asc.
const P7_PRODUCT_COLUMNS = [
  'asin', 'brand', 'title', 'bsr_current', 'bsr_30_days_avg', 'bsr_90_days_avg',
  'price', 'monthly_revenue', 'monthly_sales', 'rating_value', 'rating_count',
  'supplement_facts_raw', 'feature_bullets_text', 'claims_on_label',
  'review_analysis', 'marketing_analysis', 'serving_size', 'servings_per_container',
  // read by buildDosageTable (was missing → the dosage table was always empty)
  'all_nutrients',
].join(', ');

/** P7 dosage table: one line per product with label nutrients, top 60 by the caller's order. */
function buildDosageTable(products) {
  const rows = [];
  for (const p of (products || []).slice(0, 60)) {
    const nutrients = p.all_nutrients;
    if (!nutrients || !Array.isArray(nutrients) || !nutrients.length) continue;
    const key = nutrients.slice(0, 15).map(n => `${n.name || n.ingredient || '?'}: ${n.amount || n.quantity || '?'}`).join(' | ');
    rows.push(`${p.brand || '?'} (BSR ${p.bsr_current?.toLocaleString() || '?'}): ${key}`);
  }
  return rows.length ? rows.join('\n') : 'OCR dosage data not yet available';
}

// P9 (phase8-formula-brief.js) "all products" aggregate set — every product in
// the category with marketing_analysis. Read for price, form, P6 ingredients,
// packaging claims, review pain points and the serving-size distribution.
const P9_ALL_PRODUCT_COLUMNS = [
  'price', 'packaging_type', 'all_nutrients', 'marketing_analysis', 'review_analysis',
  // read by servingSizeDistribution (was missing → the distribution was always empty)
  'serving_size',
].join(', ');

/** P9 serving-size distribution: top 8 normalised serving sizes with counts, '' when none. */
function servingSizeDistribution(products) {
  const servingSizeMap = {};
  for (const p of products || []) {
    if (p.serving_size) {
      const ss = String(p.serving_size).toLowerCase().trim();
      servingSizeMap[ss] = (servingSizeMap[ss] || 0) + 1;
    }
  }
  return Object.entries(servingSizeMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([ss, count]) => `"${ss}": ${count} products`).join('\n');
}

// P10 (phase9-formula-qa.js) competitor set — top 40 by BSR.
const P10_COMPETITOR_COLUMNS = [
  'asin', 'brand', 'title', 'bsr_current', 'price', 'monthly_revenue', 'monthly_sales',
  'rating_value', 'rating_count', 'supplement_facts_raw', 'marketing_analysis',
  // read by competitorFlavourFields — flavours are declared in "Other ingredients"
  'other_ingredients',
].join(', ');

/**
 * P10 flavour scan: the lower-cased texts a competitor's flavours can be read
 * from, each with its field name for provenance. The scan used to read
 * marketing_analysis.other_ingredients, a key no phase writes; the label's
 * other-ingredients line is the products.other_ingredients text column.
 */
function competitorFlavourFields(c) {
  return [
    { key: 'title', text: (c?.title || '').toLowerCase() },
    { key: 'supplement_facts_raw', text: (c?.supplement_facts_raw || '').toLowerCase() },
    { key: 'other_ingredients', text: (typeof c?.other_ingredients === 'string' ? c.other_ingredients : '').toLowerCase() },
  ];
}

module.exports = {
  selectColumns,
  P7_PRODUCT_COLUMNS, buildDosageTable,
  P9_ALL_PRODUCT_COLUMNS, servingSizeDistribution,
  P10_COMPETITOR_COLUMNS, competitorFlavourFields,
};
