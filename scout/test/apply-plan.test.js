const test = require('node:test');
const assert = require('node:assert/strict');
const { applyScopePlan } = require('../utils/apply-plan');
const { assembleInventory } = require('../inventory');
const { planScope } = require('../plan-scope');
const fx = require('./fixtures/raw-fixtures');

const planFor = (raw) => planScope(assembleInventory(raw, { now: fx.NOW }), { now: fx.NOW });
const fakePhase = (num, calls) => ({ num, name: `P${num}`, run: async () => { calls.push(`run:P${num}`); } });

test('reuse/session → skip; advisory mode → never skips', () => {
  const plan = planFor(fx.fullyCovered());
  const calls = [];
  const r = applyScopePlan(fakePhase(4, calls), plan, { mode: 'honor', keyword: 'k', runScript: async () => {} });
  assert.match(r.skip, /READ-FIRST plan: reuse/);
  const a = applyScopePlan(fakePhase(4, calls), plan, { mode: 'advisory', keyword: 'k', runScript: async () => {} });
  assert.equal(a.skip, undefined);
});

test('reuse/family → only the sync script runs, with the reuse env set for exactly that call', async () => {
  const plan = planFor(fx.fragmented({ afterP1: true }));
  const calls = []; const env = {};
  const r = applyScopePlan(fakePhase(3, calls), plan, {
    mode: 'honor', keyword: 'electrolyte powder #6', env,
    runScript: async (script, args) => { calls.push(`${script} ${args.join(' ')} reuse=${env.SCOUT_REUSE_KEYWORDS} n=${env.SCOUT_REUSE_ASINS.split(',').length} age=${env.SCOUT_REUSE_MAX_AGE_DAYS}`); },
  });
  assert.equal(r.skip, undefined);
  await r.phase.run();
  assert.deepEqual(calls, ['migrate-reviews-to-dash.js electrolyte powder #6 reuse=electrolyte powder #4 n=30 age=30']);
  assert.deepEqual(env, {}, 'env is cleaned up after the phase');
});

test('top-up with sibling-fresh ASINs → the real phase runs with SCOUT_REUSE_ASINS', async () => {
  const inv = assembleInventory(fx.fragmented({ afterP1: true }), { now: fx.NOW });
  const plan = planScope(inv, { now: fx.NOW, rules: { P4: { scope: 'top40', min: 0.95, top10: 1 } } });
  const env = {}; const seen = [];
  const phase = { num: 4, name: 'P4', run: async () => { seen.push(env.SCOUT_REUSE_ASINS.split(',').length); } };
  const r = applyScopePlan(phase, plan, { mode: 'honor', keyword: 'x', env, runScript: async () => { throw new Error('sync must not run'); } });
  await r.phase.run();
  assert.deepEqual(seen, [35]);
  assert.match(r.note, /top-up/);
});

test('no plan / scrape decision → the original phase object, untouched', () => {
  const calls = [];
  const p = fakePhase(1, calls);
  assert.equal(applyScopePlan(p, null, { mode: 'honor' }).phase, p);
  const plan = planFor(fx.emptyKeyword());
  assert.equal(applyScopePlan(p, plan, { mode: 'honor' }).phase, p);
});
