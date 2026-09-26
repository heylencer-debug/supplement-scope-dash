/**
 * utils/label-variant.js — does this label belong to THIS listing and THIS
 * variation? (pure core + one fail-open read helper)
 *
 * Amazon galleries are shared across a variation family more often than not,
 * so the facts panel P4 reads for "120 Count" can be the 60-count bottle's
 * label (real case, B09WD43NBC: listing "120 Count (Pack of 1)" per Keepa, the
 * panel says 30 servings × 2 gummies = 60). The check compares what the LABEL
 * itself says — its product name, flavour and count, or the count implied by
 * servings × units — with the listing title and this ASIN's own Keepa
 * variation attributes (dovive_keepa.raw_json.variations[{asin, attributes}]).
 *
 * Verdict:
 *   mismatch          — the label contradicts the listing on flavour or brand:
 *                       another product. migrate-ocr-to-dash.js never promotes it.
 *   match_by_serving  — only the count differs (a pack-size sibling's panel). Per
 *                       serving it is the same product: kept, flagged.
 *   match             — no contradiction and at least one positive agreement.
 *   unknown           — the label shows nothing that identifies the variation.
 * Flavour is compared only from the package identity or front-of-pack wording,
 * never an ingredients line, and not at all on a variety/assorted listing.
 */

'use strict';

const { parseServing } = require('./label-facts');

const COUNT_UNITS = '(count|ct|cts|pcs|pieces|gumm(?:y|ies)|capsules?|caps|veg(?:gie)?\\s*caps(?:ules)?|softgels?|tablets?|tabs|chews|soft\\s*chews|lozenges|stick\\s*packs?|stickpacks?|sticks|packets|servings)';

const FLAVORS = [
  'mixed berry', 'blue raspberry', 'pink lemonade', 'lemon lime', 'fruit punch', 'passion fruit', 'green apple', 'strawberry kiwi',
  'strawberry lemonade', 'raspberry lemonade', 'berry lemonade', 'white peach', 'tart cherry', 'cotton candy', 'apple cinnamon', 'cherry lime',
  'strawberry', 'raspberry', 'blueberry', 'blackberry', 'cranberry', 'elderberry', 'berry', 'cherry', 'lemonade', 'lemon', 'lime', 'orange',
  'grape', 'watermelon', 'peach', 'mango', 'pineapple', 'tropical', 'apple', 'pomegranate', 'coconut', 'vanilla', 'chocolate', 'mint',
  'peppermint', 'cinnamon', 'citrus', 'kiwi', 'guava', 'acai', 'unflavored', 'unflavoured',
];

const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'a', 'an', 'in', 'to', 'by', 'plus', 'supplement', 'supplements', 'dietary', 'natural', 'naturally',
  'flavor', 'flavored', 'flavour', 'count', 'ct', 'pack', 'mg', 'mcg', 'g', 'iu', 'per', 'serving', 'servings', 'women', 'men', 'adults', 'kids', 'free', 'support',
  // dosage forms say nothing about WHICH product this is
  'gummy', 'gummies', 'capsule', 'capsules', 'caps', 'tablet', 'tablets', 'softgel', 'softgels', 'chews', 'powder', 'drink', 'mix', 'packets', 'sticks']);

function norm(s) {
  return String(s || '').toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  return norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}

/** "2 Pack", "Pack of 2", "(2 pack)", "2-Pack" → 2 */
function extractPack(text) {
  const t = String(text || '');
  const m = t.match(/pack\s+of\s+(\d{1,3})\b/i) || t.match(/\b(\d{1,2})\s*-?\s*pack\b/i) || t.match(/\b(\d{1,2})\s*x\s*\d{2,4}\s*(?:count|ct|gumm)/i);
  const n = m ? Number(m[1]) : null;
  return n && n > 0 ? n : null;
}

/**
 * Container count as printed: "120 Cts", "60 Count", "120CT", "60 Sugar-free
 * Gummies", "60 Count (Pack of 2)". Serving-size lines ("Serving Size 2
 * Gummies", "take 2 gummies") are removed first so they are never read as the
 * container count.
 */
