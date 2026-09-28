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
  // The read moved to utils/formula-reads.js (evidence layer); it still selects P7_PRODUCT_COLUMNS.
  const src = fs.readFileSync(path.join(__dirname, '..', 'phase6-market-analysis.js'), 'utf8');
  const reads = fs.readFileSync(path.join(__dirname, '..', 'utils', 'formula-reads.js'), 'utf8');
  assert.match(src, /p7Products\(EV, CAT_ID\)/);
  assert.match(reads, /ev\.products\(categoryId, P7_PRODUCT_COLUMNS,/);
  assert.doesNotMatch(src, /function buildDosageTable/);
});

test('P9: "all products" fetched with P9_ALL_PRODUCT_COLUMNS produce a serving-size distribution', () => {
  assert.ok(fi.selectColumns(fi.P9_ALL_PRODUCT_COLUMNS).includes('serving_size'));
  const rows = [FULL_ROW, { ...FULL_ROW, serving_size: '1 Stick (7 g) ' }, { ...FULL_ROW, serving_size: '2 scoops' }]
    .map((r) => project(r, fi.P9_ALL_PRODUCT_COLUMNS));
  assert.equal(fi.servingSizeDistribution(rows), '"1 stick (7 g)": 2 products\n"2 scoops": 1 products');
});

test('P9: servingSizeDistribution keeps the top 8 and is empty with no data', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ serving_size: `${i + 1} g` }));
  assert.equal(fi.servingSizeDistribution(rows).split('\n').length, 8);
  assert.equal(fi.servingSizeDistribution([{ price: 1 }]), '');
  assert.equal(fi.servingSizeDistribution(null), '');
});

test('P9 selects its aggregate set through P9_ALL_PRODUCT_COLUMNS', () => {
  // The read moved to utils/formula-reads.js (evidence layer); it still selects P9_ALL_PRODUCT_COLUMNS.
  const src = fs.readFileSync(path.join(__dirname, '..', 'phase8-formula-brief.js'), 'utf8');
  const reads = fs.readFileSync(path.join(__dirname, '..', 'utils', 'formula-reads.js'), 'utf8');
  assert.match(src, /p9AllProducts\(EV, categoryId\)/);
  assert.match(reads, /ev\.products\(categoryId, P9_ALL_PRODUCT_COLUMNS,/);
  assert.match(src, /serving_size_distribution: servingSizeDist,/);
});

test('P10: competitors fetched with P10_COMPETITOR_COLUMNS expose the other-ingredients flavour', () => {
  assert.ok(fi.selectColumns(fi.P10_COMPETITOR_COLUMNS).includes('other_ingredients'));
  const c = project({ ...FULL_ROW, title: 'Acme Electrolytes', supplement_facts_raw: 'Sodium: 500 mg' }, fi.P10_COMPETITOR_COLUMNS);
  const fields = fi.competitorFlavourFields(c);
  assert.deepEqual(fields.map((f) => f.key), ['title', 'supplement_facts_raw', 'other_ingredients']);
  const hit = fields.find((f) => f.text.includes('lemon'));
  assert.equal(hit && hit.key, 'other_ingredients');
});

test('P10: competitorFlavourFields ignores marketing_analysis.other_ingredients and non-string values', () => {
  const fields = fi.competitorFlavourFields({ marketing_analysis: { other_ingredients: 'mango' }, other_ingredients: ['cherry'] });
  assert.ok(fields.every((f) => f.text === ''));
  assert.ok(fi.competitorFlavourFields(null).every((f) => f.text === ''));
});

test('P10 selects competitors through P10_COMPETITOR_COLUMNS and scans the real column', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'phase9-formula-qa.js'), 'utf8');
  assert.match(src, /\.select\(P10_COMPETITOR_COLUMNS\)/);
  assert.doesNotMatch(src, /marketing_analysis\??\.other_ingredients/);
  assert.equal((src.match(/competitorFlavourFields\(c\)/g) || []).length, 2);
});
