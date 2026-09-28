/**
 * utils/review-synthesis-store.js — read side of dovive_review_synthesis
 * (migration 012). Shared by P6a, P7, P8 and migrate-reviews-to-dash.js so
 * each can PREFER the full-coverage synthesis and fall back to its old
 * sampling when no usable row exists.
 *
 * STALENESS: pass `reviewsClient` (the client that reads dovive_reviews) and
 * a synthesis generated BEFORE the latest scrape of its keyword is ignored —
 * with a log line saying so — because it no longer describes the reviews the
 * phase is about to reason over (e.g. P3 re-scraped, P3b not re-run yet).
 *
 * FAIL-OPEN: a missing table (migration not applied yet), a network error or
 * an empty result all return null / {} — never throw. A consumer must work
 * exactly as before when this returns nothing.
 */

'use strict';

const { isStaleSynthesis } = require('./review-synthesis');

const TABLE = 'dovive_review_synthesis';

/** Latest dovive_reviews.scraped_at for a keyword (or null). */
async function fetchLatestScrapedAt(reviewsClient, keyword) {
  try {
    if (!reviewsClient || !keyword) return null;
    const { data, error } = await reviewsClient.from('dovive_reviews')
      .select('scraped_at')
      .eq('keyword', keyword)
      .order('scraped_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].scraped_at || null;
  } catch {
    return null;
  }
}

async function isStale(reviewsClient, keyword, generatedAt, log, what) {
  if (!reviewsClient) return false;
  const latest = await fetchLatestScrapedAt(reviewsClient, keyword);
  if (!isStaleSynthesis(generatedAt, latest)) return false;
  log(`  ⚠️ Ignoring ${what} review synthesis for "${keyword}": generated ${generatedAt}, but reviews were scraped again at ${latest} — falling back to sampled reviews until P3b re-runs.`);
  return true;
}

/**
 * Latest category-scope synthesis for a keyword (optionally a category id).
 * `table` defaults to dovive_review_synthesis; utils/evidence-source.js passes
 * 'v_formula_review_themes' (same columns) for the RnD backend.
 */
async function fetchCategorySynthesis(client, { keyword, categoryId = null, reviewsClient = null, log = console.log, table = TABLE } = {}) {
  try {
    if (!client || (!keyword && !categoryId)) return null;
    let q = client.from(table)
      .select('keyword, category_id, scope, asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status')
      .eq('scope', 'category');
    q = keyword ? q.eq('keyword', keyword) : q.eq('category_id', categoryId);
    const { data, error } = await q.order('generated_at', { ascending: false }).limit(1);
    if (error || !data || !data.length) return null;
    const row = data[0];
    if (!Array.isArray(row.themes)) return null;
    if (await isStale(reviewsClient, row.keyword || keyword, row.generated_at, log, 'category')) return null;
    return row;
  } catch {
    return null;
  }
}

/** Product-scope rows for a keyword, keyed by ASIN (all-or-nothing on staleness). */
async function fetchProductSyntheses(client, { keyword, asins = null, reviewsClient = null, log = console.log, table = TABLE } = {}) {
  let out = {};
  try {
    if (!client || !keyword) return out;
    const pageSize = 500;
    for (let page = 0; ; page++) {
      let q = client.from(table)
        .select('asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status')
        .eq('scope', 'product')
        .eq('keyword', keyword);
      if (asins && asins.length) q = q.in('asin', asins);
      const { data, error } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !data) break;
      for (const r of data) if (r.asin) out[r.asin] = r;
      if (data.length < pageSize) break;
    }
    const rows = Object.values(out);
    if (rows.length && reviewsClient) {
      const oldest = rows.reduce((m, r) => (!m || (r.generated_at && r.generated_at < m) ? r.generated_at : m), null);
      if (await isStale(reviewsClient, keyword, oldest, log, 'product')) out = {};
    }
  } catch {
    // fail-open
  }
  return out;
}

module.exports = { TABLE, fetchCategorySynthesis, fetchProductSyntheses, fetchLatestScrapedAt };
