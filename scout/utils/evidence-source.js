/**
 * utils/evidence-source.js — where the formula phases READ their evidence.
 *
 * One switch, env SCOUT_EVIDENCE_SOURCE:
 *   'scout' (default)  Scout's own tables, through the DASH / DOVIVE clients
 *                      the phase already holds. Every function issues EXACTLY
 *                      the select the phase issued before this layer existed
 *                      (same table, columns, filters, order, limit) — see the
 *                      per-phase tests in test/formula-reads.test.js.
 *   'rnd'              The RnD evidence database's read-only views
 *                      (docs/FORMULA-INPUTS.md §5), through utils/rnd-client.js.
 *                      The views return Scout's own column names, so the
 *                      query shape is the same; only the relation changes.
 *
 * With 'rnd' and no RnD client (RND_SUPABASE_URL / RND_SUPABASE_ANON_KEY
 * missing) createEvidenceSource THROWS. It never quietly reads Scout instead:
 * a run that asked for RnD evidence and got Scout's would look identical and
 * be wrong.
 *
 * READS ONLY. Every write (formula_briefs, products.marketing_analysis,
 * dovive_phase5_research, …) stays in the phases, on Scout. Two helpers exist
 * because a few phases merge new keys into a row they also read as evidence:
 * briefWriteBase / productWriteBase hand back the SCOUT row the write must
 * merge into. Under 'scout' they return the row already read (no query, so
 * behaviour is unchanged); under 'rnd' they read it from Scout, because the
 * write target is Scout's row, not the RnD view's reassembly of it.
 *
 * Three reads are Scout-only by design in BOTH backends (documented in
 * docs/EVIDENCE-SOURCE.md): raw reviews (dovive_reviews — FORMULA-INPUTS gap
 * 14 keeps them in Scout), the review-synthesis staleness guard (reads
 * dovive_reviews.scraped_at), and the write bases above.
 *
 * Query options shared by the table-shaped functions:
 *   columns   the select string, verbatim
 *   ops       [[method, ...args], …] applied in order after the scope filters
 *             (eq / neq / not / is / in / lt / lte / gt / gte / ilike / like /
 *             order / limit / range / maybeSingle / single) — the phase's own
 *             chain, carried over unchanged
 *   selection a loadSelection() result; active → `.eq('selected', true)
 *             .order('selection_rank')` right after the category filter,
 *             exactly as utils/selected-competitors.js scopeToSelection does
 * They resolve to the supabase-js result `{ data, error, count? }`.
 */

'use strict';

const { createRndClient, rndClientReason } = require('./rnd-client');
const { loadSelection, scopeToSelection } = require('./selected-competitors');
const reviewStore = require('./review-synthesis-store');
const webStore = require('./web-research-store');
const creativeStore = require('./marketing-assets-store');
const miStore = require('./market-intel-store');

const BACKENDS = ['scout', 'rnd'];

/** Scout backend: [client name, table] per evidence item. */
const SCOUT_TABLES = {
  products: ['dash', 'products'],
  roster: ['dash', 'products'],
  labelFacts: ['dash', 'products'],
  labelPanels: ['dovive', 'dovive_ocr'],
  listingClaims: ['dovive', 'dovive_research'],
  marketSignals: ['dovive', 'dovive_keepa'],
  reviewThemes: ['dash', reviewStore.TABLE],
  webClaims: ['dash', webStore.TABLE],
  creativeVerdicts: ['dash', creativeStore.TABLE],
  deepResearch: ['dovive', 'dovive_phase5_research'],
  p5Sources: ['dovive', 'dovive_p5_sources'],
  packaging: ['dovive', 'dovive_packaging_intelligence'],
  productIntel: ['dash', 'products'],
  briefCurrent: ['dash', miStore.TABLE],
  rawReviews: ['dovive', 'dovive_reviews'],
};

