/**
 * utils/review-synthesis.js — pure core of P3b review synthesis.
 *
 * No I/O in this file (no Supabase, no fetch). Everything here is unit-tested
 * in scout/test/review-synthesis.test.js; the phase script
 * (phase3b-review-synthesis.js) does the fetching, the model calls and the
 * writes, and hands the data through these functions.
 *
 * What it answers (owner spec, 2026-09-26):
 *   - how many reviews were COLLECTED and how many were actually ANALYZED,
 *     from which products and which time periods (buildLedger);
 *   - recurring complaints / unmet needs / praise over ALL collected reviews,
 *     not a 5+5 or 60+60 sample (buildBatches → model → mergeThemes);
 *   - per theme: how many reviews and how many DISTINCT products support it
 *     (finalizeThemes);
 *   - product vs taste vs packaging vs shipping vs service issues kept apart
 *     (DOMAIN_LEXICON, issue_domain on every theme);
 *   - conflicting experiences preserved (counter_evidence), and a theme seen on
 *     one product only is scoped 'single_product', never category-wide.
 *
 * TWO DATA FACTS THIS MODULE CORRECTS FOR (measured read-only 2026-09-26):
 *   1. dovive_reviews holds the SAME Amazon review many times. "magnesium
 *      gummies": 1,922 rows → 1,080 unique reviews; "hydration powder":
 *      9,049 rows → 3,760. Two causes: repeat scrape runs append the same
 *      review again under the same ASIN, and Amazon shows one parent-level
 *      review pool on every child variant, so the identical review appears
 *      under several ASINs. Counting rows would double every theme and turn
 *      one variant family into "3 products". prepareReviews() de-duplicates by
 *      Amazon's own review_id and groups ASINs that share reviews into
 *      product FAMILIES; distinct_products counts families.
 *   2. Bright Data rows (every current row) carry title / review date /
 *      verified flag only inside raw_json.raw (review_header,
 *      review_posted_date, is_verified); the columns are null/false because
 *      bright-data-amazon.js normaliseReview() read the wrong field names
 *      (fixed in the same change). normalizeReview() reads the raw fallbacks
 *      so existing rows get correct dates/verified shares without a backfill.
 *
 * COST (estimated, NOT run — see estimateSynthesisCost and the phase header):
 *   per 2,000 unique reviews with text = 20 batches of 100,
 *   ≈ 185k prompt tokens (measured prompt size: ≈ 92 tokens/review) +
 *   ≈ 50k completion tokens (2,500/batch assumed, generous) + one label-merge call:
 *     anthropic/claude-sonnet-5 (ANALYSIS_MODEL default): ≈ $0.90
 *     google/gemini-3.7-flash  (CHEAP_MODE default):      ≈ $0.35
 *   Unit prices from utils/ai-usage.js PRICING (OpenRouter, 2026-09-01).
 */

'use strict';

const PROMPT_VERSION = 'p3b-v1';

const ISSUE_DOMAINS = [
  'product_efficacy',
  'taste_texture',
  'packaging',
  'shipping_condition',
  'seller_service',
  'price_value',
  'other',
];

const POLARITIES = ['complaint', 'unmet_need', 'praise'];

// ─── Domain lexicon ─────────────────────────────────────────────────────────
// Transparent, extendable. Deliberately category-agnostic: no ingredient names,
// no product forms beyond generic packaging words. A sentence may hit several
// domains ("arrived melted and the seller refused a refund" → shipping +
// seller). Add a regex to a row to extend it; add a row to add a domain (and
// add the domain to ISSUE_DOMAINS).
//
// Domain semantics:
//   product_efficacy   — does it work, side effects, dose/potency, results
//   taste_texture      — flavour, sweetness, smell, texture, mixing/dissolving
//   packaging          — container, lid, seal design, scoop, label & label claims
//   shipping_condition — condition on ARRIVAL: melted, stuck together, crushed,
//                        tampered/opened, expired, late / never arrived
//   seller_service     — seller, returns/refunds, support, subscriptions,
//                        counterfeit / wrong item
//   price_value        — price, value for money, cost per serving
const DOMAIN_LEXICON = [
  {
    domain: 'product_efficacy',
    patterns: [
      /\bwork(s|ed|ing)?\b/, /\beffective(ness)?\b/, /\bineffective\b/, /\bresults?\b/,
      /\bnotic(e|ed|eable)\b/, /\bdifference\b/, /\bhelp(s|ed|ful|ing)?\b/,
      /\bside[- ]effects?\b/, /\bstomach\b/, /\bdiarrh?ea\b/, /\bnause(a|ous)\b/,
      /\bbloat(ed|ing)?\b/, /\bheadaches?\b/, /\blaxative\b/, /\bdos(e|es|age|ing)\b/,
      /\bpoten(t|cy)\b/, /\babsor(b|bed|ption)\b/, /\bsleep(ing)?\b/, /\benergy\b/,
      /\bcramps?\b/, /\brelie(f|ve|ved)\b/, /\bfeel (better|calmer|great|a difference|nothing|any)\b/,
      /\ballerg(y|ic|ies)\b/, /\breaction\b/, /\bsymptoms?\b/,
    ],
  },
  {
    domain: 'taste_texture',
    patterns: [
      /\btast(e|es|ed|ing|y|eless)\b/, /\bflavou?r(s|ed|ful|less)?\b/, /\baftertaste\b/,
      /\btexture\b/, /\bchalky\b/, /\bgrit(ty)?\b/, /\bsandy\b/, /\bchew(y|ing|able)?\b/,
      /\bbitter(ness)?\b/, /\bsour\b/, /\bsweet(ness|ener|eners)?\b/, /\bsugary\b/,
      /\bsmell(s|y|ed)?\b/, /\bodou?r\b/, /\bmetallic\b/, /\bdisgusting\b/, /\bgross\b/,
      /\bnasty\b/, /\byummy\b/, /\bdelicious\b/, /\bmouthfeel\b/, /\bdissolv(e|es|ed|ing)\b/,
      /\bmix(es|ed|ing)? (well|easily|poorly)\b/, /\bclump(s|y|ed|ing)?\b/, /\bsalty\b/,
    ],
  },
  {
    domain: 'packaging',
    patterns: [
      /\bbottles?\b/, /\bjars?\b/, /\blids?\b/, /\bcaps?\b/, /\bcontainers?\b/,
      /\bpouch(es)?\b/, /\bpackets?\b/, /\bsachets?\b/, /\bscoops?\b/, /\bpackag(e|ing)\b/,
      /\blabel(s|ed|ing)?\b/, /\bdesiccant\b/, /\bchild[- ]?(proof|resistant)\b/,
      /\breseal(able)?\b/, /\bzip(per)?\b/, /\bplastic\b/, /\bmislead(ing)?\b/,
      /\bfront of the (bottle|jar|package|box)\b/,
    ],
  },
  {
    domain: 'shipping_condition',
    patterns: [
      /\bmelt(ed|ing|s)?\b/, /\bstuck together\b/, /\bstick(s|ing)? together\b/,
      /\bone (big )?(glob|blob|clump)\b/, /\bcrushed\b/, /\bbroken\b/, /\bdamaged\b/,
      /\bleak(ed|ing|s)?\b/, /\bspill(ed|ing)?\b/, /\barriv(e|ed|al)\b/, /\bdeliver(y|ed)\b/,
      /\bshipp(ed|ing)\b/, /\bexpir(ed|es|ation)\b/, /\b(seal|safety seal)\b.*\b(broken|open|opened|removed|missing|torn)\b/,
      /\b(opened|tampered|used) (before|already)\b/, /\bpreviously opened\b/, /\bnever (arrived|came|received)\b/,
      /\blate\b/,
    ],
  },
  {
    domain: 'seller_service',
    patterns: [
      /\bseller\b/, /\bcustomer (service|support)\b/, /\brefund(ed|s)?\b/,
      /\breturn(s|ed|able|ing)?\b/, /\breplacement\b/, /\bcontacted\b/, /\bsupport team\b/,
      /\bsubscri(be|bed|ption)\b/, /\bsubscribe (and|&) save\b/, /\bcounterfeit\b/, /\bfake\b/,
      /\bwrong (item|product|flavou?r|size)\b/, /\bdifferent (product|item|box)\b/, /\bscam\b/,
      /\bcompany\b/, /\bmanufacturer\b/, /\bresponded?\b/,
    ],
  },
  {
    domain: 'price_value',
    patterns: [
      /\bprice[ds]?\b/, /\bpricey\b/, /\bexpensive\b/, /\boverpriced\b/, /\bcheap(er|est)?\b/,
      /\bvalue\b/, /\bworth\b/, /\bcost(s|ly)?\b/, /\$\s?\d/, /\bfor the money\b/, /\bdeal\b/,
      /\bper serving\b.*\b(cost|price|\$)/, /\bafford(able)?\b/,
    ],
  },
];

