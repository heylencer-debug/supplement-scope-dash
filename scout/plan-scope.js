/**
 * plan-scope.js — turn a READ-FIRST inventory (inventory.js) into a per-phase
 * plan. PURE: no I/O, no clock reads beyond `now` (defaults to the
 * inventory's generatedAt), unit-tested in test/plan-scope.test.js.
 *
 * Decisions (one per phase, each with a one-line reason):
 *   reuse   the data is present, fresh and complete enough to skip the phase.
 *           source 'session' → THIS session already holds it: skip outright.
 *           source 'family'  → a SIBLING session holds it and this phase can
 *                              read it across sessions without copying rows:
 *                              run only the no-cost migrate step (syncScripts).
 *   top-up  some of it is fresh, the rest is missing/stale: run the phase so it
 *           processes only what is missing. `work.asins` lists those ASINs;
 *           `reuseAsins` lists family-fresh ASINs the scrapers may skip
 *           (SCOUT_REUSE_ASINS, honoured by P3/P4 producers).
 *   refresh everything present is older than the freshness window (or, for a
 *           category-level synthesis phase, its inputs are changing this run).
 *   scrape  nothing usable exists: run the phase from nothing ("generate" for
 *           AI phases — same thing, it is the full-cost path).
 *
 * Freshness windows (days), overridable per phase:
 *   env  SCOUT_FRESH_P3=45   or   SCOUT_FRESHNESS_DAYS='{"P3":45,"P4":120}'
 *   CLI  --fresh P3=45,P4=120
 */

const { PHASE_META } = require('./utils/phase-map');
const { evaluateBars } = require('./utils/verifier-bars');

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_FRESHNESS_DAYS = {
  P1: 14, P2: 7, P3: 30, P4: 90, P5: 60, P6: 60,
  P7: 30, P8: 60, P9: 30, P10: 30, P11: 30, P12: 30, P13: 30,
};

// FRESHNESS floors on the candidate set — an extra condition, never the one
// that makes skipping safe. A phase is `reuse` only if (a) this floor holds for
// fresh data AND (b) the final verifier's own bar for that phase passes
// (utils/verifier-bars.js, measured on the verifier's own sets: live run ASINs,
// whole category, its top-20, this session's own raw review count). `top10`
// adds a floor on the ten best sellers.
const DEFAULT_RULES = {
  P1: { scope: 'top40', min: 0.9, top10: 1.0 },
  P2: { scope: 'top40', min: 0.9, top10: 0.9 },
  P3: { scope: 'top40', min: 0.5, top10: 0.8 },
  P4: { scope: 'top40', min: 0.75, top10: 0.8 },
  P5: { scope: 'top10', min: 0.75, top10: 0.75 },
  P6: { scope: 'top40', min: 0.9, top10: 0.9 },
  P8: { scope: 'top40', min: 0.9, top10: 0.9 },
};

function freshnessFromEnv(env = {}, cliSpec = null) {
  const out = { ...DEFAULT_FRESHNESS_DAYS };
  if (env.SCOUT_FRESHNESS_DAYS) {
    try { Object.assign(out, JSON.parse(env.SCOUT_FRESHNESS_DAYS)); } catch { /* ignore malformed */ }
  }
  for (const k of Object.keys(DEFAULT_FRESHNESS_DAYS)) {
    const v = env[`SCOUT_FRESH_${k}`];
    if (v != null && v !== '' && !Number.isNaN(Number(v))) out[k] = Number(v);
  }
  if (cliSpec) {
    for (const part of String(cliSpec).split(',')) {
      const [k, v] = part.split('=').map(s => s && s.trim());
      if (k && v != null && !Number.isNaN(Number(v))) out[k.toUpperCase().startsWith('P') ? k.toUpperCase() : `P${k}`] = Number(v);
    }
  }
  return out;
}

