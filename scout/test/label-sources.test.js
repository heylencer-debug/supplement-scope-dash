const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLabelFields, claimKey } = require('../utils/label-sources');

// Shapes mirror real dovive_ocr rows for B0C3RKHDWB (image 0: 17 facts; text 99: 13 facts).
const panel = {
  id: 101, asin: 'A', image_index: 0, image_url: 'https://m.media-amazon.com/images/I/panel.jpg', processed_at: '2026-09-20T10:00:00Z',
  serving_size: '2 Gummies', servings_per_container: '30',
  supplement_facts: [
    { name: 'Magnesium (as Magnesium Glycinate)', amount: '100 mg', dv_percent: '24%' },
    { name: 'Ashwagandha Root Extract (Standardized to 5% Withanolides)', amount: '3,000 mg' },
    { name: 'Black Pepper Extract (95% Piperine)', amount: '10 mg' },
  ],
  certifications: ['Non-GMO', 'GMP Certified'],
  other_ingredients: 'Pectin, citric acid',
  raw_text: 'Supplement Facts ⏎ Serving Size: 2 Gummies ⏎ Amount Per Serving %DV ⏎ Magnesium (as Magnesium Glycinate) 100 mg 24%',
};
const text = {
  id: 199, asin: 'A', image_index: 99, image_url: null, processed_at: '2026-09-21T10:00:00Z',
  serving_size: '2 ashwagandha gummies', servings_per_container: '30',
  supplement_facts: [
    { name: 'Magnesium', amount: '100mg' },
    { name: 'Ashwagandha', amount: '300 mg' },
    { name: 'Black Pepper', amount: null },
    { name: 'Vitamin D3', amount: '20 mcg' },
    { name: 'L-Theanine', amount: null },
  ],
  certifications: ['Non-GMO Project Verified', 'Gluten Free', 'GMP'],
  other_ingredients: 'pectin',
};

test('nutrients: the facts-panel image wins over text extraction even with fewer rows', () => {
  const r = resolveLabelFields([text, panel]);
  assert.equal(r.values.nutrients.length, 3);
  assert.equal(r.sources.nutrients.row_id, 101);
  assert.equal(r.sources.nutrients.image_url, panel.image_url);
  assert.equal(r.label_facts.rows[0].source.row_id, 101, 'every v2 row points back at its dovive_ocr row');
  assert.match(r.label_facts.rows[0].source.excerpt, /Magnesium \(as Magnesium Glycinate\) 100 mg/);
});

test('text extraction is used when no image has facts', () => {
  const r = resolveLabelFields([{ ...panel, supplement_facts: null }, text]);
  assert.equal(r.sources.nutrients.row_id, 199);
  assert.equal(r.values.nutrients.length, 5);
});

test('nutrient conflicts are recorded with both values and both sources; absences in text are not', () => {
  const r = resolveLabelFields([text, panel]);
  const ash = r.conflicts['nutrient:ashwagandha root extract'];
  assert.ok(ash, 'ashwagandha 3000 vs 300 recorded');
  assert.deepEqual(ash.map((x) => [x.row_id, x.amount_mg]), [[101, 3000], [199, 300]]);
  assert.ok(r.conflicts['nutrient:vitamin d3'], 'a nutrient with an amount only in the text is recorded');
  assert.equal(r.conflicts['nutrient:vitamin d3'][0].note, 'not on this source');
  assert.equal(r.conflicts['nutrient:magnesium'], undefined, 'equal amounts are not a conflict');
  assert.equal(r.conflicts['nutrient:l theanine'], undefined, 'a name with no amount is not evidence');
});

test('a second panel image that omits a nutrient IS recorded', () => {
  const second = { ...panel, id: 102, image_index: 3, processed_at: '2026-09-22T00:00:00Z', supplement_facts: [{ name: 'Magnesium (as Magnesium Glycinate)', amount: '100 mg' }] };
  const r = resolveLabelFields([panel, second]);
  assert.equal(r.sources.nutrients.row_id, 101);
  assert.ok(r.conflicts['nutrient:black pepper extract']);
});

test('serving size: agreeing sources → latest; disagreeing → nutrient source + conflict', () => {
  const agree = resolveLabelFields([text, panel]);
  assert.equal(agree.values.serving_size, '2 ashwagandha gummies');
  assert.equal(agree.sources.serving_size.row_id, 199);
  assert.equal(agree.conflicts.serving_size, undefined);

  const disagree = resolveLabelFields([{ ...text, serving_size: '1 gummy', servings_per_container: '60' }, panel]);
  assert.equal(disagree.values.serving_size, '2 Gummies');
  assert.equal(disagree.sources.serving_size.row_id, 101);
  assert.match(disagree.sources.serving_size.rule, /nutrient source/);
  assert.deepEqual(disagree.conflicts.serving_size.map((x) => x.value).sort(), ['1 gummy', '2 Gummies']);
  assert.equal(disagree.values.servings_per_container, '30');
  assert.ok(disagree.conflicts.servings_per_container);
});

test('certifications: union by claim, listing-text wording first, image-only claims kept with their image', () => {
  const r = resolveLabelFields([panel, text]);
  assert.deepEqual(r.values.certifications, ['Non-GMO Project Verified', 'Gluten Free', 'GMP', 'Non-GMO']);
  const gmp = r.sources.certifications.find((c) => c.claim === 'GMP');
  assert.deepEqual(gmp.sources.map((s) => s.row_id), [199, 101]);
  const nongmo = r.sources.certifications.find((c) => c.claim === 'Non-GMO');
  assert.deepEqual(nongmo.sources.map((s) => s.row_id), [101]);
  assert.equal(claimKey('Gluten-Free'), claimKey('Gluten Free'));
  assert.notEqual(claimKey('Non-GMO'), claimKey('Non-GMO Project Verified'));
});

test('other ingredients: panel image over text', () => {
  assert.equal(resolveLabelFields([text, panel]).values.other_ingredients, 'Pectin, citric acid');
});

test('a mismatch row is never promoted and is listed as excluded', () => {
  const wrong = { ...panel, label_product_match: { verdict: 'mismatch', why: 'count: label 60 vs listing 120' } };
  const r = resolveLabelFields([wrong, text]);
  assert.equal(r.sources.nutrients.row_id, 199);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.excluded[0].row_id, 101);
  assert.match(r.excluded[0].why, /count/);
  assert.ok(!r.values.certifications.includes('Non-GMO'), 'excluded from every field, not just nutrients');
  const only = resolveLabelFields([wrong]);
  assert.deepEqual(only.values.nutrients, []);
  assert.equal(only.label_facts, null);
});

test('stored facts_v2 is used as-is (source row id attached); product_match comes from the nutrient row', () => {
  const v2 = { schema_version: 2, serving: {}, rows: [{ name: 'Zinc', amount_mg: 5, source: { row_id: null, image_url: 'u' } }], warnings: [] };
  const r = resolveLabelFields([{ ...panel, facts_v2: v2, label_product_match: { verdict: 'match', why: 'ok' } }]);
  assert.equal(r.label_facts.rows[0].name, 'Zinc');
  assert.equal(r.label_facts.rows[0].source.row_id, 101);
  assert.equal(r.product_match.verdict, 'match');
});

test('empty input is safe', () => {
  const r = resolveLabelFields([]);
  assert.deepEqual(r.values.nutrients, []);
  assert.deepEqual(r.conflicts, {});
});