// Polarity cues for the deterministic pre-pass. The model pass decides theme
// polarity; these only feed the zero-cost domain breakdown.
const NEGATIVE_CUES = [
  /\bnot\b/, /\bno\b/, /\bnever\b/, /\bdoesn'?t\b/, /\bdidn'?t\b/, /\bwon'?t\b/, /\bcan'?t\b/,
  /\bterrible\b/, /\bawful\b/, /\bhorrible\b/, /\bbad\b/, /\bworst\b/, /\bpoor(ly)?\b/,
  /\bgross\b/, /\bdisgusting\b/, /\bnasty\b/, /\bbroken\b/, /\bmelted\b/, /\bmislead(ing)?\b/,
  /\bwaste\b/, /\bdisappoint(ed|ing|ment)?\b/, /\btoo\b/, /\bunfortunately\b/, /\bhate\b/,
  /\bstuck\b/, /\bleak(ed|ing)?\b/, /\bdamaged\b/, /\bscam\b/, /\bfake\b/, /\bsick\b/,
];
const POSITIVE_CUES = [
  /\bgreat\b/, /\blove[sd]?\b/, /\bgood\b/, /\bdelicious\b/, /\btasty\b/, /\byummy\b/,
  /\bworks?\b/, /\bhelped\b/, /\bamazing\b/, /\bexcellent\b/, /\bperfect(ly)?\b/,
  /\brecommend\b/, /\bbest\b/, /\bnice\b/, /\bpleasant\b/, /\beasy\b/, /\bintact\b/,
  /\bfast (shipping|delivery)\b/, /\bwell packaged\b/, /\bfavorite\b/, /\bhappy\b/,
];

// ─── Normalisation & de-duplication ─────────────────────────────────────────

