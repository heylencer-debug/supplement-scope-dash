/**
 * utils/label-facts.js — structured supplement-facts rows, schema v2 (pure).
 *
 * "Verify labels and product information" (owner, 2026-09-27). The legacy
 * P4 row is `{ name, amount, dv_percent }` with `amount` a free string, and P8
 * strips the unit off it. v2 keeps that string (amount_raw) and adds what it
 * actually MEANS:
 *
 *   - basis        per_serving | per_unit | per_day | per_container | null
 *   - per_unit_mg / per_serving_mg, computed only when the serving units are known
 *   - elemental vs compound: "Magnesium (as Magnesium Glycinate) 100 mg" states
 *     100 mg of magnesium; "Magnesium Glycinate 500 mg" states a compound weight
 *     whose elemental share is unknown unless the label says it ("Providing
 *     Elemental Magnesium 70.8 mg") or the compound is a fixed anhydrous salt.
 *   - extract vs whole-plant equivalent: "Ashwagandha 3000 mg (From 300 mg of
 *     10:1 Extract)" is 300 mg of extract declared as its 3000 mg equivalent.
 *   - source: which dovive_ocr row / image / line of text the row came from.
 *
 * THE RULE (same as RnD-Database): unknown = null, never a guess. Every number
 * here is either parsed from the printed text, or computed from printed numbers
 * with the factor recorded next to it. A model-supplied value is only accepted
 * when the number it names appears in the label text it claims to come from.
 *
 * Every string pattern handled here was taken from real dovive_ocr rows
 * (read-only sample of 780 rows, 2026-09-27) — see test/label-facts.test.js.
 */

'use strict';

const SCHEMA_VERSION = 2;

// ── units ───────────────────────────────────────────────────────────────

const MASS_UNITS = {
  mg: 1, milligram: 1, milligrams: 1,
  mcg: 0.001, 'µg': 0.001, ug: 0.001, microgram: 0.001, micrograms: 0.001,
  g: 1000, gram: 1000, grams: 1000, gm: 1000,
  kg: 1e6,
};
const EQUIV_BASES = { rae: 'RAE', dfe: 'DFE', ne: 'NE', 'α-te': 'alpha-TE', 'a-te': 'alpha-TE', 'alpha-te': 'alpha-TE', te: 'alpha-TE' };

// Number: 3,000 · 1,630 · 2.5 · .11 · 16.67
const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d*\\.\\d+|\\d+)';
const UNIT = '(mcg|µg|ug|mg|milligrams?|micrograms?|grams?|gm|g|kg|iu|i\\.u\\.|billion\\s*cfu|million\\s*cfu|cfu|kcal|calories|ml|%)';
const QTY_RE = new RegExp(`(<|>|≤|≥|less than|up to)?\\s*${NUM}\\s*${UNIT}(?:\\s*(rae|dfe|ne|α-te|a-te|alpha-te))?(?![a-z])`, 'gi');

function toNumber(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round(n, dp = 4) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function normUnit(u) {
  if (!u) return null;
  const x = String(u).toLowerCase().replace(/\s+/g, ' ').trim();
  if (x === 'i.u.' || x === 'iu') return 'IU';
  if (/billion\s*cfu/.test(x)) return 'billion CFU';
  if (/million\s*cfu/.test(x)) return 'million CFU';
  if (x === 'cfu') return 'CFU';
  if (x === 'kcal' || x === 'calories') return 'kcal';
  if (x === 'ml') return 'mL';
  if (x === '%') return '%';
  if (x === 'µg' || x === 'ug' || /^micrograms?$/.test(x)) return 'mcg';
  if (/^milligrams?$/.test(x)) return 'mg';
  if (/^grams?$/.test(x) || x === 'gm') return 'g';
  return x;
}

/**
 * IU → mg, only where the factor is DEFINED (NIH ODS fact sheets):
 *   vitamin D (D2/D3):          1 IU = 0.025 mcg
 *   vitamin E, natural d-alpha: 1 IU = 0.67 mg  (RRR-alpha-tocopherol)
 *   vitamin E, synthetic dl-:   1 IU = 0.45 mg  (all-rac-alpha-tocopherol)
 *   vitamin A as retinol/retinyl esters: 1 IU = 0.3 mcg RAE
 * Everything else (vitamin E of unstated form, vitamin A as beta-carotene,
 * whose factor depends on the source) → null.
 */
function iuToMg(value, text) {
  if (value == null) return { mg: null, factor: null, why: 'no value' };
  const t = String(text || '').toLowerCase();
  if (/vitamin\s*d\b|vitamin\s*d[23]|cholecalciferol|ergocalciferol/.test(t)) return { mg: value * 0.000025, factor: '1 IU vitamin D = 0.025 mcg' };
  if (/vitamin\s*e\b|tocopher/.test(t)) {
    if (/\bdl-?\s*alpha|all-rac/.test(t)) return { mg: value * 0.45, factor: '1 IU synthetic vitamin E (dl-alpha) = 0.45 mg' };
    if (/\bd-?\s*alpha|rrr-/.test(t)) return { mg: value * 0.67, factor: '1 IU natural vitamin E (d-alpha) = 0.67 mg' };
    return { mg: null, factor: null, why: 'vitamin E IU needs the form (d-alpha vs dl-alpha)' };
  }
  if (/vitamin\s*a\b|retinol|retinyl/.test(t) && !/carotene/.test(t)) {
    if (/retinol|retinyl/.test(t)) return { mg: value * 0.0003, factor: '1 IU retinol = 0.3 mcg RAE' };
    return { mg: null, factor: null, why: 'vitamin A IU needs the form (retinol vs beta-carotene)' };
  }
  return { mg: null, factor: null, why: 'no defined IU factor for this nutrient' };
}

/** A mass (or defined-IU) quantity in mg; null for CFU, kcal, %, mL, unknown IU. */
function toMg(value, unit, context = '') {
  const u = normUnit(unit);
  if (value == null || !u) return { mg: null, factor: null };
  if (MASS_UNITS[u] != null) return { mg: value * MASS_UNITS[u], factor: null };
  if (u === 'IU') return iuToMg(value, context);
  return { mg: null, factor: null, why: `${u} is not a mass` };
}

function allQuantities(text) {
  const out = [];
  if (!text) return out;
  const re = new RegExp(QTY_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(text)))) {
    const value = toNumber(m[2]);
    if (value == null) continue;
    out.push({
      qualifier: m[1] ? m[1].toLowerCase() : null,
      value,
      unit: normUnit(m[3]),
      equiv: m[4] ? EQUIV_BASES[m[4].toLowerCase()] || null : null,
      index: m.index,
      text: m[0].trim(),
    });
  }
  return out;
}

