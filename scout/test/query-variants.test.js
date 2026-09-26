const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueryVariants, cleanKeyword } = require('../utils/query-variants');

test('base keyword always first; session suffix stripped', () => {
  const q = buildQueryVariants('electrolyte powder #3');
  assert.equal(q[0], 'electrolyte powder');
  assert.ok(!q.some((x) => x.includes('#')));
});

test('gummies get best + audience + sugar-free variants, capped at 5', () => {
  assert.deepEqual(buildQueryVariants('magnesium gummies'), [
    'magnesium gummies',
    'best magnesium gummies',
    'magnesium gummies for women',
    'magnesium gummies for men',
    'sugar free magnesium gummies',
  ]);
});

test('capsules get no sugar-free variant', () => {
  const q = buildQueryVariants('ashwagandha capsules');
  assert.ok(!q.some((x) => /sugar free/.test(x)));
  assert.equal(q.length, 4);
});

test('keyword already naming an audience gets no gender split', () => {
  const q = buildQueryVariants('prenatal vitamins');
  assert.deepEqual(q, ['prenatal vitamins', 'best prenatal vitamins']);
  const k = buildQueryVariants('kids multivitamin gummies');
  assert.ok(!k.some((x) => /for (wo)?men/.test(x)));
  assert.ok(k.includes('sugar free kids multivitamin gummies'));
});

test('keyword already sugar free / already "best" is not doubled', () => {
  const q = buildQueryVariants('best sugar free electrolyte powder');
  assert.equal(q.filter((x) => x.startsWith('best best')).length, 0);
  assert.ok(!q.some((x) => x.startsWith('sugar free best')));
});

test('maxQueries truncates from the end; never exceeds 5; empty input → []', () => {
  assert.deepEqual(buildQueryVariants('magnesium gummies', { maxQueries: 2 }), ['magnesium gummies', 'best magnesium gummies']);
  assert.equal(buildQueryVariants('magnesium gummies', { maxQueries: 99 }).length, 5);
  assert.deepEqual(buildQueryVariants('  #2 '), []);
  assert.equal(cleanKeyword('  hydration   powder #12 '), 'hydration powder');
});
