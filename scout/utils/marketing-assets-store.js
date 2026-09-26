/**
 * utils/marketing-assets-store.js — read side of dovive_marketing_assets
 * (migration 015). Used by P7 (phase6-market-analysis.js) and P9
 * (phase8-formula-brief.js) to add the P7b roll-up + experienced-vs-claimed
 * table to their prompts.
 *
 * FAIL-OPEN: a missing table (migration not applied), a network error or an
 * empty result all return null — never throw. A consumer must behave exactly
 * as before when this returns null (its prompt stays byte-identical).
 */

'use strict';

const TABLE = 'dovive_marketing_assets';

/** Latest category-scope row for a keyword (or, failing that, a category id). */
async function fetchCategoryMarketingAssets(client, { keyword = null, categoryId = null } = {}) {
  try {
    if (!client || (!keyword && !categoryId)) return null;
    const cols = 'keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at';
    for (const [col, val] of [['keyword', keyword], ['category_id', categoryId]]) {
      if (!val) continue;
      const { data, error } = await client.from(TABLE).select(cols).eq('scope', 'category').eq(col, val)
        .order('generated_at', { ascending: false }).limit(1);
      if (error || !data || !data.length) continue;
      const row = data[0];
      if (row.rollup && row.rollup.products_analyzed) return row;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { TABLE, fetchCategoryMarketingAssets };
