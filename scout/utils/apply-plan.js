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
      Object.assign(env, vars); // inherited by runScript's spawn()
      try { await inner(); } finally { for (const k of Object.keys(vars)) delete env[k]; }
    } },
  };
}

module.exports = { applyScopePlan };
