/**
 * utils/review-synthesis-store.js — read side of dovive_review_synthesis
 * (migration 012). Shared by P6a, P7, P8 and migrate-reviews-to-dash.js so
 * each can PREFER the full-coverage synthesis and fall back to its old
 * sampling when no row exists.
 *
 * FAIL-OPEN: a missing table (migration not applied yet), a network error or
 * an empty result all return null / {} — never throw. A consumer must work
 * exactly as before when this returns nothing.
 */

'use strict';

const TABLE = 'dovive_review_synthesis';

/** Latest category-scope synthesis for a keyword (optionally a category id). */
async function fetchCategorySynthesis(client, { keyword, categoryId = null } = {}) {
  try {
    if (!client || (!keyword && !categoryId)) return null;
    let q = client.from(TABLE)
      .select('keyword, category_id, scope, asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status')
      .eq('scope', 'category');
    q = keyword ? q.eq('keyword', keyword) : q.eq('category_id', categoryId);
    const { data, error } = await q.order('generated_at', { ascending: false }).limit(1);
    if (error || !data || !data.length) return null;
    const row = data[0];
    return Array.isArray(row.themes) ? row : null;
  } catch {
    return null;
  }
}

/** Product-scope rows for a keyword, keyed by ASIN. */
async function fetchProductSyntheses(client, { keyword, asins = null } = {}) {
  const out = {};
  try {
    if (!client || !keyword) return out;
    const pageSize = 500;
    for (let page = 0; ; page++) {
      let q = client.from(TABLE)
        .select('asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version')
        .eq('scope', 'product')
        .eq('keyword', keyword);
      if (asins && asins.length) q = q.in('asin', asins);
      const { data, error } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !data) break;
      for (const r of data) if (r.asin) out[r.asin] = r;
      if (data.length < pageSize) break;
    }
  } catch {
    // fail-open
  }
  return out;
}

module.exports = { TABLE, fetchCategorySynthesis, fetchProductSyntheses };
