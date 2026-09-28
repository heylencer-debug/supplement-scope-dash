/**
 * utils/formula-inputs.js — product columns the formula phases select, next to
 * the pure helpers that read them, so a unit test can prove every field a
 * helper reads is actually in the select.
 *
 * History: P7's dosage table read `all_nutrients` its select never asked for,
 * so it always printed "OCR dosage data not yet available" (fixed 2026-09-29).
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

module.exports = { selectColumns, P7_PRODUCT_COLUMNS, buildDosageTable };
