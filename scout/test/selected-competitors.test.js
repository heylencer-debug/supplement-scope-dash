const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSelection, applySelection, scopeToSelection } = require('../utils/selected-competitors');

// Minimal chainable stand-in for a supabase-js query.
function fakeClient(result, log = []) {
  const q = {
    select() { log.push('select'); return q; },
    eq(k, v) { log.push(`eq:${k}=${v}`); return q; },
    order(k) { log.push(`order:${k}`); return q; },
    limit() { return Promise.resolve(result); },
  };
  return { from: () => q, log };
}

test('columns absent (migration 011 not applied) → inactive, callers keep top-N-by-BSR', async () => {
  const sel = await loadSelection(fakeClient({ data: null, error: { code: '42703', message: 'column products.selected does not exist' } }), 'cat');
  assert.equal(sel.active, false);
  assert.match(sel.why, /not migrated/);
  const rows = [{ asin: 'B' }, { asin: 'A' }];
  assert.equal(applySelection(rows, sel), rows);
});

test('columns present but unpopulated → inactive', async () => {
  const sel = await loadSelection(fakeClient({ data: [], error: null }), 'cat');
  assert.equal(sel.active, false);
});

test('populated → filters to selected and orders by selection_rank', async () => {
  const sel = await loadSelection(fakeClient({ data: [{ asin: 'C', selection_rank: 1 }, { asin: 'A', selection_rank: 2 }], error: null }), 'cat');
  assert.equal(sel.active, true);
  const rows = [{ asin: 'A' }, { asin: 'B' }, { asin: 'C' }];
  assert.deepEqual(applySelection(rows, sel).map((r) => r.asin), ['C', 'A']);
});

test('no category / thrown lookup → inactive, never throws', async () => {
  assert.equal((await loadSelection(null, 'x')).active, false);
  const boom = { from() { throw new Error('network'); } };
  assert.equal((await loadSelection(boom, 'x')).active, false);
});

test('scopeToSelection adds selected filter + rank ordering only when active', () => {
  const log = [];
  const q = fakeClient({}, log).from();
  assert.equal(scopeToSelection(q, { active: false }), q);
  assert.deepEqual(log, []);
  scopeToSelection(q, { active: true, ranks: new Map() });
  assert.deepEqual(log, ['eq:selected=true', 'order:selection_rank']);
});

const { top20Need } = require('../utils/selected-competitors');

test('top20Need = min(15, ceil(0.75 × min(20, selection size)))', () => {
  assert.equal(top20Need(40), 15);
  assert.equal(top20Need(20), 15);
  assert.equal(top20Need(19), 15); // ceil(14.25)
  assert.equal(top20Need(12), 9);
  assert.equal(top20Need(10), 8);
  assert.equal(top20Need(1), 1);
  assert.equal(top20Need(0), 0);
  assert.equal(top20Need(undefined), 0);
});

test('runner contract: exports and sel shape the gate diff relies on', async () => {
  const mod = require('../utils/selected-competitors');
  for (const k of ['loadSelection', 'scopeToSelection', 'top20Need']) assert.equal(typeof mod[k], 'function', k);
  const sel = await mod.loadSelection(fakeClient({ data: [{ asin: 'A', selection_rank: 1 }], error: null }), 'cat');
  assert.equal(sel.active, true);
  assert.ok(sel.ranks instanceof Map);
  assert.equal(sel.ranks.size, 1);
});
