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

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_FRESHNESS_DAYS = {
  P1: 14, P2: 7, P3: 30, P4: 90, P5: 60, P6: 60,
  P7: 30, P8: 60, P9: 30, P10: 30, P11: 30, P12: 30, P13: 30,
};

// Coverage needed to call a per-ASIN phase complete. Mirrors the final
// verifier where it has a bar (P2 90%, P3 50% or top-20 ≥ 75%, P4 80% or
// top-20 ≥ 75%, P5 75% of the slim target, P6/P8 90%). `top10` adds a
// floor on the ten best sellers so a coverage number padded with long-tail
// ASINs cannot green-light a phase whose top sellers are missing.
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
      const ownFresh = scope.filter(a => e(a)?.own && isFresh(e(a).ownAt || e(a).at, days, now));
      const famFresh = scope.filter(a => isFresh(e(a)?.at, days, now));
      const have = scope.filter(a => e(a));
      // A sibling's data only reaches this session through a migrate step that
      // writes onto THIS session's DASH product rows — an ASIN that is not in
      // this session's category cannot receive it. (Before P1 has created the
      // category there is nothing to check; the plan is rebuilt after P1.)
      const inDash = (a) => !inv.ownCategoryId || !!inv.products?.[a]?.inOwnCategory;
      const famUsable = famFresh.filter(a => ownFresh.includes(a) || inDash(a));
      const usable = meta.familyReuse ? famUsable : ownFresh;
      const top10Share = (set) => (top10.length ? top10.filter(a => set.includes(a)).length / top10.length : 1);
      const complete = (set) => of > 0 && set.length / of >= rule.min && top10Share(set) >= rule.top10;
      const siblingSessions = [...new Set((meta.familyReuse ? famUsable : famFresh).filter(a => !ownFresh.includes(a)).flatMap(a => e(a).sessions))]
        .filter(s => s !== inv.targetSession);
      const pct = (n) => `${n}/${of}`;

      if (of === 0) {
        out = { decision: 'scrape', reason: meta.key === 'P1' ? 'no P1 data anywhere in the family — full scrape' : 'no candidate ASINs yet — runs after P1', work: { asins: 0 } };
      } else if (complete(ownFresh)) {
        out = { decision: 'reuse', source: 'session', reason: `this session holds ${pct(ownFresh.length)} fresh (≤${days}d, need ${Math.round(rule.min * 100)}%)`, work: { asins: 0 } };
      } else if (meta.familyReuse && complete(famUsable)) {
        out = { decision: 'reuse', source: 'family', reason: `family holds ${pct(famUsable.length)} fresh (≤${days}d) in ${siblingSessions.join(', ') || 'shared rows'} — sync only (${meta.syncScripts.join(', ')})`,
          work: { asins: 0 }, reuseSessions: siblingSessions, reuseAsins: famUsable.filter(a => !ownFresh.includes(a)), syncScripts: meta.syncScripts };
      } else if (have.length === 0) {
        out = { decision: 'scrape', reason: `nothing in the family for ${of} candidates`, work: { asins: of, list: scope } };
      } else if (usable.length === 0) {
        const famNote = famFresh.length && !meta.familyReuse
          ? `family has ${pct(famFresh.length)} fresh in ${siblingSessions.join(', ')} but ${meta.key} cannot read across sessions (see READ-FIRST.md TODO)`
          : `all ${have.length} present are older than ${days}d`;
        out = { decision: famFresh.length && !meta.familyReuse ? 'scrape' : 'refresh', reason: famNote, work: { asins: of, list: scope } };
      } else {
        const missing = scope.filter(a => !usable.includes(a));
        out = { decision: 'top-up', reason: `${pct(usable.length)} usable fresh (${ownFresh.length} this session${meta.familyReuse ? `, ${usable.length - ownFresh.length} from family` : ''}); ${missing.length} missing/stale`,
          work: { asins: missing.length, list: missing },
          reuseAsins: meta.familyReuse ? famUsable.filter(a => !ownFresh.includes(a)) : [],
          reuseSessions: meta.familyReuse ? siblingSessions : [] };
      }
      out.coverage = { of, own: ownFresh.length, family: famFresh.length, familyUsable: famUsable.length, have: have.length, freshnessDays: days, scope: rule.scope };
    } else {
      const p = inv.phases?.[meta.key] || {};
      const own = p.own;
      // A sibling sync (reuse/family) also changes this session's inputs.
      const upstreamChanging = decided.filter(d => d.decision !== 'reuse' || d.source === 'family').map(d => d.key);
      if (own && isFresh(own.at, days, now) && upstreamChanging.length === 0) {
        out = { decision: 'reuse', source: 'session', reason: `this session's ${meta.name} is fresh (${own.staleDays ?? '?'}d ≤ ${days}d) and no input changes`, work: { asins: 0 } };
      } else if (own && upstreamChanging.length) {
        out = { decision: 'refresh', reason: `inputs change this run (${upstreamChanging.join(', ')})`, work: { runs: 1 } };
      } else if (own) {
        out = { decision: 'refresh', reason: `this session's copy is ${own.staleDays}d old (> ${days}d)`, work: { runs: 1 } };
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
