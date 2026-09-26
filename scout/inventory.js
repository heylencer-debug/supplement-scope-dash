/**
 * inventory.js — READ-FIRST inventory (Phase −1 / P0.5).
 *
 * Before any scrape, answer: "what does the database ALREADY hold for this
 * keyword?" — across every session of the keyword FAMILY, not just the exact
 * label this job was submitted under. submit-job.js labels every
 * re-submission "#N", and each session is isolated on purpose, so without
 * this step a new "electrolyte powder #6" run re-buys data that
 * "electrolyte powder #3" already paid for.
 *
 * READS ONLY. No inserts, updates, deletes, RPCs or phase spawns — ever.
 *
 *   node inventory.js --keyword "magnesium gummies"            (table)
 *   node inventory.js --keyword "magnesium gummies" --json     (JSON only)
 *   node inventory.js --keyword "electrolyte powder #6" --plan (table + plan)
 *     [--alias "electrolyte powders"]...  [--no-auto-aliases]
 *     [--fresh P3=45,P4=120]   (plan freshness overrides, see plan-scope.js)
 *
 * Programmatic:
 *   const { buildInventory } = require('./inventory');
 *   const inv = await buildInventory({ keyword, db, dash, aliases });
 *
 * buildInventory = fetchRaw (all DB reads) + assembleInventory (pure). The
 * pure half is what the unit tests exercise with fixtures.
 */

const path = require('path');
const {
  PHASE_META, normalizeKeyword, stripSession, sessionNumber, familyNames, isFamilyLabel, familyPrefixes,
} = require('./utils/phase-map');
const { resolveCategory } = require('./utils/category-resolver');
const { resolveRunAsins, measureVerifierMetrics, evaluateBars } = require('./utils/verifier-bars');

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_N = 40;
const TOP_K = 10;