const NOT_STATED_RE = /\b(not specified|unspecified|unknown|not listed|not stated|n\/a|included|proprietary|amount not)\b/i;
const BLEND_RE = /part of (?:the )?(?:a )?([\d,.]+)\s*(mg|g|mcg)\b/i;

const UNIT_WORDS = '(gumm(?:y|ies)|capsules?|caps|veg(?:gie)?\\s*caps(?:ules)?|softgels?|tablets?|tabs?|chews?|soft\\s*chews?|lozenges?|scoops?|sticks?|stick\\s*packs?|stickpacks?|packets?|tubes?|servings?)';

function basisHintFromText(t) {
  const x = String(t || '').toLowerCase();
  if (new RegExp(`\\bper\\s+(?:${UNIT_WORDS})\\b`).test(x) && !/per\s+serving/.test(x)) return 'per_unit';
  if (/\bper\s+serving\b/.test(x)) return 'per_serving';
  if (/\b(per\s+day|daily|a\s+day)\b/.test(x)) return 'per_day';
  if (/\bper\s+(container|bottle|jar|tub|bag)\b/.test(x)) return 'per_container';
  return null;
}

/**
 * Parse one printed amount string.
 * @returns {{ amount_raw, value, unit_raw, unit_basis, amount_mg, conversion, alt_amounts, qualifier,
 *             basis_hint, variants, in_blend_mg, status }}
 *   status: ok | missing | not_stated | ambiguous | non_mass | bound ("<1 g")
 */
function parseAmount(raw, context = '') {
  const amount_raw = raw == null ? null : String(raw).trim() || null;
  const base = { amount_raw, value: null, unit_raw: null, unit_basis: null, amount_mg: null, conversion: null, alt_amounts: [], qualifier: null, basis_hint: null, variants: null, range: null, in_blend_mg: null, status: 'missing' };
  if (!amount_raw) return base;
  // "1,5 g": a comma followed by exactly 1–2 digits ending the number is a
  // decimal separator ("1,000" and "1,630" keep their thousands comma).
  const text = amount_raw.replace(/(\d),(\d{1,2})(?![\d,])/g, '$1.$2');
  base.basis_hint = basisHintFromText(text);

  // "240-250mg", "1-2 g", "120 to 130 mg": a range is not an amount.
  const range = text.match(new RegExp(`${NUM}\\s*(?:-|–|to)\\s*${NUM}\\s*${UNIT}(?![a-z])`, 'i'));
  if (range) {
    const lo = toNumber(range[1]);
    const hi = toNumber(range[2]);
    const unit = normUnit(range[3]);
    return { ...base, range: { min: lo, max: hi, unit, min_mg: round(toMg(lo, unit, context).mg, 6), max_mg: round(toMg(hi, unit, context).mg, 6) }, status: 'ambiguous' };
  }
  // "400/200mg", "9 / 13": two numbers sharing one slot — which one applies is not printed.
  const pair = text.match(new RegExp(`^\\s*${NUM}\\s*\\/\\s*${NUM}\\s*${UNIT}?(?![a-z])`, 'i'));
  if (pair) {
    const unit = normUnit(pair[3]);
    const variants = [pair[1], pair[2]].map((v) => ({ text: `${v}${unit ? ` ${unit}` : ''}`, value: toNumber(v), unit, amount_mg: unit ? round(toMg(toNumber(v), unit, context).mg, 6) : null, units: null, label: null }));
    return { ...base, variants, status: 'ambiguous' };
  }

  const blend = text.match(BLEND_RE);
  if (blend) {
    const b = toNumber(blend[1]);
    base.in_blend_mg = b != null ? toMg(b, blend[2]).mg : null;
    return { ...base, status: 'not_stated' };
  }

  // Two or more alternatives separated by "/" ("83 mg / 330 mg",
  // "1.7mg (1 gummy) / 3.4mg (2 gummies)", "400mg (Adults) / 200mg (Ages 4+)").
  const parts = text.split(/\s\/\s|\s\/(?=\s*\d)|(?<=[a-z)])\/(?=\s*\d)/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts.filter((p) => allQuantities(p).length).length > 1) {
    const variants = parts.map((p) => {
      const q = allQuantities(p)[0] || null;
      const um = p.match(new RegExp(`\\(\\s*(\\d+)\\s+${UNIT_WORDS}\\s*\\)`, 'i'));
      const label = (p.match(/\(([^)]*)\)\s*$/) || [])[1] || null;
      return {
        text: p,
        value: q ? q.value : null,
        unit: q ? q.unit : null,
        amount_mg: q ? round(toMg(q.value, q.unit, context).mg, 6) : null,
        units: um ? Number(um[1]) : null,
        label,
      };
    });
    return { ...base, variants, status: 'ambiguous' };
  }

  const qs = allQuantities(text);
  if (!qs.length) {
    if (NOT_STATED_RE.test(text)) return { ...base, status: 'not_stated' };
    const bare = text.match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*$/);
    if (bare) return { ...base, value: toNumber(bare[1]), status: 'non_mass' }; // a bare number (e.g. Calories 10)
    return { ...base, status: NOT_STATED_RE.test(context) ? 'not_stated' : 'non_mass' };
  }
  // Prefer the first MASS quantity as primary; any other quantity is an alternative
  // rendering ("25 mcg (1000 IU)", "400IU(10mcg)").
  const massFirst = qs.find((q) => MASS_UNITS[q.unit] != null) || qs[0];
  const conv = toMg(massFirst.value, massFirst.unit, context);
  const out = {
    ...base,
    value: massFirst.value,
    unit_raw: massFirst.unit,
    unit_basis: massFirst.equiv,
    qualifier: massFirst.qualifier,
    amount_mg: massFirst.qualifier ? null : round(conv.mg, 6), // "<1 g" is a bound, not an amount
    conversion: conv.factor || null,
    alt_amounts: qs.filter((q) => q !== massFirst).map((q) => ({ value: q.value, unit: q.unit, equiv: q.equiv })),
  };
  if (massFirst.unit === '%') out.status = 'non_mass';
  else if (massFirst.qualifier) out.status = 'bound';
  else if (out.amount_mg == null) out.status = 'non_mass';
  else out.status = 'ok';
  return out;
}

