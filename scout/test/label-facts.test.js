// Every name/amount string below is a real dovive_ocr.supplement_facts value
// (read-only sample, 2026-09-27); raw_text excerpts are real image OCR text.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../utils/label-facts');

const TWO_GUMMIES = L.parseServing('2 gummies');
const row = (name, amount, extra = {}) => L.buildRow({ name, amount, ...extra.f }, { serving: extra.serving || TWO_GUMMIES, panel_basis: 'per_serving', raw_text: extra.raw || '' });

test('units: mg / mcg / g / thousands separators / milligrams', () => {
  assert.equal(L.parseAmount('3,000 mg').amount_mg, 3000);
  assert.equal(L.parseAmount('2.4 mcg').amount_mg, 0.0024);
  assert.equal(L.parseAmount('5g').amount_mg, 5000);
  assert.equal(L.parseAmount('100 milligrams').amount_mg, 100);
  assert.equal(L.parseAmount('1,000mg').amount_mg, 1000);
});

test('IU converts only where the factor is defined', () => {
  const d = L.buildRow({ name: 'Vitamin D3 (as Cholecalciferol from Lichen)', amount: '2500iu' }, {});
  assert.equal(d.amount_mg, 0.0625);
  assert.match(d.conversion, /0\.025 mcg/);
  const eNat = L.buildRow({ name: 'Vitamin E (as d-alpha tocopherol)', amount: '15 IU' }, {});
  assert.equal(eNat.amount_mg, 10.05);
  const eUnknown = L.buildRow({ name: 'Vitamin E', amount: '15 IU' }, {});
  assert.equal(eUnknown.amount_mg, null, 'vitamin E IU with no form → unknown, not guessed');
  const aCarotene = L.buildRow({ name: 'Vitamin A (as beta-carotene)', amount: '5000 IU' }, {});
  assert.equal(aCarotene.amount_mg, null);
});

test('mass printed next to IU is primary; IU kept as alternative', () => {
  const a = L.parseAmount('25 mcg (1000 IU)');
  assert.equal(a.amount_mg, 0.025);
  assert.deepEqual(a.alt_amounts, [{ value: 1000, unit: 'IU', equiv: null }]);
  const b = L.parseAmount('400IU(10mcg)');
  assert.equal(b.amount_mg, 0.01);
});

test('equivalent units (RAE, DFE) are recorded as the basis of the mass', () => {
  assert.equal(L.parseAmount('720 mcg RAE').unit_basis, 'RAE');
  const f = L.parseAmount('200 mcg DFE (120 mcg folic acid)');
  assert.equal(f.unit_basis, 'DFE');
  assert.equal(f.amount_mg, 0.2);
});

test('not stated, blends, bounds and non-mass amounts are null, never guessed', () => {
  assert.equal(L.parseAmount('not specified').status, 'not_stated');
  assert.equal(L.parseAmount('unspecified amount per serving').amount_mg, null);
  const blend = L.parseAmount('part of 4000mg blend');
  assert.equal(blend.amount_mg, null);
  assert.equal(blend.in_blend_mg, 4000);
  const bound = L.parseAmount('<1g');
  assert.equal(bound.amount_mg, null);
  assert.equal(bound.status, 'bound');
  assert.equal(L.parseAmount('').status, 'missing');
  assert.equal(L.parseAmount('10 Billion CFU').amount_mg, null);
});

test('serving sizes: units, form, mass, ranges, daily', () => {
  assert.deepEqual(pick(L.parseServing('2 Gummies'), ['units', 'form', 'discrete']), { units: 2, form: 'gummy', discrete: true });
  assert.deepEqual(pick(L.parseServing('1 Scoop (22g)'), ['units', 'form', 'discrete', 'serving_mass_g']), { units: 1, form: 'scoop', discrete: false, serving_mass_g: 22 });
  assert.equal(L.parseServing('1 stick pack (6g)').form, 'stick');
  assert.equal(L.parseServing('two ashwagandha gummies').units, 2);
  const range = L.parseServing('1-2 gummies, 3 times daily');
  assert.equal(range.units, null);
  assert.deepEqual(range.range, [1, 2]);
  assert.equal(L.parseServing('1 gummy twice daily (2 gummies daily)').per_day_units, 2);
  assert.equal(L.parseServing('1 packet (.11 oz)').serving_mass_g, 3.118);
});