// ─── small pure helpers ─────────────────────────────────────────────────────
function maxIso(...vals) {
  let best = null;
  for (const v of vals.flat()) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isNaN(t)) continue;
    if (best === null || t > Date.parse(best)) best = new Date(t).toISOString();
  }
  return best;
}
function ageDays(iso, now) {
  if (!iso) return null;
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);
}
function isRealModelText(t) {
  return typeof t === 'string' && t.trim().length > 0 && !t.trim().startsWith('[ERROR:');
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

// ─── DB reads ────────────────────────────────────────────────────────────────
async function fetchAll(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
async function fetchChunked(values, makeQuery, chunk = 100) {
  const out = [];
  for (let i = 0; i < values.length; i += chunk) {
    out.push(...await fetchAll(() => makeQuery(values.slice(i, i + chunk))));
  }
  return out;
}

/**
 * Every DB read the inventory needs, returned as plain row arrays. `db` is the
 * DOVIVE client (raw dovive_* tables + scout_jobs + ai_usage_log), `dash` the
 * DASH client (categories/products/formula_briefs). In this deployment both
 * point at the same Supabase project; they are kept separate only to mirror
 * run-pipeline.js's DASH_URL override.
 */
async function fetchRaw({ keyword, db, dash = db, aliases = [], autoAliases = true, warnings = [] }) {
  const names = familyNames(keyword, { aliases, autoAliases });
  const nameSet = new Set(names);
  const prefixes = familyPrefixes(names);

  // 1) Discover session labels: categories.search_term + dovive_research.keyword
  const catRows = [];
  const kwRows = [];
  for (const p of prefixes) {
    catRows.push(...await fetchAll(() => dash.from('categories')
      .select('id,name,search_term,created_at,total_products,is_test').ilike('search_term', `${p}%`)));
    kwRows.push(...await fetchAll(() => db.from('dovive_research').select('keyword').ilike('keyword', `${p}%`)));
  }
  const allLabels = uniq([...catRows.map(c => c.search_term), ...kwRows.map(r => r.keyword)].map(normalizeKeyword));
  const labels = allLabels.filter(l => isFamilyLabel(l, nameSet));
  const target = normalizeKeyword(keyword);
  if (!labels.includes(target)) labels.push(target); // own session (may not exist yet)
  const related = allLabels.filter(l => !isFamilyLabel(l, nameSet));

  // 2) Resolve each label → category with the pipeline's OWN resolver AND the
  //    pipeline's own input: the target exactly as submitted (KEYWORD), a
  //    sibling by the spelling stored in categories.search_term (the resolver's
  //    first step is an exact, case-sensitive match), else as stored in raw rows.
  const spellings = (label) => label === target ? [keyword]
    : uniq([...catRows.map(c => c.search_term), ...kwRows.map(r => r.keyword)].filter(x => normalizeKeyword(x) === label));
  const categories = [];
  for (const label of labels) {
    try {
      let cat = null; let lastErr = null;
      for (const spelled of spellings(label)) {
        try { cat = await resolveCategory(dash, spelled); break; } catch (e) { lastErr = e; }
      }
      if (!cat) throw lastErr || new Error(`No category candidates found for '${label}'`);
      const row = catRows.find(c => c.id === cat.id) || {};
      categories.push({ label, id: cat.id, name: cat.name, method: cat.method, created_at: row.created_at || null, is_test: !!row.is_test });
    } catch (e) {
      if (!/No category candidates found/.test(e.message)) warnings.push(`category resolve '${label}': ${e.message}`);
    }
  }
  const catIds = uniq(categories.map(c => c.id));

  // 2b) This session's verifier view, measured by the verifier's OWN code
  //     (utils/verifier-bars.js) so a planned `reuse` can never be a phase the
  //     final verifier / mid-run gates would fail.
  const ownCat = categories.find(c => c.label === target) || null;
  let verifier = null;
  if (ownCat) {
    const run = await resolveRunAsins({ DOVIVE: db, DASH: dash, keyword, categoryId: ownCat.id, warn: (m) => warnings.push(m.trim()) });
    const measured = await measureVerifierMetrics({ DOVIVE: db, DASH: dash, keyword, categoryId: ownCat.id, runAsins: run.live, runAsinsAll: run.all });
    const ownRA = await fetchAll(() => dash.from('products').select('asin').eq('category_id', ownCat.id).not('review_analysis', 'is', null));
    verifier = { runAsins: run, measured, ownReviewAnalysis: uniq(ownRA.map(r => r.asin)) };
  }
  // Raw tables store the label verbatim (case as submitted) and the pipeline
  // matches with ilike, so query every original-case spelling we saw.
  const rawLabels = uniq([...catRows.map(c => c.search_term), ...kwRows.map(r => r.keyword), keyword]
    .filter(l => isFamilyLabel(l, nameSet)));

  // 3) Raw per-session tables (keyword-keyed)
  const research = rawLabels.length ? await fetchAll(() => db.from('dovive_research')
    .select('asin,keyword,bsr,rank_position,scraped_at,brand,title').in('keyword', rawLabels)) : [];
  const reviews = rawLabels.length ? await fetchAll(() => db.from('dovive_reviews')
    .select('asin,keyword,scraped_at').in('keyword', rawLabels)) : [];
  const p5 = rawLabels.length ? await fetchAll(() => db.from('dovive_phase5_research')
    .select('asin,keyword,pool,researched_at').in('keyword', rawLabels).not('full_research', 'is', null)) : [];
  const packaging = rawLabels.length ? await fetchAll(() => db.from('dovive_packaging_intelligence')
    .select('keyword,generated_at,products_analyzed').in('keyword', rawLabels)) : [];

  // 4) DASH products in every family category (JSON paths keep payloads tiny)
  const products = catIds.length ? await fetchChunked(catIds, ids => dash.from('products')
    .select([
      'asin', 'parent_asin', 'category_id', 'title', 'brand', 'bsr_current', 'rank', 'monthly_sales', 'cohort',
      'nutrients_count', 'last_updated',
      'pi_at:marketing_analysis->product_intelligence->>analyzed_at',
      'pk_at:marketing_analysis->packaging_intelligence->>analyzed_at',
    ].join(',')).in('category_id', ids), 20) : [];

  // 5) ASIN-keyed raw tables (shared across sessions by design)
  const asins = uniq([...research.map(r => r.asin), ...products.map(p => p.asin)]);
  const keepa = await fetchChunked(asins, a => db.from('dovive_keepa')
    .select('asin,keyword,parsed_at,monthly_sales_est').in('asin', a));
  // (products.*_updated_at columns are deliberately NOT read: migrate scripts
  //  stamp them with now() even when they sync a SIBLING's old rows, so they
  //  say nothing about how fresh the underlying data is.)
  const ocr = await fetchChunked(asins, a => db.from('dovive_ocr')
    .select('asin,keyword,image_index,processed_at,first_fact:supplement_facts->0->>name').in('asin', a));

  // 6) Category-level deliverables. Only presence + dates are kept after the
  //    read; the long texts are fetched once per category and dropped.
  const briefs = catIds.length ? await fetchAll(() => dash.from('formula_briefs').select([
    'category_id', 'created_at', 'updated_at',
    'gen_at:ingredients->>generated_at', 'qa_at:ingredients->>qa_generated_at',
    'mi_at:ingredients->market_intelligence->>generated_at', 'mi:ingredients->market_intelligence->>ai_market_analysis',
    'brief:ingredients->>ai_generated_brief', 'qa:ingredients->>qa_report',
    'cb_at:ingredients->competitive_benchmarking->>generated_at',
    'cb_d:ingredients->competitive_benchmarking->>sonnet_draft', 'cb_v:ingredients->competitive_benchmarking->>opus_validation',
    'fc_at:ingredients->fda_compliance->>generated_at',
    'fc_a:ingredients->fda_compliance->>opus_analysis', 'fc_v:ingredients->fda_compliance->>sonnet_validation',
    'fs_at:ingredients->final_signoff->>generated_at', 'fs_r:ingredients->final_signoff->>opus_review',
    'fs_verdict:ingredients->final_signoff->>verdict',
  ].join(',')).in('category_id', catIds)) : [];
  const briefFlags = briefs.map(b => ({
    category_id: b.category_id, created_at: b.created_at, updated_at: b.updated_at,
    gen_at: b.gen_at, qa_at: b.qa_at, mi_at: b.mi_at, cb_at: b.cb_at, fc_at: b.fc_at, fs_at: b.fs_at, fs_verdict: b.fs_verdict,
    has_mi: isRealModelText(b.mi), has_brief: isRealModelText(b.brief), has_qa: !!(b.qa && String(b.qa).trim()),
    has_cb: isRealModelText(b.cb_d) && isRealModelText(b.cb_v),
    has_fc: isRealModelText(b.fc_a) && isRealModelText(b.fc_v),
    has_fs: isRealModelText(b.fs_r),
  }));

  // 7) Cost ledger (historical $ per phase for this family) — best-effort.
  let usage = [];
  try {
    usage = rawLabels.length ? await fetchAll(() => db.from('ai_usage_log')
      .select('keyword,phase,cost_usd,calls').in('keyword', rawLabels)) : [];
  } catch (e) { warnings.push(`ai_usage_log unreadable: ${e.message}`); }

  return {
    keyword, names, labels, related, categories, verifier,
    research, reviews, p5, packaging, products, keepa, ocr, briefs: briefFlags, usage,
  };
}

// ─── Pure assembly ───────────────────────────────────────────────────────────
/**
 * Turn raw rows into the inventory. Pure: same input → same output (pass `now`).
 * Every per-ASIN phase entry is `{ at, sessions, own, ownAt }`:
 *   at       freshest timestamp of that phase's data for the ASIN in ANY family session
 *   sessions session labels that hold it
 *   own      the TARGET session (the exact label of this job) already holds it
 *   ownAt    timestamp of the target session's copy
 */
function assembleInventory(raw, { now = new Date(), topN = TOP_N, topK = TOP_K, warnings = [] } = {}) {
  const target = normalizeKeyword(raw.keyword);
  const labelOf = (kw) => normalizeKeyword(kw);
  const catById = new Map(raw.categories.map(c => [c.id, c]));
  const ownCat = raw.categories.find(c => c.label === target) || null;

  // ── sessions ──
  const sessions = uniq([...raw.labels, ...raw.categories.map(c => c.label)]).map(label => {
    const rows = raw.research.filter(r => labelOf(r.keyword) === label);
    const cat = raw.categories.find(c => c.label === label) || null;
    return {
      label, session: sessionNumber(label), own: label === target,
      categoryId: cat?.id || null, categoryName: cat?.name || null, resolvedBy: cat?.method || null,
      isTest: !!cat?.is_test, createdAt: cat?.created_at || null,
      p1Asins: uniq(rows.map(r => r.asin)).length,
      dashProducts: cat ? raw.products.filter(p => p.category_id === cat.id).length : 0,
      lastScrapedAt: maxIso(rows.map(r => r.scraped_at)),
    };
  }).sort((a, b) => (a.label < b.label ? -1 : 1));

  // ── candidate ASIN set ──
  // The target session's own P1 set when it exists; otherwise the freshest
  // family session with P1 data (the best predictor of what P1 will return).
  const ownSession = sessions.find(s => s.own);
  let source = null; let basis = 'none';
  if (ownSession && ownSession.p1Asins > 0) { source = ownSession.label; basis = 'own-session'; }
  else {
    const withP1 = sessions.filter(s => s.p1Asins > 0 && !s.isTest)
      .sort((a, b) => Date.parse(b.lastScrapedAt || 0) - Date.parse(a.lastScrapedAt || 0));
    const fallback = withP1[0] || sessions.filter(s => s.p1Asins > 0)[0];
    if (fallback) { source = fallback.label; basis = 'freshest-sibling'; }
  }
  const bsrByAsin = new Map();
  for (const p of raw.products) {
    if (p.bsr_current == null) continue;
    const prev = bsrByAsin.get(p.asin);
    if (prev == null || p.bsr_current < prev) bsrByAsin.set(p.asin, p.bsr_current);
  }
  const srcRows = source ? raw.research.filter(r => labelOf(r.keyword) === source) : [];
  const seen = new Set();
  const ranked = srcRows.filter(r => (seen.has(r.asin) ? false : seen.add(r.asin)))
    .map(r => ({ asin: r.asin, bsr: bsrByAsin.get(r.asin) ?? r.bsr ?? null, rank: r.rank_position ?? null }))
    .sort((a, b) => {
      const ab = a.bsr ?? Infinity; const bb = b.bsr ?? Infinity;
      if (ab !== bb) return ab - bb;
      return (a.rank ?? Infinity) - (b.rank ?? Infinity);
    });
  const top40 = ranked.slice(0, topN).map(r => r.asin);
  const top10 = ranked.slice(0, topK).map(r => r.asin);

  // ── per-ASIN phase presence ──
  const ownLabel = target;
  const catLabel = (id) => catById.get(id)?.label || null;
  const byAsin = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.asin)) m.set(r.asin, []); m.get(r.asin).push(r); } return m; };
  const researchBy = byAsin(raw.research);
  const reviewsBy = byAsin(raw.reviews);
  const p5By = byAsin(raw.p5);
  const productsBy = byAsin(raw.products);
  const keepaBy = byAsin(raw.keepa);
  const ocrBy = byAsin(raw.ocr.filter(o => o.first_fact));

  // Freshness comes ONLY from the raw rows the data was built from (or the
  // phase's own analyzed_at stamp for P6/P8): never from products.*_updated_at,
  // which migrate scripts set to now() even when they sync a sibling's old rows.
  // A missing raw timestamp means "unknown", and unknown is treated as stale.
  //   at        freshest timestamp anywhere (family, or by ASIN for P2/P4)
  //   own       THIS session holds the artefact the way the verifier counts it
  //   ownAt     timestamp of THIS session's copy (null = unknown = stale)
  //   siblingAt freshest copy THIS session could read without scraping
  //             (P2/P4: any session, the tables are keyed by ASIN; P3: sibling
  //             sessions' own review rows; others: informational only)
  const BY_ASIN = 'by ASIN (any session)';
  const ownReviewAnalysis = new Set(raw.verifier?.ownReviewAnalysis || []);
  const entry = ({ parts, own, ownAt, siblingAt, extra = {} }) => {
    const valid = parts.filter(p => p && (p.at || p.session));
    if (!valid.length && !own) return null;
    return {
      at: maxIso(valid.map(p => p.at)),
      sessions: uniq([...valid.map(p => p.session), own ? ownLabel : null]),
      own: !!own,
      ownAt: own ? (ownAt || null) : null,
      siblingAt: siblingAt || null,
      ...extra,
    };
  };

  const phaseEntriesFor = (asin) => {
    const prods = productsBy.get(asin) || [];
    const ownProd = ownCat ? prods.find(p => p.category_id === ownCat.id) : null;
    const res = researchBy.get(asin) || [];
    const kp = keepaBy.get(asin) || [];
    const oc = ocrBy.get(asin) || [];
    const rv = reviewsBy.get(asin) || [];
    const p5r = p5By.get(asin) || [];
    const isOwn = (kw) => labelOf(kw) === ownLabel;
    const keepaAt = maxIso(kp.map(k => k.parsed_at));
    const keepaSalesAt = maxIso(kp.filter(k => k.monthly_sales_est != null).map(k => k.parsed_at));
    const ocrAt = maxIso(oc.map(o => o.processed_at));
    const otherCats = prods.filter(p => p !== ownProd);

    return {
      // P1 counts as "own" only once the product also landed in this session's
      // DASH category (the verifier's P1-migration check reads DASH, not raw).
      P1: entry({
        parts: res.map(r => ({ at: r.scraped_at, session: labelOf(r.keyword) })),
        own: !!ownProd && res.some(r => isOwn(r.keyword)),
        ownAt: maxIso(res.filter(r => isOwn(r.keyword)).map(r => r.scraped_at)),
        siblingAt: maxIso(res.filter(r => !isOwn(r.keyword)).map(r => r.scraped_at)),
      }),
      P2: entry({
        parts: kp.map(k => ({ at: k.parsed_at, session: BY_ASIN })),
        own: !!ownProd && ownProd.monthly_sales != null,
        ownAt: keepaAt,
        siblingAt: keepaSalesAt, // migrate-keepa only lands monthly_sales when Keepa had an estimate
        extra: { sales: !!keepaSalesAt },
      }),
      P3: entry({
        parts: rv.map(r => ({ at: r.scraped_at, session: labelOf(r.keyword) })),
        own: ownReviewAnalysis.has(asin),
        ownAt: maxIso(rv.filter(r => isOwn(r.keyword)).map(r => r.scraped_at)),
        siblingAt: maxIso(rv.filter(r => !isOwn(r.keyword)).map(r => r.scraped_at)),
      }),
      P4: entry({
        parts: oc.map(o => ({ at: o.processed_at, session: BY_ASIN })),
        own: !!ownProd && (ownProd.nutrients_count || 0) > 0,
        ownAt: ocrAt,
        siblingAt: ocrAt,
      }),
      P5: entry({
        parts: p5r.map(r => ({ at: r.researched_at, session: labelOf(r.keyword) })),
        own: p5r.some(r => isOwn(r.keyword)),
        ownAt: maxIso(p5r.filter(r => isOwn(r.keyword)).map(r => r.researched_at)),
        siblingAt: maxIso(p5r.filter(r => !isOwn(r.keyword)).map(r => r.researched_at)),
      }),
      P6: entry({
        parts: prods.filter(p => p.pi_at).map(p => ({ at: p.pi_at, session: catLabel(p.category_id) })),
        own: !!ownProd?.pi_at, ownAt: ownProd?.pi_at,
        siblingAt: maxIso(otherCats.map(p => p.pi_at)),
      }),
      P8: entry({
        parts: prods.filter(p => p.pk_at).map(p => ({ at: p.pk_at, session: catLabel(p.category_id) })),
        own: !!ownProd?.pk_at, ownAt: ownProd?.pk_at,
        siblingAt: maxIso(otherCats.map(p => p.pk_at)),
      }),
    };
  };

  const ownAsins = ownCat ? raw.products.filter(p => p.category_id === ownCat.id).map(p => p.asin) : [];
  const mapAsins = uniq([...top40, ...ownAsins]);
  const products = {};
  for (const asin of mapAsins) {
    const prods = productsBy.get(asin) || [];
    const res = researchBy.get(asin) || [];
    products[asin] = {
      parent_asin: prods.find(p => p.parent_asin)?.parent_asin || null,
      brand: prods.find(p => p.brand)?.brand || res.find(r => r.brand)?.brand || null,
      bsr: bsrByAsin.get(asin) ?? null,
      top40: top40.includes(asin), top10: top10.includes(asin),
      inOwnCategory: !!ownCat && prods.some(p => p.category_id === ownCat.id),
      sessions: uniq([...res.map(r => labelOf(r.keyword)), ...prods.map(p => catLabel(p.category_id))]),
      lastUpdated: maxIso(prods.map(p => p.last_updated)), // informational only — never used as freshness
      phases: phaseEntriesFor(asin),
    };
  }

  // ── per-phase summaries ──
  const summarize = (key, set) => {
    const es = set.map(a => products[a]?.phases?.[key]).filter(Boolean);
    const freshest = maxIso(es.map(e => e.at));
    return {
      have: es.length, of: set.length, freshest, staleDays: ageDays(freshest, now),
      oldest: es.length ? es.map(e => e.at).filter(Boolean).sort()[0] || null : null,
      sourceSessions: uniq(es.flatMap(e => e.sessions)),
      own: es.filter(e => e.own).length,
    };
  };
  const catPhaseDef = {
    // generated_at stamps only — formula_briefs.updated_at moves whenever ANY
    // later phase writes the row, so it says nothing about this phase's age.
    P7: b => b.has_mi && (b.mi_at || true),
    P9: b => b.has_brief && (b.gen_at || b.created_at),
    P10: b => b.has_qa && (b.qa_at || true),
    P11: b => b.has_cb && (b.cb_at || true),
    P12: b => b.has_fc && (b.fc_at || true),
    P13: b => b.has_fs && (b.fs_at || true),
  };
  const phases = {};
  for (const m of PHASE_META) {
    if (m.level === 'asin') {
      phases[m.key] = { name: m.name, level: m.level, marker: m.marker, top40: summarize(m.key, top40), top10: summarize(m.key, top10) };
      if (m.key === 'P8') {
        phases[m.key].reports = raw.packaging.map(r => ({ session: labelOf(r.keyword), at: r.generated_at, products: r.products_analyzed }));
      }
    } else {
      const holders = [];
      for (const b of raw.briefs) {
        const at = catPhaseDef[m.key](b);
        if (!at) continue;
        const label = catLabel(b.category_id);
        holders.push({ session: label, at: typeof at === 'string' ? at : null, own: !!ownCat && b.category_id === ownCat.id, verdict: m.key === 'P13' ? b.fs_verdict || null : undefined });
      }
      const ownH = holders.filter(h => h.own);
      const freshest = maxIso(holders.map(h => h.at));
      phases[m.key] = {
        name: m.name, level: m.level, marker: m.marker,
        have: uniq(holders.map(h => h.session)).length, of: sessions.filter(s => s.categoryId).length,
        freshest, staleDays: ageDays(freshest, now), sourceSessions: uniq(holders.map(h => h.session)),
        own: ownH.length ? { at: maxIso(ownH.map(h => h.at)), staleDays: ageDays(maxIso(ownH.map(h => h.at)), now) } : null,
        holders,
      };
    }
  }

  // ── cost history (per phase, for this family) ──
  const costHistory = {};
  const p1BySession = new Map(sessions.map(s => [s.label, s.p1Asins]));
  for (const u of raw.usage || []) {
    const k = u.phase; if (!k) continue;
    costHistory[k] = costHistory[k] || { usd: 0, calls: 0, sessions: new Set() };
    costHistory[k].usd += Number(u.cost_usd) || 0;
    costHistory[k].calls += Number(u.calls) || 1;
    costHistory[k].sessions.add(labelOf(u.keyword));
  }
  for (const [k, v] of Object.entries(costHistory)) {
    const sess = [...v.sessions];
    const asinsTouched = sess.reduce((n, s) => n + (p1BySession.get(s) || 0), 0);
    costHistory[k] = {
      usd: Math.round(v.usd * 1e4) / 1e4, calls: v.calls, sessions: sess.length,
      usdPerSession: Math.round((v.usd / sess.length) * 1e4) / 1e4,
      usdPerAsin: asinsTouched ? Math.round((v.usd / asinsTouched) * 1e5) / 1e5 : null,
    };
  }

  return {
    keyword: raw.keyword, targetSession: target, base: stripSession(target), familyNames: raw.names,
    generatedAt: now.toISOString(),
    targetExists: !!(ownSession && (ownSession.p1Asins > 0 || ownSession.categoryId)),
    ownCategoryId: ownCat?.id || null,
    categoryAsins: ownAsins,
    // The final verifier's own measurements for THIS session + its bars
    // (utils/verifier-bars.js). plan-scope.js refuses `reuse` unless these pass.
    verifier: raw.verifier ? {
      runAsins: raw.verifier.runAsins,
      measured: raw.verifier.measured,
      bars: evaluateBars(raw.verifier.measured).byPhase,
    } : null,
    sessions, relatedKeywords: raw.related,
    candidates: { source, basis, top40, top10, universe: uniq(raw.research.map(r => r.asin)).length },
    phases, products, costHistory, warnings,
  };
}

