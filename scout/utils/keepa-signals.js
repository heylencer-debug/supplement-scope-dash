/**
 * utils/keepa-signals.js — read the variation / promotion / review fields out
 * of a Keepa product object (pure, unit-tested in test/keepa-signals.test.js).
 *
 * Used twice:
 *   1. keepa-phase2.js parseKeepa() — to store them as real dovive_keepa
 *      columns (migration 011).
 *   2. utils/competitor-selection inputs, from dovive_keepa.raw_json, for rows
 *      written before migration 011 (raw_json already keeps every field below
 *      except `csv`, which keepa-phase2.js strips before saving).
 *
 * Every field here was confirmed present in real stored raw_json rows
 * (2026-09-26, 808 dovive_keepa rows, read-only): parentAsin (650/808),
 * variations[{asin, attributes}] (650), coupon [oneTime, subscribeAndSave]
 * (301 non-zero), stats.lightningDealInfo [startMin, endMin] (303, mostly
 * expired), primeDealEndTime (189), promotions[{type:'SNS', discountPercent}]
 * (746, all type SNS), stats.current[17] review count (808/808), plus
 * stats.avg90 for the 90-day averages.
 *
 * Keepa csv/stats index reference (the ones this pipeline reads):
 *   0 AMAZON price · 1 NEW price · 3 SALES rank · 8 LIGHTNING_DEAL price ·
 *   16 RATING (0–50, i.e. 4.7★ = 47) · 17 COUNT_REVIEWS · 18 BUY_BOX_SHIPPING
 * Prices are in cents; -1 means "no data".
 *
 * coupon semantics (Keepa docs): each element is 0 when absent, POSITIVE for an
 * absolute discount in cents, NEGATIVE for a percentage (-15 = 15% off).
 * All Keepa timestamps are "Keepa minutes" since 2011-01-01T00:00Z.
 */

const KEEPA_EPOCH_MS = Date.UTC(2011, 0, 1);

const IDX = { AMAZON: 0, NEW: 1, SALES: 3, LIGHTNING_DEAL: 8, RATING: 16, COUNT_REVIEWS: 17, BUY_BOX: 18 };

function keepaMinutesNow(nowMs = Date.now()) {
  return Math.floor((nowMs - KEEPA_EPOCH_MS) / 60000);
}

function pos(v) {
  return typeof v === 'number' && v > 0 ? v : null;
}

function cents(v) {
  const p = pos(v);
  return p == null ? null : Math.round(p) / 100;
}

/** Same Amazon → New → Buy Box precedence parseKeepa() uses for price_usd. */
function pickPrice(arr) {
  if (!Array.isArray(arr)) return null;
  return cents(arr[IDX.AMAZON]) ?? cents(arr[IDX.NEW]) ?? cents(arr[IDX.BUY_BOX]);
}

/** One coupon element → { kind: 'percent'|'cents', value } | null. */
function decodeCoupon(v) {
  if (typeof v !== 'number' || v === 0) return null;
  return v < 0 ? { kind: 'percent', value: -v } : { kind: 'cents', value: v };
}

/**
 * Review-count history from csv[17] ([keepaMin, count, keepaMin, count, …]).
 * Kept to the last `days`, ascending by date.
 */
function reviewCountHistory(csv, days = 90, nowMs = Date.now()) {
  const arr = Array.isArray(csv) ? csv[IDX.COUNT_REVIEWS] : null;
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const cutoff = nowMs - days * 86400000;
  const out = [];
  for (let i = 0; i + 1 < arr.length; i += 2) {
    const t = arr[i];
    const v = arr[i + 1];
    if (!(t >= 0) || !(v >= 0)) continue;
    const ms = KEEPA_EPOCH_MS + t * 60000;
    if (ms < cutoff) continue;
    out.push({ date: new Date(ms).toISOString().split('T')[0], count: v });
  }
  return out.length ? out : null;
}

/**
 * @param {object} product  a Keepa API product (or dovive_keepa.raw_json)
 * @param {number} [nowMs]
 */
function extractKeepaSignals(product, nowMs = Date.now()) {
  const p = product || {};
  const stats = p.stats || {};
  const current = Array.isArray(stats.current) ? stats.current : [];
  const avg90 = Array.isArray(stats.avg90) ? stats.avg90 : [];
  const nowMin = keepaMinutesNow(nowMs);

  const variationAsins = Array.isArray(p.variations)
    ? [...new Set(p.variations.map((v) => v && v.asin).filter((a) => typeof a === 'string' && a))]
    : null;

  const coupon = Array.isArray(p.coupon) ? p.coupon : null;
  const oneTime = coupon ? decodeCoupon(coupon[0]) : null;
  const sns = coupon ? decodeCoupon(coupon[1]) : null;

  const ld = Array.isArray(stats.lightningDealInfo) ? stats.lightningDealInfo : null;
  const lightningActive =
    (ld && ld.length >= 2 && ld[0] <= nowMin && nowMin <= ld[1]) ||
    pos(current[IDX.LIGHTNING_DEAL]) != null;
  const primeDealActive = typeof p.primeDealEndTime === 'number' && p.primeDealEndTime > nowMin;

  const snsPromo = Array.isArray(p.promotions)
    ? p.promotions.find((x) => x && x.type === 'SNS' && typeof x.discountPercent === 'number')
    : null;

  const ratingRaw = pos(current[IDX.RATING]);

  return {
    parent_asin: typeof p.parentAsin === 'string' && p.parentAsin ? p.parentAsin : null,
    variation_asins: variationAsins && variationAsins.length ? variationAsins : null,
    review_count: pos(current[IDX.COUNT_REVIEWS]),
    rating: ratingRaw != null ? ratingRaw / 10 : null,
    // Current and 90-day price from the SAME stats source and precedence, so
    // the promotion check compares like with like.
    price_current: pickPrice(current),
    price_avg_90d: pickPrice(avg90),
    bsr_avg_90d: pos(avg90[IDX.SALES]),
    coupon: coupon ? { one_time: oneTime, subscribe_and_save: sns } : null,
    coupon_active: !!oneTime,
    lightning_deal_active: !!(lightningActive || primeDealActive),
    sns_discount_pct: snsPromo ? snsPromo.discountPercent : null,
  };
}

module.exports = { extractKeepaSignals, reviewCountHistory, decodeCoupon, keepaMinutesNow, IDX, KEEPA_EPOCH_MS };
