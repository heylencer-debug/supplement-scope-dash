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

test('match_by_serving: the 120-count listing shows the 60-count panel (30 servings × 2) — same product per serving (B09WD43NBC)', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B09WD43NBC',
    title: 'Nature\'s Key Ashwagandha Gummies, 120CT High Potency Root Extract+D2',
    keepa: { variations: [{ asin: 'B09HZ5NB8Y', attributes: [{ value: '60 Count (Pack of 1)', dimension: 'Size' }] }, { asin: 'B09WD43NBC', attributes: [{ value: '120 Count (Pack of 1)', dimension: 'Size' }] }] },
    label: { raw_text: 'Supplement Facts ⏎ 30 servings per container ⏎ Serving size 2 gummies', serving_size: '2 gummies', servings_per_container: '30' },
  });
  assert.equal(r.verdict, 'match_by_serving');
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

// ── review round 2026-09-27: real panels that were wrongly excluded ──

test('an ingredients line is not the flavour (Zipfizz B00KAWSJYC: "natural raspberry flavor" on the Fruit Punch listing)', () => {
  const raw = 'Fruit Punch - Supplement Facts\nServing Size 1 Tube (11 g)\nOther Ingredients: Citric acid, potassium carbonate, glucose polymers, natural raspberry flavor, sodium bicarbonate';
  assert.deepEqual(V.statedFlavors(V.frontOfPack(raw)), []);
  const r = V.checkLabelProductMatch({
    asin: 'B00KAWSJYC', title: 'Zipfizz Energy Drink Powder, 20 Pack Electrolyte Mix with B12 - Fruit Punch',
    keepa: { variations: [{ asin: 'B00KAWSJYC', attributes: [{ value: 'Fruit Punch', dimension: 'FlavorName' }, { value: '0.39 Ounce (Pack of 20)', dimension: 'Size' }] }] },
    label: { raw_text: raw, serving_size: '1 Tube (11 g)' },
  });
  assert.notEqual(r.verdict, 'mismatch');
  assert.equal(r.flavor_match, null);
  const front = V.checkLabelProductMatch({ asin: 'X', title: 'Brand Energy, Fruit Punch Flavor', label: { raw_text: 'natural raspberry flavor\nSupplement Facts' } });
  assert.equal(front.verdict, 'mismatch', 'front-of-pack flavour wording still counts');
  const identity = V.checkLabelProductMatch({ asin: 'X', title: 'Brand Energy, Fruit Punch Flavor', label: { flavor: 'Raspberry', raw_text: '' } });
  assert.equal(identity.verdict, 'mismatch', 'the model\'s package identity counts');
});

test('a variety / assorted listing skips the flavour check (Ultima B0B6242P2W "Tropical Variety")', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B0B6242P2W', title: 'Ultima Replenisher Tropical Variety Electrolyte Packets, 20 Stickpacks',
    keepa: { variations: [{ asin: 'B0B6242P2W', attributes: [{ value: 'Tropical Variety', dimension: 'FlavorName' }, { value: '20 Count (Pack of 1)', dimension: 'Size' }] }] },
    label: { flavor: 'Watermelon', raw_text: '' },
  });
  assert.equal(r.flavor_match, null);
  assert.equal(r.variety_listing, true);
  assert.notEqual(r.verdict, 'mismatch');
});

test('a Keepa size in ounces is not a count (Celsius B002RSRURY "3.08 Ounce (Pack of 1)")', () => {
  const own = V.ownVariationAttributes([{ asin: 'B002RSRURY', attributes: [{ value: 'Berry', dimension: 'FlavorName' }, { value: '3.08 Ounce (Pack of 1)', dimension: 'Size' }] }], 'B002RSRURY');
  assert.equal(own.count, null);
  assert.equal(own.size_is_measure, true);
  for (const v of ['16 Fl Oz (Pack of 12)', '500 g', '1.5 Pound', '250 ml']) {
    assert.equal(V.ownVariationAttributes([{ asin: 'A', attributes: [{ value: v, dimension: 'Size' }] }], 'A').count, null, v);
  }
  const r = V.checkLabelProductMatch({
    asin: 'B002RSRURY', title: 'CELSIUS On-The-Go Powder Stick Packs, Zero Sugar (14 Sticks per Pack)',
    keepa: { variations: [{ asin: 'B002RSRURY', attributes: [{ value: 'Berry', dimension: 'FlavorName' }, { value: '3.08 Ounce (Pack of 1)', dimension: 'Size' }] }] },
    label: { raw_text: 'Supplement Facts', serving_size: '1 Stick Pack (5.11g)', servings_per_container: '14' },
  });
  assert.equal(r.count_match, true, 'falls back to the title count (14 sticks)');
});

test('the title count is tried even when Keepa has its own count (Pedialyte "4 Count (Pack of 6), Total-24")', () => {
  const r = V.checkLabelProductMatch({
    asin: 'B0C1PY9FZP', title: 'Pedialyte Fast Hydration Electrolyte Powder Packets, Fruit Punch, Hydration Drink, 4 Count (Pack of 6), Total-24 Single-Serving Powder Packets',
    keepa: { variations: [{ asin: 'B0C1PY9FZP', attributes: [{ value: 'Fruit Punch', dimension: 'FlavorName' }, { value: '24 Count', dimension: 'Size' }] }] },
    label: { raw_text: 'Nutrition Facts\n8 servings per container\nServing size 1 Packet (9g)', serving_size: '1 Packet (9g)', servings_per_container: '8' },
  });
  assert.notEqual(r.verdict, 'mismatch');
  const titleOnly = V.checkLabelProductMatch({
    asin: 'Z', title: 'Brand Gummies, 10 Count (Pack of 6)',
    keepa: { variations: [{ asin: 'Z', attributes: [{ value: '30 Count', dimension: 'Size' }] }] },
    label: { count: '10 gummies', raw_text: '' },
  });
  assert.equal(titleOnly.count_match, true);
});
