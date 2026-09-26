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
function reuseKeywordsFromEnv(env = process.env) {
  return listFromEnv('SCOUT_REUSE_KEYWORDS', env);
}
function reuseMaxAgeDays(env = process.env) {
  const n = Number(env.SCOUT_REUSE_MAX_AGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : null;
}
module.exports = { reuseAsinsFromEnv, reuseKeywordsFromEnv, reuseMaxAgeDays };