test('per serving vs per unit: "2 gummies per serving" gives per-gummy amounts', () => {
  const r = row('Magnesium (as Magnesium Glycinate)', '100 mg');
  assert.equal(r.basis, 'per_serving');
  assert.equal(r.per_serving_mg, 100);
  assert.equal(r.per_unit_mg, 50);
  const perGummy = row('KSM-66 Ashwagandha Root Extract', '1000mg per gummy');
  assert.equal(perGummy.basis, 'per_unit');
  assert.equal(perGummy.basis_source, 'amount_text');
  assert.equal(perGummy.per_serving_mg, 2000);
});

test('per-unit is not computed for a scoop, nor when the serving is a range', () => {
  const scoop = L.buildRow({ name: 'Creatine Monohydrate (micronized)', amount: '5g' }, { serving: L.parseServing('1 Scoop (8g)'), panel_basis: 'per_serving' });
  assert.equal(scoop.per_unit_mg, null);
  const range = L.buildRow({ name: 'Ashwagandha', amount: '300 mg' }, { serving: L.parseServing('1-2 gummies'), panel_basis: 'per_serving' });
  assert.equal(range.per_unit_mg, null);
});

test('"1.7mg (1 gummy) / 3.4mg (2 gummies)" resolves per unit and per serving from the printed variants', () => {
  const r = row('Vitamin B6 (as Pyridoxine HCl)', '1.7mg (1 gummy) / 3.4mg (2 gummies)');
  assert.equal(r.per_unit_mg, 1.7);
  assert.equal(r.per_serving_mg, 3.4);
  assert.equal(r.amount_mg, 3.4);
  const pop = row('Magnesium (as Magnesium Bisglycinate Chelated Buffered from Magnesium Bisglycinate and Magnesium Malate)', '400mg (Adults) / 200mg (Ages 4+)');
  assert.equal(pop.amount_mg, null, 'two populations → no single amount');
  assert.equal(pop.status, 'ambiguous');
  assert.equal(pop.variants.length, 2);
});

test('basis is unknown (null) for listing text with no basis cue', () => {
  const r = L.buildRow({ name: 'Ashwagandha', amount: '3000mg' }, { serving: L.parseServing(null), panel_basis: null });
  assert.equal(r.basis, null);
  assert.equal(r.per_unit_mg, null);
  const v2 = L.buildFactsV2({ facts: [{ name: 'Ashwagandha', amount: '3000mg' }], raw_text: 'POTENT 3000MG ASHWAGANDHA', is_panel: false });
  assert.equal(v2.rows[0].basis, null);
});

test('panel image without a readable header → per serving by panel convention', () => {
  const v2 = L.buildFactsV2({ facts: [{ name: 'Zinc (as Zinc Citrate)', amount: '5 mg' }], serving_size: '1 gummy', is_panel: true, raw_text: 'Zinc 5mg' });
  assert.equal(v2.rows[0].basis, 'per_serving');
  assert.equal(v2.rows[0].basis_source, 'panel_convention');
});