// ── serving size ────────────────────────────────────────────────────────

const WORD_NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, single: 1, a: 1, an: 1 };
const DISCRETE_FORMS = new Set(['gummy', 'capsule', 'softgel', 'tablet', 'chew', 'lozenge', 'stick', 'packet', 'tube']);
// More discrete units than this in ONE serving is a misread (a container count
// like "120 gummies" in the serving-size slot), not a serving.
const MAX_DISCRETE_UNITS = 12;

function canonicalForm(w) {
  const x = String(w || '').toLowerCase().replace(/\s+/g, ' ');
  if (/gumm/.test(x)) return 'gummy';
  if (/softgel/.test(x)) return 'softgel';
  if (/cap/.test(x)) return 'capsule';
  if (/tab/.test(x)) return 'tablet';
  if (/chew/.test(x)) return 'chew';
  if (/lozenge/.test(x)) return 'lozenge';
  if (/scoop/.test(x)) return 'scoop';
  if (/stick/.test(x)) return 'stick';
  if (/packet|sachet|pack\b/.test(x)) return 'packet';
  if (/tube/.test(x)) return 'tube';
  if (/serving/.test(x)) return 'serving';
  return null;
}

/**
 * "2 gummies" · "1 Scoop (22g)" · "1 stick pack (6g)" · "two ashwagandha gummies"
 * · "1-2 gummies, 3 times daily" (a range → units null) · "1 gummy twice daily
 * (2 gummies daily)".
 */
function parseServing(raw) {
  const text = raw == null ? '' : String(raw).trim();
  const out = { raw: text || null, units: null, form: null, discrete: false, serving_mass_g: null, per_day_units: null, range: null, serving_alternatives: null, implausible_serving: false, inferred: false };
  if (!text) return out;
  let x = text.toLowerCase();
  // "(implied by 90 capsules / 45-day supply)": the model's inference, and its count is the container's.
  if (/\(\s*implied\b[^)]*\)?/.test(x)) { out.inferred = true; x = x.replace(/\(\s*implied\b[^)]*\)?/g, ' '); }
  if (/\bhalf\s+(?:an?\s+)?/.test(x)) x = x.replace(/\bhalf\s+(?:an?\s+)?/g, '0.5 ');
  const numAlt = `\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMS).join('|')}`;
  // Numbers and number-words only as whole words ("Mega scoop" is not "a scoop");
  // the unit noun must end at a word boundary ("2 tablespoons" is not tablets).
  const formRe = new RegExp(`(?<![\\w.])(${numAlt})(?:\\s*-\\s*(\\d+))?\\s+(?:[a-z®™-]+\\s+){0,2}?${UNIT_WORDS}\\b`, 'gi');
  const hits = [];
  // "(2 gummies daily)" is the day's total, not an alternative serving
  const xs = x.replace(new RegExp(`\\(\\s*\\d+\\s+${UNIT_WORDS}\\s+(?:daily|per day|a day)\\s*\\)`, 'gi'), ' ');
  let m;
  while ((m = formRe.exec(xs))) {
    hits.push({ n: WORD_NUMS[m[1]] ?? toNumber(m[1]), hi: m[2] ? toNumber(m[2]) : null, form: canonicalForm(m[3]), text: m[0].trim() });
  }
  if (hits.length) {
    const first = hits[0];
    out.form = first.form;
    out.discrete = DISCRETE_FORMS.has(out.form);
    if (first.hi != null) out.range = [first.n, first.hi];
    else out.units = first.n;
    // "1 Gummy for Ages 4+, 2 Gummies for Adults", "2 Gummies / 3 Gummies":
    // several counts for one serving slot — which one the amounts are for is not printed.
    const counts = new Set(hits.map((h) => h.n));
    if (counts.size > 1) {
      out.serving_alternatives = hits.map((h) => ({ units: h.n, form: h.form, text: h.text }));
      out.units = null;
    }
  }
  if (out.discrete && out.units != null && out.units > MAX_DISCRETE_UNITS) { out.implausible_serving = true; out.units = null; }
  const masses = [...x.matchAll(/(\d*\.?\d+)\s*(g|gm|grams?|oz)\b/g)].map((mm) => round(/oz/.test(mm[2]) ? toNumber(mm[1]) * 28.3495 : toNumber(mm[1]), 3)).filter((v) => v != null);
  const massSet = [...new Set(masses)];
  // "(8.0g / 7.2g / 7.3g)" — one per flavour; no single serving mass
  if (massSet.length === 1 || (massSet.length === 2 && /\boz\b/.test(x) && /\d\s*g\b/.test(x))) out.serving_mass_g = massSet[0];
  const daily = x.match(new RegExp(`\\(\\s*(\\d+)\\s+${UNIT_WORDS}\\s+(?:daily|per day|a day)\\s*\\)`, 'i'));
  if (daily) out.per_day_units = Number(daily[1]);
  else if (out.units != null) {
    const times = x.match(/\b(twice|two times|(\d+)\s*(?:x|times))\s*(?:daily|a day|per day)\b/);
    if (times) out.per_day_units = out.units * (times[2] ? Number(times[2]) : 2);
  }
  if (out.range) out.units = null; // "1-2 gummies" — which one? unknown
  return out;
}