function isFresh(iso, days, now) {
  if (!iso) return false;
  return now.getTime() - Date.parse(iso) <= days * DAY_MS;
}

function round(n, d = 4) { const f = 10 ** d; return Math.round(n * f) / f; }

// Producers that honour SCOUT_RESCRAPE_ASINS (see utils/reuse-asins.js).
const RESCRAPE_PHASES = new Set(['P3', 'P4']);

/**
 * What the verifier would measure for P2/P3/P4 AFTER a sibling sync, computed
 * over the verifier's own sets (live run ASINs / whole category / its top-20)
 * and judged by the verifier's own evaluateBars. Sibling copies count only if
 * fresh within the window; the P3 raw-review floor stays THIS session's own
 * rows (sibling reads never count toward it, exactly as in the verifier).
 */
function projectVerifierBar(inv, key, days, now) {
  const v = inv.verifier;
  if (!v?.measured) return null;
  const m = v.measured;
  const live = v.runAsins?.live || [];
  const cat = inv.categoryAsins || [];
  const runSet = live.length ? live : cat;
  const top20 = m.top20Asins || [];
  const e = (a) => inv.products?.[a]?.phases?.[key] || null;
  // Start from what the verifier MEASURED and add only the ASINs the sync
  // would newly fill (not held here yet, fresh readable copy, in this
  // session's category) — never re-derive the verifier's own counts.
  const gains = (a) => {
    const x = e(a);
    return !!x && !x.own && !!inv.products?.[a]?.inOwnCategory && isFresh(x.siblingAt, days, now) && (key !== 'P2' || x.sales);
  };
  const add = (set) => set.filter(gains).length;
  const p = { ...m };
  if (key === 'P2') p.p2 = m.p2 + add(runSet);
  if (key === 'P3') { p.p3 = m.p3 + add(runSet); p.top20P3 = m.top20P3 + add(top20); }
  if (key === 'P4') { p.p4 = m.p4 + add(cat); p.top20P4 = m.top20P4 + add(top20); }
  const r = evaluateBars(p).byPhase[key]; // includes `via` for P3/P4
  return { ...r, metrics: { p2: p.p2, p3: p.p3, p4: p.p4, top20P3: p.top20P3, top20P4: p.top20P4, runTotal: p.runTotal, total: p.total } };
}

function costFor(meta, inv, workAsins, decision, scopeSize) {
  if (decision === 'reuse') return { usd: 0, note: 'no spend (reuse)' };
  const h = inv.costHistory?.[meta.key];
  if (meta.cost === 'keepa') {
    return { usd: null, note: `Keepa: ~${workAsins} product requests (keepa-phase2.js always re-fetches the whole session — no top-up support)` };
  }
  if (meta.cost === 'scrape') {
    return { usd: null, note: `Playwright / Bright Data: ~${workAsins} ASIN pages (no AI ledger for this phase)` };
  }
  if (!h) return { usd: null, note: 'no cost history for this phase in the family ledger' };
  if (meta.level === 'category') return { usd: h.usdPerSession, note: `≈ family avg $${h.usdPerSession}/session (${h.sessions} logged)` };
  // Per-ASIN phases are capped per session (P4 OCR top-20, P5 5+3, …), so a
  // per-ASIN average over the whole scrape understates them badly. Scale the
  // family's average cost of ONE full session by the share of the scope left.
  const share = scopeSize ? Math.min(1, workAsins / scopeSize) : 1;
  return { usd: round(h.usdPerSession * share), note: `≈ $${h.usdPerSession}/session (family ledger avg, ${h.sessions} logged) × ${workAsins}/${scopeSize || '?'} of scope` };
}

/**
 * @param {object} inv  inventory from inventory.js (buildInventory / assembleInventory)
 * @param {object} opts { freshnessDays, rules, now }
 */
