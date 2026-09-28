'use strict';
// READ-FIRST inventory: the advisory "RnD coverage" section (inventory.js).
// Read-only, fail-open, printed with the plan, and never an input to planScope.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { recordingSupabase } = require('./helpers/recording-supabase');
const { assembleInventory, formatInventory, fetchRndCoverage, formatRndCoverage } = require('../inventory');
const { planScope } = require('../plan-scope');
const fx = require('./fixtures/raw-fixtures');

const IDS = [
  { product_id: 'PRO-1', value: 'B01' },
  { product_id: 'PRO-2', value: 'B02' },
];
const RUNS = [
  { id: 1, product_id: 'PRO-1' }, { id: 2, product_id: 'PRO-1' }, { id: 3, product_id: 'PRO-1' },
];
const rndFake = (over = {}) => recordingSupabase((table) => {
  if (over[table]) return over[table];
  if (table === 'product_identifiers') return { data: IDS, error: null };
  if (table === 'research_runs') return { data: RUNS, error: null };
  return { data: [], error: null };
});

test('fetchRndCoverage: ASINs by product_identifiers(id_type=asin), runs per product from research_runs — reads only', async () => {
  const rnd = rndFake();
  const cov = await fetchRndCoverage(rnd, ['B01', 'B02', 'B03', 'B01']);
  assert.deepEqual(cov, {
    available: true, basis: 'category', asinsChecked: 3,
    inRnd: 2, withRuns: 1, totalRuns: 3, runsByAsin: { B01: 3, B02: 0 }, missing: ['B03'],
  });
  assert.deepEqual(rnd.queries, [
    { table: 'product_identifiers', calls: [['select', 'product_id, value'], ['eq', 'id_type', 'asin'], ['in', 'value', ['B01', 'B02', 'B03']], ['range', 0, 999]] },
    { table: 'research_runs', calls: [['select', 'id, product_id'], ['in', 'product_id', ['PRO-1', 'PRO-2']], ['range', 0, 999]] },
  ]);
  assert.equal(rnd.writes().length, 0);
});

test('fetchRndCoverage fails open: no client, a read error, no ASINs', async () => {
  assert.deepEqual(await fetchRndCoverage(null, ['B01'], { reason: 'RnD client unavailable: RND_SUPABASE_URL is not set' }),
    { available: false, reason: 'RnD client unavailable: RND_SUPABASE_URL is not set' });
  const bad = rndFake({ product_identifiers: { data: null, error: { message: 'permission denied for table product_identifiers' } } });
  const cov = await fetchRndCoverage(bad, ['B01']);
  assert.equal(cov.available, true);
  assert.match(cov.error, /permission denied/);
  const none = await fetchRndCoverage(rndFake(), [], { basis: 'candidate' });
  assert.deepEqual(none, { available: true, basis: 'candidate', asinsChecked: 0, inRnd: 0, withRuns: 0, totalRuns: 0, runsByAsin: {}, missing: [] });
});

test('formatRndCoverage: advisory wording for every state', () => {
  assert.equal(formatRndCoverage(undefined), '');
  assert.match(formatRndCoverage({ available: false, reason: 'RnD client unavailable: RND_SUPABASE_ANON_KEY is not set' }),
    /^RnD coverage \(advisory — no plan decision reads it\): not checked — RnD client unavailable: RND_SUPABASE_ANON_KEY is not set$/);
  assert.match(formatRndCoverage({ available: true, error: 'boom' }), /read failed — boom/);
  const txt = formatRndCoverage({ available: true, basis: 'category', asinsChecked: 3, inRnd: 2, withRuns: 1, totalRuns: 3, runsByAsin: { B01: 3, B02: 0 }, missing: ['B03'] });
  assert.equal(txt, 'RnD coverage (advisory — no plan decision reads it): 2/3 category ASINs exist in RnD; 1 have research runs (3 runs)\n  runs per ASIN: B01 3');
});

test('RnD coverage never changes a plan decision, and prints with the inventory', async () => {
  for (const raw of [fx.fullyCovered(), fx.stale(), fx.fragmented({ afterP1: true }), fx.emptyKeyword()]) {
    const inv = assembleInventory(raw, { now: fx.NOW });
    const before = planScope(inv, { now: fx.NOW });
    const withCov = { ...inv, rndCoverage: await fetchRndCoverage(rndFake(), inv.categoryAsins.length ? inv.categoryAsins : inv.candidates.top40) };
    assert.deepEqual(planScope(withCov, { now: fx.NOW }), before);
    assert.doesNotMatch(formatInventory(inv), /RnD coverage/);
    assert.match(formatInventory(withCov), /RnD coverage \(advisory — no plan decision reads it\)/);
  }
});

test('run-pipeline and the inventory CLI pass the read-only RnD client to buildInventory', () => {
  for (const f of ['run-pipeline.js', 'inventory.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(s, /rnd: createRndClient\(\), rndReason: rndClientReason\(\)/, f);
  }
  const plan = fs.readFileSync(path.join(__dirname, '..', 'plan-scope.js'), 'utf8');
  assert.doesNotMatch(plan, /rndCoverage/, 'plan-scope must not read RnD coverage');
});
