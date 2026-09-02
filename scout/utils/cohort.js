/**
 * utils/cohort.js — deterministic Established/Emerging/Context classifier.
 *
 * No AI cost. Runs off signals Keepa already gives us per ASIN (listing
 * age, review count, sales, BSR trend) — computed once in
 * migrate-keepa-to-dash.js (the "cheap post-P2 step" that already loads
 * every one of these fields per product) and written to `products.cohort`
 * (scout/migrations/009_products_cohort.sql).
 *
 * WHY THIS EXISTS. P8 (phase8-formula-brief.js) needs two different kinds
 * of evidence: "what do PROVEN category leaders do" (table stakes a new
 * entrant cannot skip) vs "what are FAST-GROWING newcomers trying that
 * hasn't been proven yet" (upside worth a labelled risk note, not a
 * guarantee). Blending both into one undifferentiated "top performers"
 * list — the pipeline's behavior before this — hides which ingredient/dose/
 * positioning decisions are safe bets vs bets at all.
 *
 * DEFINITIONS (per the user-approved design):
 *   established — years on market + high stable sales + big review base
 *                 (the Liquid I.V./Nuun tier).
 *   emerging    — young listing (~under 18 months) + fast review velocity
 *                 + climbing BSR.
 *   context     — everything else. Not a model to follow either way; kept
 *                 around only so market-size/pricing views elsewhere in the
 *                 app still see every product, not just the two cohorts.
 *
 * ALL THRESHOLDS ARE ENV-TUNABLE (see THRESHOLDS below) so a category with
 * unusually young or unusually saturated competition doesn't need a code
 * change to re-tune — only a re-run of migrate-keepa-to-dash.js or the
 * one-shot backfill-cohort.js.
 */

const THRESHOLDS = {
  // ESTABLISHED — must clear ALL three floors.
  ESTABLISHED_MIN_AGE_MONTHS: numEnv('COHORT_ESTABLISHED_MIN_AGE_MONTHS', 24), // "years on market" ≈ 2+ years
  ESTABLISHED_MIN_REVIEWS: numEnv('COHORT_ESTABLISHED_MIN_REVIEWS', 1500), // "big review base"
  ESTABLISHED_MIN_MONTHLY_SALES: numEnv('COHORT_ESTABLISHED_MIN_MONTHLY_SALES', 300), // "high stable sales"

  // EMERGING — must clear age + velocity; BSR-climb only enforced when we
  // actually have enough history to measure it (see classifyCohort below —
  // young ASINs, which are exactly the emerging candidates, often have the
  // THINNEST Keepa history, so treating "no data" as a hard fail would
  // systematically under-count the cohort it's meant to catch).
  EMERGING_MAX_AGE_MONTHS: numEnv('COHORT_EMERGING_MAX_AGE_MONTHS', 18),
  EMERGING_MIN_REVIEW_VELOCITY: numEnv('COHORT_EMERGING_MIN_REVIEW_VELOCITY', 12), // reviews/month
  EMERGING_MIN_BSR_CLIMB_PCT: numEnv('COHORT_EMERGING_MIN_BSR_CLIMB_PCT', 15), // % rank improvement, early half vs late half of the 30d window
  EMERGING_MIN_REVIEWS: numEnv('COHORT_EMERGING_MIN_REVIEWS', 20), // floor so a 1-review ASIN can't "velocity" its way in
};

function numEnv(key, fallback) {
  const v = process.env[key];
  const n = v !== undefined ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Months between a Keepa date string and now. Null if no usable date. */
function monthsSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return null;
  const now = Date.now();
  const months = (now - then) / (1000 * 60 * 60 * 24 * 30.44);
  return months >= 0 ? months : null;
}

/**
 * % rank IMPROVEMENT (positive = BSR number got smaller / better) comparing
 * the earlier half of a bsr_history_30d window to the later half. Null when
 * there isn't enough history to say anything ( < 6 points, ~ every-5th-day
 * Keepa sampling over 30 days gives roughly this many for an actively
 * tracked ASIN).
 */
