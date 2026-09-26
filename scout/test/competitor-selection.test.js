const test = require('node:test');
const assert = require('node:assert/strict');
const { selectCompetitors, promoCheck, familySales, SELECTION } = require('../utils/competitor-selection');

let n = 0;
const asin = () => `B0TEST${String(++n).padStart(4, '0')}`;
function cand(over = {}) {
  return {
    asin: asin(),
    searchQueries: ['kw'],
    serpPositions: { kw: n },
    reviewsDisplayed: 1000,
    ratingDisplayed: 4.5,
    monthlySales: 500,
    ...over,
  };
}
const byAsin = (rows) => Object.fromEntries(rows.map((r) => [r.asin, r]));

test('flavors and pack sizes collapse to one competitor; best-selling child represents the family', () => {
  const parent = 'B0PARENT01';
  const a = cand({ parentAsin: parent, monthlySales: 300 });
  const b = cand({ parentAsin: parent, monthlySales: 900 });
  const c = cand({ variationAsins: [a.asin, b.asin], monthlySales: 100 }); // no parentAsin, linked by variation list
  const solo = cand();
  const { rows, stats } = selectCompetitors([a, b, c, solo]);
  const r = byAsin(rows);
  assert.equal(stats.families, 2);
  assert.equal(r[b.asin].selected, true);
  assert.deepEqual(r[b.asin].selection_reason.family.variants, [a.asin, c.asin].sort());
  for (const x of [a, c]) {
    assert.equal(r[x.asin].selected, false);
    assert.equal(r[x.asin].selection_reason.excluded, 'variation_of');
    assert.equal(r[x.asin].selection_reason.family.representative, b.asin);
  }
  // distinct child sales add up for the family
  assert.equal(r[b.asin].selection_reason.inputs.family_monthly_sales, 1300);
  assert.equal(r[b.asin].variations_count, 3);
});

test('identical family-level sales on every sibling are counted once', () => {
  assert.equal(familySales([{ monthlySales: 2000 }, { monthlySales: 2000 }]), 2000);
  assert.equal(familySales([{ monthlySales: 2000 }, { monthlySales: 500 }]), 2500);
  assert.equal(familySales([{ monthlySales: null }]), null);
});

test('review floor, rating floor and sponsored-only exclusions keep their reasons', () => {
  const low = cand({ reviewsDisplayed: 12 });
  const badRating = cand({ ratingDisplayed: 3.1 });
  const ad = cand({ searchQueries: [], sponsoredIn: ['kw'] });
  const legacyAd = cand({ searchQueries: [], isSponsored: true });
  const legacyOrganic = cand({ searchQueries: [] }); // pre-multi-query row, not sponsored
  const unknownRating = cand({ ratingDisplayed: null });
  const { rows } = selectCompetitors([low, badRating, ad, legacyAd, legacyOrganic, unknownRating]);
  const r = byAsin(rows);
  assert.equal(r[low.asin].selection_reason.excluded, 'below_review_floor');
  assert.equal(r[badRating.asin].selection_reason.excluded, 'low_rating');
  assert.equal(r[ad.asin].selection_reason.excluded, 'sponsored_only');
  assert.equal(r[legacyAd.asin].selection_reason.excluded, 'sponsored_only');
  assert.equal(r[legacyOrganic.asin].selected, true);
  assert.equal(r[unknownRating.asin].selected, true);
  assert.equal(r[unknownRating.asin].selection_reason.components.rating, 0.5);
  for (const x of [low, badRating, ad]) assert.ok(r[x.asin].selection_reason.summary.length > 0);
});

test('score orders by sales, then reviews, then rating; components are explained', () => {
  const big = cand({ monthlySales: 20000, reviewsDisplayed: 50000, ratingDisplayed: 4.7 });
  const mid = cand({ monthlySales: 2000, reviewsDisplayed: 5000, ratingDisplayed: 4.4 });
  const small = cand({ monthlySales: 200, reviewsDisplayed: 300, ratingDisplayed: 4.8 });
  const { rows } = selectCompetitors([small, mid, big]);
  assert.deepEqual(rows.slice(0, 3).map((x) => x.asin), [big.asin, mid.asin, small.asin]);
  const top = rows[0].selection_reason;
  assert.equal(top.rank, 1);
  assert.equal(top.components.sales, 1);
  assert.equal(top.components.reviews, 1);
  assert.ok(top.score > 90 && top.score <= 100);
  assert.equal(top.flags.market_leader, true);
});