// ── names: nutrient, compound, elemental ────────────────────────────────

const MINERALS = {
  calcium: 'Ca', magnesium: 'Mg', zinc: 'Zn', iron: 'Fe', potassium: 'K', sodium: 'Na', chloride: 'Cl',
  phosphorus: 'P', iodine: 'I', selenium: 'Se', copper: 'Cu', manganese: 'Mn', chromium: 'Cr', molybdenum: 'Mo',
  boron: 'B', silicon: 'Si', lithium: 'Li',
};
const SALT_SUFFIX = /\b(glycinate|bisglycinate|diglycinate|citrate|oxide|chloride|malate|dimagnesium malate|carbonate|gluconate|picolinate|threonate|l-threonate|lactate|sulfate|sulphate|phosphate|aspartate|taurate|orotate|chelate|hydroxide|bicarbonate|ascorbate|fumarate|succinate|acetate|iodide|selenate|selenite|selenomethionine|polynicotinate|nicotinate)\b/i;

// Fixed, anhydrous, stoichiometric salts ONLY — each factor is atomic mass of
// the element / formula mass. Hydrates (citrates, chloride hexahydrate) and
// chelates vary by manufacturer, so they are deliberately absent.
const FIXED_FRACTIONS = {
  'magnesium oxide': { magnesium: 24.305 / 40.304 },
  'calcium carbonate': { calcium: 40.078 / 100.086 },
  'sodium chloride': { sodium: 22.990 / 58.443, chloride: 35.453 / 58.443 },
  'potassium chloride': { potassium: 39.098 / 74.551, chloride: 35.453 / 74.551 },
  'zinc oxide': { zinc: 65.38 / 81.38 },
};

function cleanName(s) {
  return String(s || '').replace(/[®™*†‡]+/g, '').replace(/\s+/g, ' ').trim();
}

function elementOf(text) {
  const x = cleanName(text).toLowerCase().replace(/\([a-z]{1,2}\)/g, '').trim();
  if (MINERALS[x]) return x;
  return null;
}

/** "(from 1,630mg Sodium Citrate, 318mg Himalayan Rock Salt)" → [{name, mg}] */
function compoundsWithAmounts(text) {
  const out = [];
  const re = new RegExp(`${NUM}\\s*(mg|mcg|g)\\s+(?:of\\s+)?([A-Za-z][A-Za-z0-9\\-\\s®™.]*?)(?=\\s*(?:,|;|\\band\\b|\\)|$))`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const v = toNumber(m[1]);
    const name = cleanName(m[3]);
    if (v == null || !name || /extract$/i.test(name) && /\d+\s*:\s*1/.test(name)) continue;
    out.push({ name, mg: round(toMg(v, m[2]).mg, 6) });
  }
  return out;
}

/**
 * Split a printed ingredient name.
 *   "Magnesium (as Magnesium Glycinate)"   → nutrient Magnesium, element magnesium, compound "Magnesium Glycinate"
 *   "Magnesium Glycinate"                  → compound row (the name IS the compound)
 *   "Providing Elemental Magnesium"        → elemental row for magnesium
 *   "Vitamin D3 (as Cholecalciferol)"      → nutrient Vitamin D3, form Cholecalciferol
 */
