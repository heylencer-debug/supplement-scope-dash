const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCandidatePool, selectionSignalsFor } = require('../utils/serp-pool');

const A = 'B000000001', B = 'B000000002', C = 'B000000003', D = 'B000000004', E = 'B000000005';

test('union across queries; positions recorded per query', () => {
  const { pool } = buildCandidatePool([
    { query: 'kw', items: [{ asin: A, position: 1 }, { asin: B, position: 2 }] },
    { query: 'best kw', items: [{ asin: B, position: 1 }, { asin: C, position: 5 }] },
  ]);
  assert.deepEqual(pool.map((p) => p.asin), [B, A, C]); // B appears twice → wins
  const b = pool.find((p) => p.asin === B);
  assert.deepEqual(b.search_queries, ['kw', 'best kw']);
  assert.deepEqual(b.serp_positions, { kw: 2, 'best kw': 1 });
  assert.equal(b.base_position, 2);
  assert.equal(b.pool_rank, 1);
  assert.equal(pool.find((p) => p.asin === C).base_position, null);
});

test('sponsored results are never candidates; organic elsewhere keeps them', () => {
  const { pool, sponsoredOnly } = buildCandidatePool([
    { query: 'kw', items: [{ asin: D, position: 1, sponsored: true }, { asin: E, position: 2, sponsored: true }, { asin: A, position: 3 }] },
    { query: 'best kw', items: [{ asin: E, position: 4 }] },
  ]);
  assert.deepEqual(sponsoredOnly, [D]);
  assert.ok(!pool.some((p) => p.asin === D));
  const e = pool.find((p) => p.asin === E);
  assert.deepEqual(e.sponsored_in, ['kw']);
  assert.deepEqual(e.serp_positions, { 'best kw': 4 });
});

test('pool is cut to poolSize, ranked; duplicate ASIN within a query keeps the higher placement', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ asin: `B${String(i).padStart(9, '0')}`, position: i + 1 }));
  items.push({ asin: 'B000000000', position: 150 });
  const { pool, totalUnique } = buildCandidatePool([{ query: 'kw', items }], { poolSize: 80 });
  assert.equal(totalUnique, 100);
  assert.equal(pool.length, 80);
  assert.equal(pool[0].serp_positions.kw, 1);
  assert.equal(pool[79].pool_rank, 80);
  const s = selectionSignalsFor(pool[0]);
  assert.deepEqual(Object.keys(s).sort(), ['base_guaranteed', 'base_position', 'best_position', 'pool_rank', 'rrf_score', 'search_queries', 'serp_positions', 'sponsored_in']);
});

test('malformed ASINs are ignored', () => {
  const { pool } = buildCandidatePool([{ query: 'kw', items: [{ asin: 'nope', position: 1 }, { asin: A.toLowerCase(), position: 2 }] }]);
  assert.deepEqual(pool.map((p) => p.asin), [A]);
});

test('base search top-N is guaranteed a slot even when fusion would rank variant-only ASINs higher', () => {
  const base = Array.from({ length: 50 }, (_, i) => ({ asin: `BASE${String(i).padStart(6, '0')}`, position: i + 1 }));
  // 30 ASINs ranked #1-#30 in BOTH variant searches: fused score beats base #20+.
  const v = Array.from({ length: 30 }, (_, i) => ({ asin: `VARI${String(i).padStart(6, '0')}`, position: i + 1 }));
  const { pool } = buildCandidatePool(
    [{ query: 'kw', items: base }, { query: 'best kw', items: v }, { query: 'kw for women', items: v }],
    { poolSize: 50, baseGuarantee: 40 },
  );
  assert.equal(pool.length, 50);
  const inPool = new Set(pool.map((p) => p.asin));
  for (let i = 0; i < 40; i++) assert.ok(inPool.has(base[i].asin), `base #${i + 1} kept`);
  assert.equal(pool.filter((p) => p.base_guaranteed).length, 40);
  assert.equal(pool.filter((p) => p.asin.startsWith('VARI')).length, 10, 'fusion fills the rest');
  assert.deepEqual(pool.map((p) => p.pool_rank), Array.from({ length: 50 }, (_, i) => i + 1));
});
