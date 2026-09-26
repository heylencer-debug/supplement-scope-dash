// Titles, label text and Keepa variations are real rows (read-only, 2026-09-27).
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../utils/label-variant');

const VAZATISI_VARS = [
  { asin: 'B0DN9RKRQR', attributes: [{ value: 'Blueberry', dimension: 'FlavorName' }, { value: '60 Count (Pack of 1)', dimension: 'Size' }] },
  { asin: 'B0C3RJF2WD', attributes: [{ value: 'Mixed Berry', dimension: 'FlavorName' }, { value: '60 Count (Pack of 1)', dimension: 'Size' }] },
  { asin: 'B0C3RKHDWB', attributes: [{ value: 'Mixed Berry', dimension: 'FlavorName' }, { value: '60 Count (Pack of 2)', dimension: 'Size' }] },
];
const VAZATISI_LABEL = '2 Pack ⏎ Vazatisi ⏎ ASHWAGANDHA GUMMIES ⏎ With Ginkgo Biloba, Turmeric L-Theanine, Gaba & Multivitamins ⏎ 60 Sugar-free Gummies Mixed Berry Flavor ⏎ Dietary Supplement ⏎ Supplement Facts ⏎ Serving Size: 2 Gummies ⏎ Servings Per Container: 30';

test('count parsing: listing and label wording, trademarks and serving lines excluded', () => {
  assert.equal(V.extractCount('Nature\'s Key Ashwagandha Gummies, 120CT High Potency Root Extract+D2').count, 120);
  assert.equal(V.extractCount('2 Pack Ashwagandha Gummies ... Mixed Berry Flavor 120 Cts').count, 120);
  assert.equal(V.extractCount('Lunakai USA Made KSM-66 Ashwagandha Gummies for Women & Men, 60ct').count, 60);
  assert.equal(V.extractCount('Wekannufod Ashwagandha Gummies 1000mg, 60 Count').count, 60);
  assert.equal(V.extractCount('60 Sugar-free Gummies Mixed Berry Flavor').count, 60);
  assert.equal(V.extractCount('Serving Size: 2 Gummies ⏎ Adults take 2 gummies daily'), null);
  assert.equal(V.extractPack('60 Count (Pack of 2)'), 2);
  assert.equal(V.extractPack('2 Pack Ashwagandha Gummies'), 2);
});

test('flavour: stated flavour phrases only, longest first', () => {
  assert.deepEqual(V.statedFlavors('Himalaya KSM-66 Organic Ashwagandha Gummies, BlackBerry Flavor, 120 Gummies'), ['blackberry']);
  assert.deepEqual(V.statedFlavors('NATURALLY STRAWBERRY FLAVORED HEALTHY STRESS RESPONSE'), ['strawberry']);
  assert.deepEqual(V.extractFlavors('Mixed Berry'), ['mixed berry']);
  assert.deepEqual(V.statedFlavors('Tart Cherry Powder 100 mg'), [], 'an ingredient is not a flavour');
});

test('Keepa own-variation attributes', () => {
  assert.deepEqual(V.ownVariationAttributes(VAZATISI_VARS, 'B0C3RKHDWB'), { flavor: 'Mixed Berry', size: '60 Count (Pack of 2)', count: 60, pack: 2 });
  assert.equal(V.ownVariationAttributes(VAZATISI_VARS, 'NOPE'), null);
});

test('match: 2-pack of 60 — label "60 … Gummies", Keepa "60 Count (Pack of 2)", same flavour (B0C3RKHDWB)', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B0C3RKHDWB',
    title: '2 Pack Ashwagandha Gummies with Turmeric GABA Mood Energy and Immune Support, Mixed Berry Flavor 120 Cts',
    keepa: { parent_asin: 'B0DKT95WC9', variations: VAZATISI_VARS },
    label: { raw_text: VAZATISI_LABEL, serving_size: '2 Gummies', servings_per_container: '30' },
  });
  assert.equal(r.verdict, 'match');
  assert.equal(r.count_match, true);
  assert.equal(r.flavor_match, true);
  assert.equal(r.parent_asin, 'B0DKT95WC9');
  assert.deepEqual(r.mismatch_on, []);
});

