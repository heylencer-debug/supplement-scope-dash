/**
 * utils/verifier-bars.js — the final verifier's measurements and bars, in ONE
 * place, shared by run-pipeline.js (runFinalVerifier, and so the mid-run
 * gates) and by the READ-FIRST inventory/plan.
 *
 * Why shared: the plan may only skip a phase (`reuse`) if the verifier would
 * already pass that phase for THIS session. If the plan used its own notion of
 * "complete" (top-40 coverage) it could skip P3 at 28/40 while the verifier
 * measures 29/131 — and the run then dies at a gate with nothing left to fill
 * the gap. Measuring and judging with the same code makes that impossible.
 *
 *   resolveRunAsins        = run-pipeline's getRunAsins + getLiveRunAsins (no cache)
 *   measureVerifierMetrics = the queries runFinalVerifier runs
 *   evaluateBars           = the thresholds runFinalVerifier applies (pure)
 */

const { loadSelection, scopeToSelection, top20Need } = require('./selected-competitors');

const BARS = Object.freeze({
  P1_MIGRATION_MIN: 0.6,     // live run ASINs / scraped run ASINs
  P2_MIN: 0.9,               // of runTotal
  P3_MIN: 0.5,               // of runTotal …
  P3_TOP20_MIN: 15,          // … or top-20 ≥ 15 AND
  P3_MIN_REVIEWS_TOTAL: 200, // this session's OWN dovive_reviews rows ≥ 200
  P4_MIN: 0.8,               // of the WHOLE category …
  P4_TOP20_MIN: 15,          // … or top-20 ≥ 15
  P6_MIN: 0.9,               // of the WHOLE category
  P8_MIN: 0.9,               // of runTotal
});

function p5Targets(env = process.env) {
  const p5Target = (parseInt(env.P5_TOP_COUNT || '5', 10) + parseInt(env.P5_NEW_COUNT || '3', 10));
  const p5Min = Math.min(p5Target, Math.max(6, Math.ceil(p5Target * 0.75)));
  return { p5Target, p5Min };
}

function isRealModelText(t) {
  return typeof t === 'string' && t.trim().length > 0 && !t.trim().startsWith('[ERROR:');
}

/**
 * GATE POOL CAP (2026-09-26). P1 now keeps an ~80-listing candidate pool so
 * the competitor selection (migration 011) can pick 40. Until that selection
 * is populated, P3 (30 ASINs) and P4 (20) still process the top of the pool
 * by BSR — measuring them against all 80 made the P3 coverage gate
 * unreachable (28/80 on "magnesium gummies #2"). With NO active selection the
 * run-scoped gates therefore measure against the pool's top
 * SCOUT_GATE_POOL_CAP (default 40 — the old P1 cap) by BSR, which is exactly
 * the set those phases work through. With a selection active the gates are
 * scoped to the selection instead (see measureVerifierMetrics).
 */
const GATE_POOL_CAP = Math.max(1, parseInt(process.env.SCOUT_GATE_POOL_CAP || '40', 10));
function capGatePool(liveAsins, productRows, cap = GATE_POOL_CAP) {
  if (liveAsins.length <= cap) return liveAsins;
  const bsr = new Map();
  for (const r of productRows || []) if (r && r.asin && !bsr.has(r.asin)) bsr.set(r.asin, r.bsr_current == null ? Infinity : Number(r.bsr_current));
  const order = new Map(liveAsins.map((a, i) => [a, i]));
  return [...liveAsins]
    .sort((a, b) => ((bsr.get(a) ?? Infinity) - (bsr.get(b) ?? Infinity)) || (order.get(a) - order.get(b)))
    .slice(0, cap);
}

