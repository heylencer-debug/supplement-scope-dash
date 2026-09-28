'use strict';
// The formula phases' product selects must contain every column their helpers
// read — a missing column is not an error in supabase-js, it is a silently
// empty section of the prompt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const fi = require('../utils/formula-inputs');

/** What PostgREST hands back for `select(cols)`: only those keys. */
function project(row, select) {
  const out = {};
  for (const c of fi.selectColumns(select)) if (c in row) out[c] = row[c];
  return out;
}

const FULL_ROW = {
  asin: 'B01', brand: 'Acme', title: 'Acme Electrolyte Powder, Lemon', bsr_current: 1200,
  price: 24.99, marketing_analysis: { product_intelligence: {} }, review_analysis: {},
  all_nutrients: [{ name: 'Sodium', amount: '500 mg', dv_percent: '22%' }, { name: 'Potassium', amount: '200 mg' }],
  serving_size: '1 stick (7 g)', other_ingredients: 'Citric acid, natural lemon flavor, stevia',
  supplement_facts_raw: 'Sodium: 500 mg',
};

test('selectColumns splits and trims a multi-line select', () => {
  assert.deepEqual(fi.selectColumns(`a, b,\n   c ,`), ['a', 'b', 'c']);
});

test('P7: products fetched with P7_PRODUCT_COLUMNS produce a dosage table', () => {
  assert.ok(fi.selectColumns(fi.P7_PRODUCT_COLUMNS).includes('all_nutrients'));
  const table = fi.buildDosageTable([project(FULL_ROW, fi.P7_PRODUCT_COLUMNS)]);
  assert.match(table, /Acme \(BSR 1,200\): Sodium: 500 mg \| Potassium: 200 mg/);
});

test('P7: buildDosageTable accepts the ingredient/quantity spelling and skips empty rows', () => {
  const table = fi.buildDosageTable([
    { brand: 'NoLabel', bsr_current: 5, all_nutrients: [] },
    { brand: 'Alt', bsr_current: 9, all_nutrients: [{ ingredient: 'Zinc', quantity: '10 mg' }] },
  ]);
  assert.equal(table, 'Alt (BSR 9): Zinc: 10 mg');
  assert.equal(fi.buildDosageTable([]), 'OCR dosage data not yet available');
  assert.equal(fi.buildDosageTable(undefined), 'OCR dosage data not yet available');
});

test('P7 selects through P7_PRODUCT_COLUMNS', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'phase6-market-analysis.js'), 'utf8');
  assert.match(src, /\.select\(P7_PRODUCT_COLUMNS\)/);
  assert.doesNotMatch(src, /function buildDosageTable/);
});