test('elemental: a row named for the mineral states the elemental amount', () => {
  const r = row('Magnesium (as Magnesium Glycinate)', '100 mg');
  assert.equal(r.amount_kind, 'elemental');
  assert.equal(r.elemental_mg, 100);
  assert.equal(r.elemental_basis, 'stated');
  assert.equal(r.compound, 'Magnesium Glycinate');
  const na = row('Sodium (from 1,630mg Sodium Citrate, 318mg Himalayan Rock Salt)', '500mg');
  assert.equal(na.elemental_mg, 500);
  assert.deepEqual(na.compounds, [{ name: 'Sodium Citrate', mg: 1630 }, { name: 'Himalayan Rock Salt', mg: 318 }]);
  const ca = row('Calcium (from 389mg Calcium Bisglycinate Chelate (TRAACS®), 48mg Di-Calcium Phosphate)', '84mg');
  assert.deepEqual(ca.compounds, [{ name: 'Calcium Bisglycinate Chelate', mg: 389 }, { name: 'Di-Calcium Phosphate', mg: 48 }]);
  assert.equal(row('Potassium (K)', '280 mg').elemental_mg, 280);
});

test('compound weight: elemental unknown unless printed or a fixed anhydrous salt', () => {
  const gly = row('Magnesium Glycinate', '500 mg');
  assert.equal(gly.amount_kind, 'compound_weight');
  assert.equal(gly.elemental_mg, null);
  assert.equal(gly.elemental_basis, 'unknown');
  const kcl = row('Potassium Chloride', '500 mg');
  assert.equal(kcl.elemental_basis, 'computed');
  assert.equal(kcl.elemental_factor, 0.5244);
  assert.equal(kcl.elemental_mg, 262.2232);
  const cit = row('Potassium Citrate', '500 mg');
  assert.equal(cit.elemental_mg, null, 'citrates are hydrate-dependent — never computed');
});

test('"Providing Elemental Magnesium 70.8mg" states the elemental amount of the compound row above it (B0DNWLMQXV)', () => {
  const raw = 'Magnesium Glycinate ADVANCED COMPLEX (as 600mg Magnesium Glycinate and 400mgMagnesium L-Threonate) 1000mg * ⏎ Providing Elemental Magnesium: 70.8mg 17%';
  const v2 = L.buildFactsV2({
    facts: [
      { name: 'Magnesium Glycinate ADVANCED COMPLEX (as 600mg Magnesium Glycinate and 400mg Magnesium L-Threonate)', amount: '1000mg' },
      { name: 'Providing Elemental Magnesium', amount: '70.8mg' },
    ],
    serving_size: '1 Gummy', is_panel: true, raw_text: `Amount Per Serving ${raw}`,
  });
  const [cmp, el] = v2.rows;
  assert.equal(cmp.amount_kind, 'compound_weight');
  assert.equal(cmp.elemental_mg, 70.8);
  assert.equal(cmp.elemental_basis, 'stated');
  assert.deepEqual(cmp.compounds, [{ name: 'Magnesium Glycinate', mg: 600 }, { name: 'Magnesium L-Threonate', mg: 400 }]);
  assert.equal(el.amount_kind, 'elemental');
  assert.equal(el.elemental_of_row, 0);
});

test('model-reported elemental amount is accepted only if that number is printed', () => {
  const printed = L.buildRow({ name: 'Magnesium Glycinate', amount: '500 mg', elemental_amount: '70 mg' }, { raw_text: 'Magnesium Glycinate 500 mg (70 mg elemental)' });
  assert.equal(printed.elemental_mg, 70);
  assert.equal(printed.elemental_basis, 'stated');
  const invented = L.buildRow({ name: 'Magnesium Glycinate', amount: '500 mg', elemental_amount: '70 mg' }, { raw_text: 'Magnesium Glycinate 500 mg' });
  assert.equal(invented.elemental_mg, null);
  assert.equal(invented.elemental_basis, 'unknown');
});

test('extract: "Ashwagandha 3000mg (From 300mg of 10:1 Extract)" is a whole-plant equivalent (B09WD43NBC)', () => {
  const r = row('Ashwagandha (From 300mg of 10:1 Extract)', '3000mg');
  assert.equal(r.amount_kind, 'whole_plant_equivalent');
  assert.deepEqual(pick(r.extract, ['ratio', 'extract_mg', 'equivalent_whole_plant_mg', 'equivalent_basis']), { ratio: '10:1', extract_mg: 300, equivalent_whole_plant_mg: 3000, equivalent_basis: 'stated' });
  assert.equal(r.compound, null);
});