function extractCount(text) {
  let t = String(text || '');
  t = t.replace(/serving\s*size\s*:?\s*[^\n⏎]{0,40}/gi, ' ')
    .replace(/\b(take|chew|consume|adults?|children|kids)\b[^\n⏎.]{0,40}/gi, ' ')
    .replace(/\d+\s*mg\b/gi, ' ');
  // "KSM-66 Ashwagandha Gummies" is a trademark, not a count: the number may
  // not follow a letter or a hyphen. Explicit count words win over unit nouns.
  const strong = new RegExp(`(?<![\\w-])(\\d{1,4})\\s*-?\\s*(count|ct|cts|pcs|pieces)\\b`, 'gi');
  const weak = new RegExp(`(?<![\\w-])(\\d{1,4})\\s*-?\\s*(?:[a-z-]+\\s+){0,2}?${COUNT_UNITS}\\b`, 'gi');
  for (const re of [strong, weak]) {
    let m;
    while ((m = re.exec(t))) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (/serving/.test(unit)) continue; // "30 servings" is not the unit count
      if (n >= 5 && n <= 1000) return { count: n, unit, text: m[0].trim() };
    }
  }
  return null;
}

/** Flavour words in a string, longest phrase first ("mixed berry" wins over "berry"). */
function extractFlavors(text) {
  let t = ` ${norm(text)} `;
  const out = [];
  for (const f of FLAVORS) {
    const k = ` ${f} `;
    if (t.includes(k)) { out.push(f); t = t.split(k).join(' '); }
  }
  return out;
}

/** Label text minus ingredient lists ("Other Ingredients: …, natural raspberry flavor, …"). */
function frontOfPack(raw) {
  return String(raw || '')
    .split(/\r?\n|⏎/)
    .map((line) => line.replace(/\b(?:other\s+|inactive\s+)?ingredients?\s*:.*$/i, ' ').replace(/\bcontains\s*:.*$/i, ' '))
    .join('\n');
}

/** Only the phrases the label/title marks as its flavour ("Mixed Berry Flavor", "Strawberry Flavored"). */
function statedFlavors(text) {
  const s = String(text || '');
  const hits = [];
  const re = /((?:[A-Za-z]+[\s-]){0,3}?)(?:naturally\s+)?(flavou?r(?:ed)?)\b/gi;
  let m;
  while ((m = re.exec(s))) hits.push(...extractFlavors(m[1]));
  const re2 = /\bflavou?r\s*:\s*([A-Za-z\s-]{3,40})/gi;
  while ((m = re2.exec(s))) hits.push(...extractFlavors(m[1]));
  return [...new Set(hits)];
}

/** This ASIN's own attributes from Keepa's variations list. */
function ownVariationAttributes(variations, asin) {
  if (!Array.isArray(variations) || !asin) return null;
  const v = variations.find((x) => x && x.asin === asin);
  if (!v || !Array.isArray(v.attributes)) return null;
  const out = { flavor: null, size: null, count: null, pack: null };
  for (const a of v.attributes) {
    const dim = String(a && a.dimension || '').toLowerCase();
    const val = a && a.value != null ? String(a.value) : null;
    if (!val) continue;
    if (/flavou?r|scent/.test(dim)) out.flavor = val;
    if (/size|count|quantity/.test(dim)) {
      out.size = val;
      out.pack = extractPack(val);
      // "3.08 Ounce (Pack of 1)", "16 fl oz", "500 g": a weight or volume is not a unit count.
      if (/^\s*[\d.,]+\s*(?:ounces?|oz|fl\.?\s*oz|fluid|grams?|g|kg|kilograms?|lbs?|pounds?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)\b/i.test(val)) {
        out.count = null;
        out.size_is_measure = true;
      } else {
        const c = extractCount(val) || (val.match(/^(\d{1,4})\b/) ? { count: Number(val.match(/^(\d{1,4})\b/)[1]) } : null);
        out.count = c ? c.count : null;
      }
    }
  }
  return out;
}

function flavorsAgree(a, b) {
  if (!a.length || !b.length) return null;
  if (a.some((x) => ['unflavored', 'unflavoured'].includes(x)) !== b.some((x) => ['unflavored', 'unflavoured'].includes(x))) return false;
  // "berry" agrees with "mixed berry"; "lemon" with "lemon lime".
  return a.some((x) => b.some((y) => x === y || x.includes(y) || y.includes(x)));
}