test('mismatch: the 120-count listing shows the 60-count panel (30 servings × 2) (B09WD43NBC)', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B09WD43NBC',
    title: 'Nature\'s Key Ashwagandha Gummies, 120CT High Potency Root Extract+D2',
    keepa: { variations: [{ asin: 'B09HZ5NB8Y', attributes: [{ value: '60 Count (Pack of 1)', dimension: 'Size' }] }, { asin: 'B09WD43NBC', attributes: [{ value: '120 Count (Pack of 1)', dimension: 'Size' }] }] },
    label: { raw_text: 'Supplement Facts ⏎ 30 servings per container ⏎ Serving size 2 gummies', serving_size: '2 gummies', servings_per_container: '30' },
  });
  assert.equal(r.verdict, 'mismatch');
  assert.deepEqual(r.mismatch_on, ['count']);
  assert.equal(r.label.count_source, 'servings × units');
  assert.match(r.why, /120 Count/);
});

test('mismatch on flavour; match on count from the title alone', () => {
  const flav = V.checkLabelProductMatch({ asin: 'X', title: 'Brand Gummies 60 Count Strawberry Flavor', label: { flavor: 'Blue Raspberry', raw_text: 'Supplement Facts' } });
  assert.equal(flav.verdict, 'mismatch');
  assert.deepEqual(flav.mismatch_on, ['flavor']);
  const cnt = V.checkLabelProductMatch({ asin: 'B099V8HSQF', title: 'Nature\'s Truth Ashwagandha Gummies | 60 Count | Tropical Flavor', label: { raw_text: 'Supplement Facts', serving_size: '1 Vegan Gummy', servings_per_container: '60' } });
  assert.equal(cnt.verdict, 'match');
});

test('brand conflict only counts when the product name does not overlap either', () => {
  const r = V.checkLabelProductMatch({ asin: 'X', title: 'Acme Magnesium Glycinate Gummies', brand: 'Acme', label: { brand: 'Zenwise', product_name: 'Sleep Gummies', raw_text: 'Supplement Facts' } });
  assert.equal(r.verdict, 'mismatch');
  assert.deepEqual(r.mismatch_on, ['brand']);
  const same = V.checkLabelProductMatch({ asin: 'X', title: 'Liquid I.V. Hydration Multiplier', brand: 'Liquid I.V.', label: { brand: 'LIQUID I.V.', raw_text: '' } });
  assert.equal(same.verdict, 'match');
});

test('unknown when the label shows nothing that identifies the variation', () => {
  const r = V.checkLabelProductMatch({ asin: 'X', title: 'Brand Gummies', label: { raw_text: 'Supplement Facts Calories 10' } });
  assert.equal(r.verdict, 'unknown');
});

test('loadKeepaVariants is read-only and fail-open', async () => {
  const ok = { from: () => ({ select: () => ({ in: async () => ({ data: [{ asin: 'A', parent_asin: 'P', variations: VAZATISI_VARS }], error: null }) }) }) };
  const m = await V.loadKeepaVariants(ok, ['A']);
  assert.equal(m.get('A').parent_asin, 'P');
  const boom = { from: () => { throw new Error('network'); } };
  assert.equal((await V.loadKeepaVariants(boom, ['A'])).size, 0);
  const err = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'x' } }) }) }) };
  assert.equal((await V.loadKeepaVariants(err, ['A'])).size, 0);
});

test('a whole multiple with no pack size stated is a probable multipack → unknown (Pedialyte B01JO4KWAU)', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B01JO4KWAU',
    title: 'Pedialyte Electrolyte Powder Packets, On-the-Go Hydration Variety Pack',
    keepa: { variations: [{ asin: 'B01JO4KWAU', attributes: [{ value: '24 Count', dimension: 'Size' }] }] },
    label: { raw_text: 'Supplement Facts Serving Size 1 Packet', serving_size: '1 Packet', servings_per_container: '8' },
  });
  assert.equal(r.count_match, null);
  assert.equal(r.verdict, 'unknown');
  assert.match(r.count_note, /3× the label's 8/);
});

test('Keepa "1 Count (Pack of 120)" reads as 120 (B0FK1833JY)', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B0FK1833JY',
    title: 'OLLY Relaxing Magnesium Gummies, Supports Muscle Relaxation* - 120 Count',
    keepa: { variations: [{ asin: 'B0FK1833JY', attributes: [{ value: '1 Count (Pack of 120)', dimension: 'Size' }] }] },
    label: { count: '120 Gummies', raw_text: '' },
  });
  assert.equal(r.count_match, true);
  assert.equal(r.verdict, 'match');
});
