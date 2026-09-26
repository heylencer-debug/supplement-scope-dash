/**
 * utils/product-line.js — "is this the same product in another flavor or
 * size?" from brand + title alone (pure, tested in test/product-line.test.js).
 *
 * WHY. Keepa's parentAsin only groups what the SELLER grouped. Liquid I.V.
 * sells Lemon Lime 16ct, the Signature Variety Pack and the Lemon Lime tub
 * under DIFFERENT parents, so parent-only grouping gave one brand six of 40
 * competitor slots. This builds a second grouping key: the brand plus what is
 * left of the title once flavor, count, size, packaging and the category's
 * own common words are removed. What is left is the product LINE: "sugar
 * free", "immune", "multivitamin", "advancedcare plus"… — so a sugar-free or
 * immune line stays a separate competitor, while flavors and pack sizes of
 * the same line collapse.
 *
 * The vocabularies are closed classes of English (flavors, units, packaging),
 * never category names. Category words ("electrolyte", "hydration",
 * "gummies") are found from the pool itself: any token in ≥ COMMON_SHARE of
 * the pool's titles is category language, not a product line.
 */

const COMMON_SHARE = 0.2;

// Tokens that name a distinct formula/line — never stripped, even when common.
const LINE_TOKENS = new Set([
  'sugarfree', 'zero', 'keto', 'immune', 'immunity', 'sleep', 'energy', 'caffeine', 'kids', 'kid', 'children',
  'women', 'men', 'prenatal', 'senior', 'sport', 'sports', 'plus', 'max', 'extra', 'pro', 'protein', 'collagen',
  'recovery', 'pm', 'night', 'focus', 'beauty', 'stress', 'calm',
]);

// Flavors, colors-as-flavors and flavor adjectives.
const FLAVOR_TOKENS = new Set(`
  lemon lime orange tangerine grapefruit citrus lemonade limeade strawberry raspberry blueberry blackberry berry
  berries cherry grape watermelon melon cantaloupe honeydew mango pineapple peach apricot passion passionfruit
  fruit fruits punch tropical coconut banana kiwi pomegranate pom guava lychee dragonfruit acai cranberry apple
  pear plum yuzu cucumber mint peppermint spearmint vanilla chocolate cocoa caramel coffee mocha cinnamon ginger
  honey maple cookie cream creamsicle cola rootbeer bubblegum candy cotton sour blue red white green pink purple
  black gold ice iced frost frosted splash burst blast twist wave storm freeze chill fresh natural naturally
  flavor flavors flavored flavour unflavored unflavoured original classic signature assorted mixed variety sampler
  salty salted sweet tart juicy lightly
`.trim().split(/\s+/));

// Units, counts, packaging, generic retail words and grammar.
const PACK_TOKENS = new Set(`
  count ct pack packs pk packet packets stick sticks stickpack stickpacks sachet sachets serving servings serv
  single tub tubs canister canisters jar jars bottle bottles pouch pouches bag bags box boxes can cans bulk
  travel size sizes value family refill case carton container oz ounce ounces fl lb lbs pound pounds g gram grams
  kg mg ml l liter capsule capsules caps cap tablet tablets tab tabs softgel softgels gummy gummies chew chews
  piece pieces day days supply month
  with and for the of in a an to on by from new improved formula
`.trim().split(/\s+/));

function singular(t) {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`; // gummies → gummy, berries → berry
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1); // packets → packet (not plus)
  return t;
}

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/sugar[\s-]*free|zero[\s-]*sugar|no[\s-]*sugar|sugarless/g, ' sugarfree ')
    .replace(/on[\s-]*the[\s-]*go/g, ' ')
    .replace(/\bpack\s+of\s+\d+\b/g, ' ')
    .replace(/\d+(\.\d+)?/g, ' ') // numbers go; the unit left behind ("ct", "lb") is a PACK token
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(singular);
}

/** The product-identity part of a title: before the first "|", "," or dash separator. */
function headSegment(title) {
  return String(title || '').split(/\s*[|,–—]\s*|\s+-\s+/)[0];
}

function normBrand(brand) {
  return String(brand || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const isStripped = (t) => FLAVOR_TOKENS.has(t) || PACK_TOKENS.has(t);

/**
 * @param {Array<{ asin: string, brand?: string, title?: string }>} items
 * @returns {Map<string, string|null>} asin → line key ("brand|tok tok"), null when brand unknown
 */
function productLineKeys(items, opts = {}) {
  const share = opts.commonShare ?? COMMON_SHARE;
  const heads = items.map((it) => {
    const brandToks = new Set(tokens(it.brand));
    return { asin: it.asin, brand: normBrand(it.brand), toks: [...new Set(tokens(headSegment(it.title)).filter((t) => !brandToks.has(t)))] };
  });
  const df = new Map();
  for (const h of heads) for (const t of h.toks) df.set(t, (df.get(t) || 0) + 1);
  const minDf = Math.max(2, Math.ceil(heads.length * share));
  const out = new Map();
  for (const h of heads) {
    if (!h.brand) { out.set(h.asin, null); continue; }
    const line = h.toks
      .filter((t) => LINE_TOKENS.has(t) || (!isStripped(t) && (df.get(t) || 0) < minDf))
      .sort();
    out.set(h.asin, `${h.brand}|${[...new Set(line)].join(' ')}`);
  }
  return out;
}

module.exports = { productLineKeys, headSegment, normBrand, tokens };