function parseName(rawName) {
  const name = cleanName(rawName);
  const out = { name, nutrient: name, element: null, compound: null, compounds: [], form: null, name_is_compound: false, elemental_row_for: null };
  if (!name) return out;
  const elem = name.match(/^(?:providing\s+)?elemental\s+([a-z]+)\b/i) || name.match(/^providing\s+([a-z]+)\b/i);
  if (elem && MINERALS[elem[1].toLowerCase()]) {
    out.elemental_row_for = elem[1].toLowerCase();
    out.element = elem[1].toLowerCase();
    out.nutrient = elem[1][0].toUpperCase() + elem[1].slice(1).toLowerCase();
    return out;
  }
  const p = name.indexOf('(');
  const head = (p > 0 ? name.slice(0, p) : name).trim();
  const paren = p > 0 ? name.slice(p + 1).replace(/\)\s*$/, '').trim() : '';
  out.nutrient = head;
  out.element = elementOf(head);
  const inner = paren.match(/^(?:as|from|sourced from)\s+(.+)$/i) || name.match(/\((?:as|from|sourced from)\s+([^)]+)\)/i) || name.match(/\bas\s+(.+)$/i);
  if (inner && !/extract|\d+\s*(?::|-to-)\s*1\b/i.test(inner[1])) {
    // nested trademarks/notes — "(TRAACS®)" — would break the compound split
    const flat = inner[1].replace(/\([^()]*\)/g, '').replace(/\s+,/g, ',');
    out.compounds = compoundsWithAmounts(flat);
    const plain = flat.replace(/\b\d[\d,.]*\s*(mg|mcg|g)\s+(of\s+)?/gi, '').trim();
    out.form = cleanName(plain) || null;
    // "compound" is a mineral's source salt; for a vitamin "(as Cholecalciferol)" is its form.
    out.compound = out.element ? out.form : null;
  } else if (paren && !/^[A-Z][a-z]?$/.test(paren) && !/extract|standardi|%|\d+\s*:\s*1/i.test(paren) && !out.element) {
    out.form = cleanName(paren);
  }
  if (!out.element) {
    const lower = head.toLowerCase();
    const firstWord = lower.split(/\s+/)[0];
    if (MINERALS[firstWord] && SALT_SUFFIX.test(lower)) {
      out.name_is_compound = true;
      out.element = firstWord;
      out.compound = cleanName(head.replace(/\b(advanced|complex|blend)\b.*$/i, '')) || head;
    }
  }
  return out;
}

function fixedFraction(compound, element) {
  if (!compound || !element) return null;
  const key = cleanName(compound).toLowerCase();
  const f = FIXED_FRACTIONS[key];
  return f && f[element] ? f[element] : null;
}

// ── extracts ────────────────────────────────────────────────────────────

/**
 * Extract ratio / whole-plant equivalent / standardisation from the name and
 * the printed amount together.
 *   "Ashwagandha (From 300mg of 10:1 Extract)" + "3000mg"      → equivalent 3000 (stated), extract 300
 *   "Ashwagandha Root Extract (a 30:1 extract, equivalent to 500 mg of Ashwagandha Root)" + "16.67 mg"
 *                                                              → extract 16.67, equivalent 500 (stated)
 *   "Ashwagandha Root Extract 10:1 (Withania somnifera)" + "2000 mg" → extract_declared (which mass? unconfirmed)
 *   "Carbohydrates (2:1 glucose:fructose ratio)"               → not an extract
 */
function parseExtract(name, amountRaw, amountMg) {
  const text = `${cleanName(name)} ${amountRaw || ''}`;
  const lower = text.toLowerCase();
  const isExtract = /\bextract|concentrate[ds]?\b/.test(lower);
  const out = { ratio: null, ratio_n: null, extract_mg: null, equivalent_whole_plant_mg: null, equivalent_basis: null, standardised_to: null, amount_kind: null, note: null };

  const ratioM = lower.match(/(?<![\d:])(\d+(?:\.\d+)?)\s*(?::|-to-|\bto\b)\s*1(?![\d:.])/);
  if (ratioM && isExtract) {
    out.ratio_n = toNumber(ratioM[1]);
    out.ratio = `${ratioM[1]}:1`;
  }
  const std = lower.match(/standardi[sz]ed\s+to\s*(?:contain\s*)?(?:>|≥|at least|min(?:imum)?\.?)?\s*(\d+(?:\.\d+)?)\s*%\s*([a-z][a-z\- ]*?)(?=[),;]|$|\s+\d)/)
    || lower.match(/\(\s*(\d+(?:\.\d+)?)\s*%\s*([a-z][a-z\- ]*?)\s*\)/);
  if (std) out.standardised_to = `${std[1]}% ${std[2].trim()}`;

  const fromM = lower.match(new RegExp(`from\\s+${NUM}\\s*(mg|g|mcg)\\s+(?:of\\s+)?(?:an?\\s+)?(?:\\d+(?:\\.\\d+)?\\s*:\\s*1\\s+)?(?:[a-z-]+\\s+){0,3}?extract`));
  const eqM = lower.match(new RegExp(`equivalent\\s+to\\s+${NUM}\\s*(mg|g|mcg)`))
    || lower.match(new RegExp(`${NUM}\\s*(mg|g|mcg)\\s+(?:dried\\s+|raw\\s+|whole\\s+)?(?:herb|root|plant|leaf|fruit)?\\s*equivalent`));

  if (!isExtract && !fromM && !eqM) {
    // "KSM-66® Ashwagandha Root … standardized to 5% withanolides" — keep the
    // standardisation even when the word "extract" is not printed.
    if (out.standardised_to) return { ...out, amount_kind: 'ingredient', note: null };
    return null;
  }
  if (!out.ratio && fromM && ratioM) { out.ratio_n = toNumber(ratioM[1]); out.ratio = `${ratioM[1]}:1`; }

  if (fromM) {
    out.extract_mg = round(toMg(toNumber(fromM[1]), fromM[2]).mg, 4);
    if (amountMg != null && out.extract_mg != null && amountMg > out.extract_mg) {
      out.amount_kind = 'whole_plant_equivalent';
      out.equivalent_whole_plant_mg = amountMg;
      out.equivalent_basis = 'stated';
      if (out.ratio_n && Math.abs(out.extract_mg * out.ratio_n - amountMg) / amountMg > 0.05) {
        out.note = `stated equivalent ${amountMg} mg ≠ ${out.extract_mg} mg × ${out.ratio}`;
      }
    } else {
      out.amount_kind = null;
      out.note = 'amount does not exceed the extract weight it is "from" — which mass the amount is, is unclear';
    }
    return out;
  }
  if (eqM) {
    out.equivalent_whole_plant_mg = round(toMg(toNumber(eqM[1]), eqM[2]).mg, 4);
    out.equivalent_basis = 'stated';
    if (amountMg != null && out.equivalent_whole_plant_mg != null && amountMg < out.equivalent_whole_plant_mg) {
      out.amount_kind = 'extract_weight';
      out.extract_mg = amountMg;
    }
    return out;
  }
  // An extract with no "from"/"equivalent" statement. 21 CFR 101.36(b)(3)
  // declares a botanical extract by the weight of the extract, but many
  // listings print the herb equivalent next to a ratio instead — so the mass
  // is DECLARED as the extract, not confirmed.
  out.amount_kind = /\bfrom\b/.test(lower) ? null : 'extract_declared';
  if (out.amount_kind === null) out.note = 'names a source extract but not its weight — which mass the amount is, is unclear';
  return out;
}

