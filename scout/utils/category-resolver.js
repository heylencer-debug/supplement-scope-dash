async function countProductsForCategory(DASH, categoryId) {
  const { count } = await DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', categoryId);
  return count || 0;
}

/**
 * Resolve category with strict contract:
 * 1) exact search_term match first
 * 2) fallback strict all-word match on name
 * 3) tie-break by highest product count
 * 4) fail hard on unresolved or ambiguous ties
 */
async function resolveCategory(DASH, keyword) {
  // 1) exact search_term
  const { data: exact } = await DASH
    .from('categories')
    .select('id,name,search_term')
    .eq('search_term', keyword)
    .limit(20);

  if (exact?.length === 1) {
    return { id: exact[0].id, name: exact[0].name, method: 'search_term_exact' };
  }

  if (exact?.length > 1) {
    const withCounts = await Promise.all(exact.map(async c => ({
      ...c,
      product_count: await countProductsForCategory(DASH, c.id)
    })));
    withCounts.sort((a, b) => b.product_count - a.product_count);

    if (withCounts.length > 1 && withCounts[0].product_count === withCounts[1].product_count) {
      throw new Error(`Ambiguous categories for search_term='${keyword}' (same product counts)`);
    }

    return { id: withCounts[0].id, name: withCounts[0].name, method: 'search_term_tiebreak_count' };
  }

  // 2) fallback name word-match
  //
  // Session-isolation fix (2026-09-01): a session keyword ("electrolyte
  // powder #2") has NO exact search_term match on its first run (step 1
  // above correctly returns 0 rows — nothing has that exact label yet), so
  // it used to fall through to this fuzzy word-match fallback. The
  // fallback's first-word ilike WOULD find the sibling base category
  // ("Electrolyte Powder", which does contain "electrolyte"), but the
  // all-words-must-match filter below then rejects it because the sibling's
  // name doesn't contain "#2" — throwing "No category matched all keyword
  // words", a DIFFERENT error string than "No category candidates found".
  // Every caller (human-bsr.js getDashCategoryId, migrate-p1-to-dash.js
  // getOrCreateCategory) only auto-creates a new category on the latter
  // message; the former is treated as an ambiguous/DB error and left
  // unresolved — silently dropping every product sync in human-bsr.js, and
  // hard-crashing migrate-p1-to-dash.js. A session keyword should NEVER
  // fuzzy-match a sibling session's category (that's the whole point of
  // session isolation), so skip the fuzzy fallback entirely for "#N"
  // keywords once the exact match above has already come up empty — treat
  // it as a genuinely new category straight away.
  if (/#\d+\s*$/.test(keyword.trim())) {
    throw new Error(`No category candidates found for '${keyword}'`);
  }

  const words = keyword.toLowerCase().split(' ').filter(Boolean);
  const { data: cats } = await DASH
    .from('categories')
    .select('id,name')
    .ilike('name', `%${words[0]}%`)
    .limit(50);

  if (!cats?.length) throw new Error(`No category candidates found for '${keyword}'`);

  const scored = cats
    .map(c => {
      const lower = c.name.toLowerCase();
      const score = words.filter(w => lower.includes(w)).length;
      return { ...c, score };
    })
    .filter(c => c.score >= words.length)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) throw new Error(`No category matched all keyword words for '${keyword}'`);

  const topScore = scored[0].score;
  const tied = scored.filter(c => c.score === topScore);

  if (tied.length === 1) {
    return { id: tied[0].id, name: tied[0].name, method: 'name_word_match' };
  }

  const withCounts = await Promise.all(tied.map(async c => ({
    ...c,
    product_count: await countProductsForCategory(DASH, c.id)
  })));
  withCounts.sort((a, b) => b.product_count - a.product_count);

  if (withCounts.length > 1 && withCounts[0].product_count === withCounts[1].product_count) {
    throw new Error(`Ambiguous category tie for '${keyword}' (name match + equal product_count)`);
  }

  return { id: withCounts[0].id, name: withCounts[0].name, method: 'name_word_tiebreak_count' };
}

module.exports = { resolveCategory };