/** RnD backend: the §5 view each item reads (labelPanels / listingClaims compose two). */
const RND_VIEWS = {
  products: 'v_formula_products',
  roster: 'v_formula_roster',
  labelFacts: 'v_formula_label_facts',
  labelPanels: ['v_formula_label_facts', 'v_formula_listing'],
  listingClaims: ['v_formula_roster', 'v_formula_listing'],
  marketSignals: 'v_formula_keepa',
  reviewThemes: 'v_formula_review_themes',
  webClaims: 'v_formula_claims',
  creativeVerdicts: 'v_formula_creative',
  deepResearch: 'v_formula_deep_research',
  p5Sources: 'v_formula_p5_sources',
  packaging: 'v_formula_packaging',
  productIntel: 'v_formula_product_intel',
  briefCurrent: 'v_formula_brief_current',
  rawReviews: null, // Scout-only (gap 14)
};

const ROSTER_COLUMNS = 'id, asin, brand, title, selected, selection_rank, cohort, packaging_type, main_image_url';
const LABEL_FACT_COLUMNS = 'asin, supplement_facts_raw, all_nutrients, nutrients_count, serving_size, servings_per_container, other_ingredients, proprietary_blends';
const P5_OCR_COLUMNS = 'supplement_facts, other_ingredients, health_claims, certifications, label_product_match';
const P5_OCR_LEGACY_COLUMNS = 'supplement_facts, other_ingredients, health_claims, certifications';
const P5_RESEARCH_COLUMNS = 'title, brand, description, bullet_points, price, rating, review_count, bsr';
const P5_KEEPA_COLUMNS = 'price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d';
const PACKAGING_COLUMNS = 'intelligence, generated_at, products_analyzed';

const ALLOWED_OPS = new Set(['eq', 'neq', 'not', 'is', 'in', 'lt', 'lte', 'gt', 'gte', 'ilike', 'like', 'order', 'limit', 'range', 'maybeSingle', 'single']);

/** Apply a phase's chain ([[method, ...args], …]) to a query, in order. Reads only. */
function applyOps(q, ops = []) {
  for (const op of ops || []) {
    const [m, ...args] = op;
    if (!ALLOWED_OPS.has(m)) throw new Error(`evidence-source: '${m}' is not a read filter`);
    q = q[m](...args);
  }
  return q;
}

/** The caller named `key` in its options (even with an empty / undefined value). */
function has(opts, key) {
  return !!opts && Object.prototype.hasOwnProperty.call(opts, key);
}

function backendFromEnv(env = process.env) {
  const v = String((env && env.SCOUT_EVIDENCE_SOURCE) || '').trim().toLowerCase();
  return v || 'scout';
}

/**
 * @param {object} deps
 * @param {object} [deps.dash]    Scout DASH client (products, formula_briefs, review synthesis, …)
 * @param {object} [deps.dovive]  Scout DOVIVE client (dovive_* raw tables; raw reviews in BOTH backends)
 * @param {'scout'|'rnd'} [deps.backend]  default: env SCOUT_EVIDENCE_SOURCE, else 'scout'
 * @param {object} [deps.env=process.env]
 * @param {object|null} [deps.rndClient]  injectable; default createRndClient(env) in rnd mode
 */
