/**
 * utils/competitor-selection.js — pick the 40 established competitors a
 * category's research is built on (pure, unit-tested in
 * test/competitor-selection.test.js; the DB wrapper is select-competitors.js).
 *
 * THE BRIEF (owner, 2026-09-26): "Select 40 relevant, established
 * competitors. Forty is enough. Find them through several relevant searches
 * and avoid counting flavors and pack sizes as separate competitors. Include
 * market leaders and other products with a meaningful review base, high
 * ratings, and strong estimated sales. Explain why each competitor was
 * selected, checking whether its apparent success depends on a temporary
 * promotion or reviews shared across variations."
 *
 * HOW, step by step (every step leaves a trace in `selection_reason`):
 *
 *  0. CLEAN REVIEW COUNTS. Until 2026-09-26 keepa-phase2.js wrote the star
 *     rating ×10 over P1's review count (dovive_research.review_count, and
 *     from there products.rating_count — 756 product rows). A page count that
 *     equals rating×10 (±1, ≤50) or is <50 while Keepa's own count is ≥10×
 *     larger is treated as unusable and Keepa's count is used instead
 *     (usableDisplayedReviews).
 *  1. FAMILIES. Flavors and pack sizes are Amazon "variations" of one parent
 *     ASIN. ASINs are grouped by Keepa parentAsin plus the variation lists
 *     Keepa returns (union-find, so A↔parent↔B and A-lists-B both join), AND
 *     by product line — same brand, same title once flavor/count/size/pack
 *     words are removed (utils/product-line.js) — because sellers often list
 *     flavors and tubs under different parents. One family = one competitor;
 *     the others are kept in `variants[]`. A brand holds at most
 *     MAX_FAMILIES_PER_BRAND of the selected slots (backstop).
 *  2. SHARED REVIEWS. Amazon shows the family's pooled review count on every
 *     child. Siblings reporting the SAME review count AND rating (either the
 *     count shown on the page at P1, or Keepa's own per-ASIN count) are marked
 *     `shared_reviews_with`. A listing whose page count is ≥3× Keepa's own
 *     count for it is marked `likely_family_pooled`. Either way, the score
 *     uses the ASIN's OWN count when Keepa has one that is not itself shared.
 *  3. PROMOTIONS. `promo_flag` when (a) the current sales rank is ≥40% better
 *     than its 90-day average WHILE a one-time coupon or a lightning/Prime
 *     deal is live, or (b) the current price is ≥20% under its 90-day
 *     average. A flagged product's sales component is discounted (×0.75) so a
 *     temporary spike cannot buy it a place. Subscribe & Save is a standing
 *     programme, recorded but never treated as a promotion.
 *  4. ELIGIBILITY. Sponsored-only listings are never candidates. A family
 *     needs ≥ REVIEW_FLOOR reviews ("a meaningful review base") and, when a
 *     rating is known, ≥ MIN_RATING stars.
 *  5. SCORE (0–100) = 50% sales + 30% reviews + 20% rating. Sales and reviews
 *     are log-scaled against the best in the pool (a 10× sales gap is a real
 *     difference, a 200k-vs-100k review gap is not); rating maps 3.5★→0,
 *     5★→1, unknown → 0.5.
 *  6. CUT. The top TARGET_COUNT (40) by score are `selected`, ranked. Every
 *     other ASIN is `selected=false` but keeps its full reason.
 *
 * Thresholds are env-tunable (same pattern as utils/cohort.js).
 */

