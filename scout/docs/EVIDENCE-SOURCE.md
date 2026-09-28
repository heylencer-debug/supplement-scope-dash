# Evidence source: where the formula phases read from

Status: written 2026-09-29 with the code it describes. Companion to
`docs/FORMULA-INPUTS.md` (§2 lists every read per phase, §3 the input
contract, §5 the RnD views). No pipeline script was run to build this.

## 1. The switch

| Env var | Values | Effect |
|---|---|---|
| `SCOUT_EVIDENCE_SOURCE` | `scout` (default, also when unset) \| `rnd` | Which backend every formula-phase evidence read uses. Any other value throws at start-up. |
| `RND_SUPABASE_URL` | RnD project URL | Needed for `rnd`, and for the advisory RnD coverage line in READ-FIRST. |
| `RND_SUPABASE_ANON_KEY` | RnD anon key | Same. RnD's RLS grants anon SELECT only. |

- **`scout`**: Scout's own tables through the `DASH` / `DOVIVE` clients the
  phase already builds. Every read is the exact chain the phase issued before
  this layer existed (same table, select string, filters, order, limit).
  `test/formula-reads.test.js` asserts that call for call per phase.
- **`rnd`**: the RnD evidence database's read-only views
  (FORMULA-INPUTS §5), through `utils/rnd-client.js`. The views are designed to
  return Scout's column names, so the same chain runs against the view.
- **`rnd` with no RnD client** (either RnD variable missing): the phase
  **throws at start-up** with
  `SCOUT_EVIDENCE_SOURCE=rnd but RnD client unavailable: <VAR> is not set — refusing to read formula evidence from Scout instead`.
  It never falls back to Scout. Env values are never printed; only variable names.

Code:

- `utils/rnd-client.js`: `createRndClient(env)` returns a client or `null`;
  `rndClientReason(env)` gives the one-line reason. The client exposes only
  `from(table).select(...)`. Insert, update, upsert, delete and rpc are not
  reachable through it.
- `utils/evidence-source.js`: `createEvidenceSource({ dash, dovive, backend?, env?, rndClient? })`,
  one function per contract item (§3 below).
- `utils/formula-reads.js`: each phase's reads, expressed on the evidence
  source. The phases run on load, so their reads live here, where the tests
  can watch them.

## 2. What stays on Scout in both backends

The layer covers **reads only**. Some reads also stay on Scout under `rnd`,
because they are not evidence or because RnD has no home for them yet:

| Read | Why it stays on Scout |
|---|---|
| Every write: `formula_briefs` update, delete and insert; `products.marketing_analysis`; `dovive_phase5_research`; `dovive_p5_sources`; `dovive_packaging_intelligence`; `dovive_web_research`; `categories.updated_at` | Writes stay on Scout until FORMULA-INPUTS gaps 12–13 exist. |
| Read-merge-write reads made right before a write: P5 `products.marketing_analysis` mirror; P7 `formula_briefs` patch; P8 per-row `marketing_analysis`; P9 preserve-keys read before its delete and insert; P10 `qa_comparison_note` | They are the write's base row, not evidence. |
| `briefWriteBase` / `productWriteBase` (P6, P10–P13) | Under `rnd`, the row a phase merges its new key into is read from Scout. Merging into the view's reassembled `ingredients` / `marketing_analysis` would overwrite Scout keys that RnD does not carry. Under `scout` these return the row already read and issue **no query**. |
| Raw reviews (`dovive_reviews`): P5 grounding, P6 slice, P7 and P9 fallback | RnD does not hold raw reviews. FORMULA-INPUTS gap 14 recommends keeping them in Scout. |
| Review-synthesis staleness guard (`dovive_reviews.scraped_at` via `reviewsClient`) | The views expose no `latest_scraped_at`. |
| Each phase's own-output checks: P5 already-researched (`dovive_phase5_research`); P5b pre-flight (`dovive_web_research`) | These are the write target's own state. |
| `resolveCategory` (`categories`) | The views are keyed by Scout's `category_id`, via RnD's `category_crosswalk`. |

**Known limitation of `rnd` today:** the brief deliverables (P7 market report,
P9–P12 outputs) are still **written to Scout** but **read from
`v_formula_brief_current`** as evidence under `rnd`. Until RnD stores formula
deliverables (gap 13), a later phase in the same run will not see what an
earlier phase just wrote. Skip checks behave the same way: they read the view.
Do not run the formula chain end-to-end on `rnd` until
`v_formula_brief_current` is fed by `formula_deliverables`.

## 3. Functions, shapes and the view each reads

Shared options for the table-shaped functions:

- `columns`: the select string, verbatim.
- `ops`: the phase's own chain as `[[method, ...args], …]`, applied in
  order after the scope filters. Only read filters are accepted:
  eq/neq/not/is/in/lt/lte/gt/gte/ilike/like/order/limit/range/maybeSingle/single.
- `selection`: a `loadSelection()` result. When it is active, the layer adds
  `.eq('selected', true).order('selection_rank')` right after the category
  filter.

These functions return the supabase-js result, `{ data, error, count? }`.

| Function | Returns | `scout` reads | `rnd` reads |
|---|---|---|---|
| `products(categoryId, columns, {selection, ops, selectOptions})` | product rows with `columns` | `products` | `v_formula_products` |
| `roster(categoryId, {columns, selection, ops})` | `{id, asin, brand, title, selected, selection_rank, cohort, packaging_type, main_image_url}` | `products` | `v_formula_roster` |
| `selection(categoryId)` | `{active, why, ranks: Map<asin, rank>}` via `utils/selected-competitors.js` | `products` | `v_formula_roster` |
| `labelFacts({categoryId, asins, columns, ops})` | `{asin, supplement_facts_raw, all_nutrients[{name, amount, dv_percent}], nutrients_count, serving_size, servings_per_container, other_ingredients, proprietary_blends}` | `products` | `v_formula_label_facts` |
| `labelPanels(asin, {categoryId})` | `[{supplement_facts, other_ingredients, health_claims, certifications, label_product_match}]`, ≤8 | `dovive_ocr`, ordered by image, plus the pre-013 legacy retry | `v_formula_label_facts` (one panel per row) plus `v_formula_listing` (claims, certifications); `label_product_match` is null |
| `listingClaims(asin, {keyword, categoryId})` | `{title, brand, description, bullet_points[], price, rating, review_count, bsr}` or null | `dovive_research` (asin plus exact session keyword) | `v_formula_roster` + `v_formula_listing`, mapped to that shape |
| `marketSignals(asin, {columns})` | `{price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d[{date, rank}]}` or null | `dovive_keepa` | `v_formula_keepa` |
| `reviewThemes({scope: 'category'\|'product', keyword, categoryId, asins, reviewsClient, log})` | category: the `dovive_review_synthesis` row or null; product: `{[asin]: row}` | `dovive_review_synthesis` | `v_formula_review_themes` |
| `rawReviews(asin\|asins, columns, {ops})` | review rows | `dovive_reviews` | `dovive_reviews` (Scout, see §2) |
| `webClaims({keyword, categoryId}, {log})` | `{row: {keyword, category_id, status, ledger, rollup, verification, model, generated_at} \| null, text}` | `dovive_web_research` | `v_formula_claims` |
| `creativeVerdicts({keyword, categoryId})` | `{keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at}` or null | `dovive_marketing_assets` | `v_formula_creative` |
| `deepResearch({keyword, asins, columns, ops})` | `dovive_phase5_research` rows (`asin, brand, bsr_rank, pool, benefits, formula_notes, key_strengths, key_weaknesses, competitor_angle, certifications, third_party_tested, full_research, researched_by`) | `dovive_phase5_research`: `in asin`, then `ilike keyword` | `v_formula_deep_research` |
| `p5Sources({keyword, asins, columns, ops})` | `{asin, keyword, source_url, source_type, raw_html_excerpt, extracted}` | `dovive_p5_sources`: `in asin`, then `eq keyword` | `v_formula_p5_sources` |
| `packaging({keyword, columns, ops})` | `{intelligence, generated_at, products_analyzed}` | `dovive_packaging_intelligence` | `v_formula_packaging` |
| `productIntel(categoryId, {asins, columns, ops})` | `{asin, marketing_analysis}`, with no phase reader yet | `products` | `v_formula_product_intel` |
| `briefCurrent(categoryId, {columns, ops})` | `{id, category_id, ingredients, created_at}` | `formula_briefs` | `v_formula_brief_current` |
| `marketIntel(categoryId)` | `{ai_market_analysis, generated_at, model, products_analyzed, review_coverage, source}` or null, via `utils/market-intel-store.js` | `formula_briefs` | `v_formula_brief_current` |
| `briefWriteBase(categoryId, row, {columns, ops})` | the Scout row to merge into | `row` itself (no query) | `formula_briefs` (Scout) |
| `productWriteBase(rows, {columns})` | `Map<id, {id, marketing_analysis}>` | the rows themselves (no query) | `products` by id (Scout) |
| `describe()` | `{item: 'scout:<table>' \| 'rnd:<view>'}` | | |