function brandAgrees(labelBrand, listingBrand, title) {
  if (!labelBrand || !listingBrand) return null;
  const a = norm(labelBrand).replace(/ /g, '');
  const b = norm(listingBrand).replace(/ /g, '');
  if (!a || !b) return null;
  if (a.includes(b) || b.includes(a)) return true;
  if (title && norm(title).replace(/ /g, '').includes(a)) return true;
  return false;
}

/**
 * @param {object} p
 *   asin
 *   title                listing title
 *   brand                listing brand (dovive_research.brand / products.brand)
 *   label                { brand, product_name, flavor, count, raw_text, serving_size, servings_per_container }
 *   keepa                { parent_asin, variations }  (dovive_keepa.raw_json fields)
 * @returns {{ title_tokens_overlap, flavor_match, count_match, brand_match, parent_asin, listing: object,
 *             label: object, verdict: 'match'|'match_by_serving'|'mismatch'|'unknown', mismatch_on: string[], why: string }}
 */
function checkLabelProductMatch(p = {}) {
  const label = p.label || {};
  const raw = label.raw_text || '';
  const own = p.keepa ? ownVariationAttributes(p.keepa.variations, p.asin) : null;

  // Listing side: Keepa's own attributes first, then the title.
  const titleCount = extractCount(p.title);
  const titlePack = extractPack(p.title);
  const listingFlavorText = own && own.flavor ? own.flavor : p.title;
  const listingFlavors = own && own.flavor ? extractFlavors(own.flavor) : statedFlavors(p.title);
  // A variety / assorted listing holds several flavours: any one of them on a panel is expected.
  const varietyListing = /\b(variety|assorted|sampler|mixed flavou?rs?)\b/i.test(listingFlavorText || '') || /\b(variety|assorted)\s+pack\b/i.test(p.title || '');
  const listingCounts = new Set();
  const titleCounts = new Set();
  if (titleCount) {
    titleCounts.add(titleCount.count);
    if (titlePack && titlePack > 1 && titleCount.count % titlePack === 0) titleCounts.add(titleCount.count / titlePack);
    if (titlePack && titlePack > 1) titleCounts.add(titleCount.count * titlePack);
  }
  if (own && own.count) {
    listingCounts.add(own.count);
    if (own.pack && own.pack > 1) listingCounts.add(own.count * own.pack);
  } else {
    for (const c of titleCounts) listingCounts.add(c);
  }

  // Label side: printed count, else servings × units per serving.
  const printed = extractCount(label.count) || extractCount(raw);
  const serving = parseServing(label.serving_size);
  const spc = Number(String(label.servings_per_container ?? '').match(/\d+/)?.[0]);
  const derived = serving.discrete && serving.units && spc ? serving.units * spc : null;
  const labelCount = printed ? printed.count : derived;
  const labelCountSource = printed ? 'printed' : derived ? 'servings × units' : null;
  const labelPack = extractPack(raw);
  // Flavour comes from the package identity the model read, or front-of-pack
  // wording — NEVER an ingredients line ("… natural raspberry flavor, …").
  const labelFlavors = label.flavor ? extractFlavors(label.flavor) : statedFlavors(frontOfPack(raw));

  let count_match = null;
  let count_note = null;
  if (labelCount && listingCounts.size) {
    const all = new Set([...listingCounts, ...titleCounts]);
    count_match = all.has(labelCount) || (labelPack > 1 && all.has(labelCount * labelPack));
    // "24 Count" of 8-packet boxes: a whole multiple of the label with NO pack
    // size stated in Keepa is probably a multipack, not another variation —
    // unknown, not mismatch. Keepa's explicit "Pack of 1" keeps it a count
    // difference. The title's own count/pack is tried as well.
    const keepaPackStated = own && own.size && /pack\s+of/i.test(own.size);
    if (!count_match && !keepaPackStated) {
      const multiple = [...all].find((c) => c > labelCount && c % labelCount === 0 && c / labelCount <= 12);
      if (multiple) { count_match = null; count_note = `listing count ${multiple} is ${multiple / labelCount}× the label's ${labelCount} with no pack size stated — probably a multipack`; }
    }
  }
  const flavor_match = varietyListing ? null : flavorsAgree(labelFlavors, listingFlavors);
  const brand_match = brandAgrees(label.brand, p.brand, p.title);

  const nameTokens = tokens(label.product_name);
  const titleTokens = new Set(tokens(p.title));
  const title_tokens_overlap = nameTokens.length ? Math.round((nameTokens.filter((t) => titleTokens.has(t)).length / nameTokens.length) * 100) / 100 : null;

  const conflicts = [];
  const mismatch_on = [];
  const agreements = [];
  if (flavor_match === false) { conflicts.push(`flavour: label ${labelFlavors.join('/')} vs listing ${listingFlavors.join('/')}`); mismatch_on.push('flavor'); }
  else if (flavor_match) agreements.push('flavour');
  if (count_match === false) { conflicts.push(`count: label ${labelCount} (${labelCountSource}) vs listing ${[...listingCounts].join(' or ')}${own && own.size ? ` (Keepa size "${own.size}")` : ''}`); mismatch_on.push('count'); }
  else if (count_match) agreements.push('count');
  if (brand_match === false && (title_tokens_overlap == null || title_tokens_overlap < 0.2)) { conflicts.push(`brand: label "${label.brand}" vs listing "${p.brand}"`); mismatch_on.push('brand'); }
  else if (brand_match) agreements.push('brand');
  if (title_tokens_overlap != null && title_tokens_overlap >= 0.5) agreements.push('product name');

  // mismatch          — flavour or brand contradicts the listing: another product;
  //                     never promoted.
  // match_by_serving  — only the COUNT differs (a pack-size sibling's panel):
  //                     per serving the panel is the same product, so it is kept
  //                     and flagged, but servings_per_container is not this listing's.
  let verdict = 'unknown';
  let why;
  if (mismatch_on.includes('flavor') || mismatch_on.includes('brand')) { verdict = 'mismatch'; why = conflicts.join('; '); }
  else if (mismatch_on.includes('count')) { verdict = 'match_by_serving'; why = `${conflicts.join('; ')} — another pack size's panel; per serving it is the same product`; }
  else if (agreements.length) { verdict = 'match'; why = `label agrees on ${agreements.join(', ')}`; }
  else why = count_note || (varietyListing ? 'variety listing — flavour not compared; no count or brand to compare' : 'the label shows no flavour, count or brand to compare');

  return {
    title_tokens_overlap,
    flavor_match,
    count_match,
    brand_match,
    count_note,
    parent_asin: (p.keepa && p.keepa.parent_asin) || null,
    listing: { counts: [...listingCounts], flavors: listingFlavors, keepa_size: own ? own.size : null, keepa_flavor: own ? own.flavor : null },
    label: { count: labelCount, count_source: labelCountSource, pack: labelPack, flavors: labelFlavors, brand: label.brand || null, product_name: label.product_name || null },
    verdict,
    variety_listing: varietyListing,
    // Which dimensions disagree.
    mismatch_on,
    why,
  };
}

/**
 * dovive_keepa variation data for these ASINs, keyed by ASIN. Read-only and
 * fail-open: any error → empty map (every verdict falls back to the title).
 */
async function loadKeepaVariants(client, asins) {
  const out = new Map();
  if (!client || !asins || !asins.length) return out;
  try {
    for (let i = 0; i < asins.length; i += 100) {
      const chunk = asins.slice(i, i + 100);
      const { data, error } = await client.from('dovive_keepa').select('asin, parent_asin:raw_json->parentAsin, variations:raw_json->variations').in('asin', chunk);
      if (error) return out;
      for (const r of data || []) out.set(r.asin, { parent_asin: typeof r.parent_asin === 'string' ? r.parent_asin : null, variations: Array.isArray(r.variations) ? r.variations : null });
    }
  } catch (_) { /* fail-open */ }
  return out;
}

module.exports = {
  checkLabelProductMatch,
  extractCount,
  extractPack,
  extractFlavors,
  statedFlavors,
  frontOfPack,
  ownVariationAttributes,
  loadKeepaVariants,
};