function numEnv(key, fallback) {
  const v = process.env[key];
  const n = v !== undefined ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const SELECTION = {
  TARGET_COUNT: numEnv('SELECTION_TARGET_COUNT', 40),
  REVIEW_FLOOR: numEnv('SELECTION_REVIEW_FLOOR', 50), // "meaningful review base"
  MIN_RATING: numEnv('SELECTION_MIN_RATING', 3.5), // only enforced when a rating is known
  WEIGHT_SALES: 0.5,
  WEIGHT_REVIEWS: 0.3,
  WEIGHT_RATING: 0.2,
  RATING_FLOOR_FOR_SCORE: 3.5, // 3.5★ scores 0 on the rating component, 5★ scores 1
  PROMO_BSR_IMPROVEMENT: numEnv('SELECTION_PROMO_BSR_IMPROVEMENT', 0.4), // rank ≥40% better than 90d avg…
  PROMO_PRICE_DROP: numEnv('SELECTION_PROMO_PRICE_DROP', 0.2), // …or price ≥20% under 90d avg
  PROMO_SALES_DISCOUNT: numEnv('SELECTION_PROMO_SALES_DISCOUNT', 0.75),
  POOLED_REVIEW_RATIO: 3, // page count ≥3× Keepa's own count ⇒ likely pooled
  POOLED_REVIEW_MIN_GAP: 100,
  MARKET_LEADER_COUNT: 5, // top-N eligible families by sales are tagged market leaders
  MAX_FAMILIES_PER_BRAND: numEnv('SELECTION_MAX_FAMILIES_PER_BRAND', 3),
  CORRUPT_COUNT_MAX: 50, // rating×10 corruption can only produce 10–50
  CORRUPT_KEEPA_RATIO: 10,
};

const REASON_VERSION = 2;

const { productLineKeys, normBrand } = require('./product-line');

/**
 * P1's review count, or null when it is the rating×10 corruption (see step 0).
 * @returns {{ count: number|null, corrupt: boolean }}
 */
function usableDisplayedReviews({ displayed, ratings = [], keepaOwn = null }, T = SELECTION) {
  const d = typeof displayed === 'number' && displayed > 0 ? displayed : (Number(displayed) > 0 ? Number(displayed) : null);
  if (d == null) return { count: null, corrupt: false };
  const looksLikeRating = d <= T.CORRUPT_COUNT_MAX && ratings.some((r) => {
    const n = Number(r);
    if (!(n > 0)) return false;
    const x10 = n <= 5 ? n * 10 : n; // accept 4.7 or Keepa's raw 47
    return Math.abs(d - Math.round(x10)) <= 1;
  });
  const dwarfedByKeepa = d < T.CORRUPT_COUNT_MAX && Number(keepaOwn) >= T.CORRUPT_KEEPA_RATIO * d;
  return looksLikeRating || dwarfedByKeepa ? { count: null, corrupt: true } : { count: d, corrupt: false };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const posNum = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// ── union-find over ASINs ────────────────────────────────────────────────
function makeDsu() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
    return r;
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb < ra ? ra : rb, rb < ra ? rb : ra); };
  return { find, union };
}

function normalise(c, T = SELECTION) {
  const searchQueries = Array.isArray(c.searchQueries) ? c.searchQueries : [];
  const sponsoredIn = Array.isArray(c.sponsoredIn) ? c.sponsoredIn : [];
  return {
    ...c,
    asin: String(c.asin || '').toUpperCase(),
    parentAsin: c.parentAsin ? String(c.parentAsin).toUpperCase() : null,
    variationAsins: Array.isArray(c.variationAsins) ? c.variationAsins.map((a) => String(a).toUpperCase()) : [],
    reviewsDisplayedRaw: posNum(c.reviewsDisplayed),
    ...(() => {
      const u = usableDisplayedReviews({ displayed: posNum(c.reviewsDisplayed), ratings: [c.ratingDisplayed, c.ratingOwn], keepaOwn: posNum(c.reviewsOwn) }, T);
      return { reviewsDisplayed: u.count, reviewsDisplayedCorrupt: u.corrupt };
    })(),
    reviewsOwn: posNum(c.reviewsOwn),
    ratingDisplayed: posNum(c.ratingDisplayed),
    ratingOwn: posNum(c.ratingOwn),
    monthlySales: posNum(c.monthlySales),
    bsrCurrent: posNum(c.bsrCurrent),
    bsr90Avg: posNum(c.bsr90Avg),
    priceCurrent: posNum(c.priceCurrent),
    price90Avg: posNum(c.price90Avg),
    searchQueries,
    serpPositions: c.serpPositions && typeof c.serpPositions === 'object' ? c.serpPositions : {},
    sponsoredIn,
    // Sponsored-only: never surfaced organically. With P1 selection signals
    // that is "no organic query"; for legacy rows (no signals) it is the
    // stored is_sponsored flag.
    sponsoredOnly: searchQueries.length === 0 && (!!c.isSponsored || sponsoredIn.length > 0),
  };
}

