/**
 * utils/web-research-store.js — read side of dovive_web_research (migration
 * 014, P5b). Used by P7 (phase6-market-analysis.js) and P9
 * (phase8-formula-brief.js) to PREFER counted, source-labelled web claims.
 *
 * FAIL-OPEN: missing table, network error or no row → null. A consumer must
 * build exactly the prompt it built before when this returns null.
 */

'use strict';

const { webEvidenceText } = require('./web-research');

const TABLE = 'dovive_web_research';
const COLS = 'keyword, category_id, status, ledger, rollup, verification, model, generated_at';

/** `table` defaults to dovive_web_research; evidence-source passes 'v_formula_claims' for RnD. */
async function fetchWebResearch(client, { keyword = null, categoryId = null, table = TABLE } = {}) {
  try {
    if (!client || (!keyword && !categoryId)) return null;
    for (const [col, val] of [['keyword', keyword], ['category_id', categoryId]]) {
      if (!val) continue;
      const { data, error } = await client.from(table).select(COLS).eq(col, val).order('generated_at', { ascending: false }).limit(1);
      if (!error && data && data.length && data[0].rollup) return data[0];
    }
    return null;
  } catch {
    return null;
  }
}

/** { row, text } — text is '' when there is nothing counted to show. */
async function loadWebEvidence(client, opts, { log = console.log } = {}) {
  const row = await fetchWebResearch(client, opts);
  const text = webEvidenceText(row);
  if (text) {
    const l = row.ledger || {};
    log(`  P5b web evidence: ${l.fetched ?? '?'} pages read, ${l.duplicates_removed || 0} copies excluded (${row.status}, ${row.generated_at})`);
  }
  return { row, text };
}

module.exports = { TABLE, fetchWebResearch, loadWebEvidence };