function bsrClimbPct(bsrHistory30d) {
  if (!Array.isArray(bsrHistory30d) || bsrHistory30d.length < 6) return null;
  const sorted = [...bsrHistory30d]
    .filter((r) => r && r.rank > 0 && r.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sorted.length < 6) return null;
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid).map((r) => r.rank);
  const late = sorted.slice(mid).map((r) => r.rank);
  if (!early.length || !late.length) return null;
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const earlyAvg = avg(early);
  const lateAvg = avg(late);
  if (earlyAvg <= 0) return null;
  return ((earlyAvg - lateAvg) / earlyAvg) * 100;
}

/**
 * Classify one product. `signals`:
 *   { listedSince, releaseDate, reviewCount, monthlySalesEst, bsrCurrent, bsrHistory30d }
 *
 * listedSince/releaseDate/monthlySalesEst/bsrHistory30d come from
 * dovive_keepa (see migrate-keepa-to-dash.js's select). reviewCount MUST
 * come from `products.rating_count` (the real P1 Bright Data scrape count)
 * — NOT `dovive_keepa.review_count`. A live sanity check against real
 * market leaders (Nuun, Liquid I.V., LMNT) found the Keepa field
 * (`stats.current[16]` in keepa-phase2.js's parseKeepa()) stuck at ~45-48
 * for nearly every ASIN regardless of the product's actual review count —
 * e.g. Liquid I.V.'s real ~106,000 reviews reported as 46 — which silently
 * zeroed out the entire 'established' cohort the first time this ran.
 * `products.rating_count` is untouched by the Keepa migration's own patch,
 * so it still holds the real figure. The Keepa field bug itself is
 * separate and NOT fixed here (out of scope for cohort tagging) — flagged
 * for a future pass.
 *
 * Returns { cohort, ageMonths, reviewVelocity, bsrClimbPct } — the extra
 * fields are diagnostic (used by backfill-cohort.js's sanity-check report
 * and safe to ignore otherwise).
 */
function classifyCohort(signals, thresholds = THRESHOLDS) {
  const {
    listedSince, releaseDate, reviewCount, monthlySalesEst, bsrHistory30d,
  } = signals || {};

  const ageMonths = monthsSince(listedSince) ?? monthsSince(releaseDate);
  const reviews = reviewCount || 0;
  const reviewVelocity = ageMonths && ageMonths > 0 ? reviews / ageMonths : null;
  const climb = bsrClimbPct(bsrHistory30d);

  const isEstablished =
    ageMonths !== null &&
    ageMonths >= thresholds.ESTABLISHED_MIN_AGE_MONTHS &&
    reviews >= thresholds.ESTABLISHED_MIN_REVIEWS &&
    (monthlySalesEst || 0) >= thresholds.ESTABLISHED_MIN_MONTHLY_SALES;

  if (isEstablished) {
    return { cohort: 'established', ageMonths, reviewVelocity, bsrClimbPct: climb };
  }

  const isEmerging =
    ageMonths !== null &&
    ageMonths <= thresholds.EMERGING_MAX_AGE_MONTHS &&
    reviews >= thresholds.EMERGING_MIN_REVIEWS &&
    reviewVelocity !== null &&
    reviewVelocity >= thresholds.EMERGING_MIN_REVIEW_VELOCITY &&
    // Climbing BSR: required when measurable, waived when the ASIN simply
    // doesn't have enough Keepa history yet (see threshold comment above).
    (climb === null || climb >= thresholds.EMERGING_MIN_BSR_CLIMB_PCT);

  if (isEmerging) {
    return { cohort: 'emerging', ageMonths, reviewVelocity, bsrClimbPct: climb };
  }

  return { cohort: 'context', ageMonths, reviewVelocity, bsrClimbPct: climb };
}

module.exports = { classifyCohort, monthsSince, bsrClimbPct, THRESHOLDS };