/** Promotion check for one ASIN. */
function promoCheck(c, T = SELECTION) {
  const bsrVs90 = c.bsrCurrent && c.bsr90Avg ? (c.bsr90Avg - c.bsrCurrent) / c.bsr90Avg : null; // + = better now
  const priceVs90 = c.priceCurrent && c.price90Avg ? (c.price90Avg - c.priceCurrent) / c.price90Avg : null; // + = cheaper now
  const bsrSpike = bsrVs90 != null && bsrVs90 >= T.PROMO_BSR_IMPROVEMENT;
  const promoLive = !!c.couponActive || !!c.dealActive;
  const priceDrop = priceVs90 != null && priceVs90 >= T.PROMO_PRICE_DROP;
  const flag = (bsrSpike && promoLive) || priceDrop;
  const why = [];
  if (bsrSpike && promoLive) why.push(`sales rank ${Math.round(bsrVs90 * 100)}% better than its 90-day average while a ${c.couponActive ? 'coupon' : 'deal'} is live`);
  if (priceDrop) why.push(`price ${Math.round(priceVs90 * 100)}% under its 90-day average`);
  return {
    flag,
    why,
    bsr_vs_90d_pct: bsrVs90 == null ? null : Math.round(bsrVs90 * 100),
    price_vs_90d_pct: priceVs90 == null ? null : Math.round(priceVs90 * 100),
    coupon_active: !!c.couponActive,
    deal_active: !!c.dealActive,
    sns_discount_pct: c.snsDiscountPct ?? null,
  };
}