`v_formula_market_series` (per-point Keepa series) is not read yet; no
formula phase reads Keepa history beyond P5's `bsr_history_30d`, which comes
from `v_formula_keepa`.

The read stores take an optional `table` so the layer can point them at a
view: `review-synthesis-store`, `web-research-store`, `marketing-assets-store`,
`market-intel-store` and `selected-competitors.loadSelection`. Their
defaults, and so their behaviour for every other caller, are unchanged.

## 4. Per-phase status

All ten formula phases are **switched**. Each has a test in
`test/formula-reads.test.js`: "Pn reads: scout chain identical…" asserts the
recorded calls against the pre-layer chain, and "Pn phase file…" asserts the
phase uses the layer and that its writes and merge-reads stay on Scout.

| Phase | Script | Status | Reads now in the layer | Stays on Scout |
|---|---|---|---|---|
| P5 | `phase5-deep-research.js` | switched | selection; pools A/B, their fallbacks and the emerging top-up (`p5Established`, `p5BestBsr`, `p5Emerging`, `p5LowReviewEarners`); grounding (`p5Listing`, `p5LabelPanels` with the legacy OCR retry, `p5Reviews`, `p5Keepa`). Grounding now receives `categoryId`, which `rnd` uses to scope the views. | already-researched check; P5 writes; mirror merge-read |
| P5b | `phase5b-web-research.js` | switched | `loadCompetitors` (products, selection via `evidence.selection`), `loadBrandDomains` (`p5Sources`). Both take an optional `evidence`; `loadBrandDomains` is now exported. | `dovive_web_research` pre-flight and upsert |
| P6 | `phase6-product-intelligence.js` | switched | `p6Products`, selection, `p6RawReviews`, `p6ProductSyntheses` | write via `productWriteBase` merge |
| P7 | `phase6-market-analysis.js` | switched | `p7Products` (with `all_nutrients`), `p7CategorySynthesis`, `p7CategoryAsins` + `p7RawReviews`, `p7WebEvidence`, `p7MarketingAssets`, `EV.marketIntel` (skip check) | `formula_briefs` patch |
| P8 | `phase7-packaging-intelligence.js` | switched | `p8Products` (limit only below 999, as before) | per-row merge-read, update, packaging upsert |
| P9 | `phase8-formula-brief.js` | switched | `p9Top20` (selection-scoped), `p9NewWinners`, `p9AllProducts` (with `serving_size`), `p9ProductCount`, `EV.marketIntel`, `p9CategorySynthesis`, web and assets, `p9P5Research`, `p9P5Sources`, `p9PackagingSummary`, `p9RawReviews`, `p9BriefSkip` | preserve-keys read, delete and insert, categories bump |
| P10 | `phase9-formula-qa.js` | switched | `briefSkipRow`, `briefFormulaRow`, `EV.marketIntel`, `p10Competitors` (with `other_ingredients`) | both brief updates (on `briefFormulaWriteBase`), qa-note merge |
| P11 | `phase10-competitive-benchmarking.js` | switched | `briefSkipRow`, `briefFormulaRow`, `p11Products`, `p11P5Research`, `p11P5Sources` | update on `briefFormulaWriteBase` |
| P12 | `phase11-fda-compliance.js` | switched | `briefSkipRow`, `briefFormulaRow` | update on `briefFormulaWriteBase`; NIH fetches |
| P13 | `phase12-final-signoff.js` | switched | `p13Brief` | update on `p13BriefWriteBase` |

The fixes from 2026-09-29 are routed through the layer and are otherwise
unchanged: P7's report read from `formula_briefs.ingredients.market_intelligence`
by `market-intel-store`, P7's `all_nutrients`, P9's `serving_size`, and P10's
`products.other_ingredients`.

Under `scout`, behaviour differs from before in two small ways. P7 now uses one
`DOVIVE` client instead of building two from the same env. A missing Scout
brief row at write time in P10–P13 now throws a named error instead of a
TypeError on `null.ingredients`. Every query is identical.

## 5. READ-FIRST: advisory RnD coverage

`inventory.js` (`buildInventory({ …, rnd, rndReason })`, also used by
`run-pipeline.js`) adds a line under the inventory in the plan output when an
RnD client is passed. The line reports how many of the category's ASINs exist
in RnD (`product_identifiers`, `id_type = 'asin'`) and how many
`research_runs` each has. Before P1 has landed any ASINs, it uses the planned
candidates. Without the client, the line says why the check was skipped. A
failed read or a timeout (20 s) is reported in the line and never fails the
inventory. `plan-scope.js` never reads it, and a test checks that the plan is
identical with and without it.
