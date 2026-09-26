/**
 * utils/reuse-asins.js — the READ-FIRST plan's hand-off to the producers.
 *
 * run-pipeline.js sets these ONLY for the duration of one phase, and only when
 * plan-scope.js decided that phase is a `top-up` / family `reuse`:
 *
 *   SCOUT_REUSE_ASINS     comma-separated ASINs whose data for this phase is
 *                         already fresh in a SIBLING session of the same
 *                         keyword family. Producers (playwright-reviews.js,
 *                         phase4-text-extract.js, ocr-phase4.js) treat them as
 *                         "already done" and do not re-buy them.
 *   SCOUT_RESCRAPE_ASINS  comma-separated ASINs THIS session already holds but
 *                         only as stale (outside the freshness window) data, with
 *                         no fresh sibling copy. Producers drop them from their
 *                         "already done for this keyword" set so they are
 *                         scraped / OCR'd again.
 *   SCOUT_REUSE_KEYWORDS  comma-separated sibling session labels the migrate
 *                         step may READ from for those ASINs
 *                         (migrate-reviews-to-dash.js). Rows are never copied.
 *   SCOUT_REUSE_MAX_AGE_DAYS  freshness window for the sibling rows read.
 *
 * Unset (every run that did not come through a plan) → empty → the scripts
 * behave exactly as before.
 */
function listFromEnv(name, env = process.env) {
  return String(env[name] || '').split(',').map(s => s.trim()).filter(Boolean);
}
function reuseAsinsFromEnv(env = process.env) {
  return new Set(listFromEnv('SCOUT_REUSE_ASINS', env));
}
function rescrapeAsinsFromEnv(env = process.env) {
  return new Set(listFromEnv('SCOUT_RESCRAPE_ASINS', env));
}
function reuseKeywordsFromEnv(env = process.env) {
  return listFromEnv('SCOUT_REUSE_KEYWORDS', env);
}
function reuseMaxAgeDays(env = process.env) {
  const n = Number(env.SCOUT_REUSE_MAX_AGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * migrate-reviews-to-dash.js: which ASINs of this session's category may take
 * a sibling's reviews — those with none under this session's keyword, plus
 * those the plan listed because this session's copy is stale.
 */
function siblingReviewNeed(asins, byAsin, planned = new Set()) {
  return asins.filter(a => !byAsin[a] || planned.has(a));
}

/**
 * Merge sibling review rows into byAsin (mutates, returns the count of ASINs
 * that took sibling rows). Per ASIN only the single freshest sibling session is
 * used (no review counted twice), and only when it is fresher than this
 * session's own rows — otherwise this session's copy is kept.
 */
function mergeSiblingReviews(byAsin, sibling) {
  const freshestKw = {};
  for (const r of sibling) {
    const cur = freshestKw[r.asin];
    if (!cur || (r.scraped_at || '') > cur.at) freshestKw[r.asin] = { kw: r.keyword, at: r.scraped_at || '' };
  }
  const ownFreshest = (a) => (byAsin[a] || []).reduce((m, r) => ((r.scraped_at || '') > m ? r.scraped_at : m), '');
  const replaced = new Set();
  for (const r of sibling) {
    const pick = freshestKw[r.asin];
    if (pick?.kw !== r.keyword) continue;
    if (byAsin[r.asin] && !replaced.has(r.asin)) {
      if (pick.at <= ownFreshest(r.asin)) continue; // own copy is as fresh — keep it
      byAsin[r.asin] = [];                           // sibling's is fresher — use it instead
    }
    replaced.add(r.asin);
    if (!byAsin[r.asin]) byAsin[r.asin] = [];
    byAsin[r.asin].push(r);
  }
  return replaced.size;
}

module.exports = { reuseAsinsFromEnv, rescrapeAsinsFromEnv, reuseKeywordsFromEnv, reuseMaxAgeDays, siblingReviewNeed, mergeSiblingReviews };
