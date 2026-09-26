const test = require('node:test');
const assert = require('node:assert/strict');
const { productLineKeys, headSegment } = require('../utils/product-line');

// Real titles from the "electrolyte powder #3" category (read-only, 2026-09-26),
// plus other brands so category-common words are learned from the pool.
const LIV = 'Liquid I.V.';
const items = [
  { asin: 'LIV_BASE16', brand: LIV, title: 'Liquid I.V. Hydration Electrolytes, Lemon Lime, 16 Count' },
  { asin: 'LIV_SIGVAR', brand: LIV, title: 'Liquid I.V. Electrolyte Powder, Signature Variety Pack, 16 Count' },
  { asin: 'LIV_TUB30', brand: LIV, title: 'Liquid I.V. Hydration Electrolytes Tub, Lemon Lime, 30 Servings' },
  { asin: 'LIV_PASSIO', brand: LIV, title: 'Liquid I.V. Hydration Electrolytes, Passion Fruit, 10 Count | Scientifically Formulated' },
  { asin: 'LIV_SF_LL', brand: LIV, title: 'Liquid I.V. Sugar Free Hydration Electrolytes, Lemon Lime, 14 Count' },
  { asin: 'LIV_SF_VAR', brand: LIV, title: 'Liquid I.V. Sugar Free Electrolyte Packets, Classic Variety Pack, 16 Count' },
  { asin: 'LIV_IMMUNE', brand: LIV, title: 'Liquid I.V. Hydration + Immune Electrolytes, Tangerine, 14 Count' },
  { asin: 'KN_BLUE', brand: 'KEY NUTRIENTS', title: 'KEY NUTRIENTS Multivitamin Electrolytes Powder, Blue Raspberry, 90 Servings' },
  { asin: 'KN_PEACH', brand: 'KEY NUTRIENTS', title: 'KEY NUTRIENTS Multivitamin Electrolytes Powder, Peach Mango, 90 Servings' },
  { asin: 'PED_ADV', brand: 'Pedialyte', title: 'Pedialyte AdvancedCare Plus Electrolyte Powder Packets, Berry Frost' },
  { asin: 'PED_VAR', brand: 'Pedialyte', title: 'Pedialyte Electrolyte Powder Packets, On-the-Go Hydration Variety Pack' },
  { asin: 'PED_ZERO', brand: 'Pedialyte', title: 'Pedialyte Electrolyte Drink Mix With Zero Sugar | Hydration With Key Electrolytes | Strawberry, 24 Powder Packets' },
  { asin: 'ULT_WATER', brand: 'Ultima Replenisher', title: 'Ultima Replenisher Watermelon Electrolytes Powder, 30-Serving Canister' },
  { asin: 'ULT_PINK', brand: 'Ultima Replenisher', title: 'Ultima Replenisher Pink Lemonade Electrolyte Packets, 20 Stickpacks' },
  { asin: 'NOBRAND', brand: '', title: 'Electrolytes Powder, Raw Unflavored, 800mg Sodium, 90 Servings' },
  { asin: 'XT1', brand: 'XTEND', title: 'XTEND Sport BCAA Powder Blue Raspberry Ice - Electrolyte Powder for Recovery' },
];

test('flavors, counts, tubs and variety packs of one line share a key', () => {
  const k = productLineKeys(items);
  const base = k.get('LIV_BASE16');
  for (const a of ['LIV_SIGVAR', 'LIV_TUB30', 'LIV_PASSIO']) assert.equal(k.get(a), base, a);
  assert.equal(k.get('KN_BLUE'), k.get('KN_PEACH'));
  assert.equal(k.get('ULT_WATER'), k.get('ULT_PINK'));
});

test('distinct formula lines stay separate: sugar free, immune, AdvancedCare Plus, zero sugar', () => {
  const k = productLineKeys(items);
  assert.equal(k.get('LIV_SF_LL'), k.get('LIV_SF_VAR'));
  assert.notEqual(k.get('LIV_SF_LL'), k.get('LIV_BASE16'));
  assert.notEqual(k.get('LIV_IMMUNE'), k.get('LIV_BASE16'));
  assert.notEqual(k.get('LIV_IMMUNE'), k.get('LIV_SF_LL'));
  assert.notEqual(k.get('PED_ADV'), k.get('PED_VAR'));
  assert.notEqual(k.get('PED_ZERO'), k.get('PED_VAR'));
  const liv = new Set(['LIV_BASE16', 'LIV_SIGVAR', 'LIV_TUB30', 'LIV_PASSIO', 'LIV_SF_LL', 'LIV_SF_VAR', 'LIV_IMMUNE'].map((a) => k.get(a)));
  assert.equal(liv.size, 3);
});

test('different brands never share a key; unknown brand gets no key', () => {
  const k = productLineKeys(items);
  assert.notEqual(k.get('KN_BLUE'), k.get('ULT_WATER'));
  assert.equal(k.get('NOBRAND'), null);
});

test('head segment stops at the first separator', () => {
  assert.equal(headSegment('A B, C | D'), 'A B');
  assert.equal(headSegment('XTEND Sport BCAA Powder - Electrolyte'), 'XTEND Sport BCAA Powder');
});
