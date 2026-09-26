/**
 * Raw-row fixtures for assembleInventory() → planScope(). Each builder returns
 * exactly the shape fetchRaw() returns, so the tests exercise the same pure
 * code path the live CLI does — just without a database.
 *
 * NOW is fixed; ages are expressed in days before NOW.
 */
const NOW = new Date('2026-09-26T00:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const asins = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`);

function empty(keyword) {
  return { keyword, names: [keyword], labels: [keyword], related: [], categories: [],
    research: [], reviews: [], p5: [], packaging: [], products: [], keepa: [], ocr: [], briefs: [], usage: [] };
}

function allBriefFlags(categoryId, at) {
  return { category_id: categoryId, created_at: at, updated_at: at, gen_at: at, qa_at: at, mi_at: at, cb_at: at, fc_at: at, fs_at: at,
    fs_verdict: 'APPROVED', has_mi: true, has_brief: true, has_qa: true, has_cb: true, has_fc: true, has_fs: true };
}

/** One session holding every phase for 40 ASINs, all `age` days old. */
function singleSession(keyword, catId, age) {
  const at = ago(age);
  const list = asins('B0FULL', 40);
  const raw = empty(keyword);
  raw.categories = [{ label: keyword, id: catId, name: keyword, method: 'search_term_exact', created_at: at, is_test: false }];
  raw.research = list.map((a, i) => ({ asin: a, keyword, bsr: 100 + i, rank_position: i + 1, scraped_at: at }));
  raw.products = list.map((a, i) => ({ asin: a, parent_asin: `P${a}`, category_id: catId, bsr_current: 100 + i, monthly_sales: 1000,
    nutrients_count: 8, ra_n: '30', review_analysis_updated_at: at, pi_at: at, pk_at: at, updated_at: at, last_updated: at }));
  raw.keepa = list.map(a => ({ asin: a, keyword, parsed_at: at }));
  raw.reviews = list.flatMap(a => [{ asin: a, keyword, scraped_at: at }, { asin: a, keyword, scraped_at: at }]);
  raw.ocr = list.map(a => ({ asin: a, keyword, image_index: 0, processed_at: at, first_fact: 'Magnesium' }));
  raw.p5 = list.slice(0, 10).map(a => ({ asin: a, keyword, pool: 'top10', researched_at: at }));
  raw.briefs = [allBriefFlags(catId, at)];
  raw.usage = [{ keyword, phase: 'P4', cost_usd: 0.5, calls: 40 }, { keyword, phase: 'P9', cost_usd: 1.4, calls: 2 }];
  return raw;
}

const fullyCovered = () => singleSession('vitamin d gummies', 'cat-vd', 3);
const stale = () => singleSession('ashwagandha gummies', 'cat-ash', 200);
const emptyKeyword = () => empty('creatine gummies');

/**
 * "electrolyte powder" family, target = a brand-new "#6" session.
 *   #3  (40 d old)  P1 + OCR for all 40 + P6 + a full brief
 *   #4  (10 d old)  P1 + reviews for ASINs 1–30
 *   #5  ( 4 d old)  P1 only — the freshest P1 → the candidate source
 * `afterP1: true` adds the #6 session's own P1 rows + DASH category (35 of the
 * 40 candidates landed in DASH), i.e. the plan as rebuilt after P1.
 */
function fragmented({ afterP1 = false } = {}) {
  const list = asins('B0ELEC', 40);
  const raw = empty('electrolyte powder #6');
  raw.names = ['electrolyte powder', 'electrolytes powder'];
  raw.labels = ['electrolyte powder #3', 'electrolyte powder #4', 'electrolyte powder #5', 'electrolyte powder #6'];
  raw.related = ['electrolyte packets'];
  raw.categories = [
    { label: 'electrolyte powder #3', id: 'cat-3', name: 'Electrolyte Powder #3', method: 'search_term_exact', created_at: ago(40), is_test: false },
    { label: 'electrolyte powder #4', id: 'cat-4', name: 'Electrolyte Powder #4', method: 'search_term_exact', created_at: ago(10), is_test: false },
    { label: 'electrolyte powder #5', id: 'cat-5', name: 'Electrolyte Powder #5', method: 'search_term_exact', created_at: ago(4), is_test: false },
  ];
  for (const [kw, age] of [['electrolyte powder #3', 40], ['electrolyte powder #4', 10], ['electrolyte powder #5', 4]]) {
    raw.research.push(...list.map((a, i) => ({ asin: a, keyword: kw, bsr: 50 + i, rank_position: i + 1, scraped_at: ago(age) })));
  }
  raw.products.push(...list.map((a, i) => ({ asin: a, category_id: 'cat-3', bsr_current: 50 + i, nutrients_count: 6, pi_at: ago(40), updated_at: ago(40) })));
  raw.products.push(...list.slice(0, 30).map((a, i) => ({ asin: a, category_id: 'cat-4', bsr_current: 50 + i, ra_n: '25', review_analysis_updated_at: ago(10), updated_at: ago(10) })));
  raw.products.push(...list.map((a, i) => ({ asin: a, category_id: 'cat-5', bsr_current: 50 + i, updated_at: ago(4) })));
  raw.ocr = list.map(a => ({ asin: a, keyword: 'electrolyte powder #3', image_index: 0, processed_at: ago(40), first_fact: 'Sodium' }));
  raw.reviews = list.slice(0, 30).map(a => ({ asin: a, keyword: 'electrolyte powder #4', scraped_at: ago(10) }));
  raw.keepa = list.map(a => ({ asin: a, keyword: 'electrolyte powder #3', parsed_at: ago(40) }));
  raw.briefs = [allBriefFlags('cat-3', ago(40))];
  raw.usage = [{ keyword: 'electrolyte powder #3', phase: 'P5', cost_usd: 0.4, calls: 8 }, { keyword: 'electrolyte powder #3', phase: 'P9', cost_usd: 1.2, calls: 2 }];
  if (afterP1) {
    raw.categories.push({ label: 'electrolyte powder #6', id: 'cat-6', name: 'Electrolyte Powder #6', method: 'search_term_exact', created_at: ago(0), is_test: false });
    raw.research.push(...list.map((a, i) => ({ asin: a, keyword: 'electrolyte powder #6', bsr: 50 + i, rank_position: i + 1, scraped_at: ago(0) })));
    // 35 of the 40 made it into the #6 DASH category; B0ELEC0036..40 did not.
    raw.products.push(...list.slice(0, 35).map((a, i) => ({ asin: a, category_id: 'cat-6', bsr_current: 50 + i, updated_at: ago(0) })));
  }
  return raw;
}

module.exports = { NOW, ago, fullyCovered, stale, emptyKeyword, fragmented };