/** Sibling ASINs with identical (count, rating) on the given fields. */
function sharedGroups(members, countKey, ratingKey) {
  const byKey = new Map();
  for (const m of members) {
    const n = m[countKey];
    const r = m[ratingKey];
    if (!n || r == null) continue;
    const k = `${n}|${r}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(m.asin);
  }
  const out = new Map();
  for (const asins of byKey.values()) {
    if (asins.length < 2) continue;
    for (const a of asins) out.set(a, asins.filter((x) => x !== a));
  }
  return out;
}

/** Sales of a family: identical non-zero figures on every sibling are one family-level number, otherwise children add up. */
function familySales(members) {
  const vals = members.map((m) => m.monthlySales).filter((v) => v > 0);
  if (!vals.length) return null;
  if (vals.length > 1 && vals.every((v) => v === vals[0])) return vals[0];
  return vals.reduce((a, b) => a + b, 0);
}

function logShare(v, max) {
  if (!v || !max) return 0;
  return Math.log10(1 + v) / Math.log10(1 + max);
}

function summarise(r, T) {
  const bits = [];
  const i = r.inputs;
  if (r.selected) bits.push(`#${r.rank} of ${r.of}`);
  else if (r.excluded === 'below_cut') bits.push(`Ranked ${r.pool_rank}, outside the top ${T.TARGET_COUNT}`);
  else if (r.excluded === 'variation_of') bits.push(`A variation of ${r.family.representative} — counted once, under that listing`);
  else if (r.excluded === 'sponsored_only') bits.push('Only ever appeared as a sponsored ad — never a candidate');
  else if (r.excluded === 'below_review_floor') bits.push(`Under the ${T.REVIEW_FLOOR}-review floor`);
  else if (r.excluded === 'low_rating') bits.push(`Rated under ${T.MIN_RATING}★`);
  else if (r.excluded === 'brand_cap') bits.push(`Brand already holds ${T.MAX_FAMILIES_PER_BRAND} selected product lines`);
  const facts = [];
  if (i.family_monthly_sales) facts.push(`~${i.family_monthly_sales.toLocaleString('en-US')} sales/mo`);
  if (i.reviews_scored) facts.push(`${i.reviews_scored.toLocaleString('en-US')} reviews${i.review_basis === 'own_asin' ? ' (its own)' : ''}`);
  if (i.rating) facts.push(`${i.rating}★`);
  if (facts.length) bits.push(facts.join(', '));
  if (r.search.queries.length) bits.push(`surfaced by ${r.search.queries.length} search${r.search.queries.length === 1 ? '' : 'es'}`);
  if (r.flags.market_leader) bits.push('market leader by sales');
  if (r.cohort && r.cohort.cohort && r.cohort.cohort !== 'context') bits.push(r.cohort.cohort);
  if (r.family.variants.length) bits.push(`${r.family.variants.length} variation${r.family.variants.length === 1 ? '' : 's'} folded in`);
  if (r.flags.promo.flag) bits.push(`WARNING promo-driven? ${r.flags.promo.why.join('; ')}`);
  if (r.flags.shared_reviews.with.length) bits.push(`WARNING reviews shared with ${r.flags.shared_reviews.with.join(', ')}`);
  else if (r.flags.shared_reviews.likely_family_pooled) bits.push(`WARNING page shows ${i.reviews_displayed?.toLocaleString('en-US')} reviews pooled across variations; scored on its own ${i.reviews_own?.toLocaleString('en-US')}`);
  return bits.join(' · ');
}

/**
 * @param {object[]} rawCandidates  see normalise() for the accepted fields
 * @param {object} [thresholds]
 * @returns {{ rows: object[], stats: object }}
 *   rows: one per input ASIN — { asin, selected, selection_rank, selection_reason,
 *          promo_flag, shared_reviews_with, parent_asin, variations_count }
 */
function selectCompetitors(rawCandidates, thresholds = SELECTION) {
  const T = { ...SELECTION, ...thresholds };
  const seen = new Set();
  const cands = [];
  (rawCandidates || []).forEach((raw, idx) => {
    const c = normalise(raw, T);
    if (!/^[A-Z0-9]{10}$/.test(c.asin) || seen.has(c.asin)) return;
    seen.add(c.asin);
    c._order = idx;
    cands.push(c);
  });

  // 1. families — Keepa variation links, then same-brand product line
  const dsu = makeDsu();
  for (const c of cands) {
    dsu.find(c.asin);
    if (c.parentAsin) dsu.union(c.asin, c.parentAsin);
    for (const v of c.variationAsins) dsu.union(c.asin, v);
  }
  const lineKeys = productLineKeys(cands.map((c) => ({ asin: c.asin, brand: c.brand, title: c.title })));
  const lineFirst = new Map();
  for (const c of cands) {
    const key = lineKeys.get(c.asin);
    c.lineKey = key;
    if (!key) continue;
    if (lineFirst.has(key)) dsu.union(lineFirst.get(key), c.asin);
    else lineFirst.set(key, c.asin);
  }
  const families = new Map();
  for (const c of cands) {
    const k = dsu.find(c.asin);
    if (!families.has(k)) families.set(k, []);
    families.get(k).push(c);
  }

  // 2 + 3. per-ASIN review basis and promotion check
  for (const members of families.values()) {
    const sharedShown = sharedGroups(members, 'reviewsDisplayed', 'ratingDisplayed');
    const sharedOwn = sharedGroups(members, 'reviewsOwn', 'ratingOwn');
    const hasVariations = members.length > 1 || members.some((m) => m.variationAsins.length > 1);
    for (const m of members) {
      const withShown = sharedShown.get(m.asin) || [];
      const withOwn = sharedOwn.get(m.asin) || [];
      m.sharedWith = [...new Set([...withShown, ...withOwn])].sort();
      m.likelyPooled = hasVariations && m.reviewsOwn != null && m.reviewsDisplayed != null &&
        m.reviewsDisplayed >= T.POOLED_REVIEW_RATIO * m.reviewsOwn &&
        m.reviewsDisplayed - m.reviewsOwn >= T.POOLED_REVIEW_MIN_GAP;
      if ((withShown.length || m.likelyPooled) && m.reviewsOwn != null && !withOwn.length) {
        m.reviewsScored = m.reviewsOwn; m.reviewBasis = 'own_asin';
      } else {
        m.reviewsScored = m.reviewsDisplayed ?? m.reviewsOwn ?? 0;
        m.reviewBasis = (m.sharedWith.length || m.likelyPooled) ? 'family_shared' : (m.reviewsDisplayed != null ? 'amazon_page' : (m.reviewsOwn != null ? 'keepa' : 'none'));
      }
      m.rating = m.ratingDisplayed ?? m.ratingOwn ?? null;
      m.promo = promoCheck(m, T);
      m.ineligible = m.sponsoredOnly ? 'sponsored_only'
        : m.reviewsScored < T.REVIEW_FLOOR ? 'below_review_floor'
        : (m.rating != null && m.rating < T.MIN_RATING) ? 'low_rating'
        : null;
    }
  }

  // collapse: one representative per family, eligible members first
  const byRepPref = (a, b) =>
    (b.monthlySales || 0) - (a.monthlySales || 0) ||
    (b.reviewsScored || 0) - (a.reviewsScored || 0) ||
    (a.bsrCurrent || Infinity) - (b.bsrCurrent || Infinity) ||
    a._order - b._order;
  const reps = [];
  for (const members of families.values()) {
    const eligible = members.filter((m) => !m.ineligible).sort(byRepPref);
    const rep = eligible[0] || [...members].sort((a, b) => (a.sponsoredOnly - b.sponsoredOnly) || byRepPref(a, b))[0];
    const organicMembers = members.filter((m) => !m.sponsoredOnly);
    rep.family = members;
    rep.familySales = familySales(organicMembers.length ? organicMembers : members);
    rep.familyQueries = [...new Set(members.flatMap((m) => m.searchQueries))];
    reps.push(rep);
  }

  // 5. score eligible representatives
  const eligibleReps = reps.filter((r) => !r.ineligible);
  const maxSales = Math.max(0, ...eligibleReps.map((r) => r.familySales || 0));
  const maxReviews = Math.max(0, ...eligibleReps.map((r) => r.reviewsScored || 0));
  for (const r of eligibleReps) {
    let sales = logShare(r.familySales, maxSales);
    const promoDiscount = r.promo.flag ? T.PROMO_SALES_DISCOUNT : 1;
    sales *= promoDiscount;
    const reviews = logShare(r.reviewsScored, maxReviews);
    const rating = r.rating == null ? 0.5 : Math.min(1, Math.max(0, (r.rating - T.RATING_FLOOR_FOR_SCORE) / (5 - T.RATING_FLOOR_FOR_SCORE)));
    r.components = { sales: round(sales, 3), reviews: round(reviews, 3), rating: round(rating, 3), promo_discount: promoDiscount };
    r.score = round(100 * (T.WEIGHT_SALES * sales + T.WEIGHT_REVIEWS * reviews + T.WEIGHT_RATING * rating), 1);
  }
  eligibleReps.sort((a, b) => b.score - a.score || (b.familySales || 0) - (a.familySales || 0) || (b.reviewsScored || 0) - (a.reviewsScored || 0) || a.asin.localeCompare(b.asin));
  eligibleReps.forEach((r, i) => { r.poolRank = i + 1; });
  const leaders = new Set(
    [...eligibleReps].filter((r) => r.familySales).sort((a, b) => b.familySales - a.familySales).slice(0, T.MARKET_LEADER_COUNT).map((r) => r.asin),
  );
  // Cut to TARGET_COUNT, at most MAX_FAMILIES_PER_BRAND per brand (backstop
  // for lines the title grouping could not recognise as the same product).
  const selected = [];
  const perBrand = new Map();
  for (const r of eligibleReps) {
    if (selected.length >= T.TARGET_COUNT) break;
    const b = normBrand(r.brand);
    if (b && (perBrand.get(b) || 0) >= T.MAX_FAMILIES_PER_BRAND) { r.brandCapped = true; continue; }
    if (b) perBrand.set(b, (perBrand.get(b) || 0) + 1);
    selected.push(r);
  }
  selected.forEach((r, i) => { r.rank = i + 1; });
  const selectedSet = new Set(selected.map((r) => r.asin));

  // 6. one output row per input ASIN
  const rows = [];
  for (const rep of reps) {
    const variants = rep.family.filter((m) => m.asin !== rep.asin).map((m) => m.asin).sort();
    const variationsTotal = Math.max(rep.family.length, ...rep.family.map((m) => m.variationAsins.length));
    for (const m of rep.family) {
      const isRep = m === rep;
      const excluded = isRep
        ? (rep.ineligible || (selectedSet.has(rep.asin) ? null : (rep.brandCapped ? 'brand_cap' : 'below_cut')))
        : 'variation_of';
      const reason = {
        version: REASON_VERSION,
        brand: m.brand || null,
        selected: isRep && selectedSet.has(rep.asin),
        rank: isRep && selectedSet.has(rep.asin) ? rep.rank : null,
        of: selected.length,
        pool_rank: isRep ? rep.poolRank ?? null : null,
        excluded,
        score: isRep ? rep.score ?? null : null,
        components: isRep ? rep.components ?? null : null,
        inputs: {
          monthly_sales: m.monthlySales,
          family_monthly_sales: isRep ? rep.familySales : null,
          reviews_displayed: m.reviewsDisplayed,
          reviews_displayed_raw: m.reviewsDisplayedRaw,
          reviews_displayed_corrupt: m.reviewsDisplayedCorrupt,
          reviews_own: m.reviewsOwn,
          reviews_scored: m.reviewsScored,
          review_basis: m.reviewBasis,
          rating: m.rating,
          bsr_current: m.bsrCurrent,
          bsr_90d_avg: m.bsr90Avg,
          price_current: m.priceCurrent,
          price_90d_avg: m.price90Avg,
        },
        cohort: m.cohort
          ? {
              cohort: m.cohort.cohort ?? null,
              age_months: round(m.cohort.ageMonths, 1),
              review_velocity: round(m.cohort.reviewVelocity, 1),
              bsr_climb_pct: round(m.cohort.bsrClimbPct, 1),
            }
          : null,
        flags: {
          promo: m.promo,
          shared_reviews: { with: m.sharedWith, likely_family_pooled: !!m.likelyPooled },
          market_leader: isRep && leaders.has(rep.asin),
        },
        family: { parent_asin: m.parentAsin, product_line: m.lineKey || null, representative: rep.asin, variants: isRep ? variants : [], variations_total: variationsTotal },
        search: { queries: isRep ? rep.familyQueries : m.searchQueries, serp_positions: m.serpPositions, sponsored_in: m.sponsoredIn },
        thresholds: { target: T.TARGET_COUNT, review_floor: T.REVIEW_FLOOR, min_rating: T.MIN_RATING },
      };
      reason.summary = summarise(reason, T);
      rows.push({
        asin: m.asin,
        selected: reason.selected,
        selection_rank: reason.rank,
        selection_reason: reason,
        promo_flag: !!m.promo.flag,
        shared_reviews_with: m.sharedWith,
        parent_asin: m.parentAsin,
        variations_count: variationsTotal > 1 ? variationsTotal : null,
      });
    }
  }
  rows.sort((a, b) => (a.selection_rank ?? Infinity) - (b.selection_rank ?? Infinity) || a.asin.localeCompare(b.asin));

  const excludedCounts = {};
  for (const r of rows) {
    const k = r.selection_reason.excluded;
    if (k) excludedCounts[k] = (excludedCounts[k] || 0) + 1;
  }
  return {
    rows,
    stats: {
      candidates: cands.length,
      families: families.size,
      eligible: eligibleReps.length,
      selected: selected.length,
      promo_flagged_selected: selected.filter((r) => r.promo.flag).length,
      shared_reviews_selected: selected.filter((r) => r.sharedWith.length || r.likelyPooled).length,
      excluded: excludedCounts,
    },
  };
}

module.exports = { selectCompetitors, promoCheck, familySales, usableDisplayedReviews, SELECTION, REASON_VERSION };