// ── evidence ────────────────────────────────────────────────────────────

function squash(s) {
  return String(s || '').toLowerCase().replace(/[®™*†‡]/g, '').replace(/\s+/g, ' ').trim();
}

/** Every number in `value` must appear, as printed, in `text` (1,000 ≡ 1000). */
function numbersAppearIn(value, text) {
  if (value == null || !text) return false;
  const nums = String(value).match(/\d[\d,]*(?:\.\d+)?/g);
  if (!nums || !nums.length) return false;
  const hay = ` ${String(text).replace(/(\d),(\d{3})/g, '$1$2')} `;
  return nums.every((n) => new RegExp(`(^|[^\\d.])${n.replace(/,/g, '').replace('.', '\\.')}(?![\\d])`).test(hay));
}

/** The line of label text a row came from: the model's excerpt if it is really in the text, else the first line naming it. */
function findExcerpt(rawText, name, modelExcerpt) {
  const text = rawText ? String(rawText) : '';
  if (modelExcerpt) {
    const ex = String(modelExcerpt).trim().slice(0, 240);
    if (!text) return { excerpt: ex, excerpt_source: 'model_unverified' };
    if (squash(text).includes(squash(ex))) return { excerpt: ex, excerpt_source: 'model' };
  }
  if (!text || !name) return { excerpt: modelExcerpt ? String(modelExcerpt).slice(0, 240) : null, excerpt_source: modelExcerpt ? 'model_unverified' : null };
  const key = squash(cleanName(name).split('(')[0]).slice(0, 40);
  if (!key) return { excerpt: null, excerpt_source: null };
  const lines = text.split(/\r?\n|⏎/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => squash(l).includes(key));
  if (hit) return { excerpt: hit.slice(0, 240), excerpt_source: 'raw_text' };
  const flat = squash(text);
  const i = flat.indexOf(key);
  if (i >= 0) return { excerpt: flat.slice(Math.max(0, i - 20), i + 140), excerpt_source: 'raw_text' };
  return { excerpt: modelExcerpt ? String(modelExcerpt).slice(0, 240) : null, excerpt_source: modelExcerpt ? 'model_unverified' : null };
}

// ── rows ────────────────────────────────────────────────────────────────

const BASIS_VALUES = new Set(['per_serving', 'per_unit', 'per_day', 'per_container']);

function panelBasis(rawText) {
  const t = String(rawText || '').toLowerCase();
  if (new RegExp(`amount\\s+per\\s+(?:${UNIT_WORDS})`).test(t) && !/amount\s+per\s+serving/.test(t)) return 'per_unit';
  if (/amount\s+per\s+serving|per\s+serving\s+%\s*d/.test(t)) return 'per_serving';
  return null;
}

/**
 * One legacy/model facts row → v2.
 * @param {object} f        { name, amount, dv_percent, ...optional v2 hints from the model }
 * @param {object} ctx      { serving, raw_text, panel_basis, source }
 */
