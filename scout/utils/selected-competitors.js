/**
 * utils/selected-competitors.js — how P3 / P4 / P5 / P8 read the competitor
 * selection written by select-competitors.js (migration 011).
 *
 * The contract every caller relies on: when `products.selected` does not
 * exist yet (migration 011 not applied) or is not populated for this
 * category (selection never ran, e.g. a category built before it existed),
 * the loader returns `{ active: false }` and callers keep TODAY's behaviour
 * — "top N by BSR". Only a populated selection changes what they process.
 */

const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./category-resolver');

const INACTIVE = (why) => ({ active: false, why, ranks: new Map() });

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client  DASH client (products lives there)
 * @param {string} categoryId
 * @returns {Promise<{ active: boolean, why: string, ranks: Map<string, number> }>}
 */
async function loadSelection(client, categoryId) {
  if (!client || !categoryId) return INACTIVE('no category');
  try {
    const { data, error } = await client
      .from('products')
      .select('asin, selection_rank')
      .eq('category_id', categoryId)
      .eq('selected', true)
      .order('selection_rank', { ascending: true })
      .limit(500);
    if (error) return INACTIVE(/selected|selection_rank|42703|does not exist/i.test(`${error.code} ${error.message}`) ? 'selection columns not migrated (011)' : `query failed: ${error.message}`);
    if (!data || !data.length) return INACTIVE('selection not populated for this category');
    const ranks = new Map();
    for (const r of data) if (r.asin && !ranks.has(r.asin)) ranks.set(r.asin, r.selection_rank ?? ranks.size + 1);
    return { active: true, why: `${ranks.size} selected competitors`, ranks };
  } catch (e) {
    return INACTIVE(`lookup failed: ${e.message}`);
  }
}

/** Same, starting from the pipeline keyword (for scripts that only have the keyword). */
async function loadSelectionForKeyword(keyword, client) {
  const dash = client || createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
  try {
    const cat = await resolveCategory(dash, keyword);
    return loadSelection(dash, cat.id);
  } catch (e) {
    return INACTIVE(`category not resolved: ${e.message}`);
  }
}

/**
 * Keep only selected rows, ordered by selection_rank. Inactive selection →
 * rows returned untouched (same array), so the caller's existing ordering
 * and caps still apply.
 */
function applySelection(rows, selection, getAsin = (r) => r.asin) {
  if (!selection || !selection.active) return rows;
  return rows
    .filter((r) => selection.ranks.has(getAsin(r)))
    .sort((a, b) => selection.ranks.get(getAsin(a)) - selection.ranks.get(getAsin(b)));
}

/**
 * For supabase-js product queries: scope to selected rows ordered by
 * selection_rank. Call BEFORE the query's own .order(...) so selection_rank
 * is the primary sort key; inactive selection → query untouched.
 */
function scopeToSelection(query, selection) {
  if (!selection || !selection.active) return query;
  return query.eq('selected', true).order('selection_rank', { ascending: true });
}

/**
 * How many of the (selection-scoped) top-20 must be done for a P3/P4 gate to
 * pass: 75% of the rows the gate can actually look at, never more than the
 * historical 15. A category with only 12 selected competitors needs 9, not
 * an unreachable 15.
 *
 * @param {number} selectionSize  number of selected competitors (sel.ranks.size)
 */
function top20Need(selectionSize) {
  const n = Math.max(0, Math.floor(Number(selectionSize) || 0));
  return Math.min(15, Math.ceil(0.75 * Math.min(20, n)));
}

module.exports = { loadSelection, loadSelectionForKeyword, applySelection, scopeToSelection, top20Need };