test('promo flag: rank spike during a live coupon, or a deep price cut; sales component is discounted', () => {
  assert.equal(promoCheck({ bsrCurrent: 500, bsr90Avg: 1500, couponActive: true }).flag, true);
  assert.equal(promoCheck({ bsrCurrent: 500, bsr90Avg: 1500 }).flag, false, 'a rank spike alone is not a promo');
  assert.equal(promoCheck({ bsrCurrent: 1400, bsr90Avg: 1500, dealActive: true }).flag, false, 'a live deal without a spike is not');
  assert.equal(promoCheck({ priceCurrent: 15, price90Avg: 25 }).flag, true);
  assert.equal(promoCheck({ priceCurrent: 23, price90Avg: 25 }).flag, false);
  assert.equal(promoCheck({ snsDiscountPct: 15 }).flag, false, 'Subscribe & Save is not a promotion');

  const promo = cand({ monthlySales: 5000, bsrCurrent: 300, bsr90Avg: 2000, couponActive: true });
  const clean = cand({ monthlySales: 5000 });
  const { rows } = selectCompetitors([promo, clean]);
  const r = byAsin(rows);
  assert.equal(r[promo.asin].promo_flag, true);
  assert.equal(r[promo.asin].selection_reason.components.promo_discount, SELECTION.PROMO_SALES_DISCOUNT);
  assert.ok(r[promo.asin].selection_reason.score < r[clean.asin].selection_reason.score);
  assert.match(r[promo.asin].selection_reason.summary, /promo-driven/);
});

test('shared reviews: identical count+rating on siblings is flagged, score uses the ASIN\'s own Keepa count', () => {
  const parent = 'B0PARENT02';
  const a = cand({ parentAsin: parent, reviewsDisplayed: 106000, ratingDisplayed: 4.7, reviewsOwn: 611, ratingOwn: 4.7, monthlySales: 800 });
  const b = cand({ parentAsin: parent, reviewsDisplayed: 106000, ratingDisplayed: 4.7, reviewsOwn: 2400, ratingOwn: 4.6, monthlySales: 3000 });
  const { rows } = selectCompetitors([a, b]);
  const r = byAsin(rows);
  assert.deepEqual(r[a.asin].shared_reviews_with, [b.asin]);
  assert.deepEqual(r[b.asin].shared_reviews_with, [a.asin]);
  assert.equal(r[b.asin].selection_reason.inputs.review_basis, 'own_asin');
  assert.equal(r[b.asin].selection_reason.inputs.reviews_scored, 2400);
  assert.match(r[b.asin].selection_reason.summary, /reviews shared with/);
});

test('shared reviews via identical Keepa counts; lone child with pooled page count is "likely pooled"', () => {
  const parent = 'B0PARENT03';
  const a = cand({ parentAsin: parent, reviewsOwn: 3085, ratingOwn: 4.6, reviewsDisplayed: null, ratingDisplayed: null });
  const b = cand({ parentAsin: parent, reviewsOwn: 3085, ratingOwn: 4.6, reviewsDisplayed: null, ratingDisplayed: null });
  const lone = cand({ variationAsins: ['B0SIBLING1', 'B0SIBLING2'], reviewsDisplayed: 50000, reviewsOwn: 400 });
  const { rows } = selectCompetitors([a, b, lone]);
  const r = byAsin(rows);
  assert.deepEqual(r[a.asin].shared_reviews_with, [b.asin]);
  assert.equal(r[a.asin].selection_reason.inputs.review_basis, 'family_shared');
  assert.equal(r[lone.asin].selection_reason.flags.shared_reviews.likely_family_pooled, true);
  assert.equal(r[lone.asin].selection_reason.inputs.reviews_scored, 400);
  assert.deepEqual(r[lone.asin].shared_reviews_with, []);
});