const DEFAULT_TIMEOUT_MS = 90000;

/** Rejects after `ms` — a hung read must never hold a job (the pipeline fails open on it). */
function withTimeout(promise, ms, what = 'inventory reads') {
  if (!ms || ms <= 0) return promise;
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function buildInventory({ keyword, db, dash, aliases = [], autoAliases = true, now = new Date(), topN = TOP_N, topK = TOP_K,
  timeoutMs = Number(process.env.SCOUT_PLAN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS }) {
  if (!keyword) throw new Error('buildInventory: keyword is required');
  if (!db) throw new Error('buildInventory: db (supabase client) is required');
  const warnings = [];
  const raw = await withTimeout(fetchRaw({ keyword, db, dash: dash || db, aliases, autoAliases, warnings }), timeoutMs);
  return assembleInventory(raw, { now, topN, topK, warnings });
}

// ─── Printing ────────────────────────────────────────────────────────────────
function pad(s, n) { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function day(iso) { return iso ? iso.slice(0, 10) : '—'; }

function formatInventory(inv) {
  const L = [];
  L.push(`READ-FIRST inventory — "${inv.keyword}"  (family: ${inv.familyNames.join(' | ')})`);
  L.push(`Candidates: ${inv.candidates.top40.length} top-40 / ${inv.candidates.top10.length} top-10 from ${inv.candidates.source ? `"${inv.candidates.source}" (${inv.candidates.basis})` : 'nothing — no P1 data in the family'}; family universe ${inv.candidates.universe} ASINs`);
  L.push('');
  L.push('Sessions:');
  for (const s of inv.sessions) {
    L.push(`  ${s.own ? '*' : ' '} ${pad(s.label, 34)} P1 ${pad(s.p1Asins, 4)} DASH ${pad(s.dashProducts, 4)} last scrape ${day(s.lastScrapedAt)}${s.isTest ? '  [test]' : ''}${s.categoryId ? '' : '  (no category)'}`);
  }
  if (inv.relatedKeywords.length) L.push(`  related, NOT counted (pass --alias to include): ${inv.relatedKeywords.join(', ')}`);
  L.push('');
  L.push(`${pad('Phase', 30)}${pad('top-40', 10)}${pad('top-10', 10)}${pad('own', 8)}${pad('freshest', 12)}${pad('age d', 7)}sources`);
  for (const m of PHASE_META) {
    const p = inv.phases[m.key];
    if (p.level === 'asin') {
      L.push(`${pad(`${m.key} ${m.name}`, 30)}${pad(`${p.top40.have}/${p.top40.of}`, 10)}${pad(`${p.top10.have}/${p.top10.of}`, 10)}${pad(`${p.top40.own}/${p.top40.of}`, 8)}${pad(day(p.top40.freshest), 12)}${pad(p.top40.staleDays ?? '—', 7)}${p.top40.sourceSessions.join(', ') || '—'}`);
    } else {
      L.push(`${pad(`${m.key} ${m.name}`, 30)}${pad(`${p.have} sess`, 20)}${pad(p.own ? 'yes' : 'no', 8)}${pad(day(p.freshest), 12)}${pad(p.staleDays ?? '—', 7)}${p.sourceSessions.join(', ') || '—'}`);
    }
  }
  if (inv.verifier) {
    const m = inv.verifier.measured;
    L.push('', `Final verifier, this session (run ASINs ${m.runAsinsCount}/${m.runAsinsAllCount} live, category ${m.total}, own raw reviews ${m.reviewRowsTotal}):`);
    L.push('  ' + Object.entries(inv.verifier.bars).map(([k, b]) => `${k} ${b.pass ? `ok${b.via ? ` (${b.via})` : ''}` : 'FAIL'}`).join(' · '));
    for (const [k, b] of Object.entries(inv.verifier.bars)) if (!b.pass) L.push(`  ${k}: ${b.msg}`);
  } else {
    L.push('', 'Final verifier: no DASH category for this session yet (nothing to measure until P1).');
  }
  const ch = Object.entries(inv.costHistory);
  if (ch.length) L.push('', `AI cost ledger for this family: ${ch.map(([k, v]) => `${k} $${v.usd} (${v.sessions} sess)`).join(' · ')}`);
  if (inv.warnings.length) L.push('', ...inv.warnings.map(w => `⚠ ${w}`));
  return L.join('\n');
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
function argValues(argv, flag) {
  const out = [];
  argv.forEach((a, i) => { if (a === flag && argv[i + 1]) out.push(argv[i + 1]); });
  return out;
}

async function main(argv = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  const { createClient } = require('@supabase/supabase-js');
  const keyword = argValues(argv, '--keyword')[0];
  if (!keyword) {
    console.error('Usage: node inventory.js --keyword "magnesium gummies" [--json] [--plan] [--alias "..."] [--no-auto-aliases] [--fresh P3=45,P4=120]');
    process.exit(1);
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const dash = createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
  const inv = await buildInventory({
    keyword, db, dash,
    aliases: argValues(argv, '--alias'),
    autoAliases: !argv.includes('--no-auto-aliases'),
  });
  let plan = null;
  if (argv.includes('--plan')) {
    const { planScope, freshnessFromEnv, formatPlan } = require('./plan-scope');
    plan = planScope(inv, { freshnessDays: freshnessFromEnv(process.env, argValues(argv, '--fresh')[0]) });
    if (!argv.includes('--json')) console.log(`${formatInventory(inv)}\n\n${formatPlan(plan)}\n`);
  } else if (!argv.includes('--json')) {
    console.log(`${formatInventory(inv)}\n`);
  }
  const payload = plan ? { inventory: inv, plan } : inv;
  console.log(argv.includes('--json') ? JSON.stringify(payload, null, 2) : `JSON:\n${JSON.stringify(payload)}`);
}

if (require.main === module) {
  main().catch(e => { console.error(`inventory failed: ${e.message}`); process.exit(1); });
}

module.exports = { buildInventory, fetchRaw, assembleInventory, formatInventory, withTimeout, TOP_N, TOP_K };
