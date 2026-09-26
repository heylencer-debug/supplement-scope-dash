/**
 * utils/label-sources.js — per-field source resolution for migrate-ocr-to-dash.js (pure).
 *
 * Replaces "the dovive_ocr row with the most facts wins, for every field".
 * Each product field now has its own rule, and every disagreement between
 * sources is RECORDED (products.label_conflicts), never silently dropped:
 *
 *   nutrients               facts-panel image > text extraction (image_index 99).
 *                           Among images: most facts, then latest. Nutrients the
 *                           other sources state differently — or only one source
 *                           states — are conflicts.
 *   serving_size /          when every source agrees: the latest. When they
 *   servings_per_container  disagree: the NUTRIENT source's value (its amounts are
 *                           per ITS serving), plus a conflict.
 *   certifications          union by claim; wording from the text extraction
 *                           (listing copy) when both have it; image-only claims
 *                           (a logo) kept with their image as the source.
 *   other_ingredients       facts-panel image > text.
 *
 * A row whose label_product_match.verdict is 'mismatch' (the label is another
 * product or another variation) is excluded from every field and listed in
 * `excluded` so the caller logs it.
 */

'use strict';

const { buildFactsV2, withRowSource, nutrientKey, parseServing } = require('./label-facts');

const TEXT_INDEX = 99;

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

/** Same nutrient under a slightly different printed name ("black pepper" ~ "black pepper extract"). */
function matchKey(map, k) {
  if (map.has(k)) return k;
  const kt = new Set(k.split(' '));
  let best = null;
  let bestScore = 0;
  for (const ck of map.keys()) {
    if (ck.includes(k) || k.includes(ck)) return ck;
    const ct = ck.split(' ');
    const inter = ct.filter((t) => kt.has(t)).length;
    const score = inter / new Set([...ct, ...kt]).size;
    if (score > bestScore) { bestScore = score; best = ck; }
  }
  return bestScore >= 0.6 ? best : null;
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
  const excluded = all.filter((r) => r.label_product_match && r.label_product_match.verdict === 'mismatch')
    .map((r) => ({ ...src(r), why: r.label_product_match.why || 'label does not match this listing' }));
  const usable = all.filter((r) => !(r.label_product_match && r.label_product_match.verdict === 'mismatch'));

  const values = { nutrients: [], serving_size: null, servings_per_container: null, certifications: [], other_ingredients: null };
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
    for (const other of usable) {
      if (other === nRow || !factsOf(other).length) continue;
      const ov2 = factsV2For(other);
      const matched = new Set();
      for (const r of ov2.rows) {
        const k = nutrientKey(r.name);
        if (!k) continue;
        const ck = matchKey(chosen, k);
        const c = ck ? chosen.get(ck) : null;
        if (ck) matched.add(ck);
        let differs;
        if (!c) differs = r.amount_mg != null; // named elsewhere with an amount, absent from the chosen panel
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
  for (const [field, keyFn] of [['serving_size', servingKey], ['servings_per_container', countKey]]) {
    const cands = usable.filter((r) => r[field] != null && String(r[field]).trim() !== '');
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

  // ── certifications: union by claim, text wording first ──
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
  values.certifications = [...byClaim.values()].map((e) => e.claim);
  if (byClaim.size) sources.certifications = [...byClaim.values()].map((e) => ({ claim: e.claim, sources: e.sources }));

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