async function resolveRunAsins({ DOVIVE, DASH, keyword, categoryId, warn = console.warn }) {
  let all = [];
  try {
    const { data, error } = await DOVIVE.from('dovive_research').select('asin').eq('keyword', keyword);
    if (error) throw error;
    all = [...new Set((data || []).map(r => r.asin).filter(Boolean))];
  } catch (e) {
    warn(`  ⚠️ getRunAsins() failed (${e.message}) — falling back to whole-category scoping`);
    all = [];
  }
  let result = { live: all, all };
  if (all.length && categoryId) {
    try {
      const liveAsins = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await DASH.from('products').select('asin').eq('category_id', categoryId).range(from, from + 999);
        if (error) throw error;
        liveAsins.push(...(data || []).map(r => r.asin));
        if (!data || data.length < 1000) break;
      }
      const liveSet = new Set(liveAsins);
      result = { live: all.filter(a => liveSet.has(a)), all };
      if (result.live.length > GATE_POOL_CAP) {
        const sel = await loadSelection(DASH, categoryId);
        if (!sel.active) {
          const rows = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await DASH.from('products').select('asin, bsr_current').eq('category_id', categoryId).in('asin', result.live).range(from, from + 999);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < 1000) break;
          }
          const capped = capGatePool(result.live, rows);
          warn(`  ℹ️ run-scoped gates measure the pool's top ${capped.length} by BSR (no competitor selection yet; ${result.live.length} in the pool)`);
          result = { live: capped, all, pool: result.live };
        }
      }
    } catch (e) {
      warn(`  ⚠️ getLiveRunAsins failed (${e.message}) — falling back to full run-ASIN list`);
    }
  }
  return result;
}

async function measureVerifierMetrics({ DOVIVE, DASH, keyword, categoryId, runAsins, runAsinsAll, env = process.env }) {
  const { count: total } = await DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId);
  // Competitor selection (migration 011): when populated, P3/P4's top-20 and
  // P6's coverage are measured over the SELECTED competitors (what those
  // phases now process) instead of top-20-by-BSR / the whole category.
  // Inactive selection → every query below is exactly as before.
  const selection = await loadSelection(DASH, categoryId);
  const selectionSize = selection.active ? selection.ranks.size : 0;
  const q = async (col) => (await DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId).not(col, 'is', null)).count || 0;
  const scopedQ = async (col) => {
    let query = DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId).not(col, 'is', null);
    if (runAsins.length) query = query.in('asin', runAsins);
    return (await query).count || 0;
  };
  const runTotal = runAsins.length || total;

  const p2 = await scopedQ('monthly_sales');
  const p3 = await scopedQ('review_analysis');
  const p4 = (await DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId).gt('nutrients_count', 0)).count || 0;
  const { p5Target, p5Min } = p5Targets(env);
  const p5 = (await DOVIVE.from('dovive_phase5_research')
    .select('*', { count: 'exact', head: true })
    .ilike('keyword', keyword)
    .not('full_research', 'is', null)).count || 0;
  const p6 = selection.active
    ? ((await scopeToSelection(DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId).not('marketing_analysis', 'is', null), selection)).count || 0)
    : await q('marketing_analysis');
  const p6Total = selection.active ? selectionSize : total;
  const p8 = await (async () => {
    let query = DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId).filter('marketing_analysis->packaging_intelligence', 'not.is', null);
    if (runAsins.length) query = query.in('asin', runAsins);
    return (await query).count || 0;
  })();

  let top20Query = scopeToSelection(DASH.from('products').select('asin, nutrients_count, review_analysis').eq('category_id', categoryId), selection).not('bsr_current', 'is', null).order('bsr_current', { ascending: true }).limit(20);
  if (runAsins.length) top20Query = top20Query.in('asin', runAsins);
  const { data: top20 } = await top20Query;
  const top20P4 = (top20 || []).filter(x => (x.nutrients_count || 0) > 0).length;
  const top20P3 = (top20 || []).filter(x => x.review_analysis != null).length;

  const { data: fb } = await DASH.from('formula_briefs').select('ingredients').eq('category_id', categoryId).single();
  const cb11 = fb?.ingredients?.competitive_benchmarking;
  const fc12 = fb?.ingredients?.fda_compliance;
  const fs13 = fb?.ingredients?.final_signoff;

  const { count: reviewRowsTotal } = await DOVIVE.from('dovive_reviews').select('*', { count: 'exact', head: true }).ilike('keyword', keyword);

  return {
    total, runTotal, runAsinsCount: runAsins.length, runAsinsAllCount: runAsinsAll.length,
    p2, p3, p4, p5, p5Target, p5Min, p6, p6Total, p8,
    selectionActive: selection.active, selectionSize, top20Need: top20Need(selection),
    p7: !!(fb?.ingredients?.market_intelligence?.ai_market_analysis),
    p9: !!(fb?.ingredients?.ai_generated_brief),
    p10: !!(fb?.ingredients?.qa_report),
    p11: !!cb11 && isRealModelText(cb11.sonnet_draft) && isRealModelText(cb11.opus_validation),
    p12: !!fc12 && isRealModelText(fc12.opus_analysis) && isRealModelText(fc12.sonnet_validation),
    p13: !!fs13 && isRealModelText(fs13.opus_review),
    top20P3, top20P4, top20Asins: (top20 || []).map(x => x.asin),
    reviewRowsTotal: reviewRowsTotal || 0,
  };
}

