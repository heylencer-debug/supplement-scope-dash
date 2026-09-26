/**
 * utils/phase-map.js — one shared description of the pipeline phases for the
 * READ-FIRST inventory (inventory.js) and the plan (plan-scope.js).
 *
 * Runner numbering (run-pipeline.js), NOT the script-file numbering:
 *   P7 = phase6-market-analysis.js, P8 = phase7-packaging-intelligence.js,
 *   P9 = phase8-formula-brief.js, P10 = phase9-formula-qa.js,
 *   P11 = phase10-competitive-benchmarking.js, P12 = phase11-fda-compliance.js,
 *   P13 = phase12-final-signoff.js.
 *
 * level 'asin'     — the phase produces one artefact per product; coverage is
 *                    measured against the candidate ASIN set (top-40 / top-10).
 * level 'category' — the phase produces one artefact per session category
 *                    (formula_briefs.ingredients.*); coverage is 0/1.
 *
 * familyReuse — whether a SIBLING session's data for the same ASIN can reach
 * THIS session by READING alone (no row copies). True only where the migrate
 * step already reads the raw table by ASIN (P2 dovive_keepa, P4 dovive_ocr),
 * or reads it by keyword and has been taught to read sibling keywords (P3
 * dovive_reviews via SCOUT_REUSE_KEYWORDS in migrate-reviews-to-dash.js).
 * syncScripts — the no-cost migrate step(s) that land that sibling data in
 * this session's DASH category when the plan says "reuse from family".
 */

const PHASE_META = [
  { key: 'P1', num: 1, name: 'Amazon Scrape', level: 'asin', marker: 'dovive_research (asin,keyword) + products rows',
    familyReuse: false, syncScripts: null, cost: 'scrape' },
  { key: 'P2', num: 2, name: 'Keepa Enrichment', level: 'asin', marker: 'dovive_keepa (asin) → products.monthly_sales',
    familyReuse: true, readBy: 'asin', syncScripts: ['migrate-keepa-to-dash.js'], cost: 'keepa' },
  { key: 'P3', num: 3, name: 'Reviews', level: 'asin', marker: 'dovive_reviews (asin,keyword) → products.review_analysis',
    familyReuse: true, readBy: 'keyword', syncScripts: ['migrate-reviews-to-dash.js', 'phase3b-review-synthesis.js'], cost: 'scrape' },
  { key: 'P4', num: 4, name: 'OCR / Formula Extraction', level: 'asin', marker: 'dovive_ocr (asin,image_index) → products.nutrients_count',
    familyReuse: true, readBy: 'asin', syncScripts: ['migrate-ocr-to-dash.js'], cost: 'ai' },
  { key: 'P5', num: 5, name: 'Deep Research', level: 'asin', marker: 'dovive_phase5_research (asin,keyword,pool) with full_research',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P6', num: 6, name: 'Product Intelligence', level: 'asin', marker: 'products.marketing_analysis.product_intelligence',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P7', num: 7, name: 'Market Intelligence', level: 'category', marker: 'formula_briefs.ingredients.market_intelligence.ai_market_analysis',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P8', num: 8, name: 'Packaging Intelligence', level: 'asin', marker: 'products.marketing_analysis.packaging_intelligence',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P9', num: 9, name: 'Formula Brief', level: 'category', marker: 'formula_briefs.ingredients.ai_generated_brief',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P10', num: 10, name: 'Formula QA', level: 'category', marker: 'formula_briefs.ingredients.qa_report',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P11', num: 11, name: 'Competitive Benchmarking', level: 'category', marker: 'formula_briefs.ingredients.competitive_benchmarking',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P12', num: 12, name: 'FDA Compliance', level: 'category', marker: 'formula_briefs.ingredients.fda_compliance',
    familyReuse: false, syncScripts: null, cost: 'ai' },
  { key: 'P13', num: 13, name: 'Final Sign-off', level: 'category', marker: 'formula_briefs.ingredients.final_signoff',
    familyReuse: false, syncScripts: null, cost: 'ai' },
];

const PHASE_BY_KEY = Object.fromEntries(PHASE_META.map(p => [p.key, p]));
const PHASE_BY_NUM = Object.fromEntries(PHASE_META.map(p => [p.num, p]));

// ── Keyword family helpers ─────────────────────────────────────────────────
// A "session label" is the keyword a job was submitted under. submit-job.js
// gives every re-submission of the same keyword a new "#N" suffix, so one
// search term ("electrolyte powder") accumulates several isolated sessions
// ("electrolyte powder", "electrolyte powder #2", … "#5"). The FAMILY is the
// base keyword with the suffix stripped, plus explicit aliases, plus (by
// default) singular/plural variants of each word.

function normalizeKeyword(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripSession(s) {
  return normalizeKeyword(s).replace(/\s*#\d+\s*$/, '').trim();
}

function sessionNumber(s) {
  const m = normalizeKeyword(s).match(/#(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 1;
}

function wordVariants(w) {
  const out = new Set([w]);
  if (w.length <= 3) return [...out];
  if (/ies$/.test(w)) { out.add(w.slice(0, -3) + 'y'); }
  else if (/[^aeiou]y$/.test(w)) { out.add(w.slice(0, -1) + 'ies'); }
  if (/s$/.test(w) && !/ss$/.test(w) && !/ies$/.test(w)) out.add(w.slice(0, -1));
  if (!/s$/.test(w) && !/y$/.test(w)) out.add(w + 's');
  return [...out];
}

/** All normalized base names that count as the same search term. */
function familyNames(keyword, { aliases = [], autoAliases = true } = {}) {
  const bases = [stripSession(keyword), ...aliases.map(stripSession)].filter(Boolean);
  const names = new Set();
  for (const base of bases) {
    names.add(base);
    if (!autoAliases) continue;
    const words = base.split(' ');
    let combos = [[]];
    for (const w of words) {
      const vs = wordVariants(w);
      const next = [];
      for (const c of combos) for (const v of vs) next.push([...c, v]);
      combos = next.slice(0, 64); // guard: long keywords would explode
    }
    for (const c of combos) names.add(c.join(' '));
  }
  return [...names];
}

function isFamilyLabel(label, names) {
  const set = names instanceof Set ? names : new Set(names);
  return set.has(stripSession(label));
}

/**
 * Distinct first-word stems used for one broad ilike per stem per table
 * ("electrolyte"/"electrolytes" → "electrolyte"). Stems that are a prefix of
 * another stem absorb it, so the query count stays tiny.
 */
function familyPrefixes(names) {
  const stems = [...new Set(names.map(n => {
    const w = n.split(' ')[0] || '';
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }).filter(Boolean))].sort((a, b) => a.length - b.length);
  const out = [];
  for (const s of stems) if (!out.some(o => s.startsWith(o))) out.push(s);
  return out;
}

module.exports = {
  PHASE_META, PHASE_BY_KEY, PHASE_BY_NUM,
  normalizeKeyword, stripSession, sessionNumber, familyNames, isFamilyLabel, familyPrefixes,
};