test('exactly 40 selected out of a larger pool; the rest keep reasons with pool rank', () => {
  const pool = Array.from({ length: 85 }, (_, i) => cand({ monthlySales: 10000 - i * 100, reviewsDisplayed: 500 + i }));
  const { rows, stats } = selectCompetitors(pool);
  const sel = rows.filter((r) => r.selected);
  assert.equal(sel.length, 40);
  assert.equal(stats.selected, 40);
  assert.deepEqual(sel.map((r) => r.selection_rank), Array.from({ length: 40 }, (_, i) => i + 1));
  const out = rows.filter((r) => !r.selected);
  assert.equal(out.length, 45);
  for (const r of out) {
    assert.equal(r.selection_rank, null);
    assert.equal(r.selection_reason.excluded, 'below_cut');
    assert.ok(r.selection_reason.pool_rank > 40);
    assert.ok(r.selection_reason.score != null);
  }
  assert.equal(stats.excluded.below_cut, 45);
});

test('fewer eligible than 40 → selects all eligible, never pads with below-floor products', () => {
  const pool = [cand(), cand(), cand({ reviewsDisplayed: 3 })];
  const { rows } = selectCompetitors(pool);
  assert.equal(rows.filter((r) => r.selected).length, 2);
});

test('duplicate ASINs and garbage input are ignored; empty input is safe', () => {
  const a = cand();
  const { rows } = selectCompetitors([a, { ...a }, { asin: 'x' }, null].filter(Boolean));
  assert.equal(rows.length, 1);
  assert.deepEqual(selectCompetitors([]).rows, []);
});

test('reason carries cohort metrics and the searches that surfaced it', () => {
  const a = cand({
    searchQueries: ['kw', 'best kw'],
    serpPositions: { kw: 3, 'best kw': 1 },
    cohort: { cohort: 'established', ageMonths: 61.23, reviewVelocity: 812.44, bsrClimbPct: -2.1 },
  });
  const { rows } = selectCompetitors([a]);
  const reason = rows[0].selection_reason;
  assert.deepEqual(reason.cohort, { cohort: 'established', age_months: 61.2, review_velocity: 812.4, bsr_climb_pct: -2.1 });
  assert.deepEqual(reason.search.queries, ['kw', 'best kw']);
  assert.match(reason.summary, /surfaced by 2 searches/);
});

// ── review round 1 (2026-09-26) ─────────────────────────────────────────
const { usableDisplayedReviews } = require('../utils/competitor-selection');

test('usableDisplayedReviews: rating×10 corruption and Keepa-dwarfed counts are unusable', () => {
  assert.deepEqual(usableDisplayedReviews({ displayed: 46, ratings: [4.6] }), { count: null, corrupt: true });
  assert.deepEqual(usableDisplayedReviews({ displayed: 47, ratings: [null, 4.6] }), { count: null, corrupt: true }, '±1 of either rating');
  assert.deepEqual(usableDisplayedReviews({ displayed: 30, ratings: [4.2], keepaOwn: 400 }), { count: null, corrupt: true }, '<50 and Keepa ≥10×');
  assert.deepEqual(usableDisplayedReviews({ displayed: 30, ratings: [4.2], keepaOwn: 200 }), { count: 30, corrupt: false });
  assert.deepEqual(usableDisplayedReviews({ displayed: 470, ratings: [4.7] }), { count: 470, corrupt: false }, 'only ≤50 can be a rating');
  assert.deepEqual(usableDisplayedReviews({ displayed: null, ratings: [4.7] }), { count: null, corrupt: false });
});