test('extract: "16.67 mg (a 30:1 extract, equivalent to 500 mg of Ashwagandha Root)" is the extract weight (B0CVS93LRZ)', () => {
  const r = row('Ashwagandha Root Extract (Withania somnifera) (a 30:1 extract, equivalent to 500 mg of Ashwagandha Root)', '16.67 mg');
  assert.equal(r.amount_kind, 'extract_weight');
  assert.equal(r.extract.extract_mg, 16.67);
  assert.equal(r.extract.equivalent_whole_plant_mg, 500);
  assert.equal(r.extract.ratio, '30:1');
});

test('extract with a ratio but no from/equivalent statement: declared, equivalent NOT computed', () => {
  const r = row('Ashwagandha Root Extract 10:1 (Withania somnifera) (Root) [Solvent: Water]', '2000 mg');
  assert.equal(r.amount_kind, 'extract_declared');
  assert.equal(r.extract.ratio, '10:1');
  assert.equal(r.extract.equivalent_whole_plant_mg, null);
  const ksm = row('KSM-66® Ashwagandha Root From 12-to-1 root extract standardized to > 5% withanolides', '1000mg');
  assert.equal(ksm.extract.ratio, '12:1');
  assert.equal(ksm.extract.standardised_to, '5% withanolides');
  assert.equal(ksm.amount_kind, null, 'label leaves unclear which mass 1000 mg is');
});

test('standardisation and non-extract ratios', () => {
  assert.equal(row('Ashwagandha Root Extract (Standardized to 5% Withanolides)', '3,000 mg').extract.standardised_to, '5% withanolides');
  assert.equal(row('Black Pepper Extract (95% Piperine)', '10mg').extract.standardised_to, '95% piperine');
  assert.equal(row('Carbohydrates (2:1 glucose:fructose ratio)', '30g').extract, null);
  assert.equal(row('BCAAs (Branched Chain Amino Acids, 2:1:1 ratio)', '7g').extract, null);
});

test('model extract hints need their numbers printed', () => {
  const ok = L.buildRow({ name: 'Rhodiola Extract', amount: '100 mg', extract_ratio: '4:1' }, { raw_text: 'Rhodiola Extract (4:1) 100 mg' });
  assert.equal(ok.extract.ratio, '4:1');
  const no = L.buildRow({ name: 'Rhodiola Extract', amount: '100 mg', extract_ratio: '20:1' }, { raw_text: 'Rhodiola Extract 100 mg' });
  assert.equal(no.extract.ratio, null);
});

test('evidence: model excerpt kept only when it is in the label text; else the matching raw line', () => {
  const raw = 'Supplement Facts ⏎ Vitamin D2 25mcg 125% ⏎ Ashwagandha 3000mg †';
  const good = L.findExcerpt(raw, 'Vitamin D2', 'Vitamin D2 25mcg 125%');
  assert.equal(good.excerpt_source, 'model');
  const fabricated = L.findExcerpt(raw, 'Vitamin D2', 'Vitamin D2 50mcg 250%');
  assert.equal(fabricated.excerpt_source, 'raw_text');
  assert.equal(fabricated.excerpt, 'Vitamin D2 25mcg 125%');
  assert.equal(L.findExcerpt('', 'x', 'claimed line').excerpt_source, 'model_unverified');
});

