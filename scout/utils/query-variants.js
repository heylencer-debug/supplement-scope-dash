/**
 * utils/query-variants.js — the small set of Amazon searches P1 runs per
 * keyword (pure, no I/O, unit-tested in test/query-variants.test.js).
 *
 * WHY. One search surfaces whatever Amazon's relevance ranker puts first for
 * ONE phrasing. Established competitors that rank for the category but not for
 * that exact phrasing were never seen. A handful of phrasings — the base
 * keyword, the "best …" intent query, the two audience splits, and the
 * sugar-free form split — widens the pool to the products shoppers actually
 * reach, without a hand-maintained per-category list.
 *
 * GENERIC BY CONSTRUCTION. The only vocabularies here are closed classes of
 * ENGLISH words (audience nouns, dosage-form nouns, sweetened forms), never
 * category names. A keyword that already names an audience gets no audience
 * split; a keyword with no sweetened form gets no sugar-free split.
 *
 * Order matters: the base query comes first (it gets the most SERP pages in
 * human-bsr.js) and the list is truncated at `maxQueries` from the end.
 */

const MAX_QUERIES_DEFAULT = 5;

// A keyword naming any of these already targets an audience; splitting it by
// gender would produce nonsense ("prenatal vitamins for men").
const AUDIENCE_WORDS = [
  'women', 'woman', 'womens', "women's", 'female', 'her',
  'men', 'man', 'mens', "men's", 'male', 'him',
  'kid', 'kids', 'child', 'children', 'toddler', 'toddlers', 'baby', 'babies', 'infant', 'teen', 'teens',
  'adult', 'adults', 'senior', 'seniors', 'elderly',
  'prenatal', 'postnatal', 'pregnancy', 'pregnant', 'menopause', 'menopausal',
  'dog', 'dogs', 'cat', 'cats', 'pet', 'pets', 'horse', 'horses',
];

// Dosage forms that are usually sweetened — only these get a "sugar free"
// split (nobody searches "sugar free capsules").
const SWEETENED_FORMS = [
  'gummy', 'gummies', 'chew', 'chews', 'chewable', 'chewables',
  'powder', 'powders', 'drink', 'mix', 'packet', 'packets', 'stick', 'sticks',
  'syrup', 'lozenge', 'lozenges', 'candy', 'bar', 'bars', 'shot', 'shots',
];

const SUGAR_FREE_RE = /\b(sugar[\s-]?free|no sugar|zero sugar|sugarless|unsweetened|keto)\b/i;

/** Clean a keyword label: drops the " #N" session suffix and extra spaces. */
function cleanKeyword(label) {
  return String(label || '')
    .replace(/\s*#\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(s) {
  return s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

function hasAny(ws, vocab) {
  return ws.some((w) => vocab.includes(w));
}

/**
 * @param {string} keywordLabel  e.g. "magnesium gummies" or "electrolyte powder #3"
 * @param {{ maxQueries?: number }} [opts]
 * @returns {string[]}  1..maxQueries distinct queries, base first
 */
function buildQueryVariants(keywordLabel, opts = {}) {
  const maxQueries = Math.max(1, Math.min(Number(opts.maxQueries) || MAX_QUERIES_DEFAULT, MAX_QUERIES_DEFAULT));
  const base = cleanKeyword(keywordLabel);
  if (!base) return [];
  const ws = words(base);

  const out = [base];
  if (ws[0] !== 'best' && ws[0] !== 'top') out.push(`best ${base}`);
  if (!hasAny(ws, AUDIENCE_WORDS)) {
    out.push(`${base} for women`);
    out.push(`${base} for men`);
  }
  if (hasAny(ws, SWEETENED_FORMS) && !SUGAR_FREE_RE.test(base)) {
    out.push(`sugar free ${base}`);
  }

  const seen = new Set();
  const distinct = out.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return distinct.slice(0, maxQueries);
}

module.exports = { buildQueryVariants, cleanKeyword, MAX_QUERIES_DEFAULT };