test('DRY-RUN FIXTURE: corrupted page counts (rating×10) do not push Liquid I.V.-class leaders out, nor fake shared reviews', () => {
  const pool = [];
  // The corruption as it sits in products.rating_count today: "46" / "47".
  const liv = cand({ brand: 'Liquid I.V.', title: 'Liquid I.V. Hydration Electrolytes, Lemon Lime, 16 Count', reviewsDisplayed: 46, ratingDisplayed: 4.6, reviewsOwn: 106236, ratingOwn: 4.6, monthlySales: 40000 });
  const lmnt = cand({ brand: 'LMNT', title: 'LMNT Zero Sugar Electrolytes, Citrus Salt, 30 Stick Packs', reviewsDisplayed: 47, ratingDisplayed: 4.7, reviewsOwn: 31000, ratingOwn: 4.7, monthlySales: 30000 });
  // Two unrelated-parent siblings whose corrupted counts would match "47|4.7".
  const sibA = cand({ parentAsin: 'B0PARENT09', reviewsDisplayed: 47, ratingDisplayed: 4.7, reviewsOwn: 900, ratingOwn: 4.7, monthlySales: 2000 });
  const sibB = cand({ parentAsin: 'B0PARENT09', reviewsDisplayed: 47, ratingDisplayed: 4.7, reviewsOwn: 1200, ratingOwn: 4.6, monthlySales: 2500 });
  pool.push(liv, lmnt, sibA, sibB);
  for (let i = 0; i < 60; i++) pool.push(cand({ brand: `Brand${i}`, title: `Brand${i} Electrolyte Powder, Mixed Berry, 30 Servings`, reviewsDisplayed: 500 + i * 30, ratingDisplayed: 4.4, monthlySales: 1000 + i * 40 }));
  const { rows, stats } = selectCompetitors(pool);
  const r = byAsin(rows);
  assert.equal(stats.selected, 40);
  for (const x of [liv, lmnt]) {
    assert.equal(r[x.asin].selected, true, x.brand);
    assert.ok(r[x.asin].selection_rank <= 3, `${x.brand} rank ${r[x.asin].selection_rank}`);
    assert.equal(r[x.asin].selection_reason.inputs.reviews_displayed_corrupt, true);
    assert.equal(r[x.asin].selection_reason.inputs.reviews_scored, x.reviewsOwn);
    assert.equal(r[x.asin].selection_reason.excluded, null);
  }
  assert.deepEqual(r[sibB.asin].shared_reviews_with, [], 'corrupt counts never match as shared reviews');
  assert.equal(r[sibB.asin].selected, true);
});

test('product-line grouping folds one brand\'s flavors / tubs / variety packs across different parents', () => {
  const liv = (title, sales, parent) => cand({ brand: 'Liquid I.V.', title, monthlySales: sales, parentAsin: parent });
  const pool = [
    liv('Liquid I.V. Hydration Electrolytes, Lemon Lime, 16 Count', 40000, 'B0PAR00001'),
    liv('Liquid I.V. Electrolyte Powder, Signature Variety Pack, 16 Count', 20000, 'B0PAR00002'),
    liv('Liquid I.V. Hydration Electrolytes Tub, Lemon Lime, 30 Servings', 5000, 'B0PAR00003'),
    liv('Liquid I.V. Sugar Free Hydration Electrolytes, Lemon Lime, 14 Count', 40000, 'B0PAR00004'),
    liv('Liquid I.V. Sugar Free Electrolyte Packets, Classic Variety Pack, 16 Count', 40000, 'B0PAR00005'),
    liv('Liquid I.V. Hydration + Immune Electrolytes, Tangerine, 14 Count', 10000, 'B0PAR00006'),
  ];
  for (let i = 0; i < 10; i++) pool.push(cand({ brand: `Other${i}`, title: `Other${i} Electrolyte Powder, Lemon, 30 Servings` }));
  const { rows } = selectCompetitors(pool);
  const livRows = rows.filter((x) => pool.slice(0, 6).some((p) => p.asin === x.asin));
  const selectedLiv = livRows.filter((x) => x.selected);
  assert.equal(selectedLiv.length, 3, 'base line, sugar-free line, immune line');
  assert.equal(livRows.filter((x) => x.selection_reason.excluded === 'variation_of').length, 3);
});

test('brand cap: a brand holds at most 3 selected families even when its lines differ', () => {
  const lines = ['Sleep', 'Energy', 'Immune', 'Kids', 'Protein'];
  const pool = lines.map((l, i) => cand({ brand: 'MegaBrand', title: `MegaBrand ${l} Gummies, 60 Count`, monthlySales: 50000 - i }));
  for (let i = 0; i < 10; i++) pool.push(cand({ brand: `Small${i}` }));
  const { rows } = selectCompetitors(pool);
  const mega = rows.filter((x) => pool.slice(0, 5).some((p) => p.asin === x.asin));
  assert.equal(mega.filter((x) => x.selected).length, 3);
  assert.equal(mega.filter((x) => x.selection_reason.excluded === 'brand_cap').length, 2);
  assert.match(mega.find((x) => x.selection_reason.excluded === 'brand_cap').selection_reason.summary, /Brand already holds 3/);
});