function createEvidenceSource({ dash = null, dovive = null, backend = null, env = process.env, rndClient } = {}) {
  const mode = backend || backendFromEnv(env);
  if (!BACKENDS.includes(mode)) {
    throw new Error(`SCOUT_EVIDENCE_SOURCE must be 'scout' or 'rnd' (got '${mode}')`);
  }
  let rnd = null;
  if (mode === 'rnd') {
    rnd = rndClient !== undefined ? rndClient : createRndClient(env);
    if (!rnd) {
      const why = rndClientReason(env) || 'RnD client unavailable';
      throw new Error(`SCOUT_EVIDENCE_SOURCE=rnd but ${why} — refusing to read formula evidence from Scout instead`);
    }
  }
  const isRnd = mode === 'rnd';
  const scoutClient = (name) => {
    const c = name === 'dash' ? dash : dovive;
    if (!c) throw new Error(`evidence-source: the Scout ${name.toUpperCase()} client was not provided`);
    return c;
  };
  /** { client, table } for a single-relation item under the active backend. */
  const src = (item) => {
    if (isRnd && RND_VIEWS[item]) return { client: rnd, table: RND_VIEWS[item] };
    const [c, t] = SCOUT_TABLES[item];
    return { client: scoutClient(c), table: t };
  };

  // ── category-scoped product reads ────────────────────────────────────────
  function categoryQuery(item, categoryId, columns, { selection = null, ops = [], selectOptions } = {}) {
    const { client, table } = src(item);
    let q = selectOptions === undefined ? client.from(table).select(columns) : client.from(table).select(columns, selectOptions);
    q = q.eq('category_id', categoryId);
    q = scopeToSelection(q, selection);
    return applyOps(q, ops);
  }

  /**
   * Any product-level columns for a category, with the phase's own chain.
   * Scout: `products`. RnD: `v_formula_products` (roster + label facts +
   * listing + product intel in one row, Scout column names).
   * @returns {Promise<{ data: object[]|null, error: object|null, count?: number }>}
   *   rows carry exactly `columns` (Scout names).
   */
  function products(categoryId, columns, opts = {}) {
    return categoryQuery('products', categoryId, columns, opts);
  }

  /**
   * §3.1 product roster. Scout: `products`. RnD: `v_formula_roster`.
   * @returns {Promise<{ data: Array<{ id, asin, brand, title, selected, selection_rank, cohort, packaging_type, main_image_url }>|null, error }>}
   *   (or whatever `columns` names)
   */
  function roster(categoryId, { columns = ROSTER_COLUMNS, ...opts } = {}) {
    return categoryQuery('roster', categoryId, columns, opts);
  }

  /**
   * The 40-competitor selection, via utils/selected-competitors.js.
   * Scout: `products`. RnD: `v_formula_roster` (same `asin, selection_rank,
   * selected` columns).
   * @returns {Promise<{ active: boolean, why: string, ranks: Map<string, number> }>}
   */
  function selection(categoryId) {
    const { client, table } = src('roster');
    return isRnd ? loadSelection(client, categoryId, { table }) : loadSelection(client, categoryId);
  }

  /**
   * §3.2 label facts per product, by category and/or ASINs.
   * Scout: `products`. RnD: `v_formula_label_facts`.
   * @returns {Promise<{ data: Array<{ asin, supplement_facts_raw: string, all_nutrients: Array<{name, amount, dv_percent}>,
   *   nutrients_count: number, serving_size: string, servings_per_container: number, other_ingredients: string,
   *   proprietary_blends: any[] }>|null, error }>}
   */
  function labelFacts({ categoryId = null, asins = null, columns = LABEL_FACT_COLUMNS, ops = [] } = {}) {
    const { client, table } = src('labelFacts');
    let q = client.from(table).select(columns);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (asins) q = q.in('asin', asins);
    return applyOps(q, ops);
  }

  /**
   * §3.2 the per-image label panels P5 grounds on (dovive_ocr), mismatch
   * verdict included so the caller can drop a panel showing another product.
   * Scout: `dovive_ocr` by asin, image_index order, 8 panels; on error the
   * pre-migration-013 select without label_product_match (P5's legacy retry).
   * RnD: one panel per `v_formula_label_facts` row for the ASIN (≤8), with
   * `v_formula_listing.claims_on_label / certifications` as its claims —
   * RnD has no per-image rows, and no mismatch verdict (label_product_match null).
   * @returns {Promise<{ data: Array<{ supplement_facts, other_ingredients, health_claims, certifications, label_product_match? }>|null, error }>}
   */
  async function labelPanels(asin, { categoryId = null } = {}) {
    if (isRnd) {
      const [lfView, liView] = RND_VIEWS.labelPanels;
      let lf = rnd.from(lfView).select('asin, all_nutrients, other_ingredients').eq('asin', asin);
      let li = rnd.from(liView).select('asin, claims_on_label, certifications').eq('asin', asin);
      if (categoryId) { lf = lf.eq('category_id', categoryId); li = li.eq('category_id', categoryId); }
      const [f, l] = await Promise.all([lf.limit(8), li.limit(1).maybeSingle()]);
      if (f.error) return { data: null, error: f.error };
      const listing = (l && !l.error && l.data) || {};
      return {
        data: (f.data || []).map((r) => ({
          supplement_facts: r.all_nutrients ?? null,
          other_ingredients: r.other_ingredients ?? null,
          health_claims: listing.claims_on_label ?? null,
          certifications: listing.certifications ?? null,
          label_product_match: null,
        })),
        error: null,
      };
    }
    const { client, table } = src('labelPanels');
    const res = await client.from(table).select(P5_OCR_COLUMNS)
      .eq('asin', asin).order('image_index', { ascending: true }).limit(8);
    if (!res.error) return res;
    const legacy = await client.from(table).select(P5_OCR_LEGACY_COLUMNS)
      .eq('asin', asin).order('image_index', { ascending: true }).limit(8);
    return { data: legacy.data, error: legacy.error || null };
  }

  /**
   * §3.5 the listing copy P5 grounds on, in the dovive_research shape.
   * Scout: `dovive_research` by asin + exact session keyword (ilike), 1 row.
   * RnD: `v_formula_roster` (title, brand, price, rating, BSR) +
   * `v_formula_listing` (description, bullets split on newlines) for the ASIN,
   * scoped to `categoryId` when given (RnD has no session keyword).
   * @returns {Promise<{ data: { title, brand, description, bullet_points: string[], price, rating, review_count, bsr }|null, error }>}
   */
  async function listingClaims(asin, { keyword = null, categoryId = null } = {}) {
    if (isRnd) {
      const [rosterView, listingView] = RND_VIEWS.listingClaims;
      let r = rnd.from(rosterView).select('asin, brand, title, price, rating_value, rating_count, bsr_current').eq('asin', asin);
      let l = rnd.from(listingView).select('asin, feature_bullets_text, description_text').eq('asin', asin);
      if (categoryId) { r = r.eq('category_id', categoryId); l = l.eq('category_id', categoryId); }
      const [ro, li] = await Promise.all([r.limit(1).maybeSingle(), l.limit(1).maybeSingle()]);
      if (ro.error) return { data: null, error: ro.error };
      if (li.error) return { data: null, error: li.error };
      if (!ro.data && !li.data) return { data: null, error: null };
      const a = ro.data || {};
      const b = li.data || {};
      return {
        data: {
          title: a.title ?? null,
          brand: a.brand ?? null,
          description: b.description_text ?? null,
          bullet_points: String(b.feature_bullets_text || '').split('\n').map((s) => s.trim()).filter(Boolean),
          price: a.price ?? null,
          rating: a.rating_value ?? null,
          review_count: a.rating_count ?? null,
          bsr: a.bsr_current ?? null,
        },
        error: null,
      };
    }
    const { client, table } = src('listingClaims');
    return client.from(table).select(P5_RESEARCH_COLUMNS)
      .eq('asin', asin).ilike('keyword', keyword).limit(1).maybeSingle();
  }

  /**
   * §3.4 Keepa-derived signals for one ASIN.
   * Scout: `dovive_keepa`. RnD: `v_formula_keepa` (same columns).
   * @returns {Promise<{ data: { price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d: Array<{date, rank}> }|null, error }>}
   */
  function marketSignals(asin, { columns = P5_KEEPA_COLUMNS } = {}) {
    const { client, table } = src('marketSignals');
    return client.from(table).select(columns).eq('asin', asin).limit(1).maybeSingle();
  }

  /**
   * §3.3 review synthesis, via utils/review-synthesis-store.js.
   * Scout: `dovive_review_synthesis`. RnD: `v_formula_review_themes`.
   * The staleness guard reads `reviewsClient` (Scout's dovive_reviews) in both.
   * @param {{ scope: 'category'|'product', keyword, categoryId?, asins?, reviewsClient?, log? }} opts
   * @returns {Promise<object|null|Record<string, object>>}
   *   category → the row `{ keyword, category_id, scope, asin, ledger, themes[], domain_breakdown[], generated_at, model, prompt_version, status }` or null;
   *   product → `{ [asin]: { asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status } }`
   */
  function reviewThemes({ scope, ...opts }) {
    const { client, table } = src('reviewThemes');
    const o = isRnd ? { ...opts, table } : opts;
    if (scope === 'category') return reviewStore.fetchCategorySynthesis(client, o);
    if (scope === 'product') return reviewStore.fetchProductSyntheses(client, o);
    throw new Error(`reviewThemes: scope must be 'category' or 'product' (got '${scope}')`);
  }

  /**
   * §3.3 raw reviews (the fallback when no synthesis exists). Scout-only in
   * BOTH backends — RnD does not hold raw reviews (FORMULA-INPUTS gap 14).
   * @param {string|string[]} asins  one ASIN (eq) or a list (in)
   * @returns {Promise<{ data: Array<{ asin?, rating, title, body, helpful_votes?, verified_purchase? }>|null, error }>}
   */
  function rawReviews(asins, columns, { ops = [] } = {}) {
    const c = scoutClient('dovive');
    let q = c.from(SCOUT_TABLES.rawReviews[1]).select(columns);
    q = Array.isArray(asins) ? q.in('asin', asins) : q.eq('asin', asins);
    return applyOps(q, ops);
  }

  /**
   * §3.7 P5b web claims, via utils/web-research-store.js loadWebEvidence.
   * Scout: `dovive_web_research`. RnD: `v_formula_claims`.
   * @returns {Promise<{ row: { keyword, category_id, status, ledger, rollup, verification, model, generated_at }|null, text: string }>}
   */
  function webClaims(opts, logOpts) {
    const { client, table } = src('webClaims');
    return webStore.loadWebEvidence(client, isRnd ? { ...opts, table } : opts, logOpts);
  }

  /**
   * §3.6 P7b marketing-asset verdicts (category row), via marketing-assets-store.
   * Scout: `dovive_marketing_assets`. RnD: `v_formula_creative`.
   * @returns {Promise<{ keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at }|null>}
   */
  function creativeVerdicts(opts) {
    const { client, table } = src('creativeVerdicts');
    return creativeStore.fetchCategoryMarketingAssets(client, isRnd ? { ...opts, table } : opts);
  }

  /**
   * §3.7 P5 deep research rows.
   * Scout: `dovive_phase5_research`, `.in('asin')` when `asins` is named, then
   * `.ilike('keyword')` (exact session label) when `keyword` is named, then the phase's ops.
   * RnD: `v_formula_deep_research` (same columns).
   * @returns {Promise<{ data: Array<{ asin, brand, bsr_rank, pool, benefits, formula_notes, key_strengths, key_weaknesses,
   *   competitor_angle, certifications, third_party_tested, full_research, researched_by }>|null, error }>} (per `columns`)
   */
  function deepResearch(opts = {}) {
    const { keyword, asins, columns, ops = [] } = opts;
    const { client, table } = src('deepResearch');
    let q = client.from(table).select(columns);
    // Filter iff the caller NAMED the key — the old chains issued .in / .ilike
    // unconditionally with whatever value they had (an empty or undefined
    // KEYWORD matched nothing); skipping a falsy one would widen the read to
    // every keyword's rows.
    if (has(opts, 'asins')) q = q.in('asin', asins);
    if (has(opts, 'keyword')) q = q.ilike('keyword', keyword);
    return applyOps(q, ops);
  }

  /**
   * §3.7 P5 off-Amazon sources.
   * Scout: `dovive_p5_sources`, `.in('asin')` when `asins` is named, `.eq('keyword')`
   * when `keyword` is named, then ops. RnD: `v_formula_p5_sources`.
   * @returns {Promise<{ data: Array<{ asin, keyword, source_url, source_type, raw_html_excerpt, extracted }>|null, error }>} (per `columns`)
   */
  function p5Sources(opts = {}) {
    const { keyword, asins, columns, ops = [] } = opts;
    const { client, table } = src('p5Sources');
    let q = client.from(table).select(columns);
    // Filter iff the caller named the key (see deepResearch).
    if (has(opts, 'asins')) q = q.in('asin', asins);
    if (has(opts, 'keyword')) q = q.eq('keyword', keyword);
    return applyOps(q, ops);
  }

  /**
   * §3.8 category packaging intelligence.
   * Scout: `dovive_packaging_intelligence` by keyword. RnD: `v_formula_packaging`.
   * @returns {Promise<{ data: { intelligence: object, generated_at, products_analyzed }|object[]|null, error }>}
   */
  function packaging({ keyword, columns = PACKAGING_COLUMNS, ops = [] } = {}) {
    const { client, table } = src('packaging');
    return applyOps(client.from(table).select(columns).eq('keyword', keyword), ops);
  }

  /**
   * §3.9 per-product prior analysis (`marketing_analysis` =
   * { product_intelligence, packaging_intelligence, p5_research, … }).
   * Scout: `products`. RnD: `v_formula_product_intel`.
   * @returns {Promise<{ data: Array<{ asin, marketing_analysis }>|null, error }>}
   */
  function productIntel(categoryId, { asins = null, columns = 'asin, marketing_analysis', ops = [] } = {}) {
    const { client, table } = src('productIntel');
    let q = client.from(table).select(columns).eq('category_id', categoryId);
    if (asins) q = q.in('asin', asins);
    return applyOps(q, ops);
  }

  /**
   * §3.9 the category's formula brief (one jsonb `ingredients` holding P7 and
   * P9–P13 deliverables). Scout: `formula_briefs`. RnD: `v_formula_brief_current`.
   * @returns {Promise<{ data: { id, category_id, ingredients, created_at }|object[]|null, error }>} (per `columns`/ops)
   */
  function briefCurrent(categoryId, { columns, ops = [] } = {}) {
    const { client, table } = src('briefCurrent');
    return applyOps(client.from(table).select(columns).eq('category_id', categoryId), ops);
  }

  /**
   * The Scout formula_briefs row a phase must merge its new key into before
   * writing. Scout backend: `evidenceRow` itself (no query — unchanged
   * behaviour). RnD backend: the same chain on Scout's `formula_briefs`,
   * because the write goes to Scout and must not carry the view's reassembly.
   * @returns {Promise<object|null>}
   */
  async function briefWriteBase(categoryId, evidenceRow, { columns, ops = [] } = {}) {
    if (!isRnd) return evidenceRow;
    const { data } = await applyOps(scoutClient('dash').from(SCOUT_TABLES.briefCurrent[1]).select(columns).eq('category_id', categoryId), ops);
    return data || null;
  }

  /**
   * Per-row write bases for a phase that merges into products.marketing_analysis
   * by id (P6). Scout backend: a Map over the rows already read (no query).
   * RnD backend: Scout's `products` rows by id (chunks of 100).
   * @returns {Promise<Map<string, { id, marketing_analysis }>>}
   */
  async function productWriteBase(rows, { columns = 'id, marketing_analysis' } = {}) {
    const out = new Map();
    if (!isRnd) {
      for (const r of rows || []) if (r && r.id != null && !out.has(r.id)) out.set(r.id, r);
      return out;
    }
    const ids = [...new Set((rows || []).map((r) => r && r.id).filter((x) => x != null))];
    const c = scoutClient('dash');
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await c.from('products').select(columns).in('id', ids.slice(i, i + 100));
      if (error) throw new Error(`evidence-source: Scout write base for products not readable: ${error.message}`);
      for (const r of data || []) out.set(r.id, r);
    }
    return out;
  }

  /**
   * P7's market report out of the brief, via utils/market-intel-store.js.
   * Scout: `formula_briefs`. RnD: `v_formula_brief_current`.
   * @returns {Promise<{ ai_market_analysis, generated_at, model, products_analyzed, review_coverage, source }|null>}
   */
  function marketIntel(categoryId) {
    const { client, table } = src('briefCurrent');
    return isRnd ? miStore.fetchMarketIntel(client, categoryId, { table }) : miStore.fetchMarketIntel(client, categoryId);
  }

  /** Which relation each function reads under the active backend (for logs/docs). */
  function describe() {
    const out = {};
    for (const item of Object.keys(SCOUT_TABLES)) {
      const v = isRnd ? RND_VIEWS[item] : null;
      out[item] = v ? `rnd:${[].concat(v).join('+')}` : `scout:${SCOUT_TABLES[item][1]}`;
    }
    return out;
  }

  return {
    backend: mode,
    products, roster, selection, labelFacts, labelPanels, listingClaims, marketSignals,
    reviewThemes, rawReviews, webClaims, creativeVerdicts, deepResearch, p5Sources,
    packaging, productIntel, briefCurrent, briefWriteBase, productWriteBase, marketIntel,
    describe,
  };
}

module.exports = {
  createEvidenceSource, backendFromEnv, applyOps,
  BACKENDS, SCOUT_TABLES, RND_VIEWS,
  ROSTER_COLUMNS, LABEL_FACT_COLUMNS, P5_OCR_COLUMNS, P5_OCR_LEGACY_COLUMNS, P5_RESEARCH_COLUMNS, P5_KEEPA_COLUMNS, PACKAGING_COLUMNS,
};