const MONTH_DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2}), (\d{4})\b/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Parse an Amazon review date from any of the shapes seen in dovive_reviews. Returns 'YYYY-MM-DD' or null. */
function parseReviewDateLoose(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(MONTH_DATE_RE);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00:00 UTC`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const iso = s.match(ISO_DATE_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * Normalise one dovive_reviews row. Accepts either the full row (raw_json
 * object) or the flattened select used by the phase script (rid, rheader,
 * rdate, rverified, rvine, rvariant, date_text).
 *
 * The Amazon review DATE is taken from review_posted_date / review_date only —
 * never from raw_json.date_text for Bright Data rows, which holds the SCRAPE
 * timestamp, not the review date.
 */
function normalizeReview(row) {
  const raw = (row.raw_json && row.raw_json.raw) || {};
  const reviewId = row.rid || raw.review_id || null;
  const title = (row.title || row.rheader || raw.review_header || '').toString().trim() || null;
  const body = (row.body || raw.review_text || '').toString().trim() || null;
  const postedDate = row.rdate || raw.review_posted_date || null;
  const isBrightData = !!(row.rid || raw.review_id);
  const dateTextFallback = isBrightData ? null : (row.date_text || (row.raw_json && row.raw_json.date_text) || null);
  const date = parseReviewDateLoose(row.review_date) || parseReviewDateLoose(postedDate) || parseReviewDateLoose(dateTextFallback);
  const verified = truthy(row.verified_purchase) || truthy(row.rverified) || truthy(raw.is_verified);
  const vine = truthy(row.rvine) || truthy(raw.is_amazon_vine);
  const rating = row.rating == null ? null : Number(row.rating);
  return {
    row_id: row.id,
    // Amazon's review_id when present (every Bright Data row). Otherwise the
    // text: a long body is specific enough to match across ASINs (parent-level
    // review pools); a short one ("Great!") only matches within its own ASIN.
    review_key: reviewId
      ? `rid:${reviewId}`
      : (normText(body).length >= 60
        ? `txt:${rating}|${normText(body)}`
        : `txt:${row.asin}|${rating}|${normText(title)}|${normText(body)}`),
    asin: row.asin,
    rating: Number.isFinite(rating) ? rating : null,
    title,
    body,
    date,
    verified,
    vine,
    helpful: Number(row.helpful_votes || raw.helpful_count || 0) || 0,
    variant: row.rvariant || raw.variant_name || null,
    reviewer_name: row.reviewer_name || null,
  };
}

function normText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Union-find over ASINs. */
function makeUnionFind() {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = a;
    while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a); const rb = find(b);
    if (ra === rb) return;
    // deterministic root: lexicographically smaller ASIN
    if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb);
  };
  return { find, union, keys: () => [...parent.keys()] };
}

/**
 * De-duplicate rows into unique reviews and group ASINs that share reviews
 * into product families.
 *
 * @returns {{ reviews: object[], stats: object, familyOf: Record<string,string>, families: Record<string,string[]> }}
 *   reviews[i].id = smallest dovive_reviews.id among its duplicates (stable),
 *   reviews[i].asins = every ASIN the review was collected under,
 *   reviews[i].family = the family id (smallest ASIN in the family).
 */
function prepareReviews(rows) {
  const byKey = new Map();
  const uf = makeUnionFind();
  let rowsCollected = 0;
  for (const row of rows || []) {
    if (!row || !row.asin) continue;
    rowsCollected++;
    const n = normalizeReview(row);
    uf.find(n.asin);
    const existing = byKey.get(n.review_key);
    if (!existing) {
      byKey.set(n.review_key, { ...n, id: n.row_id, row_ids: [n.row_id], asins: [n.asin] });
      continue;
    }
    existing.row_ids.push(n.row_id);
    if (!existing.asins.includes(n.asin)) {
      existing.asins.push(n.asin);
      uf.union(existing.asins[0], n.asin);
    }
    if (n.row_id != null && (existing.id == null || n.row_id < existing.id)) existing.id = n.row_id;
    // Fill gaps from later duplicates (e.g. an older row missing its title).
    for (const f of ['title', 'body', 'date', 'variant']) if (!existing[f] && n[f]) existing[f] = n[f];
    existing.verified = existing.verified || n.verified;
    existing.vine = existing.vine || n.vine;
    existing.helpful = Math.max(existing.helpful, n.helpful);
  }
  const familyOf = {};
  const families = {};
  for (const asin of uf.keys()) {
    const f = uf.find(asin);
    familyOf[asin] = f;
    (families[f] = families[f] || []).push(asin);
  }
  for (const f of Object.keys(families)) families[f].sort();
  const reviews = [...byKey.values()]
    .map((r) => ({ ...r, asins: [...r.asins].sort(), family: familyOf[r.asins[0]] }))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return {
    reviews,
    familyOf,
    families,
    stats: {
      rows_collected: rowsCollected,
      duplicate_rows_removed: rowsCollected - reviews.length,
      reviews_shared_across_asins: reviews.filter((r) => r.asins.length > 1).length,
    },
  };
}

/** Text used for analysis: title + body. */
function reviewText(r) {
  return [r.title, r.body].filter(Boolean).join('. ').trim();
}

// ─── Cap ────────────────────────────────────────────────────────────────────

/**
 * Keep every review unless there are more than `max`. When capped, take the
 * most recent reviews round-robin across product families so no family is
 * crowded out, and say so in the returned `cap`.
 */
function applyCap(reviews, max) {
  if (!max || reviews.length <= max) return { analyzed: reviews, cap: null };
  const byFamily = new Map();
  for (const r of reviews) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(r);
  }
  for (const list of byFamily.values()) {
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.id ?? 0) - (b.id ?? 0));
  }
  const fams = [...byFamily.keys()].sort();
  const out = [];
  for (let i = 0; out.length < max; i++) {
    let took = false;
    for (const f of fams) {
      const r = byFamily.get(f)[i];
      if (r) { out.push(r); took = true; if (out.length >= max) break; }
    }
    if (!took) break;
  }
  return {
    analyzed: out.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    cap: {
      max,
      reviews_collected: reviews.length,
      reviews_dropped: reviews.length - out.length,
      rule: 'REVIEW_SYNTHESIS_MAX_REVIEWS — most recent reviews kept, round-robin across product families',
    },
  };
}

// ─── Ledger ────────────────────────────────────────────────────────────────

function share(n, d) {
  return d ? Math.round((n / d) * 1000) / 1000 : null;
}

function dateRange(reviews) {
  const dates = reviews.map((r) => r.date).filter(Boolean).sort();
  return { min: dates[0] || null, max: dates[dates.length - 1] || null, undated: reviews.length - dates.length };
}

/**
 * Coverage ledger for a set of unique reviews.
 *
 * @param {object} p
 * @param {object[]} p.collected   unique reviews in scope (after de-dup)
 * @param {object[]} p.analyzed    the subset that entered this synthesis (== collected unless capped)
 * @param {object|null} p.cap      from applyCap
 * @param {object} [p.stats]       from prepareReviews (row / duplicate counts)
 * @param {Record<string,string>} [p.familyOf]
 * @param {boolean} [p.perProduct] include the per-ASIN breakdown (category scope)
 */
function buildLedger({ collected, analyzed, cap = null, stats = null, familyOf = null, perProduct = false }) {
  const n = analyzed.length;
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let rated = 0;
  for (const r of analyzed) {
    const s = Math.round(r.rating);
    if (stars[s] !== undefined) { stars[s]++; ratingSum += r.rating; rated++; }
  }
  const asins = new Set();
  for (const r of analyzed) for (const a of r.asins) asins.add(a);
  const fams = new Set(analyzed.map((r) => r.family));
  const byYear = {};
  for (const r of analyzed) {
    const y = r.date ? r.date.slice(0, 4) : 'undated';
    byYear[y] = (byYear[y] || 0) + 1;
  }
  const withText = analyzed.filter((r) => reviewText(r).length >= 15).length;
  const ledger = {
    rows_collected: stats ? stats.rows_collected : collected.length,
    duplicate_rows_removed: stats ? stats.duplicate_rows_removed : 0,
    reviews_collected: collected.length,
    reviews_analyzed: n,
    reviews_with_text: withText,
    rating_only_reviews: n - withText,
    cap_applied: cap,
    products_with_reviews: asins.size,
    distinct_asins: [...asins].sort(),
    product_families: fams.size,
    reviews_shared_across_asins: analyzed.filter((r) => r.asins.length > 1).length,
    date_range: dateRange(analyzed),
    reviews_by_year: byYear,
    verified_share: share(analyzed.filter((r) => r.verified).length, n),
    vine_share: share(analyzed.filter((r) => r.vine).length, n),
    star_distribution: stars,
    average_rating: rated ? Math.round((ratingSum / rated) * 100) / 100 : null,
  };
  if (perProduct) {
    const per = {};
    for (const r of analyzed) {
      for (const a of r.asins) {
        const e = (per[a] = per[a] || { asin: a, family: familyOf ? familyOf[a] : r.family, reviews: 0, rating_sum: 0, dates: [] });
        e.reviews++;
        e.rating_sum += r.rating || 0;
        if (r.date) e.dates.push(r.date);
      }
    }
    ledger.per_product = Object.values(per)
      .map((e) => {
        e.dates.sort();
        return {
          asin: e.asin,
          family: e.family,
          reviews: e.reviews,
          average_rating: e.reviews ? Math.round((e.rating_sum / e.reviews) * 100) / 100 : null,
          date_range: { min: e.dates[0] || null, max: e.dates[e.dates.length - 1] || null },
        };
      })
      .sort((a, b) => b.reviews - a.reviews || a.asin.localeCompare(b.asin));
  }
  return ledger;
}

// ─── Deterministic pre-pass ─────────────────────────────────────────────────

/** Split review text into sentences (keeps the original characters). */
function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Domains a piece of text touches, per the lexicon (possibly several). */
function assignDomains(text, lexicon = DOMAIN_LEXICON) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const row of lexicon) {
    if (row.patterns.some((re) => re.test(t))) out.push(row.domain);
  }
  return out;
}

function cuePolarity(text) {
  const t = String(text || '').toLowerCase();
  const neg = NEGATIVE_CUES.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  const pos = POSITIVE_CUES.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  return pos > neg ? 1 : neg > pos ? -1 : 0;
}

/**
 * Sentence-level pre-classification of one review.
 * polarity per domain: -1 negative, +1 positive, 0 unclear — the star rating
 * breaks ties (≤2★ → negative, ≥4★ → positive).
 */
function preclassifyReview(review, lexicon = DOMAIN_LEXICON) {
  const sentences = splitSentences(reviewText(review)).map((s) => ({ text: s, domains: assignDomains(s, lexicon), polarity: cuePolarity(s) }));
  const ratingPolarity = review.rating == null ? 0 : review.rating >= 4 ? 1 : review.rating <= 2 ? -1 : 0;
  const domainPolarity = {};
  for (const s of sentences) {
    for (const d of s.domains) {
      domainPolarity[d] = (domainPolarity[d] || 0) + (s.polarity || ratingPolarity);
    }
  }
  const domains = Object.keys(domainPolarity);
  const polarityByDomain = {};
  for (const d of domains) {
    const v = domainPolarity[d];
    polarityByDomain[d] = v > 0 ? 1 : v < 0 ? -1 : ratingPolarity;
  }
  return { review_id: review.id, domains: domains.length ? domains : ['other'], polarity_by_domain: polarityByDomain, sentences };
}

/**
 * Zero-cost domain breakdown over ALL analyzed reviews: for each issue domain,
 * how many reviews raise it negatively / positively, and across how many
 * product families. This alone separates taste from packaging from shipping
 * from service without a single model call, and it shows conflict at domain
 * level (e.g. taste: 38 negative vs 212 positive).
 */
function buildDomainBreakdown(reviews, pre) {
  const byId = new Map(pre.map((p) => [p.review_id, p]));
  const out = {};
  for (const d of ISSUE_DOMAINS) out[d] = { domain: d, reviews_mentioning: 0, negative: { count: 0, families: new Set() }, positive: { count: 0, families: new Set() }, unclear: 0 };
  for (const r of reviews) {
    const p = byId.get(r.id);
    if (!p || !reviewText(r)) continue;
    for (const d of Object.keys(p.polarity_by_domain)) {
      const e = out[d];
      e.reviews_mentioning++;
      const v = p.polarity_by_domain[d];
      if (v < 0) { e.negative.count++; e.negative.families.add(r.family); }
      else if (v > 0) { e.positive.count++; e.positive.families.add(r.family); }
      else e.unclear++;
    }
  }
  return ISSUE_DOMAINS.filter((d) => d !== 'other').map((d) => {
    const e = out[d];
    return {
      domain: d,
      reviews_mentioning: e.reviews_mentioning,
      negative: { count: e.negative.count, products: e.negative.families.size },
      positive: { count: e.positive.count, products: e.positive.families.size },
      unclear: e.unclear,
    };
  });
}

// ─── Batching & prompt ─────────────────────────────────────────────────────

/**
 * Split reviews-with-text into batches, interleaving product families so every
 * batch sees many products (consistent labels, real cross-product signal).
 */
function buildBatches(reviews, size = 100) {
  const withText = reviews.filter((r) => reviewText(r).length >= 15);
  const byFamily = new Map();
  for (const r of withText) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(r);
  }
  const fams = [...byFamily.keys()].sort();
  for (const f of fams) byFamily.get(f).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const ordered = [];
  for (let i = 0; ordered.length < withText.length; i++) {
    for (const f of fams) { const r = byFamily.get(f)[i]; if (r) ordered.push(r); }
  }
  const batches = [];
  for (let i = 0; i < ordered.length; i += size) batches.push(ordered.slice(i, i + size));
  return batches;
}

const REVIEW_CHAR_LIMIT = 600;

function formatReviewForPrompt(r, pre) {
  const text = reviewText(r).replace(/\s+/g, ' ');
  const clipped = text.length > REVIEW_CHAR_LIMIT ? `${text.slice(0, REVIEW_CHAR_LIMIT)}…` : text;
  const domains = pre ? pre.domains.join(',') : '';
  return `${r.id} | P${r.family} | ${r.rating ?? '?'}★ | ${domains} | ${clipped}`;
}

function buildBatchPrompt(batch, { keyword, preById = null } = {}) {
  const lines = batch.map((r) => formatReviewForPrompt(r, preById ? preById.get(r.id) : null)).join('\n');
  return `You are analysing Amazon customer reviews for the "${keyword}" category.
Cluster the reviews below into THEMES. A theme is one specific, recurring experience.

Each input line is: review_id | product | stars | pre-tagged issue domains (a keyword guess, may be wrong) | review text.

Return ONLY JSON, no prose, in exactly this shape:
{"themes":[{"label":"...","domain":"...","polarity":"...","review_ids":[123,456],"opposite_review_ids":[789]}]}

Rules:
- "label": a short, specific, canonical noun phrase describing the experience, the way a product manager would name it ("Gummies arrive melted or stuck together", "Chalky, gritty texture", "Front label overstates the dose per serving", "Helps with sleep"). Never a whole sentence, never a product name or brand.
- "domain": exactly one of product_efficacy, taste_texture, packaging, shipping_condition, seller_service, price_value, other.
  Keep them apart: taste/texture ≠ arrival condition (melted, stuck together, opened seal) ≠ packaging design/label ≠ seller/returns ≠ price.
- "polarity": "complaint" (something went wrong), "unmet_need" (something wanted that the product lacks — a size, a flavour, a form, information), or "praise".
- "review_ids": EVERY review in this batch that expresses the theme — copy the numeric review_id exactly. Do not sample; do not invent ids.
- "opposite_review_ids": reviews in this batch that report the OPPOSITE experience on the same topic (e.g. for "tastes bitter", reviews that say it tastes good). Leave empty if none.
- A review may belong to several themes. Include a theme even if only one review supports it — support is counted downstream.
- Do not merge different problems into one vague theme ("quality issues"). Be specific.

REVIEWS:
${lines}`;
}

/** Tolerant JSON extraction from a model response. */
function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/**
 * Validate one batch's model output against the ids actually in the batch.
 * Unknown ids (hallucinated or from another batch) are dropped and counted.
 */
function parseBatchResponse(text, batchIds) {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.themes)) return { ok: false, themes: [], dropped_ids: 0 };
  const allowed = new Set(batchIds.map(Number));
  let dropped = 0;
  const clean = (ids) => {
    const out = [];
    for (const x of Array.isArray(ids) ? ids : []) {
      const n = Number(String(x).replace(/^R/i, ''));
      if (allowed.has(n)) { if (!out.includes(n)) out.push(n); } else dropped++;
    }
    return out;
  };
  const themes = [];
  for (const t of parsed.themes) {
    if (!t || typeof t.label !== 'string' || !t.label.trim()) continue;
    const review_ids = clean(t.review_ids);
    if (!review_ids.length) continue;
    const domain = ISSUE_DOMAINS.includes(t.domain) ? t.domain : 'other';
    const polarity = POLARITIES.includes(t.polarity) ? t.polarity : 'complaint';
    const opposite = clean(t.opposite_review_ids).filter((id) => !review_ids.includes(id));
    themes.push({ label: t.label.trim().slice(0, 140), domain, polarity, review_ids, opposite_review_ids: opposite });
  }
  return { ok: true, themes, dropped_ids: dropped };
}

// ─── Merge across batches ──────────────────────────────────────────────────

const STOPWORDS = new Set(('a an the and or of to in on for with is are was were be been it its this that these those as at by from ' +
  'into than then too very not no product products item gummy gummies capsule capsules powder bottle one some any per').split(' '));
const SENTIMENT_WORDS = new Set(('good great bad terrible awful horrible nice pleasant unpleasant love loved hate like liked dislike ' +
  'excellent amazing poor worst best better worse delicious disgusting gross tasty yummy nasty positive negative strong weak ' +
  'effective ineffective works work working worked does doesnt didnt issue issues problem problems complaint praise lack lacking ' +
  'no none missing').split(' '));

function stem(w) {
  let x = w;
  if (x.length > 5 && x.endsWith('ing')) x = x.slice(0, -3);
  else if (x.length > 4 && x.endsWith('ed')) x = x.slice(0, -2);
  else if (x.length > 4 && x.endsWith('es')) x = x.slice(0, -2);
  else if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss')) x = x.slice(0, -1);
  if (x.length > 4 && x.endsWith('e')) x = x.slice(0, -1); // arrive/arrived → arriv
  return x;
}

function labelTokens(label) {
  return new Set(String(label || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w)).map(stem));
}

function topicTokens(label) {
  const out = new Set();
  for (const t of labelTokens(label)) if (!SENTIMENT_WORDS.has(t)) out.add(t);
  return out;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function labelSimilarity(a, b) {
  return jaccard(labelTokens(a), labelTokens(b));
}

/**
 * Union the per-batch clusters into category themes. Two clusters merge when
 * they share polarity AND (same domain and label similarity ≥ threshold, or
 * near-identical labels ≥ 0.8 regardless of domain). Canonical label = the
 * member label with the most supporting reviews; domain = review-weighted
 * majority.
 */
function mergeThemes(batchThemes, { threshold = 0.5 } = {}) {
  const items = batchThemes.flat().filter(Boolean);
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const tokens = items.map((t) => labelTokens(t.label));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].polarity !== items[j].polarity) continue;
      const sim = jaccard(tokens[i], tokens[j]);
      if ((items[i].domain === items[j].domain && sim >= threshold) || sim >= 0.8) {
        const ri = find(i); const rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const groups = new Map();
  items.forEach((t, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  });
  return sortMerged([...groups.values()].map((members) => combineMembers(members)));
}

function sortMerged(list) {
  return list.sort((a, b) => b.review_ids.length - a.review_ids.length || a.label.localeCompare(b.label));
}

/** Union a set of same-polarity clusters into one. */
function combineMembers(members, canonicalLabel = null) {
  const ids = new Set();
  const opp = new Set();
  const domainWeight = {};
  const labels = [];
  let best = members[0];
  for (const m of members) {
    for (const id of m.review_ids) ids.add(id);
    for (const id of m.opposite_review_ids || []) opp.add(id);
    domainWeight[m.domain] = (domainWeight[m.domain] || 0) + m.review_ids.length;
    if (m.review_ids.length > best.review_ids.length) best = m;
    for (const l of m.merged_labels || [m.label]) if (!labels.includes(l)) labels.push(l);
  }
  const domain = Object.entries(domainWeight).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  for (const id of ids) opp.delete(id);
  return {
    label: canonicalLabel || best.label,
    domain,
    polarity: best.polarity,
    review_ids: [...ids].sort((a, b) => a - b),
    opposite_review_ids: [...opp].sort((a, b) => a - b),
    merged_labels: labels,
  };
}

/**
 * Second merge stage (one cheap model call over LABELS only, no review text):
 * token overlap cannot see that "Melted in shipping" and "Gummies arrive as
 * one blob" are the same experience. The model proposes synonym groups by
 * index; applyLabelGroups validates them (known indices, each used once,
 * never across polarity) and unions the clusters.
 */
function buildLabelMergePrompt(merged, { keyword } = {}) {
  const lines = merged.map((t, i) => `${i} | ${t.polarity} | ${t.domain} | ${t.review_ids.length} | ${t.label}`).join('\n');
  return `These are review themes extracted in separate batches for the "${keyword}" category. Some are the SAME customer experience worded differently.

Each line: index | polarity | domain | supporting reviews | label

Return ONLY JSON: {"groups":[{"label":"canonical label","members":[0,7,12]}]}
- Only list groups of 2+ indices that describe the same specific experience.
- Never group different problems (e.g. "melted in transit" vs "hard texture"), never group across polarity.
- The canonical label is short and specific, in the style of the input labels.
- Indices not in any group stay as they are — do not list singletons.

THEMES:
${lines}`;
}

function applyLabelGroups(merged, groups) {
  const used = new Set();
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const idx = (Array.isArray(g && g.members) ? g.members : [])
      .map(Number)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < merged.length && !used.has(i));
    const uniq = [...new Set(idx)];
    // split by polarity — a group may never mix complaint and praise
    const byPol = new Map();
    for (const i of uniq) {
      const p = merged[i].polarity;
      if (!byPol.has(p)) byPol.set(p, []);
      byPol.get(p).push(i);
    }
    for (const list of byPol.values()) {
      if (list.length < 2) continue;
      for (const i of list) used.add(i);
      const label = typeof g.label === 'string' && g.label.trim() ? g.label.trim().slice(0, 140) : null;
      out.push(combineMembers(list.map((i) => merged[i]), label));
    }
  }
  merged.forEach((t, i) => { if (!used.has(i)) out.push(t); });
  return sortMerged(out);
}

// ─── Finalise: counts, scope, excerpts, counter-evidence ───────────────────

function isOpposite(a, b) {
  if (a === b) return false;
  const neg = (p) => p === 'complaint' || p === 'unmet_need';
  return (neg(a) && b === 'praise') || (a === 'praise' && neg(b));
}

function scopeFor(familyCount, productsWithReviews) {
  if (familyCount <= 1) return 'single_product';
  if (familyCount >= 3 && productsWithReviews && familyCount / productsWithReviews >= 0.2) return 'category_wide';
  return 'multi_product';
}

function clipExcerpt(s, max = 280) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 200 ? sp : max)}…`;
}

