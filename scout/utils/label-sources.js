/**
 * utils/label-sources.js — per-field source resolution for migrate-ocr-to-dash.js (pure).
 *
 * Replaces "the dovive_ocr row with the most facts wins, for every field".
 * Each product field now has its own rule, and every disagreement between
 * sources is RECORDED (products.label_conflicts), never silently dropped:
 *
 *   nutrients               facts-panel image > text extraction (image_index 99).
 *                           Among images: most facts, then latest. A nutrient is
 *                           the same across sources only by normalised name or by
 *                           (mineral, form); a different amount of the same measure
 *                           — or an amount only another panel states — is a conflict.
 *   serving_size /          when every source agrees: the latest. When they
 *   servings_per_container  disagree: the NUTRIENT source's value (its amounts are
 *                           per ITS serving), plus a conflict.
 *   claims_on_label         label IMAGE claims only (unchanged meaning).
 *   claims_all_sources      union by claim incl. listing text; wording from the
 *                           text extraction when both have it; each claim lists
 *                           its sources.
 *   other_ingredients       facts-panel image > text.
 *
 * A row whose label_product_match says the label is ANOTHER PRODUCT (brand or
 * flavour contradiction) is excluded from every field and listed in `excluded`
 * so the caller logs it. A pack-size sibling's panel (match_by_serving) is kept.
 */

'use strict';

const { buildFactsV2, withRowSource, nutrientKey, parseServing, parseName } = require('./label-facts');

const TEXT_INDEX = 99;

/**
 * Excluded from every field ONLY when the label is another product: a brand or
 * flavour contradiction. A count-only difference (verdict match_by_serving, or
 * an older 'mismatch' row whose mismatch_on is just ['count']) is kept.
 */
function isOtherProduct(r) {
  const m = r && r.label_product_match;
  if (!m || m.verdict !== 'mismatch') return false;
  if (!Array.isArray(m.mismatch_on) || !m.mismatch_on.length) return true;
  return m.mismatch_on.includes('brand') || m.mismatch_on.includes('flavor');
}

function isText(r) { return r && r.image_index === TEXT_INDEX; }
function factsOf(r) { return Array.isArray(r && r.supplement_facts) ? r.supplement_facts.filter((f) => f && f.name) : []; }
function ts(r) { const t = Date.parse(r && r.processed_at); return Number.isFinite(t) ? t : 0; }
function src(r) { return { row_id: r.id ?? null, image_url: r.image_url ?? null, image_index: r.image_index ?? null, processed_at: r.processed_at ?? null }; }

function servingKey(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = parseServing(v);
  if (s.units != null && s.form) return `${s.units} ${s.form}`;
  return String(v).toLowerCase().replace(/\s+/g, ' ').trim();
}
function countKey(v) {
  const m = String(v ?? '').match(/\d+/);
  return m ? m[0] : null;
}