test('buildFactsV2 carries the source image and schema version; withRowSource fills the row id', () => {
  const v2 = L.buildFactsV2({ facts: [{ name: 'Zinc', amount: '5 mg' }, { name: '', amount: '1 mg' }], serving_size: '2 gummies', servings_per_container: '30', is_panel: true, source: { asin: 'A', image_url: 'https://img/1.jpg', image_index: 2 } });
  assert.equal(v2.schema_version, 2);
  assert.equal(v2.rows.length, 1);
  assert.equal(v2.serving.servings_per_container, 30);
  assert.equal(v2.rows[0].source.image_url, 'https://img/1.jpg');
  assert.equal(v2.rows[0].source.row_id, null);
  const withId = L.withRowSource(v2, { id: 42, asin: 'A', image_url: 'https://img/1.jpg', image_index: 2 });
  assert.equal(withId.rows[0].source.row_id, 42);
});

test('numbersAppearIn treats 1,000 and 1000 as the same printed number', () => {
  assert.equal(L.numbersAppearIn('1,000 mg', 'contains 1000mg'), true);
  assert.equal(L.numbersAppearIn('100 mg', 'contains 1000mg'), false);
});

function pick(o, keys) { return Object.fromEntries(keys.map((k) => [k, o[k]])); }

// ── review round 2026-09-27: strings that came back with wrong numbers and status ok ──
// (real dovive_ocr values unless marked "reviewer")

test('ranges are ambiguous, never an amount; min/max kept', () => {
  for (const [raw, min, max] of [['240-250mg', 240, 250], ['120-130mg', 120, 130], ['1-2 g', 1000, 2000] /* reviewer */]) {
    const a = L.parseAmount(raw);
    assert.equal(a.status, 'ambiguous', raw);
    assert.equal(a.amount_mg, null, raw);
    assert.equal(a.range.min_mg, min, raw);
    assert.equal(a.range.max_mg, max, raw);
  }
  const r = row('Potassium', '240-250mg');
  assert.equal(r.amount_mg, null);
  assert.equal(r.per_unit_mg, null);
  assert.deepEqual(r.range, { min: 240, max: 250, unit: 'mg', min_mg: 240, max_mg: 250 });
});

test('"400/200mg" and "9 / 13" are two values in one slot → ambiguous', () => {
  const a = L.parseAmount('400/200mg');
  assert.equal(a.status, 'ambiguous');
  assert.equal(a.amount_mg, null);
  assert.deepEqual(a.variants.map((v) => v.amount_mg), [400, 200]);
  assert.equal(L.parseAmount('9 / 13').status, 'ambiguous');
});

test('"1,5 g" is 1.5 g (decimal comma); "1,000 mg" and "1,630mg" keep their thousands comma (reviewer)', () => {
  assert.equal(L.parseAmount('1,5 g').amount_mg, 1500);
  assert.equal(L.parseAmount('0,25 mg').amount_mg, 0.25);
  assert.equal(L.parseAmount('1,000 mg').amount_mg, 1000);
  assert.equal(L.parseAmount('1,630mg').amount_mg, 1630);
});

test('serving sizes with alternatives → no per-serving / per-unit, alternatives listed', () => {
  const cases = [
    ['1 Gummy for Ages 4+, 2 Gummies for Adults', [1, 2]],
    ['2 Gummies (Adults), 1 Gummy (Ages 4+)', [2, 1]],
    ['2 gummies (adults); 1 gummy (kids age 4+)', [2, 1]],
    ['1 gummy daily (ages 4-13), 2 gummies daily (teens and adults)', [1, 2]],
    ['1 Gummy for Children Ages 4 through 12; 4 Gummies for Ages 13 and Above', [1, 4]],
    ['2 Gummies / 3 Gummies', [2, 3]],
  ];
  for (const [raw, alts] of cases) {
    const s = L.parseServing(raw);
    assert.equal(s.units, null, raw);
    assert.deepEqual(s.serving_alternatives.map((a) => a.units), alts, raw);
  }
  const r = L.buildRow({ name: 'Magnesium (as Magnesium Citrate)', amount: '100 mg' }, { serving: L.parseServing('1 Gummy for Ages 4+, 2 Gummies for Adults'), panel_basis: 'per_serving' });
  assert.equal(r.per_serving_mg, null);
  assert.equal(r.per_unit_mg, null);
  assert.equal(r.amount_mg, 100, 'the printed amount itself is kept');
  // one count, several forms, or a daily total, are NOT alternatives
  assert.equal(L.parseServing('1 scoop or stick').units, 1);
  assert.equal(L.parseServing('2 gummies (for adults and children 14+)').units, 2);
  assert.equal(L.parseServing('1 gummy twice daily (2 gummies daily)').units, 1);
});