function buildRow(f, ctx = {}) {
  const serving = ctx.serving || parseServing(null);
  const raw = ctx.raw_text || '';
  const n = parseName(f && f.name);
  const a = parseAmount(f && f.amount, `${n.name} ${n.form || ''} ${n.compound || ''}`);

  // basis — printed on the amount > printed as the panel header > model (explicit) > unknown
  let basis = a.basis_hint;
  let basis_source = basis ? 'amount_text' : null;
  if (!basis && ctx.panel_basis) { basis = ctx.panel_basis; basis_source = 'panel_header'; }
  if (!basis && f && BASIS_VALUES.has(f.basis)) { basis = f.basis; basis_source = 'model'; }

  let amount_mg = a.amount_mg;
  let per_unit_mg = null;
  let per_serving_mg = null;
  if (a.status === 'ambiguous' && a.variants) {
    // "1.7mg (1 gummy) / 3.4mg (2 gummies)" — the variants carry their own unit counts.
    const one = a.variants.find((v) => v.units === 1 && v.amount_mg != null);
    const serv = serving.units != null ? a.variants.find((v) => v.units === serving.units && v.amount_mg != null) : null;
    if (one) per_unit_mg = one.amount_mg;
    if (serv) { per_serving_mg = serv.amount_mg; amount_mg = serv.amount_mg; basis = 'per_serving'; basis_source = 'amount_text'; }
  } else if (serving.serving_alternatives) {
    // "1 Gummy for Ages 4+, 2 Gummies for Adults": which serving the amount is for is not printed.
  } else if (amount_mg != null && basis) {
    if (basis === 'per_serving') {
      per_serving_mg = amount_mg;
      if (serving.units && serving.discrete) per_unit_mg = round(amount_mg / serving.units, 6);
    } else if (basis === 'per_unit') {
      per_unit_mg = amount_mg;
      if (serving.units && serving.discrete) per_serving_mg = round(amount_mg * serving.units, 6);
    }
  }

  // elemental vs compound
  let elemental_mg = null;
  let elemental_basis = null;
  let elemental_factor = null;
  let amount_kind = null;
  let compound = n.compound;
  // Model-reported values are checked against THIS row's own line of label
  // text (never the whole label: "Calories 20" must not back an invented
  // "20 mg elemental"). No own line → the value is kept as `model_claimed`.
  const ev = findExcerpt(raw, n.name, f && f.evidence_excerpt);
  const ownLine = ev.excerpt && (ev.excerpt_source === 'model' || ev.excerpt_source === 'raw_text') ? ev.excerpt : null;
  const hint = (value, check) => {
    if (value == null || String(value).trim() === '') return null;
    if (!ownLine) return 'model_claimed';
    return check(value, ownLine) ? 'stated' : null;
  };
  const inLine = (v, line) => squash(line).includes(squash(v));
  let compound_source = compound ? 'label' : null;
  if (!compound && f && f.compound) {
    const h = hint(f.compound, inLine);
    if (h) { compound = cleanName(f.compound); compound_source = h === 'stated' ? 'label' : 'model_claimed'; }
  }
  if (n.elemental_row_for) {
    amount_kind = 'elemental';
    elemental_mg = amount_mg;
    elemental_basis = amount_mg != null ? 'stated' : 'unknown';
  } else if (n.element && !n.name_is_compound) {
    // The row is NAMED for the element ("Magnesium (as …)", "Sodium (Na)"): its amount is the element's.
    amount_kind = 'elemental';
    elemental_mg = amount_mg;
    elemental_basis = amount_mg != null ? 'stated' : 'unknown';
  } else if (n.element && n.name_is_compound) {
    amount_kind = 'compound_weight';
    const frac = fixedFraction(n.compound, n.element);
    if (frac && amount_mg != null) {
      elemental_mg = round(amount_mg * frac, 4);
      elemental_basis = 'computed';
      elemental_factor = round(frac, 4);
    } else {
      elemental_basis = 'unknown';
    }
  }
  // model-reported elemental amount — `stated` only if its number is on this row's own line.
  if (elemental_basis === 'unknown' && f && f.elemental_amount) {
    const h = hint(f.elemental_amount, numbersAppearIn);
    const q = parseAmount(f.elemental_amount);
    if (h && q.amount_mg != null) { elemental_mg = q.amount_mg; elemental_basis = h; }
  }

  let extract = parseExtract(n.name, a.amount_raw, amount_mg);
  if (!extract && f && (f.extract_ratio || f.equivalent_amount) && /extract/i.test(`${n.name} ${f.extract_ratio || ''}`)) {
    extract = { ratio: null, ratio_n: null, extract_mg: null, equivalent_whole_plant_mg: null, equivalent_basis: null, standardised_to: null, amount_kind: 'extract_declared', note: null };
  }
  if (extract && f) {
    const claimed = [];
    if (!extract.ratio && f.extract_ratio) {
      const h = hint(f.extract_ratio, numbersAppearIn);
      const r = String(f.extract_ratio).match(/(\d+(?:\.\d+)?)\s*:\s*1/);
      if (h && r) { extract.ratio = `${r[1]}:1`; extract.ratio_n = toNumber(r[1]); if (h === 'model_claimed') claimed.push('ratio'); }
    }
    if (extract.equivalent_whole_plant_mg == null && f.equivalent_amount) {
      const h = hint(f.equivalent_amount, numbersAppearIn);
      const q = parseAmount(f.equivalent_amount);
      if (h && q.amount_mg != null) {
        extract.equivalent_whole_plant_mg = q.amount_mg;
        extract.equivalent_basis = h;
        // only a label-backed equivalent may re-classify what the printed amount measures
        if (h === 'stated' && amount_mg != null && amount_mg < q.amount_mg) { extract.amount_kind = 'extract_weight'; extract.extract_mg = amount_mg; }
      }
    }
    if (!extract.standardised_to && f.standardised_to) {
      const h = hint(f.standardised_to, numbersAppearIn);
      if (h) { extract.standardised_to = String(f.standardised_to).trim(); if (h === 'model_claimed') claimed.push('standardised_to'); }
    }
    if (claimed.length) extract.model_claimed = claimed;
  }
  if (extract) amount_kind = extract.amount_kind; // null = the label leaves unclear which mass this is
  else if (!amount_kind && amount_mg != null) amount_kind = 'ingredient';

  const src = ctx.source || {};
  return {
    name: n.name,
    nutrient: n.nutrient,
    amount_mg,
    amount_raw: a.amount_raw,
    unit_raw: a.unit_raw,
    unit_basis: a.unit_basis,
    conversion: a.conversion,
    alt_amounts: a.alt_amounts.length ? a.alt_amounts : null,
    qualifier: a.qualifier,
    status: a.status,
    variants: a.variants,
    range: a.range,
    in_blend_mg: a.in_blend_mg,
    basis,
    basis_source,
    per_unit_mg,
    per_serving_mg,
    amount_kind,
    form: n.form,
    compound: compound || null,
    compound_source: compound ? compound_source : null,
    compounds: n.compounds.length ? n.compounds : null,
    elemental_mg,
    elemental_basis,
    elemental_factor,
    extract: extract ? {
      ratio: extract.ratio,
      extract_mg: extract.extract_mg,
      equivalent_whole_plant_mg: extract.equivalent_whole_plant_mg,
      equivalent_basis: extract.equivalent_basis,
      standardised_to: extract.standardised_to,
      note: extract.note,
      model_claimed: extract.model_claimed || null,
    } : null,
    dv_percent: f && f.dv_percent != null && String(f.dv_percent).trim() !== '' ? String(f.dv_percent).trim() : null,
    source: {
      row_id: src.row_id ?? null,
      asin: src.asin ?? null,
      image_url: src.image_url ?? null,
      image_index: src.image_index ?? null,
      excerpt: ev.excerpt,
      excerpt_source: ev.excerpt_source,
    },
  };
}