const CLAIM_ALIASES = [
  [/non[\s-]*gmo\s*project/i, 'non-gmo project verified'],
  [/non[\s-]*gmo/i, 'non-gmo'],
  [/gluten[\s-]*free/i, 'gluten-free'],
  [/dairy[\s-]*free/i, 'dairy-free'],
  [/soy[\s-]*free/i, 'soy-free'],
  [/sugar[\s-]*free/i, 'sugar-free'],
  [/gelatin[\s-]*free/i, 'gelatin-free'],
  [/keto/i, 'keto'],
  [/nsf\s*certified\s*for\s*sport|certified\s*for\s*sport/i, 'nsf certified for sport'],
  [/informed[\s-]*sport/i, 'informed sport'],
  [/informed[\s-]*choice/i, 'informed choice'],
  [/usp\s*verified/i, 'usp verified'],
  [/usda\s*organic|certified\s*organic/i, 'usda organic'],
  [/c?gmp/i, 'gmp'],
  [/(3rd|third)[\s-]*party/i, 'third-party tested'],
  [/made\s+in\s+(the\s+)?usa/i, 'made in usa'],
  [/vegan/i, 'vegan'],
];
function claimKey(c) {
  const s = String(c || '').trim();
  for (const [re, k] of CLAIM_ALIASES) if (re.test(s)) return k;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** v2 facts for a row: its stored facts_v2 when present, else built from the legacy shape. */
function factsV2For(row) {
  if (row.facts_v2 && Array.isArray(row.facts_v2.rows)) return withRowSource(row.facts_v2, row);
  return withRowSource(buildFactsV2({
    facts: factsOf(row),
    serving_size: row.serving_size,
    servings_per_container: row.servings_per_container,
    raw_text: row.raw_text,
    is_panel: !isText(row) && factsOf(row).length > 0,
    source: src(row),
  }), row);
}

/**
 * Identity of a nutrient row for cross-source comparison: its normalised name
 * ("vitamin d3"), and for minerals its (element, form) pair ("magnesium",
 * "glycinate"). NO substring matching — "magnesium" is not "magnesium glycinate
 * advanced complex", and "ashwagandha" is not "ashwagandha root extract".
 */
function identity(row) {
  const n = parseName(row.name);
  const element = n.element || null;
  const formSrc = row.compound || n.compound || null;
  const form = element && formSrc
    ? formSrc.toLowerCase().replace(new RegExp(`\\b${element}\\b`, 'g'), ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() || null
    : null;
  return { key: nutrientKey(row.name), element, form };
}

/** The chosen-panel key this row is the same nutrient as, or null. */
function matchKey(chosenIds, row) {
  const id = identity(row);
  if (!id.key) return null;
  if (chosenIds.has(id.key)) return id.key;
  if (id.element && id.form) {
    for (const [k, cid] of chosenIds) if (cid.element === id.element && cid.form === id.form) return k;
  }
  return null;
}

/** Amounts are only comparable when they measure the same thing (elemental vs compound weight are not). */
function comparable(a, b) {
  const kinds = new Set([a.amount_kind, b.amount_kind].filter(Boolean));
  return kinds.size <= 1;
}

function pickNutrientRow(rows) {
  const withFacts = rows.filter((r) => factsOf(r).length > 0);
  const images = withFacts.filter((r) => !isText(r));
  const pool = images.length ? images : withFacts;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => factsOf(b).length - factsOf(a).length || ts(b) - ts(a))[0];
}

/**
 * @param {Array<object>} rows  dovive_ocr rows for ONE ASIN
 *   ({ id, image_url, image_index, processed_at, serving_size, servings_per_container,
 *      supplement_facts, facts_v2?, certifications, other_ingredients, raw_text?, label_product_match? })
 * @returns {{ values, label_facts, sources, conflicts, excluded, product_match }}
 */
function resolveLabelFields(rows) {
  const all = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const excluded = all.filter(isOtherProduct)
    .map((r) => ({ ...src(r), why: r.label_product_match.why || 'label does not match this listing' }));
  const usable = all.filter((r) => !isOtherProduct(r));

  // label_claims: claims read off label IMAGES only (products.claims_on_label, as before);
  // claims_all_sources: every claim incl. listing text, each with its sources.
  const values = { nutrients: [], serving_size: null, servings_per_container: null, label_claims: [], claims_all_sources: [], other_ingredients: null };
  const sources = {};
  const conflicts = {};

  // ── nutrients ──
  const nRow = pickNutrientRow(usable);
  let label_facts = null;
  if (nRow) {
    values.nutrients = factsOf(nRow);
    sources.nutrients = src(nRow);
    label_facts = factsV2For(nRow);
    const chosen = new Map(label_facts.rows.map((r) => [nutrientKey(r.name), r]));
    const chosenIds = new Map(label_facts.rows.map((r) => [nutrientKey(r.name), identity(r)]));
    for (const other of usable) {
      if (other === nRow || !factsOf(other).length) continue;
      const ov2 = factsV2For(other);
      const otherIsPanel = !isText(other);
      const matched = new Set();
      for (const r of ov2.rows) {
        const k = nutrientKey(r.name);
        if (!k) continue;
        const ck = matchKey(chosenIds, r);
        const c = ck ? chosen.get(ck) : null;
        if (ck) matched.add(ck);
        let differs;
        // named with an amount on another PANEL but absent from the chosen one; listing
        // text names ingredients loosely ("Ashwagandha"), so its extras are not evidence
        if (!c) differs = otherIsPanel && r.amount_mg != null;
        else if (!comparable(c, r)) differs = false;
        else if (c.amount_mg != null && r.amount_mg != null) differs = Math.abs(c.amount_mg - r.amount_mg) > Math.max(0.01, 0.02 * Math.max(c.amount_mg, r.amount_mg));
        else differs = c.amount_mg == null && r.amount_mg != null; // only the other source states an amount
        if (!differs) continue;
        const field = `nutrient:${ck || k}`;
        conflicts[field] = conflicts[field] || [{ value: c ? c.amount_raw : null, amount_mg: c ? c.amount_mg : null, note: c ? null : 'not on this source', ...src(nRow) }];
        conflicts[field].push({ value: r.amount_raw, amount_mg: r.amount_mg, note: null, ...src(other) });
      }
      // A second PANEL image that omits a nutrient is evidence; text extraction
      // routinely lists only the headline actives, so its silence is not.
      if (isText(other)) continue;
      for (const [k, c] of chosen) {
        if (matched.has(k)) continue;
        const field = `nutrient:${k}`;
        conflicts[field] = conflicts[field] || [{ value: c.amount_raw, amount_mg: c.amount_mg, note: null, ...src(nRow) }];
        conflicts[field].push({ value: null, amount_mg: null, note: 'not on this source', ...src(other) });
      }
    }
  }

  // ── serving size / servings per container ──
  const packSibling = (r) => r.label_product_match && r.label_product_match.verdict === 'match_by_serving';
  for (const [field, keyFn] of [['serving_size', servingKey], ['servings_per_container', countKey]]) {
    // a pack-size sibling's panel has the right serving but not this listing's container count
    const cands = usable.filter((r) => r[field] != null && String(r[field]).trim() !== '' && !(field === 'servings_per_container' && packSibling(r)));
    if (!cands.length) continue;
    const keys = new Set(cands.map((r) => keyFn(r[field])));
    if (keys.size === 1) {
      const latest = [...cands].sort((a, b) => ts(b) - ts(a))[0];
      values[field] = latest[field];
      sources[field] = src(latest);
    } else {
      const pick = (nRow && cands.includes(nRow)) ? nRow : [...cands].sort((a, b) => ts(b) - ts(a))[0];
      values[field] = pick[field];
      sources[field] = { ...src(pick), rule: nRow && pick === nRow ? 'nutrient source (its amounts are per its serving)' : 'latest' };
      conflicts[field] = cands.map((r) => ({ value: r[field], ...src(r) }));
    }
  }

  // ── certifications: union by claim (claims_all_sources), text wording first ──
  const byClaim = new Map();
  const ordered = [...usable.filter(isText), ...usable.filter((r) => !isText(r)).sort((a, b) => ts(b) - ts(a))];
  for (const r of ordered) {
    for (const c of Array.isArray(r.certifications) ? r.certifications : []) {
      if (!c || !String(c).trim()) continue;
      const k = claimKey(c);
      const e = byClaim.get(k);
      if (!e) byClaim.set(k, { claim: String(c).trim(), key: k, sources: [src(r)] });
      else e.sources.push(src(r));
    }
  }
  values.claims_all_sources = [...byClaim.values()].map((e) => ({ claim: e.claim, sources: e.sources }));
  if (byClaim.size) sources.certifications = values.claims_all_sources;
  // products.claims_on_label keeps its old meaning: what the label IMAGES show.
  const labelClaims = new Map();
  for (const r of usable.filter((x) => !isText(x)).sort((a, b) => ts(b) - ts(a))) {
    for (const c of Array.isArray(r.certifications) ? r.certifications : []) {
      if (c && String(c).trim() && !labelClaims.has(claimKey(c))) labelClaims.set(claimKey(c), String(c).trim());
    }
  }
  values.label_claims = [...labelClaims.values()];

  // ── other ingredients: panel image > text ──
  const oiCands = usable.filter((r) => r.other_ingredients && String(r.other_ingredients).trim());
  if (oiCands.length) {
    const img = oiCands.filter((r) => !isText(r)).sort((a, b) => ts(b) - ts(a));
    const pick = img[0] || oiCands[0];
    values.other_ingredients = pick.other_ingredients;
    sources.other_ingredients = src(pick);
  }

  const product_match = nRow && nRow.label_product_match ? nRow.label_product_match : null;
  return { values, label_facts, sources, conflicts, excluded, product_match };
}

module.exports = { resolveLabelFields, claimKey, servingKey, TEXT_INDEX };