/**
 * Calibration notes carried over verbatim from runFinalVerifier (run-pipeline.js)
 * when its measurements and bars moved here:
 *
 * Run-scoped P2/P3/P8 (see getRunAsins()/checkPhaseStatus comment above —
 * same root cause + same fix, applied here so the final verifier and the
 * per-phase gate agree). `total` above is intentionally left as the whole
 * accumulated category count for P4/P6 (unchanged, out of this task's
 * explicit scope) and for the top-level `total` reported in metrics.
 * P5 data lives in dovive_phase5_research (DOVIVE DB), not in DASH products table.
 * Gate on rows that actually HAVE content (full_research non-null), not just row
 * existence — see checkPhaseStatus case 5 comment for the full "P5 too heavy" /
 * save-strip-bug context.
 * Session-isolation fix (2026-09-01): exact match, not a first-word
 * substring (see checkPhaseStatus's matching comment).
 * P11/P12 (2026-08-28): check the deliverable is genuinely complete (real
 * draft/primary text AND real validation text), not one arbitrary
 * intermediate field — see isRealModelText() above.
 * Migration-loss guard: the live-ASIN denominator above cannot be allowed
 * to mask a migration that dropped most of the run's products (e.g. the
 * hydration onConflict bug: 3/139 live would otherwise gate as 3/3 = 100%).
 * P3 top20 CORRECTED 2026-08-28 (coordinator-verified against job config +
 * logs, superseding the earlier "unset credential" theory): BRIGHTDATA_API_KEY
 * WAS bound on the Cloud Run job (secretKeyRef -> scout-brightdata-key), and
 * the run logs confirm the fallback DID engage and complete ("Bright Data
 * reviews fallback done. 24/30 ASINs got reviews (1426 total)"). The 4
 * top-20 misses (B0FD3KBQWH, B0B2PKZVBH, B0F55ZNP9P, B095XB8XJT) WERE
 * processed by the fallback but Bright Data's reviews dataset itself
 * returned zero records for those specific ASINs. So this is a genuine
 * per-ASIN Bright Data coverage gap (~80-85% observed), not a fixable
 * credential/ops issue: Playwright is bot-walled from Cloud Run's
 * datacenter IPs (the primary path), and Bright Data simply doesn't have
 * reviews indexed for every SKU. A strict 20/20 gate would fail forever on
 * any run with a few uncoverable top products. Calibrated to top20 >= 15
 * (75%, tolerates ~3-5 genuinely uncovered top SKUs) AND total category
 * reviews >= 200 (a non-trivial volume threshold that still fails hard if
 * the fallback silently didn't fire at all, e.g. missing/invalid key ->
 * near-zero reviews overall).
 * Session-isolation fix (2026-09-01): exact match, not a first-word
 * substring (see checkPhaseStatus's matching comment) — otherwise a
 * sibling session's review volume masks a fresh session's real P3 gap.
 * P4 top20 relaxed 20 → 18 (2026-08-28 "ashwagandha gummies" investigation,
 * 138 products): the 2 top-20 misses (B092H5DCJM, B094T131B4 — both Goli
 * Ashwagandha & Vitamin D Gummy SKUs) have bullet_points containing only
 * marketing/certification claims with zero dosage/supplement-facts content;
 * GPT-4o correctly returned 0 facts. Confirmed real Amazon-side gap, not a
 * P4 extraction bug — see checkPhaseStatus's case 4 for the full evidence.
 * Relaxed further 18 → 15 (2026-08-29): electrolyte powder (16/20) and
 * magnesium (17/20) both failed on top sellers that genuinely publish no
 * supplement-facts image or dosage bullets (LMNT-style sticks) — same
 * real-world ceiling class as P3. 15/20 (75%) tolerates that class of real gap while still failing hard on
 * genuinely broken coverage (e.g. 5/20).
 * P5 was deliberately slimmed (2026-08-28, "P5 too heavy" decision) from
 * Top10+Top10=20 to P5_TOP_COUNT+P5_NEW_COUNT (default 5+3=8 products) —
 * see phase5-deep-research.js. The old hardcoded `>= 20` gate is stale and
 * would fail every slim run forever. Now passes when P5 rows WITH REAL
 * CONTENT (full_research non-null — never just row existence, so the fixed
 * save-strip bug that used to produce empty rows can't silently satisfy
 * this gate again) reach >= 75% of the configured target (min 6), tolerating
 * occasional per-product AI/scrape failures without masking a broken run.
 */