/**
 * "Magnesium Glycinate … 1000mg" followed by "Providing Elemental Magnesium 70.8mg":
 * the second row states the first row's elemental amount.
 */
function linkElementalRows(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const m = /^(?:providing\s+)?elemental\s+([a-z]+)|^providing\s+([a-z]+)/i.exec(r.name || '');
    if (!m) continue;
    const el = (m[1] || m[2]).toLowerCase();
    for (let j = i - 1; j >= 0; j--) {
      const p = rows[j];
      const hay = `${p.name} ${p.compound || ''}`.toLowerCase();
      if (hay.includes(el) && p.amount_kind !== 'elemental') {
        if (r.amount_mg != null) {
          p.elemental_mg = r.amount_mg;
          p.elemental_basis = 'stated';
          p.elemental_factor = null;
          p.elemental_from_row = i;
        }
        r.elemental_of_row = j;
        break;
      }
    }
  }
  return rows;
}

/**
 * The whole v2 record for one dovive_ocr row.
 * @param {object} input
 *   facts                   legacy/model rows ({ name, amount, dv_percent, …hints })
 *   serving_size            printed serving size
 *   servings_per_container
 *   raw_text                all text read from the image (or the bullet text)
 *   is_panel                true when the source is a Supplement Facts panel image
 *   source                  { row_id, asin, image_url, image_index }
 */
function buildFactsV2(input = {}) {
  const facts = Array.isArray(input.facts) ? input.facts.filter((f) => f && String(f.name || '').trim()) : [];
  const serving = parseServing(input.serving_size);
  const spc = toNumber(String(input.servings_per_container ?? '').match(/\d[\d,]*(?:\.\d+)?/)?.[0]);
  const panel_basis = input.is_panel ? (panelBasis(input.raw_text) || 'per_serving') : panelBasis(input.raw_text);
  const panel_basis_source = input.is_panel && !panelBasis(input.raw_text) ? 'panel_convention' : (panel_basis ? 'panel_header' : null);
  const ctx = { serving, raw_text: input.raw_text || '', panel_basis, source: input.source || {} };
  const rows = linkElementalRows(facts.map((f) => buildRow(f, ctx)));
  if (panel_basis_source === 'panel_convention') {
    for (const r of rows) if (r.basis_source === 'panel_header') r.basis_source = 'panel_convention';
  }
  const warnings = [];
  if (serving.range) warnings.push(`serving size is a range (${serving.raw}) — per-unit amounts not computed`);
  if (serving.serving_alternatives) warnings.push(`serving size gives alternatives (${serving.raw}) — per-serving and per-unit amounts not computed`);
  if (serving.implausible_serving) warnings.push(`serving size "${serving.raw}" is not a plausible single serving — ignored`);
  if (serving.units != null && !serving.discrete && serving.form) warnings.push(`serving unit "${serving.form}" is not a countable unit — per-unit amounts not computed`);
  for (const r of rows) {
    if (r.status === 'ambiguous') warnings.push(`${r.name}: several amounts printed (${r.amount_raw})`);
    if (r.extract && r.extract.note) warnings.push(`${r.name}: ${r.extract.note}`);
  }
  return {
    schema_version: SCHEMA_VERSION,
    serving: { ...serving, servings_per_container: spc },
    rows,
    warnings,
  };
}

/** Re-attach the dovive_ocr row id (unknown until the row exists) to every row's source. */
function withRowSource(v2, row) {
  if (!v2 || !Array.isArray(v2.rows)) return v2;
  return {
    ...v2,
    rows: v2.rows.map((r) => ({
      ...r,
      source: {
        ...(r.source || {}),
        row_id: row.id ?? (r.source && r.source.row_id) ?? null,
        asin: row.asin ?? (r.source && r.source.asin) ?? null,
        image_url: row.image_url ?? (r.source && r.source.image_url) ?? null,
        image_index: row.image_index ?? (r.source && r.source.image_index) ?? null,
      },
    })),
  };
}

/** Nutrient key for cross-source comparison: "Vitamin D3 (as Cholecalciferol)" → "vitamin d3". */
function nutrientKey(name) {
  return squash(cleanName(name).split('(')[0]).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  SCHEMA_VERSION,
  parseAmount,
  parseServing,
  parseName,
  parseExtract,
  toMg,
  iuToMg,
  numbersAppearIn,
  findExcerpt,
  buildRow,
  buildFactsV2,
  linkElementalRows,
  withRowSource,
  nutrientKey,
  panelBasis,
  FIXED_FRACTIONS,
};