/** Choose the verbatim sentence of a review that best expresses a theme. */
function pickSentence(review, theme, lexicon = DOMAIN_LEXICON) {
  const sentences = splitSentences(review.body || review.title || '');
  if (!sentences.length) return review.title || '';
  const topic = topicTokens(theme.label);
  let best = null;
  let bestScore = -1;
  for (const s of sentences) {
    const toks = labelTokens(s);
    let overlap = 0;
    for (const t of topic) if (toks.has(t)) overlap++;
    const domainHit = assignDomains(s, lexicon).includes(theme.domain) ? 1 : 0;
    const score = overlap * 2 + domainHit;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

function pickExcerpts(ids, reviewById, theme, max = 3) {
  const candidates = ids.map((id) => reviewById.get(id)).filter(Boolean)
    .sort((a, b) => (Number(b.verified) - Number(a.verified)) || (b.helpful - a.helpful) || (a.id - b.id));
  const out = [];
  const seenFamilies = new Set();
  for (const pass of [0, 1]) {
    for (const r of candidates) {
      if (out.length >= max) break;
      if (out.some((e) => e.review_id === r.id)) continue;
      if (pass === 0 && seenFamilies.has(r.family)) continue;
      const text = pickSentence(r, theme);
      if (!text) continue;
      out.push({ review_id: r.id, asin: r.asins[0], rating: r.rating, verified: r.verified, date: r.date, text: clipExcerpt(text) });
      seenFamilies.add(r.family);
    }
  }
  return out;
}

function summarizeIds(ids, reviewById) {
  const rs = ids.map((id) => reviewById.get(id)).filter(Boolean);
  const asins = new Set();
  const fams = new Set();
  for (const r of rs) { for (const a of r.asins) asins.add(a); fams.add(r.family); }
  return {
    reviews: rs,
    review_count: rs.length,
    asins: [...asins].sort(),
    families: fams.size,
    verified: rs.filter((r) => r.verified).length,
    date_range: dateRange(rs),
  };
}

/**
 * Turn merged clusters into the stored theme records.
 *
 * counter_evidence = the model's in-batch opposite ids ∪ the supporting ids of
 * any OPPOSITE-polarity theme on the same topic (same domain, topic-token
 * similarity ≥ 0.5 once sentiment words are removed: "Bitter taste" ⇄ "Great
 * taste"). It is never merged away and never netted off — a complaint with a
 * large counter_evidence is a split experience, not a verdict.
 */
function finalizeThemes(merged, reviews, { productsWithReviews, reviewsAnalyzed, topicThreshold = 0.5 } = {}) {
  const reviewById = new Map(reviews.map((r) => [r.id, r]));
  const topics = merged.map((t) => topicTokens(t.label));
  return merged.map((t, i) => {
    const s = summarizeIds(t.review_ids, reviewById);
    const counterIds = new Set(t.opposite_review_ids || []);
    const pairedLabels = [];
    merged.forEach((o, j) => {
      if (j === i || !isOpposite(t.polarity, o.polarity) || o.domain !== t.domain) return;
      if (jaccard(topics[i], topics[j]) < topicThreshold) return;
      pairedLabels.push(o.label);
      for (const id of o.review_ids) counterIds.add(id);
    });
    for (const id of t.review_ids) counterIds.delete(id);
    const ce = summarizeIds([...counterIds].sort((a, b) => a - b), reviewById);
    return {
      label: t.label,
      domain: t.domain,
      polarity: t.polarity,
      review_ids: s.reviews.map((r) => r.id),
      review_count: s.review_count,
      share_of_analyzed: share(s.review_count, reviewsAnalyzed),
      distinct_products: { count: s.families, asin_count: s.asins.length, asins: s.asins },
      scope: scopeFor(s.families, productsWithReviews),
      verified_count: s.verified,
      verified_share: share(s.verified, s.review_count),
      date_range: s.date_range,
      excerpts: pickExcerpts(s.reviews.map((r) => r.id), reviewById, t, 3),
      counter_evidence: {
        review_ids: ce.reviews.map((r) => r.id),
        count: ce.review_count,
        products: ce.families,
        paired_theme_labels: pairedLabels,
        excerpt: pickExcerpts(ce.reviews.map((r) => r.id), reviewById, { ...t, label: pairedLabels[0] || t.label }, 1)[0] || null,
      },
      merged_labels: t.merged_labels || [t.label],
    };
  }).filter((t) => t.review_count > 0)
    .sort((a, b) => b.review_count - a.review_count || b.distinct_products.count - a.distinct_products.count || a.label.localeCompare(b.label));
}

/**
 * Product-level view of category themes: only the reviews collected under this
 * ASIN, with the category context kept alongside so a product-page complaint
 * can say whether it is this product's problem or a category-wide one.
 */
function projectThemesToProduct(themes, asin, reviews) {
  const reviewById = new Map(reviews.map((r) => [r.id, r]));
  const onAsin = (id) => { const r = reviewById.get(id); return r && r.asins.includes(asin); };
  const out = [];
  for (const t of themes) {
    const ids = t.review_ids.filter(onAsin);
    if (!ids.length) continue;
    const counter = t.counter_evidence.review_ids.filter(onAsin);
    const rs = ids.map((id) => reviewById.get(id));
    out.push({
      label: t.label,
      domain: t.domain,
      polarity: t.polarity,
      review_ids: ids,
      review_count: ids.length,
      verified_count: rs.filter((r) => r.verified).length,
      date_range: dateRange(rs),
      excerpts: t.excerpts.filter((e) => ids.includes(e.review_id)).slice(0, 2),
      counter_evidence: { review_ids: counter, count: counter.length },
      category_context: {
        review_count: t.review_count,
        distinct_products: t.distinct_products.count,
        scope: t.scope,
        other_products: Math.max(0, t.distinct_products.count - 1),
      },
    });
  }
  return out.sort((a, b) => b.review_count - a.review_count || a.label.localeCompare(b.label));
}

// ─── Consumers: briefs (P7/P8) and the dashboard ───────────────────────────

const DOMAIN_LABEL = {
  product_efficacy: 'efficacy',
  taste_texture: 'taste/texture',
  packaging: 'packaging/label',
  shipping_condition: 'arrival condition',
  seller_service: 'seller/service',
  price_value: 'price/value',
  other: 'other',
};

function fmtN(n) { return Number(n || 0).toLocaleString('en-US'); }

function fmtMonth(d) {
  if (!d) return '?';
  const [y, m] = d.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] || '?'} ${y}`;
}

/** One line per theme, counts first — what P7/P8 put in their prompts. */
function formatThemeLine(t) {
  const prods = t.distinct_products.count;
  const scope = t.scope === 'single_product'
    ? 'ONE product only — not a category conclusion'
    : t.scope === 'category_wide' ? 'category-wide' : 'several products';
  const conflict = t.counter_evidence && t.counter_evidence.count
    ? `; conflicting: ${fmtN(t.counter_evidence.count)} review${t.counter_evidence.count === 1 ? '' : 's'} report the opposite`
    : '';
  const ex = t.excerpts && t.excerpts[0] ? ` e.g. "${t.excerpts[0].text}" (${t.excerpts[0].asin})` : '';
  return `- ${t.label} [${DOMAIN_LABEL[t.domain] || t.domain}] — ${fmtN(t.review_count)} review${t.review_count === 1 ? '' : 's'} across ${prods} product${prods === 1 ? '' : 's'} (${fmtN(t.verified_count)} verified); ${scope}${conflict}.${ex}`;
}

function formatLedgerLine(l) {
  if (!l) return '';
  const cap = l.cap_applied ? ` (capped at ${fmtN(l.cap_applied.max)} — ${fmtN(l.cap_applied.reviews_dropped)} not analyzed)` : '';
  const dup = l.duplicate_rows_removed ? `; ${fmtN(l.rows_collected)} scraped rows before removing ${fmtN(l.duplicate_rows_removed)} duplicates` : '';
  const dr = l.date_range && l.date_range.min ? `${fmtMonth(l.date_range.min)}–${fmtMonth(l.date_range.max)}` : 'dates unknown';
  const ver = l.verified_share != null ? `, ${Math.round(l.verified_share * 100)}% verified` : '';
  const tp = l.theme_pass && l.theme_pass.batches_failed
    ? ` Theme extraction PARTIAL: ${fmtN(l.theme_pass.reviews_in_failed_batches)} reviews were in failed batches, so theme counts are a lower bound.`
    : '';
  return `Evidence base: ${fmtN(l.reviews_analyzed)} of ${fmtN(l.reviews_collected)} unique reviews analyzed${cap}${dup}; ${fmtN(l.products_with_reviews)} ASINs in ${fmtN(l.product_families)} product families; ${dr}${ver}.${tp}`;
}

/**
 * Pick themes for a brief prompt from a category synthesis row.
 * Returns { available:false } when there is no usable synthesis — callers fall
 * back to their old sampling.
 *
 * Selection: complaints + unmet needs ranked by review_count (ties: more
 * products), with at least `perDomainFloor` from each domain that has any so
 * shipping/service never crowd out taste; praise ranked the same way.
 * single_product themes are allowed but carry their scope label.
 */
function selectThemesForBrief(synthesis, { max = 24, maxPraise = 12, perDomainFloor = 2 } = {}) {
  const themes = synthesis && Array.isArray(synthesis.themes) ? synthesis.themes : [];
  if (!themes.length) return { available: false, complaints: [], praise: [], text: '', ledgerLine: '' };
  const byCount = (a, b) => b.review_count - a.review_count || b.distinct_products.count - a.distinct_products.count || a.label.localeCompare(b.label);
  const neg = themes.filter((t) => t.polarity !== 'praise').sort(byCount);
  const pos = themes.filter((t) => t.polarity === 'praise').sort(byCount);
  const chosen = [];
  const seen = new Set();
  for (const d of ISSUE_DOMAINS) {
    for (const t of neg.filter((x) => x.domain === d).slice(0, perDomainFloor)) {
      if (chosen.length >= max) break;
      chosen.push(t); seen.add(t);
    }
  }
  for (const t of neg) { if (chosen.length >= max) break; if (!seen.has(t)) { chosen.push(t); seen.add(t); } }
  chosen.sort(byCount);
  const praise = pos.slice(0, maxPraise);
  const ledgerLine = formatLedgerLine(synthesis.ledger);
  const text = [
    ledgerLine,
    'Counts are unique reviews; "products" are product families (variants sharing one review pool count once). A theme marked ONE product only must not be generalised to the category; "conflicting" counts reviews reporting the opposite experience.',
    '',
    'COMPLAINTS & UNMET NEEDS (ranked by supporting reviews):',
    ...(chosen.length ? chosen.map(formatThemeLine) : ['- none found']),
    '',
    'WHAT CUSTOMERS PRAISE:',
    ...(praise.length ? praise.map(formatThemeLine) : ['- none found']),
  ].join('\n');
  return { available: true, complaints: chosen, praise, text, ledgerLine };
}

/**
 * P8's `top_pain_points` shape ({keyword, mentions}) built from the synthesis,
 * with the evidence fields alongside so the prompt can print counts. Complaint
 * and unmet-need themes only, ranked by supporting reviews.
 */
function painPointsFromSynthesis(synthesis, max = 40) {
  const themes = synthesis && Array.isArray(synthesis.themes) ? synthesis.themes : [];
  return themes
    .filter((t) => t.polarity !== 'praise')
    .slice()
    .sort((a, b) => b.review_count - a.review_count || b.distinct_products.count - a.distinct_products.count)
    .slice(0, max)
    .map((t) => ({
      keyword: t.label,
      mentions: t.review_count,
      products: t.distinct_products.count,
      verified: t.verified_count,
      domain: t.domain,
      polarity: t.polarity,
      scope: t.scope,
      counter: t.counter_evidence ? t.counter_evidence.count : 0,
    }));
}

/** "41 reviews across 9 products (12 verified); conflicting: 17" — or the legacy "N mentions". */
function formatPainPointCount(p) {
  if (p.products == null) return `${p.mentions} mentions`;
  const one = p.scope === 'single_product' ? ' — ONE product only' : '';
  const conflict = p.counter ? `; conflicting: ${p.counter}` : '';
  return `${p.mentions} review${p.mentions === 1 ? '' : 's'} across ${p.products} product${p.products === 1 ? '' : 's'} (${p.verified} verified)${one}${conflict}`;
}

/**
 * The switch P7/P8 use: synthesis when a usable row exists, otherwise the
 * caller's existing random sample, untouched.
 */
function briefReviewInput(synthesis, fallbackSample, opts) {
  const sel = selectThemesForBrief(synthesis, opts);
  if (sel.available) {
    return { mode: 'synthesis', evidenceText: sel.text, ledgerLine: sel.ledgerLine, complaints: sel.complaints, praise: sel.praise };
  }
  return { mode: 'sample', evidenceText: '', ledgerLine: '', ...(fallbackSample || {}) };
}

/**
 * P6a per-product prompt block from a scope='product' synthesis row: the
 * product's own coverage line, then its themes with counts, conflicts and
 * whether the same theme shows up on other products. Returns '' when there is
 * nothing to say, so the caller can fall back to its 5+5 sample.
 */
function formatProductEvidenceForPrompt(productRow, { maxThemes = 10 } = {}) {
  if (!productRow || !Array.isArray(productRow.themes) || !productRow.themes.length) return '';
  const l = productRow.ledger || {};
  const dr = l.date_range && l.date_range.min ? `${fmtMonth(l.date_range.min)}–${fmtMonth(l.date_range.max)}` : 'dates unknown';
  const ver = l.verified_share != null ? `, ${Math.round(l.verified_share * 100)}% verified` : '';
  const head = `All ${fmtN(l.reviews_analyzed)} unique reviews for this product analyzed (${dr}${ver}); themes with supporting review counts:`;
  const lines = productRow.themes.slice(0, maxThemes).map((t) => {
    const sign = t.polarity === 'praise' ? '+' : t.polarity === 'unmet_need' ? '?' : '-';
    const conflict = t.counter_evidence && t.counter_evidence.count ? `, ${t.counter_evidence.count} say the opposite` : '';
    const ctx = t.category_context && t.category_context.other_products
      ? `; also reported on ${t.category_context.other_products} other product${t.category_context.other_products === 1 ? '' : 's'}`
      : '; not reported on other products';
    const ex = t.excerpts && t.excerpts[0] ? ` — "${t.excerpts[0].text.slice(0, 160)}"` : '';
    return `${sign} ${t.label} [${DOMAIN_LABEL[t.domain] || t.domain}]: ${t.review_count} review${t.review_count === 1 ? '' : 's'}${conflict}${ctx}${ex}`;
  });
  return [head, ...lines].join('\n');
}

/**
 * The block migrate-reviews-to-dash.js / P3b attach to
 * products.review_analysis.review_evidence (additive — nothing else changes).
 */
function buildProductEvidence(productRow, { maxThemes = 12 } = {}) {
  if (!productRow) return null;
  return {
    ledger: productRow.ledger,
    themes: (productRow.themes || []).slice(0, maxThemes),
    theme_count: (productRow.themes || []).length,
    generated_at: productRow.generated_at || null,
    model: productRow.model || null,
    prompt_version: productRow.prompt_version || null,
    source: 'dovive_review_synthesis',
  };
}

// ─── Cost estimate (no calls) ──────────────────────────────────────────────

/**
 * Estimate the model cost of the theme pass. Token counts use chars/4.
 * `completionPerBatch` defaults to 2,500 tokens (≈ 20 themes with their id
 * lists) — deliberately generous.
 */
function estimateSynthesisCost(batches, pricing, { keyword = 'category', completionPerBatch = 2500 } = {}) {
  let promptTokens = 0;
  for (const b of batches) promptTokens += Math.ceil(buildBatchPrompt(b, { keyword }).length / 4);
  const completionTokens = batches.length * completionPerBatch;
  const cost = pricing ? promptTokens * pricing.prompt + completionTokens * pricing.completion : null;
  return { batches: batches.length, prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: cost == null ? null : Math.round(cost * 10000) / 10000 };
}

module.exports = {
  PROMPT_VERSION,
  ISSUE_DOMAINS,
  POLARITIES,
  DOMAIN_LEXICON,
  DOMAIN_LABEL,
  parseReviewDateLoose,
  normalizeReview,
  prepareReviews,
  reviewText,
  applyCap,
  buildLedger,
  splitSentences,
  assignDomains,
  preclassifyReview,
  buildDomainBreakdown,
  buildBatches,
  buildBatchPrompt,
  extractJson,
  parseBatchResponse,
  labelTokens,
  topicTokens,
  labelSimilarity,
  mergeThemes,
  buildLabelMergePrompt,
  applyLabelGroups,
  finalizeThemes,
  scopeFor,
  projectThemesToProduct,
  formatThemeLine,
  formatLedgerLine,
  selectThemesForBrief,
  painPointsFromSynthesis,
  formatPainPointCount,
  briefReviewInput,
  formatProductEvidenceForPrompt,
  buildProductEvidence,
  estimateSynthesisCost,
};