test('serving parser: unit nouns end at a word boundary; "a" only as a word; half; implausible counts', () => {
  assert.equal(L.parseServing('2 tablespoons').form, null, 'reviewer: tablespoons are not tablets');
  assert.equal(L.parseServing('2 tablespoons').units, null);
  assert.equal(L.parseServing('Half a scoop').units, 0.5, 'reviewer');
  assert.equal(L.parseServing('Mega scoop').units, null);
  const big = L.parseServing('120 gummies');
  assert.equal(big.units, null);
  assert.equal(big.implausible_serving, true);
  const implied = L.parseServing('2 capsules (implied by 90 capsules / 45-day supply)');
  assert.equal(implied.units, 2);
  assert.equal(implied.inferred, true);
  assert.equal(L.parseServing('1 Stickpack (8.0g / 7.2g / 7.3g)').serving_mass_g, null, 'one mass per flavour — no single serving mass');
  assert.equal(L.parseServing('1 stick (7.4g / 0.26 oz)').serving_mass_g, 7.4);
});

test('model values are checked against the row\'s OWN line, not the whole label', () => {
  const raw = 'Supplement Facts ⏎ Calories 20 ⏎ Magnesium Glycinate 500mg';
  const invented = L.buildRow({ name: 'Magnesium Glycinate', amount: '500 mg', elemental_amount: '20 mg' }, { raw_text: raw });
  assert.equal(invented.elemental_mg, null, '"Calories 20" must not back an invented 20 mg elemental');
  assert.equal(invented.elemental_basis, 'unknown');
  const onLine = L.buildRow({ name: 'Magnesium Glycinate', amount: '500 mg', elemental_amount: '70 mg', evidence_excerpt: 'Magnesium Glycinate 500mg (70mg elemental)' }, { raw_text: 'Calories 20 ⏎ Magnesium Glycinate 500mg (70mg elemental)' });
  assert.equal(onLine.elemental_mg, 70);
  assert.equal(onLine.elemental_basis, 'stated');
  const noLine = L.buildRow({ name: 'Magnesium Glycinate', amount: '500 mg', elemental_amount: '70 mg' }, { raw_text: '' });
  assert.equal(noLine.elemental_mg, 70);
  assert.equal(noLine.elemental_basis, 'model_claimed', 'no excerpt → kept, never stated');
  const ratioElsewhere = L.buildRow({ name: 'Rhodiola Extract', amount: '100 mg', extract_ratio: '4:1' }, { raw_text: 'Rhodiola Extract 100 mg ⏎ Contains 4:1 ratio of love' });
  assert.equal(ratioElsewhere.extract.ratio, null);
  const claimed = L.buildRow({ name: 'Rhodiola Extract', amount: '100 mg', extract_ratio: '4:1' }, { raw_text: '' });
  assert.equal(claimed.extract.ratio, '4:1');
  assert.deepEqual(claimed.extract.model_claimed, ['ratio']);
  const cmp = L.buildRow({ name: 'Zinc', amount: '5 mg', compound: 'zinc picolinate' }, { raw_text: '' });
  assert.equal(cmp.compound_source, 'model_claimed');
});

test('KSM-66 standardisation is captured without the word "extract"', () => {
  const r = row('KSM-66® Ashwagandha Root (standardized to 5% withanolides)', '600 mg');
  assert.equal(r.extract.standardised_to, '5% withanolides');
  assert.equal(r.extract.ratio, null);
  assert.equal(r.amount_kind, 'ingredient');
});
