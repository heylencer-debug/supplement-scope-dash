/**
 * utils/apply-plan.js — how run-pipeline.js honours a READ-FIRST plan for one
 * phase. Kept out of run-pipeline.js (which has import-time side effects) so
 * it can be unit-tested.
 *
 *   mode 'honor'  reuse/session → { skip }
 *                 reuse/family  → phase copy whose run() is the no-cost sync
 *                                 script(s) only (reads sibling data by ASIN /
 *                                 by sibling keyword, never copies raw rows)
 *                 top-up with reuseAsins → phase copy that sets
 *                                 SCOUT_REUSE_ASINS / _KEYWORDS /
 *                                 _MAX_AGE_DAYS for exactly its own duration
 *                 anything else → the original phase (+ a note)
 *   other modes   → the original phase, untouched.
 */
function applyScopePlan(phase, plan, { mode = 'honor', keyword, runScript, env = process.env } = {}) {
  const d = plan?.phases?.[`P${phase.num}`];
  if (!d || mode !== 'honor') return { phase };
  if (d.decision === 'reuse' && d.source === 'session') return { skip: `READ-FIRST plan: reuse — ${d.reason}` };
  const vars = {};
  if (d.reuseAsins?.length) vars.SCOUT_REUSE_ASINS = d.reuseAsins.join(',');
  if (d.reuseSessions?.length) vars.SCOUT_REUSE_KEYWORDS = d.reuseSessions.join(',');
  if (d.rescrapeAsins?.length) vars.SCOUT_RESCRAPE_ASINS = d.rescrapeAsins.join(',');
  if (Object.keys(vars).length && plan.freshnessDays?.[`P${phase.num}`]) {
    vars.SCOUT_REUSE_MAX_AGE_DAYS = String(plan.freshnessDays[`P${phase.num}`]);
  }
  const syncOnly = d.decision === 'reuse' && d.source === 'family' && d.syncScripts?.length;
  const note = `READ-FIRST plan: ${syncOnly ? 'reuse from sibling sessions — sync only' : d.decision} — ${d.reason}`;
  if (!syncOnly && !Object.keys(vars).length) return { phase, note };
  const inner = syncOnly ? async () => { for (const s of d.syncScripts) await runScript(s, [keyword]); } : phase.run;
  return {
    note,
    env: vars,
    phase: { ...phase, run: async () => {
      // Set for exactly this phase (inherited by runScript's spawn()), then put
      // back whatever was there before — an operator may have exported one.
      const prior = Object.fromEntries(Object.keys(vars).map(k => [k, Object.prototype.hasOwnProperty.call(env, k) ? env[k] : undefined]));
      Object.assign(env, vars);
      try { await inner(); } finally {
        for (const [k, v] of Object.entries(prior)) { if (v === undefined) delete env[k]; else env[k] = v; }
      }
    } },
  };
}

/**
 * After P1 the session's ASIN set and DASH category exist for the first time,
 * so the plan is rebuilt. If that rebuild fails (or times out) the result is
 * NO plan — never the start plan, which was built before this session had a
 * category (every ASIN looked syncable, candidates came from a sibling) and
 * would send P3/P4 into sync-only runs against another session's set.
 */
async function planAfterPhase(phaseNum, currentPlan, rebuild) {
  if (phaseNum !== 1 || !currentPlan) return currentPlan;
  try { return (await rebuild('after-P1')) || null; } catch { return null; }
}

module.exports = { applyScopePlan, planAfterPhase };