function planScope(inv, opts = {}) {
  const freshness = { ...DEFAULT_FRESHNESS_DAYS, ...(opts.freshnessDays || {}) };
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const now = opts.now ? new Date(opts.now) : new Date(inv.generatedAt || Date.now());
  const top40 = inv.candidates?.top40 || [];
  const top10 = inv.candidates?.top10 || [];
  const phases = {};
  const decided = [];

  for (const meta of PHASE_META) {
    const days = freshness[meta.key];
    let out;

    if (meta.level === 'asin') {
      const rule = rules[meta.key] || { scope: 'top40', min: 0.9, top10: 0.9 };
      const scope = rule.scope === 'top10' ? top10 : top40;
      const of = scope.length;
      const e = (a) => inv.products?.[a]?.phases?.[meta.key] || null;
      // Freshness from raw timestamps only (inventory.js): ownAt/siblingAt null = stale.
      const ownFresh = scope.filter(a => e(a)?.own && isFresh(e(a).ownAt, days, now));
      const anyFresh = scope.filter(a => isFresh(e(a)?.at, days, now));
      const have = scope.filter(a => e(a));
      // A sibling's data only reaches this session through a migrate step that
      // writes onto THIS session's DASH product rows — an ASIN that is not in
      // this session's category cannot receive it. (Before P1 has created the
      // category there is nothing to check; the plan is rebuilt after P1.)
      const inDash = (a) => !inv.ownCategoryId || !!inv.products?.[a]?.inOwnCategory;
      // reuseAsins = fresh WITHIN THE WINDOW in a readable copy, and not already
      // fresh here. Only these may be skipped by the producers (SCOUT_REUSE_ASINS).
      const reusable = meta.familyReuse
        ? scope.filter(a => !ownFresh.includes(a) && inDash(a) && isFresh(e(a)?.siblingAt, days, now))
        : [];
      const usable = [...ownFresh, ...reusable];
      // Held here but stale, and no fresh copy to read → must be scraped again.
      // The producers' own "already done for this keyword" skip would otherwise
      // keep them stale forever (SCOUT_RESCRAPE_ASINS).
      const rescrape = RESCRAPE_PHASES.has(meta.key)
        ? scope.filter(a => e(a)?.own && !ownFresh.includes(a) && !reusable.includes(a))
        : [];
      const top10Share = (set) => (top10.length ? top10.filter(a => set.includes(a)).length / top10.length : 1);
      const complete = (set) => of > 0 && set.length / of >= rule.min && top10Share(set) >= rule.top10;
      const byAsin = meta.readBy === 'asin';
      const siblingSessions = byAsin ? [] : [...new Set(reusable.flatMap(a => e(a).sessions))].filter(x => x !== inv.targetSession);
      const readFrom = byAsin ? 'by ASIN (any session)' : `in ${siblingSessions.join(', ') || '—'}`;
      const pct = (n) => `${n}/${of}`;
      // The verifier decides whether skipping is safe — never top-40 coverage alone.
      const bar = inv.verifier?.bars?.[meta.key] || null;
      const proj = meta.familyReuse ? projectVerifierBar(inv, meta.key, days, now) : null;
      // A top-20-only pass rests on BSR ranking; unless P2 is itself skipped,
      // this run's Keepa refresh re-ranks the top-20 and the pass can vanish
      // before the P5/P9 gates look (the ashwagandha P3 15/20 case).
      const rankFrozen = decided.find(d => d.key === 'P2')?.decision === 'reuse' && decided.find(d => d.key === 'P2')?.source === 'session';
      const fragile = (b) => b?.via === 'top20' && !rankFrozen;
      const barSafe = !!bar?.pass && !fragile(bar);
      const projSafe = !!proj?.pass && !fragile(proj);
      const barNote = !inv.verifier ? 'no DASH category for this session yet — re-planned after P1'
        : bar && !bar.pass ? `verifier would fail: ${bar.msg}`
        : fragile(bar) ? `verifier ${meta.key} passes only on its top-20 path, which this run's P2 Keepa refresh re-ranks` : null;

      if (of === 0) {
        out = { decision: 'scrape', reason: meta.key === 'P1' ? 'no P1 data anywhere in the family — full scrape' : 'no candidate ASINs yet — runs after P1', work: { asins: 0 } };
      } else if (complete(ownFresh) && barSafe) {
        out = { decision: 'reuse', source: 'session', reason: `this session holds ${pct(ownFresh.length)} fresh (≤${days}d) and the verifier's ${meta.key} bar already passes`, work: { asins: 0 } };
      } else if (meta.familyReuse && reusable.length && complete(usable) && projSafe) {
        out = { decision: 'reuse', source: 'family', reason: `${pct(usable.length)} fresh (≤${days}d; ${reusable.length} read ${readFrom}); verifier ${meta.key} projected to pass after sync (${meta.syncScripts.join(', ')})`,
          work: { asins: 0 }, reuseSessions: siblingSessions, reuseAsins: reusable, syncScripts: meta.syncScripts, projected: proj.metrics };
      } else if (have.length === 0) {
        out = { decision: 'scrape', reason: `nothing in the family for ${of} candidates`, work: { asins: of, list: scope } };
      } else if (usable.length === 0) {
        const otherFresh = anyFresh.filter(a => !ownFresh.includes(a));
        const famNote = otherFresh.length && !meta.familyReuse
          ? `family has ${pct(otherFresh.length)} fresh in ${[...new Set(otherFresh.flatMap(a => e(a).sessions))].filter(x => x !== inv.targetSession).join(', ')} but ${meta.key} cannot read across sessions (see READ-FIRST.md TODO)`
          : `all ${have.length} present are older than ${days}d (or undated)`;
        out = { decision: otherFresh.length && !meta.familyReuse ? 'scrape' : 'refresh', reason: famNote, work: { asins: of, list: scope }, rescrapeAsins: rescrape };
      } else {
        const missing = scope.filter(a => !usable.includes(a));
        const why = complete(ownFresh) && barNote ? `${barNote}; ` : '';
        out = { decision: 'top-up', reason: `${why}${pct(usable.length)} usable fresh (${ownFresh.length} this session${meta.familyReuse && reusable.length ? `, ${reusable.length} read ${readFrom}` : ''}); ${missing.length} missing/stale${rescrape.length ? `, ${rescrape.length} of them re-scraped` : ''}`,
          work: { asins: missing.length, list: missing },
          reuseAsins: reusable, reuseSessions: siblingSessions, rescrapeAsins: rescrape };
      }
      out.coverage = { of, own: ownFresh.length, reusable: reusable.length, anyFresh: anyFresh.length, have: have.length, freshnessDays: days, scope: rule.scope,
        verifierBar: bar ? { pass: bar.pass, via: bar.via, msg: bar.msg } : null, projectedBar: proj ? { pass: proj.pass, via: proj.via, msg: proj.msg } : null };
    } else {
      const p = inv.phases?.[meta.key] || {};
      const own = p.own;
      // A sibling sync (reuse/family) also changes this session's inputs.
      const upstreamChanging = decided.filter(d => d.decision !== 'reuse' || d.source === 'family').map(d => d.key);
      const bar = inv.verifier?.bars?.[meta.key] || null;
      if (own && isFresh(own.at, days, now) && upstreamChanging.length === 0 && bar?.pass) {
        out = { decision: 'reuse', source: 'session', reason: `this session's ${meta.name} is fresh (${own.staleDays ?? '?'}d ≤ ${days}d) and no input changes`, work: { asins: 0 } };
      } else if (own && upstreamChanging.length) {
        out = { decision: 'refresh', reason: `inputs change this run (${upstreamChanging.join(', ')})`, work: { runs: 1 } };
      } else if (own && bar && !bar.pass) {
        out = { decision: 'refresh', reason: `verifier would fail: ${bar.msg}`, work: { runs: 1 } };
      } else if (own) {
        out = { decision: 'refresh', reason: own.at ? `this session's copy is ${own.staleDays}d old (> ${days}d)` : "this session's copy is undated (treated as stale)", work: { runs: 1 } };
      } else {
        const fam = (p.sourceSessions || []).length ? ` (family has it in ${p.sourceSessions.join(', ')} — category-scoped, not reusable)` : '';
        out = { decision: 'scrape', reason: `not generated for this session yet${fam}`, work: { runs: 1 } };
      }
    }

    out.cost = costFor(meta, inv, out.work?.asins || (meta.level === 'category' ? 1 : 0), out.decision, out.coverage?.of);
    phases[meta.key] = { num: meta.num, name: meta.name, ...out };
    decided.push({ key: meta.key, decision: out.decision, source: out.source });
  }

  // Informational: a sibling session that is further along than the target.
  let recommendation = null;
  const target = (inv.sessions || []).find(s => s.own);
  if (!target || !target.p1Asins) {
    const best = (inv.sessions || []).filter(s => !s.own && s.p1Asins > 0 && !s.isTest)
      .map(s => ({ s, n: Object.values(inv.phases || {}).filter(p => (p.holders || []).some(h => h.session === s.label)).length }))
      .sort((a, b) => b.n - a.n || Date.parse(b.s.lastScrapedAt || 0) - Date.parse(a.s.lastScrapedAt || 0))[0];
    if (best && best.n > 0) {
      recommendation = `"${inv.targetSession}" is a new session; "${best.s.label}" already has ${best.n} category-level deliverables (last scrape ${String(best.s.lastScrapedAt).slice(0, 10)}). Consider re-running that session instead of starting a new one.`;
    }
  }

  const estUsd = round(Object.values(phases).reduce((s, p) => s + (p.cost?.usd || 0), 0));
  return {
    keyword: inv.keyword, targetSession: inv.targetSession, generatedAt: now.toISOString(),
    candidates: { source: inv.candidates?.source || null, basis: inv.candidates?.basis || 'none', top40: top40.length, top10: top10.length },
    freshnessDays: freshness,
    phases,
    skip: Object.entries(phases).filter(([, p]) => p.decision === 'reuse' && p.source === 'session').map(([k]) => k),
    syncOnly: Object.entries(phases).filter(([, p]) => p.decision === 'reuse' && p.source === 'family').map(([k]) => k),
    estimate: { aiUsd: estUsd, note: 'AI phases only, from this family\'s ai_usage_log averages; scrape/Keepa phases are counted in ASINs' },
    recommendation,
  };
}

function formatPlan(plan) {
  const L = [`PLAN — "${plan.keyword}" (candidates from ${plan.candidates.source ? `"${plan.candidates.source}"` : 'nothing'}, ${plan.candidates.basis})`];
  for (const [k, p] of Object.entries(plan.phases)) {
    const d = p.decision + (p.source === 'family' ? ' (family)' : '');
    const w = p.work?.asins ? `${p.work.asins} ASINs` : p.work?.runs ? `${p.work.runs} run` : '—';
    const c = p.cost?.usd != null ? `$${p.cost.usd}` : '';
    L.push(`  ${k.padEnd(4)} ${d.padEnd(15)} ${w.padEnd(10)} ${c.padEnd(8)} ${p.reason}`);
  }
  L.push(`  est. AI spend ≈ $${plan.estimate.aiUsd}  ·  skip: ${plan.skip.join(', ') || '—'}  ·  sync-only: ${plan.syncOnly.join(', ') || '—'}`);
  if (plan.recommendation) L.push(`  ▸ ${plan.recommendation}`);
  return L.join('\n');
}

module.exports = { planScope, formatPlan, freshnessFromEnv, DEFAULT_FRESHNESS_DAYS, DEFAULT_RULES };
