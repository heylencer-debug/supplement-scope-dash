const test = require('node:test');
const assert = require('node:assert/strict');
const { extractKeepaSignals, reviewCountHistory, keepaMinutesNow } = require('../utils/keepa-signals');

const NOW = Date.UTC(2026, 8, 26);
const nowMin = keepaMinutesNow(NOW);

// Shape copied from a real stored dovive_keepa.raw_json row (B0FJHSQ24N,
// read-only 2026-09-26), trimmed to the fields this module reads.
const real = {
  asin: 'B0FJHSQ24N',
  parentAsin: 'B0GKQJTYXW',
  variations: [
    { asin: 'B0FJHLKPHJ', attributes: [{ value: 'Blood Orange Blackberry', dimension: 'FlavorName' }] },
    { asin: 'B0FJHSQ24N', attributes: [] },
    { asin: 'B0FJHLKPHJ', attributes: [] },
  ],
  coupon: [0, -15],
  promotions: [{ type: 'SNS', amount: -1, sellerId: null, discountPercent: 5, snsBulkDiscountPercent: 10 }],
  stats: {
    current: [-1, 2999, -1, 22425, 2999, -1, -1, -1, -1, -1, 2999, 1, -1, -1, -1, 1, 39, 20, 2999],
    avg90: [-1, 2999, -1, 17829, 2999, -1, -1, -1, -1, -1, 2999, 1, -1, -1, -1, -1, 40, 16, 2999],
    lightningDealInfo: null,
  },
};

test('reads parent, deduped variations, review count (index 17, not 16), rating, SNS', () => {
  const s = extractKeepaSignals(real, NOW);
  assert.equal(s.parent_asin, 'B0GKQJTYXW');
  assert.deepEqual(s.variation_asins, ['B0FJHLKPHJ', 'B0FJHSQ24N']);
  assert.equal(s.review_count, 20);
  assert.equal(s.rating, 3.9);
  assert.equal(s.price_avg_90d, 29.99);
  assert.equal(s.bsr_avg_90d, 17829);
  assert.equal(s.sns_discount_pct, 5);
  // one-time coupon 0 → not active; S&S coupon 15% recorded
  assert.equal(s.coupon_active, false);
  assert.deepEqual(s.coupon, { one_time: null, subscribe_and_save: { kind: 'percent', value: 15 } });
  assert.equal(s.lightning_deal_active, false);
});

test('one-time coupon in cents is active; live lightning deal window is active, expired is not', () => {
  const s = extractKeepaSignals({ coupon: [200, 0], stats: { lightningDealInfo: [nowMin - 10, nowMin + 10] } }, NOW);
  assert.equal(s.coupon_active, true);
  assert.deepEqual(s.coupon.one_time, { kind: 'cents', value: 200 });
  assert.equal(s.lightning_deal_active, true);
  const e = extractKeepaSignals({ stats: { lightningDealInfo: [7492024, 7492716] } }, NOW);
  assert.equal(e.lightning_deal_active, false);
  assert.equal(extractKeepaSignals({ primeDealEndTime: nowMin + 60 }, NOW).lightning_deal_active, true);
  assert.equal(extractKeepaSignals({ primeDealEndTime: 7769220 }, NOW).lightning_deal_active, false);
});

test('empty / missing product never throws', () => {
  const s = extractKeepaSignals(null, NOW);
  assert.equal(s.parent_asin, null);
  assert.equal(s.variation_asins, null);
  assert.equal(s.review_count, null);
  assert.equal(s.coupon, null);
});

test('review-count history from csv[17], windowed', () => {
  const csv = [];
  csv[17] = [nowMin - 200 * 1440, 10, nowMin - 30 * 1440, 50, nowMin - 1440, 60, -1, -1];
  const h = reviewCountHistory(csv, 90, NOW);
  assert.deepEqual(h.map((r) => r.count), [50, 60]);
  assert.equal(reviewCountHistory([], 90, NOW), null);
});
