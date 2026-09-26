const test = require('node:test');
const assert = require('node:assert/strict');
const { createOcrWriter, isMissingColumnError } = require('../utils/ocr-row-write');

function client(failFirstWith) {
  const bodies = [];
  let n = 0;
  return {
    bodies,
    from: () => ({ upsert: async (body) => { bodies.push(body); n++; return n === 1 && failFirstWith ? { error: failFirstWith } : { error: null }; } }),
  };
}
const quiet = { warn() {} };

test('migration 013 applied: facts_v2 and label_product_match are written', async () => {
  const c = client(null);
  await createOcrWriter(c, { log: quiet }).upsert({ asin: 'A', image_index: 0, facts_v2: { rows: [] }, label_product_match: { verdict: 'match' } });
  assert.ok('facts_v2' in c.bodies[0]);
});

test('migration 013 missing: one retry without the new keys, then never sent again', async () => {
  const c = client({ code: 'PGRST204', message: "Could not find the 'facts_v2' column of 'dovive_ocr' in the schema cache" });
  const w = createOcrWriter(c, { log: quiet });
  await w.upsert({ asin: 'A', image_index: 0, supplement_facts: [{ name: 'Zinc' }], facts_v2: {}, label_product_match: null });
  await w.upsert({ asin: 'B', image_index: 0, facts_v2: {} });
  assert.equal(c.bodies.length, 3);
  assert.ok(!('facts_v2' in c.bodies[1]));
  assert.deepEqual(c.bodies[1].supplement_facts, [{ name: 'Zinc' }], 'legacy columns unchanged');
  assert.ok(!('facts_v2' in c.bodies[2]));
  assert.equal(w.state.v2Columns, false);
});

test('other errors still throw', async () => {
  const c = client({ code: '23505', message: 'duplicate key' });
  await assert.rejects(createOcrWriter(c, { log: quiet }).upsert({ asin: 'A' }), /duplicate key/);
  assert.equal(isMissingColumnError({ code: '42703', message: 'column dovive_ocr.label_product_match does not exist' }), true);
  assert.equal(isMissingColumnError({ code: '42703', message: 'column dovive_ocr.other does not exist' }), false);
});