/**
 * Pure. `m` is measureVerifierMetrics' output (or a projection of it).
 * Returns the verifier's failure strings (unchanged wording) and a per-phase
 * pass/fail. The P1-migration check is not tied to a phase in the verifier; it
 * is reported as P1 here and also in `failures` whatever the scope.
 */
function evaluateBars(m, scopePhases = null) {
  const inScope = (n) => !scopePhases || scopePhases.includes(n);
  const B = BARS;
  const byPhase = {};
  const failures = [];
  const add = (n, pass, msg) => {
    byPhase[`P${n}`] = { pass, msg: pass ? null : msg };
    if (!pass && inScope(n)) failures.push(msg);
  };

  const p1Pass = !(m.runAsinsAllCount && m.runAsinsCount < m.runAsinsAllCount * B.P1_MIGRATION_MIN);
  byPhase.P1 = { pass: p1Pass, msg: p1Pass ? null : `P1 migration incomplete: only ${m.runAsinsCount}/${m.runAsinsAllCount} scraped ASINs exist in DASH` };
  if (!p1Pass) failures.push(byPhase.P1.msg);

  add(2, m.p2 >= m.runTotal * B.P2_MIN, `P2 ${m.p2}/${m.runTotal} (this run) < 90%`);
  // Top-20 floor: 15 (B.P3_TOP20_MIN / B.P4_TOP20_MIN), or 75% of a smaller
  // competitor selection — a category can legitimately select fewer than 20
  // and the floor never pads it (utils/selected-competitors.js top20Need).
  const need3 = m.selectionActive ? Math.min(B.P3_TOP20_MIN, m.top20Need) : B.P3_TOP20_MIN;
  const need4 = m.selectionActive ? Math.min(B.P4_TOP20_MIN, m.top20Need) : B.P4_TOP20_MIN;
  const p3Cov = m.p3 >= m.runTotal * B.P3_MIN;
  const p3Top = m.top20P3 >= need3 && (m.reviewRowsTotal || 0) >= B.P3_MIN_REVIEWS_TOTAL;
  add(3, p3Cov || p3Top,
    `P3 ${m.p3}/${m.runTotal} (this run) < 50% and Top20 ${m.top20P3}/20 (raw reviews=${m.reviewRowsTotal || 0}, need top20>=${need3} and raw>=${B.P3_MIN_REVIEWS_TOTAL})`);
  const p4Cov = m.p4 >= m.total * B.P4_MIN;
  const p4Top = m.top20P4 >= need4;
  add(4, p4Cov || p4Top, `P4 ${m.p4}/${m.total} and Top20 ${m.top20P4}/20 (need top20>=${need4})`);
  // Which path carried the pass: a pass that rests only on the top-20 path
  // depends on BSR ranking, which a Keepa refresh (P2) changes mid-run.
  byPhase.P3.via = p3Cov ? 'coverage' : p3Top ? 'top20' : null;
  byPhase.P4.via = p4Cov ? 'coverage' : p4Top ? 'top20' : null;
  add(5, m.p5 >= m.p5Min, `P5 ${m.p5}/${m.p5Target} (need >= ${m.p5Min} with content)`);
  const p6Total = m.p6Total ?? m.total;
  add(6, m.p6 >= p6Total * B.P6_MIN, `P6 ${m.p6}/${p6Total}${m.selectionActive ? ' (selected)' : ''} < 90%`);
  add(7, !!m.p7, 'P7 market_intelligence missing');
  add(8, m.p8 >= m.runTotal * B.P8_MIN, `P8 ${m.p8}/${m.runTotal} (this run) < 90%`);
  add(9, !!m.p9, 'P9 ai_generated_brief missing');
  add(10, !!m.p10, 'P10 qa_report missing');
  add(11, !!m.p11, 'P11 competitive_benchmarking missing');
  add(12, !!m.p12, 'P12 fda_compliance missing');
  add(13, !!m.p13, 'P13 final_signoff missing');
  return { pass: failures.length === 0, failures, byPhase };
}

module.exports = { BARS, GATE_POOL_CAP, capGatePool, p5Targets, resolveRunAsins, measureVerifierMetrics, evaluateBars, isRealModelText };
