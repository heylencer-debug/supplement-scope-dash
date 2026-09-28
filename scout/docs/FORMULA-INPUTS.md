# Formula-phase input contract and RnD mapping

Status: documentation only, written 2026-09-29 from a read of `main`. No
pipeline script was run. Column names below were confirmed read-only against
Scout's Supabase through the PostgREST OpenAPI listing and 1–3 sample rows
per table (keys only, no values printed), and against the RnD evidence
database through its read-only MCP (`list_relations`, `describe_relation`,
`sql_select` aggregates).

Every `file:line` is relative to `scout/` unless it starts with `RnD-Database/`.

---

## 1. Overview: two halves of the pipeline

`run-pipeline.js` defines thirteen phases in its `PHASES` array
(`run-pipeline.js:543-633`). They split cleanly into a **capture half** that
pays for outside data and a **formula half** that only reads what capture
stored and asks models to reason over it.

| Phase | Name (from `PHASES`) | Script(s) actually run | Half |
|---|---|---|---|
| P1 | Amazon Scrape | `human-bsr.js`, then `migrate-p1-to-dash.js` (`run-pipeline.js:547,549`) | capture |
| P2 | Keepa Enrichment | `keepa-phase2.js`, then `migrate-keepa-to-dash.js` (`:555,557`) | capture |
| P3 | Reviews | `playwright-reviews.js`, `migrate-reviews-to-dash.js`, `phase3b-review-synthesis.js` (`:566,568,573`) | capture (+ P3b AI synthesis) |
| P4 | OCR / Formula Extraction | `phase4-text-extract.js`, `ocr-phase4.js`, `migrate-ocr-to-dash.js` (`:579,581,583`); hook `phase7b-marketing-assets.js` after P4 (`:848,902`) | capture (+ P7b AI vision) |
| P5 | Deep Research | `phase5-deep-research.js` (`:588`); hook `phase5b-web-research.js` after P5 (`:852,908`) | boundary |
| P6 | Product Intelligence | `phase6-product-intelligence.js` (`:592`) | formula |
| P7 | Market Intelligence | `phase6-market-analysis.js` (`:596`) | formula |
| P8 | Packaging Intelligence | `phase7-packaging-intelligence.js` (`:600`) | formula (rule-based, no model) |
| P9 | Formula Brief | `phase8-formula-brief.js` (`:604`) | formula |
| P10 | Formula QA | `phase9-formula-qa.js`, then `phase6-market-analysis.js --force`, then `seed-category-analysis.js` (`:612,615,617`) | formula |
| P11 | Competitive Formula Benchmarking | `phase10-competitive-benchmarking.js` (`:622`) | formula |
| P12 | FDA Compliance | `phase11-fda-compliance.js` (`:626`) | formula |
| P13 | Final Sign-off | `phase12-final-signoff.js` (`:630`) | formula |

The script filenames are one number behind the phase numbers (P9 runs
`phase8-…`, P10 runs `phase9-…`). This document always uses the **phase**
number and names the script.

Before any phase, READ-FIRST (`inventory.js` + `plan-scope.js`) reads what
the keyword family already holds and decides per phase: reuse, sync-only,
top-up or run (`run-pipeline.js:7-11,682-721`). `inventory.js` is read-only
and touches `categories`, `dovive_research`, `dovive_reviews`,
`dovive_phase5_research`, `dovive_packaging_intelligence`, `products`,
`dovive_keepa`, `dovive_ocr`, `formula_briefs`, `ai_usage_log`
(`inventory.js:94-207`). The completion bars live in
`utils/verifier-bars.js` and are also used as mid-run gates before P5 and
P9 (`run-pipeline.js:656-680`, `utils/verifier-bars.js:20-28,240-281`).
The formula phases' only verifier checks are "the `formula_briefs`
ingredients key exists and is real model text" (`utils/verifier-bars.js:147-150,276-280`).

**Two clients, one database.** Every script builds `DASH` from
`DASH_URL || SUPABASE_URL` and `DOVIVE` from `SUPABASE_URL`
(e.g. `run-pipeline.js:33-37`, `phase8-formula-brief.js:35-39`).
`scout/.env` defines only `SUPABASE_URL`/`SUPABASE_KEY` (no `DASH_*`), so
**both names point at the same Supabase project today**. The labels still
matter: `DASH` is used for the dashboard-facing tables (`products`,
`categories`, `formula_briefs`, `dovive_review_synthesis`,
`dovive_web_research`, `dovive_marketing_assets`), `DOVIVE` for the raw
capture tables (`dovive_*`). The tables below say which client each read
uses.

**How a phase finds its data.** Every formula phase resolves the category
once with `resolveCategory(DASH, KEYWORD)` (`utils/category-resolver.js:16-19`
by `categories.search_term`, fallback `:78-81` by `ilike name`), then filters
`products` by `category_id`. Raw `dovive_*` rows are filtered by the full
session label `keyword` (exact `ilike`, session-isolation fix of 2026-09-01)
or by `asin`. The 40-competitor selection is read through
`utils/selected-competitors.js:22-40` (`products.selected = true`, ordered by
`selection_rank`, limit 500); when it is empty or the columns are missing the
loader returns `{active:false}` and callers fall back to "top N by BSR"
(`:5-10,58-73`).

No formula phase uses a raw `rest/v1/` URL. The only raw REST calls in the
repo are in capture scripts (`keepa-phase2.js:76,87,227,288,335,410`,
`human-bsr.js:104,130`, `cloud-worker.js:85`).

---

## 2. Per-phase reads and writes

Row counts are typical per category, measured on the briefed categories in
Scout's DB (28 `formula_briefs` rows, 11 with a final sign-off): `products`
per category ranges 17–165 (median about 130); the selection is active
(40 rows with `selected = true`) on only 3 of those categories; P5 keeps
about 8–11 rows per keyword; `dovive_reviews` holds 1,000–9,000 rows per
keyword (with heavy duplication, see `utils/review-synthesis.js:21-35`).

### P5 — Deep Research (`phase5-deep-research.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `products` | `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales, rating_value, rating_count, supplement_facts_raw, other_ingredients, claims_on_label, feature_bullets_text, marketing_analysis, review_analysis, cohort` | `category_id`; selection-scoped when active. Pool A: `cohort='established'`, BSR asc, limit `P5_TOP_COUNT` (5), fallback best BSR. Pool B: `cohort='emerging'`, limit `P5_NEW_COUNT` (3); when the selection is short, emerging rows **outside** the selection (limit 3+40); last fallback `rating_count<500 AND monthly_revenue>0` | 8 | `:862-864, 866-935, 909-915` |
| DOVIVE | `dovive_research` | `title, brand, description, bullet_points, price, rating, review_count, bsr` | `asin`, `ilike keyword` = session, 1 row | 1/ASIN | `:192-194` |
| DOVIVE | `dovive_ocr` | `supplement_facts, other_ingredients, health_claims, certifications, label_product_match` (legacy retry without the last) | `asin`, order `image_index`, limit 8; rows with `label_product_match.verdict='mismatch'` dropped | ≤8/ASIN | `:195-196, 212-219` |
| DOVIVE | `dovive_reviews` | `rating, title, body, verified_purchase, helpful_votes` | `asin`, top 40 by `helpful_votes` | 40/ASIN | `:198-199` |
| DOVIVE | `dovive_keepa` | `price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d` (`[{date, rank}]`) | `asin`, 1 row | 1/ASIN | `:201-202` |
| DOVIVE | `dovive_phase5_research` | `asin, pool, researched_by` | `ilike keyword` (skip-already-done) | ~8 | `:953-955` |
| DASH | `products` | `marketing_analysis` | `asin` + `category_id` | 1/ASIN | `:1030-1034` |

Plus live off-Amazon research per ASIN (Perplexity search, or legacy
DuckDuckGo + Playwright) — not a DB read.

**Writes:** `dovive_phase5_research` upsert on `(asin, keyword)` with
`asin, keyword, brand, bsr_rank, pool, benefits, features, formula_notes,
certifications, awards, third_party_tested, transparency_flag,
reddit_sentiment, reddit_notes, reddit_sources, external_reviews,
healthline_covered, labdoor_score, key_weaknesses, key_strengths,
competitor_angle, full_research, researched_at, researched_by,
data_grounding, phase` (`:807-842, 979-1003`; `data_grounding` is not a live
column and is dropped by the save-retry loop). `dovive_p5_sources` insert:
`asin, keyword, source_url, source_type, raw_html_excerpt, extracted`
(`:686-693`), where `extracted = {perplexity_findings, citations[],
signals:{retail_price, certifications[], dosage_mg_mentioned,
excerpt_preview}}` (`:541-545, 664-674`). `products.marketing_analysis.p5_research`
= `{pool, competitor_angle, key_strengths, key_weaknesses,
threat_assessment, dovive_angle, data_grounding, researched_at}`
(`:1037-1050`).

### P5b — Web research (`phase5b-web-research.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `dovive_web_research` | `keyword, status, generated_at, ledger, sources, search_runs, model` | `keyword` (previous run, reuse fresh searches) | 0–1 | `:120-127` |
| DASH | `products` | `asin, brand, title, bsr_current, feature_bullets_text, description_text` | selection (`selected=true`, `selection_rank`, limit 200) else top `max(P5B_TOP_BRANDS,40)` by BSR | 40 | `:139, 145-157` |
| DOVIVE | `dovive_p5_sources` | `asin, source_url, source_type` | `keyword`, `source_type='brand_site'`, limit 200 | ≤8 | `:164-165` |

Plus Perplexity search and page fetches. **Writes:** `dovive_web_research`
upsert on `keyword`: `keyword, category_id, status, model, prompt_version,
ledger, sources, search_runs, rollup, verification, cost_usd, generated_at`
(`:384-411`).

### P6 — Product Intelligence (`phase6-product-intelligence.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `products` | `id, asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg, price, monthly_revenue, monthly_sales, rating_value, rating_count, serving_size, servings_per_container, supplement_facts_raw, feature_bullets_text, claims_on_label, marketing_analysis` | `category_id`, BSR asc, limit `TOP_N` (999); **processes** only the selection when active, but market metrics (median price) use every row | whole category; processes 40 | `:90, 543-548, 556-567, 571-573` |
| DOVIVE | `dovive_reviews` | `asin, rating, title, body, helpful_votes` | `asin IN batch`, helpful desc, limit 20×batch; keeps 5 pos (≥4★) + 5 crit (≤2★) per ASIN | 10/ASIN | `:53-66` |
| DASH | `dovive_review_synthesis` | `asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status` | `scope='product'`, `keyword`, `asin IN batch`; staleness check against `dovive_reviews.scraped_at` (DOVIVE) | 1/ASIN | `:69`; `utils/review-synthesis-store.js:24-31, 66-91` |

**Writes:** `products.marketing_analysis.product_intelligence` (merge into
existing jsonb, by `id`) (`:674-679`). Shape = the model JSON (`:449-471`)
plus computed metrics: `primary_active_ingredient, primary_active_amount_mg,
primary_active_form, ashwagandha_amount_mg, ashwagandha_extract_type,
withanolide_percentage, is_sugar_free, is_vegan, is_gluten_free, is_non_gmo,
is_cgmp, is_third_party_tested, certifications[], bonus_ingredients[],
artificial_colors, proprietary_blend, formula_quality_score (1-10),
competitor_threat_level, key_strengths[], key_weaknesses[],
form_factor_notes, market_opportunity_gap, price_per_serving,
price_per_mg_ashwagandha, velocity_direction, velocity_score,
bsr_trend_label, bsr_vs_30d_pct, bsr_vs_90d_pct, price_positioning_tier,
price_positioning_label, category_median_price, revenue_per_review,
revenue_per_review_label, analysis_method, analyzed_at` (`:176-196, 580-598, 625-639`).

### P7 — Market Intelligence (`phase6-market-analysis.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `id, created_at` | `category_id` **and `brief_type='market_analysis'`** (skip check) | 0 | `:522-523` |
| DASH | `products` | `asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg, price, monthly_revenue, monthly_sales, rating_value, rating_count, supplement_facts_raw, feature_bullets_text, claims_on_label, review_analysis, marketing_analysis, serving_size, servings_per_container` | `category_id`, BSR asc, **not** selection-scoped | whole category | `:532-537` |
| DASH | `dovive_review_synthesis` | category row: `keyword, category_id, scope, asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status` | `scope='category'`, `keyword` (fallback `category_id`), newest | 1 | `:553-559`; `utils/review-synthesis-store.js:47-63` |
| DOVIVE | `dovive_reviews` | `asin, rating, title, body` | only when no synthesis: `asin IN` first 400 category ASINs, `body` not null, limit 3000; random 80 pos + 80 crit | ≤160 | `:127-139` |
| DASH | `products` | `asin` | `category_id`, limit 500 (for the fallback above) | — | `:128` |
| DASH | `dovive_web_research` | `keyword, category_id, status, ledger, rollup, verification, model, generated_at` | `keyword` then `category_id`, newest with non-empty `rollup` | 1 | `:570`; `utils/web-research-store.js:15-29` |
| DASH | `dovive_marketing_assets` | `keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at` | `scope='category'`, `keyword` then `category_id`, needs `rollup.products_analyzed` | 1 | `:572`; `utils/marketing-assets-store.js:17-33` |
| DASH | `formula_briefs` | `id, ingredients` | `category_id` (for the patch) | 1 | `:474-477` |

Fields read out of the rows: `marketing_analysis.product_intelligence.{bonus_ingredients,
ashwagandha_extract_type, certifications, formula_quality_score,
competitor_threat_level, velocity_direction, velocity_score, bsr_trend_label,
price_positioning_tier, market_opportunity_gap, ashwagandha_amount_mg}` and
`review_analysis` stringified (`:156, 212-226, 243-264, 268-274`).

**Writes:** `formula_briefs.ingredients.market_intelligence` =
`{ai_market_analysis, generated_at, grok_model, products_analyzed,
review_coverage}` (patch if the row exists, else insert a row with only
that key) (`:464-496`). Also a Windows vault file (no-op on Cloud Run).

### P8 — Packaging Intelligence (`phase7-packaging-intelligence.js`)

Rule-based (keyword matching), no model call.

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `products` | `id, asin, title, brand, bsr_current, price, main_image_url, feature_bullets_text, supplement_facts_raw` | `category_id`, BSR asc, limit `TOP_N` (999) — **not** selection-scoped | whole category | `:26-28, 247-251` |
| DASH | `products` | `marketing_analysis` | `id` (read-merge-write per row) | 1/row | `:267` |

**Writes:** `products.marketing_analysis.packaging_intelligence` =
`{primary_benefit_claim, benefit_claims[], badge_claims[],
inferred_color_palette[], claim_density, messaging_score, headline_hook,
main_image_url, analyzed_at}` plus `marketing_analysis_updated_at,
updated_at` (`:128-138, 268-272`). `dovive_packaging_intelligence` (DOVIVE)
upsert on `keyword`: `keyword, intelligence, generated_at,
products_analyzed`, where `intelligence = {keyword, products_analyzed,
generated_at, benefit_claim_frequency{label:{count,pct}},
badge_claim_frequency{…}, color_palette_frequency{…}, saturated_claims[],
market_gaps{benefit_gaps[], badge_gaps[]}, top_packagers[],
dovive_packaging_strategy{recommended_primary_claim, claims_to_avoid,
claims_to_own, badges_to_feature, color_direction, color_rationale,
packaging_headline_formula, key_insight}}` (`:217-237, 289-292`).

### P9 — Formula Brief (`phase8-formula-brief.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `id, created_at, ingredients` | `category_id` (skip if `ai_generated_brief` exists) | 1 | `:1935-1941` |
| DASH | `market_intelligence` | `ai_market_analysis, aggregated_data, generated_at` | `category_id`, newest | **table does not exist** | `:520-525` |
| DASH | `formula_briefs` | `ingredients, generated_at, brief_type` | `category_id`, `brief_type='market_analysis'` | **columns do not exist** | `:530-536` |
| DASH | `products` "top20" | `asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg, price, monthly_revenue, monthly_sales, rating_value, rating_count, packaging_type, serving_size, servings_per_container, claims_on_label, supplement_facts_raw, all_nutrients, other_ingredients, proprietary_blends, feature_bullets_text, marketing_analysis, cohort` | selection-scoped when active, `bsr_current` not null, BSR asc, **limit 50**; first 5 = "top performers" | 40–50 | `:555-568` |
| DASH | `products` "new winners" | same minus `bsr_*_avg, rating_value` | `bsr_current<30000`, `rating_count<500`, revenue desc, limit 15 — **not** selection-scoped | ≤15 | `:573-584` |
| DASH | `products` "all" | `price, packaging_type, all_nutrients, marketing_analysis, review_analysis` | `category_id`, `marketing_analysis` not null | whole category | `:588-591` |
| DASH | `products` | count | `category_id` | — | `:600-602` |
| DASH | `dovive_review_synthesis` | category row (as P7) | `keyword` / `category_id`; staleness via DOVIVE `dovive_reviews` | 1 | `:687` |
| DASH | `dovive_web_research` | as P7 | as P7 | 1 | `:695` |
| DASH | `dovive_marketing_assets` | as P7 | as P7 | 1 | `:696` |
| DOVIVE | `dovive_phase5_research` | `asin, brand, bsr_rank, pool, benefits, formula_notes, key_strengths, key_weaknesses, competitor_angle, certifications, third_party_tested, full_research, researched_by` | `ilike keyword`, `bsr_rank` asc, limit 20 | ~8 | `:362-366` |
| DOVIVE | `dovive_p5_sources` | `asin, source_url, raw_html_excerpt` | `asin IN` P5 ASINs (no keyword filter) | ~8 | `:785-787` |
| DOVIVE | `dovive_packaging_intelligence` | `intelligence, generated_at, products_analyzed` | `keyword` | 1 | `:396-399` |
| DOVIVE | `dovive_reviews` | `asin, rating, title, body` | only when no synthesis: `asin IN top20`, ≥4★ limit 100 and ≤2★ limit 100, random 60 each | ≤120 | `:822-827` |

Fields read out of the rows: `marketing_analysis.product_intelligence.*`
(bonus_ingredients, ashwagandha_*, withanolide_percentage, certifications,
is_sugar_free, is_vegan, is_third_party_tested, formula_quality_score,
competitor_threat_level, bsr_trend_label, price_positioning_label,
market_opportunity_gap, key_strengths, key_weaknesses) (`:639-646, 893-913`);
`marketing_analysis.packaging_intelligence.benefit_claims` (`:649-652`);
`review_analysis.pain_points[].{issue|theme|pain_point, frequency}` and
`review_analysis.{praised_ingredients|top_ingredients|loved_ingredients,
criticized_ingredients|disliked_ingredients}` (`:655-660, 750-763`);
`all_nutrients[].{name|ingredient, amount|quantity}` for dosage ranges
(`:716-735`).

**Writes:** deletes and re-inserts the `formula_briefs` row for the category
(`:1776-1800`) with `category_id, positioning, target_customer, form_type,
form_rationale, flavor_profile, flavor_importance,
flavor_development_needed, servings_per_container, target_price,
packaging_type, market_summary, consumer_pain_points, key_differentiators,
opportunity_insights, risk_factors, created_at, updated_at` and
`ingredients = {ai_generated_brief, ai_generated_brief_grok,
ai_generated_brief_claude, formula_brief_model_grok,
formula_brief_model_claude, grok_chars, claude_chars, generated_at, keyword,
market_intelligence, competitive_benchmarking, fda_compliance,
final_signoff (the last four preserved from the old row), data_sources{…}}`
(`:1800-1900`). Bumps `categories.updated_at` (`:1903`).

### P10 — Formula QA (`phase9-formula-qa.js`) + post-QA steps

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `ingredients` | `category_id` (skip if `qa_report`) | 1 | `:1163-1165` |
| DASH | `formula_briefs` | `id, ingredients` (`ai_generated_brief_grok`, `ai_generated_brief`, `ai_generated_brief_claude`) | `category_id` | 1 | `:1173-1177` |
| DASH | `market_intelligence` / `formula_briefs(brief_type)` | as P9 | as P9 | **both miss** | `:219-238, 1187` |
| DASH | `products` | `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales, rating_value, rating_count, supplement_facts_raw, marketing_analysis` | `category_id`, BSR not null, BSR asc, limit 40 — **not** selection-scoped | 40 | `:1192-1198` |

Fields read out: `marketing_analysis.product_intelligence.*` as P9 plus
`revenue_per_review` (`:244-260`); `supplement_facts_raw` (`:260, 771, 1039`);
`title` and `marketing_analysis.other_ingredients` (a key nothing writes) for
flavour detection (`:1366-1377`).

**Writes:** `formula_briefs.ingredients` += `qa_report, qa_verdict,
adjusted_formula, final_formula_brief, formula_variants{proven, edge,
recommended}, comparative_verdict, adjustments_table, formula_validation,
qa_generated_at` (`:1250-1320`), then += `comprehensive_comparison,
flavor_qa, flavor_recommendations, flavor_summary, competitor_notes_json,
call2_raw_output, qa_pipeline_metadata, qa_run_audit` (`:1513-1550`).
`products.marketing_analysis.qa_comparison_note` per ASIN + category
(`:1569-1575`). Then P10 re-runs P7 with `--force` (`run-pipeline.js:615`)
and runs `seed-category-analysis.js` (`:617`), which only defines a
hard-coded demo record and **writes nothing** (`seed-category-analysis.js:20-176`).

### P11 — Competitive Formula Benchmarking (`phase10-competitive-benchmarking.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `ingredients.competitive_benchmarking` (skip check), then `id, ingredients.{adjusted_formula | final_formula_brief | ai_generated_brief}` | `category_id` | 1 | `:540-560` |
| DASH | `products` | `asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales, rating_value, rating_count, serving_size, servings_per_container, supplement_facts_raw, all_nutrients, nutrients_count, marketing_analysis` | `category_id`, BSR not null, BSR asc, limit 50 — **not** selection-scoped; keeps rows with `nutrients_count>0 OR supplement_facts_raw` | ≤50 | `:571-579` |
| DOVIVE | `dovive_phase5_research` | `asin, competitor_angle, key_strengths, key_weaknesses, certifications` | `asin IN`, `ilike keyword` | ~8 | `:259-262` |
| DOVIVE | `dovive_p5_sources` | `asin, source_url, source_type, extracted.{retail_price, certifications}` | `asin IN` (no keyword filter) | ~8 | `:263-265, 282-285` |

**Writes:** `formula_briefs.ingredients.competitive_benchmarking` =
`{sonnet_draft, opus_validation, formula_score, validation_result,
competitors_with_formula, competitors_without_formula, generated_at,
models_used{draft, validation}}` (`:636-655`).

### P12 — FDA Compliance (`phase11-fda-compliance.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `ingredients.fda_compliance` (skip), then `id, ingredients.{adjusted_formula | final_formula_brief | ai_generated_brief, qa_report, formula_validation.valid}` | `category_id` | 1 | `:608-636` |

Plus live NIH ODS fact sheets from a hard-coded ingredient→URL map
(`:48-…, 647`). **Writes:** `formula_briefs.ingredients.fda_compliance` =
`{opus_analysis, sonnet_validation, compliance_score, compliance_status,
validation_result, nih_coverage{fetched, no_page, failed, total},
ingredients_reviewed[], generated_at, models_used, data_sources{ingredient:url}}`
(`:694-717`).

### P13 — Final Sign-off (`phase12-final-signoff.js`)

| Client | Table | Columns used | Filter / scope | Rows | Cite |
|---|---|---|---|---|---|
| DASH | `formula_briefs` | `id, ingredients.{final_signoff, fda_compliance.{opus_analysis, sonnet_validation}, formula_variants.{proven, edge, recommended}, final_formula_brief, ai_generated_brief, adjusted_formula, qa_report, competitive_benchmarking.{sonnet_draft, opus_validation}}` | `category_id` | 1 | `:168-181, 227-229, 307-324` |

**Writes:** `formula_briefs.ingredients.final_signoff` = `{opus_review,
verdict, corrections_applied, generated_at, model, per_formula?,
comparative_note?}` (`:357-371`).

### Reads that silently return nothing today (found while mapping)

These are real gaps in what the formula chain actually receives, and any
replacement data source has to decide whether to reproduce or fix them.
Items 1, 2, 3 and 5 were fixed on 2026-09-29; their text below describes the
code before the fix.

1. **Fixed 2026-09-29 (`daef995`).** **P7's report never reaches P9 or P10.** P7 writes
   `formula_briefs.ingredients.market_intelligence` (`phase6-market-analysis.js:479-481`),
   but P9 and P10 look for it in a `market_intelligence` table and in
   `formula_briefs.brief_type='market_analysis'` / `ingredients.ai_generated_brief`
   (`phase8-formula-brief.js:520-545`, `phase9-formula-qa.js:219-238`).
   Scout's DB has no `market_intelligence` table and `formula_briefs` has no
   `brief_type` or `generated_at` column (OpenAPI listing, 2026-09-29), so
   both queries error and return null: P9's prompt gets
   `market_intelligence: {has_data:false}` and P10 runs "without market
   context". The same missing `brief_type` means P7's skip check never
   skips (`phase6-market-analysis.js:522-523`).
2. **Fixed 2026-09-29 (`871ed0a`).** **P7's dosage table is always empty.** `buildDosageTable` reads
   `p.all_nutrients` (`phase6-market-analysis.js:141-149`), which P7 does not
   select (`:532-537`).
3. **Fixed 2026-09-29 (`c92cbc8`).** **P9's serving-size distribution is always empty.** The loop reads
   `p.serving_size` from the "all products" rows (`phase8-formula-brief.js:705-711`),
   whose select has no `serving_size` (`:588-591`).
4. **P9's review-analysis ingredient signals are empty.** It reads
   `review_analysis.praised_ingredients / criticized_ingredients` and
   `pain_points[].issue` (`:655-660, 750-763`); the live `review_analysis`
   shape is `{pain_points[], top_reviews{positive,neutral,critical},
   analysis_metadata, sentiment_distribution}` with `pain_points` empty in
   the sampled rows. P9 overrides pain points from the P3b synthesis when it
   exists (`:687-692`), so this only bites without P3b.
5. **Fixed 2026-09-29 (`51c6bbd`).** **P10 flavour scan reads `marketing_analysis.other_ingredients`**, a key
   no phase writes (`phase9-formula-qa.js:782, 1370`). The real column is
   `products.other_ingredients`.
6. **None of the migration-013 label columns are read by a formula phase.**
   `label_facts`, `label_sources`, `label_conflicts`, `claims_all_sources`,
   `certifications_verified` (all populated: 79/80 rows on "Electrolyte
   Powder #6"), `dovive_ocr.facts_v2`, `selection_reason` and
   `marketing_asset_analysis` are written by capture but consumed only by
   the dashboard and P5's mismatch filter. Every formula phase still reads
   the legacy `supplement_facts_raw` text and `all_nutrients`.
7. **P8's category summary is category-agnostic in two places:**
   `intelligence.keyword` is hard-coded `'ashwagandha gummies'` and
   `packaging_headline_formula` says "Premium KSM-66"
   (`phase7-packaging-intelligence.js:211, 218`). P6's schema and P7/P9/P10
   prompts also carry ashwagandha-specific keys (`ashwagandha_amount_mg`,
   `ashwagandha_extract_type`, `withanolide_percentage`) that are null on
   every other category.
8. **Scope is inconsistent across phases.** P5, P5b, P6 and P9's top-20 use
   the 40-competitor selection; P7, P8, P9's new-winners and "all" sets,
   P10 (top 40 by BSR) and P11 (top 50 by BSR) do not.

---

## 3. Formula input contract (per category)

The minimal set the formula phases need, with the exact shape Scout reads.
"Scope" says which subset of the category each consumer needs.

### 3.1 Product roster

| Field | Type / shape | Consumers |
|---|---|---|
| `category_id` | uuid (from `categories.search_term = keyword`) | all |
| `id` | uuid row id (P6/P8 write by it) | P6, P8 |
| `asin, brand, title` | text | all |
| `selected, selection_rank` | bool, int ≥1 | P5, P5b, P6, P9, verifier |
| `cohort` | `'established' | 'emerging' | 'context'` | P5 pools, P9 evidence pools |
| `packaging_type` | text (substring-matched: gummy/capsule/tablet/powder/liquid) | P9 |
| `main_image_url` | text | P8 |
| Own products | **not read by any formula phase today** | — |

Scope: whole category (P7, P8, P9-all), selection or top 50 by BSR (P9), top
40/50 by BSR (P10/P11), 8 research picks (P5).

### 3.2 Label facts

| Field | Shape Scout reads | Consumers |
|---|---|---|
| `supplement_facts_raw` | text, one `Name: amount` per line (e.g. `"Creatine: 5g\nVitamin B12: ?"`) | P6, P7, P8, P9, P10, P11 |
| `all_nutrients` | jsonb `[{name, amount (string), dv_percent}]` (code also tolerates `ingredient`/`quantity`) | P9 (dosage ranges, prompts), P11 |
| `nutrients_count` | int (P4 gate `> 0`; P11 `withFormula`) | P11, verifier |
| `serving_size` | text | P6, P7, P9, P11 |
| `servings_per_container` | int | P6 (price/serving), P7, P9, P11 |
| `other_ingredients` | text | P5, P9 |
| `proprietary_blends` | jsonb array | P9 |
| `dovive_ocr.{supplement_facts, other_ingredients, health_claims, certifications, label_product_match.verdict}` | per image, `supplement_facts` = `[{name, amount, dv_percent}]` | P5 only |

Available but unread (the target shape a new source should prefer):
`products.label_facts` / `dovive_ocr.facts_v2` =
`{schema_version, rows:[{name, nutrient, amount_raw, amount_mg, amount_kind,
unit_raw, basis, unit_basis, per_serving_mg, per_unit_mg, elemental_mg,
elemental_basis, elemental_factor, in_blend_mg, form, compound, compounds,
extract, qualifier, range, variants, alt_amounts, dv_percent, conversion,
status, source{asin, row_id, excerpt, excerpt_source, image_url,
image_index}}], serving:{raw, form, units, discrete, inferred,
per_day_units, serving_mass_g, servings_per_container, range,
implausible_serving, serving_alternatives}, warnings[]}`.

### 3.3 Reviews and review synthesis

| Field | Shape | Consumers |
|---|---|---|
| `dovive_review_synthesis` category row | `ledger{rows_collected, duplicate_rows_removed, reviews_collected, reviews_analyzed, reviews_with_text, rating_only_reviews, cap_applied, products_with_reviews, distinct_asins[], product_families, reviews_shared_across_asins, date_range, reviews_by_year, verified_share, vine_share, star_distribution, average_rating}`, `themes[{label, domain, polarity ('complaint'|'unmet_need'|'praise'), review_ids[], review_count, share_of_analyzed, distinct_products{count, asin_count, asins[]}, scope, verified_count, verified_share, date_range, excerpts[{review_id, asin, date, rating, verified, text}], counter_evidence{review_ids, count, products, paired_theme_labels, excerpt}, merged_labels[]}]`, `domain_breakdown[{domain, reviews_mentioning, negative{count, products}, positive{count, products}, unclear}]`, `status, model, prompt_version, generated_at` (`utils/review-synthesis.js:412-470, 899-945`) | P7, P9 |
| `dovive_review_synthesis` product rows | same keys, per ASIN (+ `ledger.per_product`) | P6 |
| `dovive_reviews.scraped_at` (latest per keyword) | timestamptz — staleness guard | P6, P7, P9 |
| Raw review fallback | `dovive_reviews.{asin, rating, title, body, helpful_votes, verified_purchase}` | P5 (40/ASIN), P6/P7/P9 when no synthesis |
| `products.review_analysis` | jsonb (see §2 gap 4) | P7 (stringified), P9 |

### 3.4 Market signals (Keepa-derived)

| Field | Shape | Consumers |
|---|---|---|
| `bsr_current, bsr_30_days_avg, bsr_90_days_avg` | int | P5–P11 (ordering, velocity) |
| `price` | numeric | P6–P11 |
| `monthly_revenue, monthly_sales` | numeric / int | P5, P6, P7, P9, P10, P11 |
| `rating_value, rating_count` | numeric / int | P5–P11 |
| `dovive_keepa.{price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d[{date, rank}]}` | per ASIN | P5 only |

Captured but unread by the formula phases: `dovive_keepa.price_history_30d
[{date, price_usd}]`, `bsr_history_90d`, `monthly_sold_history[]`,
`review_count_history_90d`, `price_avg_90d`, `coupon`, `coupon_active`,
`lightning_deal_active`, `sns_discount_pct`; `products.promo_flag`,
`selection_reason.inputs`.

### 3.5 Listing text, claims, certifications

| Field | Shape | Consumers |
|---|---|---|
| `feature_bullets_text` | text | P5, P5b, P6, P7, P8, P9 |
| `description_text` | text | P5b (syndication check) |
| `claims_on_label` | text[] | P5, P6, P7, P9 |
| `dovive_research.{title, brand, description, bullet_points, price, rating, review_count, bsr}` | per ASIN + session keyword | P5 |
| Unread: `claims_all_sources [{claim, sources[]}]`, `certifications_verified{results[{claim, status, reason, registry, match, scope, evidence_url, checked_at}], checked_at, lookups_enabled, schema_version}`, `label_sources`, `label_conflicts` | | — |

### 3.6 Marketing-asset verdicts (P7b)

`dovive_marketing_assets` category row read by P7 and P9 through
`formatMarketingAssetsForPrompt` (`utils/marketing-assets.js:961-995`):
`ledger{products, products_analyzed, images_analyzed,
a_plus_images_analyzed, products_failed, products_not_attempted,
products_skipped_failed, videos_available, claims_dropped_unevidenced}`,
`rollup{products_analyzed, recurring_messages[], main_promises[],
audience_segments[{segment, products, asins, example_cues}], use_cases[],
comparison_table_claims[{…, vs_who}], packaging{formats, colours,
certifications_shown}}` (cluster items `{key, seed, label, asins, kinds,
seen_on, products, variants}`), `experienced_vs_claimed{available,
items[{claim, benefit_group, variants, products_claiming, asins,
claimed_via, claim_surface, seen_on, claiming_products_with_reviews,
review_support{theme_label, review_count, distinct_products,
on_claiming_products, polarity, rule}, praise_reviews, complaint_reviews,
matches[], verdict ('experienced'|'mixed_weak'|'claimed_only'|'contradicted'|'no_review_signal')}],
counts, rules, excluded_attribute_claims, synthesis}`, `status, generated_at`
(`utils/marketing-assets.js:594-660, 735-819`). Gate: `rollup.products_analyzed > 0`.

### 3.7 Web research claims (P5b) and deep research (P5)

- `dovive_web_research` row read by P7 and P9 via `webEvidenceText`
  (`utils/web-research.js:715-744`): `ledger{queries_run, sources_found,
  fetched, extracted, duplicates_removed, copied_marketing_quotes,
  by_ownership{independent, brand_owned, affiliate, sponsored, unknown}}`,
  `rollup{ingredient_claims[], comparison_criteria[], strengths[],
  weaknesses[], pricing[], products_discussed[], copied_marketing_quotes}`
  where each claim group is `{label, independent_sources,
  brand_owned_sources, affiliate_sources, sponsored_sources,
  unknown_sources, total_sources, duplicate_sources_excluded,
  copied_marketing_excluded, products[], quotes[{url, domain, ownership,
  quote, excluded?}], ingredient? | product?}` (`:380-477`), and
  `verification[{claim, status, evidence_url, note, …}]`.
- `dovive_phase5_research` (P9, P11) and `dovive_p5_sources` (P9, P11,
  P5b) with the columns listed in §2.

### 3.8 Packaging intelligence

- Per product: `products.marketing_analysis.packaging_intelligence.benefit_claims`
  (P9) — shape in §2 P8.
- Per category: `dovive_packaging_intelligence.intelligence`
  (`market_gaps.{benefit_gaps, badge_gaps}[{label, count, pct}]`,
  `saturated_claims[{label, count, pct}]`, `dovive_packaging_strategy.*`) (P9,
  `phase8-formula-brief.js:480-514`).

### 3.9 Prior deliverables (the chain's own intermediate state)

| Produced by | Where | Read by |
|---|---|---|
| P5 | `dovive_phase5_research`, `dovive_p5_sources`, `marketing_analysis.p5_research` | P9, P11 (P5b reads sources) |
| P6 | `products.marketing_analysis.product_intelligence` | P7, P9, P10 |
| P7 | `formula_briefs.ingredients.market_intelligence` | **nobody in the chain** (gap 1) |
| P8 | `marketing_analysis.packaging_intelligence`, `dovive_packaging_intelligence` | P9 |
| P9 | `ingredients.{ai_generated_brief, ai_generated_brief_grok, ai_generated_brief_claude}` | P10, P11, P12, P13 |
| P10 | `ingredients.{adjusted_formula, final_formula_brief, formula_variants, qa_report, formula_validation}` | P11, P12, P13 |
| P11 | `ingredients.competitive_benchmarking` | P13 |
| P12 | `ingredients.fda_compliance` | P13 |

All of the P9–P13 state lives in one jsonb column,
`formula_briefs.ingredients`, one row per `category_id`.

---

## 4. Mapping to the RnD evidence database

What RnD actually is (read 2026-09-29): the typed tables of
`RnD-Database/migrations/001_init.sql` (`dict_*`, `products` with `PRO-xx`
ids, `product_identifiers`, `product_variants`, `obs_*`, `listing_*`,
`review_aspects`, `contradictions`, `open_questions`, views
`v_dose_computed`, `v_dose_per_day`, `v_price_per_serving`,
`v_dose_per_day_cost`; `001_init.sql:17-460`) **plus** a research layer
that is not in that migration but exists live: `research_runs(id,
manifest_hash, product_id, category, model, prompt_version, origin,
created_at)`, `research_sources(run_id, source_key, source_id, scope,
locator, capture_method, original_hash, original_file_ref)`,
`research_assertions(run_id, assertion_key, source_key, scope, section,
predicate, label, value_text, value_numeric, unit, basis, ingredient_id,
label_order, evidence_state, excerpt, locator, notes)`,
`research_questions`, and the current-fact view `v_astra_facts` (66,451
rows) / `v_astra_products` (169 products, with a `role` of
`own|competitor|reference` and a `format_family`). Most live evidence sits
in `research_assertions` under dotted predicates (`customer.*` 22.6k,
`media.*` 16.6k, `claim.*` 5.9k, `ingredient.*` 3.1k, `market.*` 1.3k,
`usage.*`, `nutrition.*`, `certification.*`, `formula.*`), while the typed
`obs_*` tables are thin (`obs_ingredients` 71 rows, `obs_price` 24,
`obs_rank` 50, `obs_certifications` 9, `review_aspects` 0). There is also
`obs_competitor_selection` (`RnD-Database/supabase/migrations/20260928152308_competitor_selection_observations.sql`),
and a draft, unapplied projection that maps each Scout raw table to RnD
candidates (`RnD-Database/migrations/20260928164324_formula_generator_projection_draft.sql`),
which already names three tables that do not exist yet: `obs_market_series`,
`category_crosswalk`, `research_assertions` rows for web/creative claims.

House rules that constrain the mapping (`RnD-Database/CLAUDE.md`): ASIN is
not a key; always mg with a `basis` column; calculations are views, never
stored; observations are append-only; model-derived content must be marked
`inferred` and carry model + prompt version.

| Contract item | RnD home | Notes |
|---|---|---|
| Category | `v_astra_products.format_family` / `research_runs.category` | No uuid, no keyword. Needs a crosswalk to Scout `categories.id` / `search_term`. |
| asin, brand, title | `product_identifiers(id_type='asin')`, `dict_brands`, `products.name`; `listing_text(text_type='title')`, `amazon.title` assertions | Many ASINs per `PRO-xx`; a view must pick one per listing. |
| selected, selection_rank | `obs_competitor_selection(asin, category_id, selection_rank, selection_reason)` | Already shaped for this (`category_id uuid` is Scout's). |
| cohort | — | Gap. |
| Own products | `products.role = 'own'` (live) | Formula phases do not read them yet. |
| packaging_type / form | `obs_format`, `format.*` / `product.format` assertions | `obs_format` is empty. |
| supplement_facts_raw | `listing_text(text_type='supplement_facts_raw')` | Verbatim text, one row per source. |
| all_nutrients / label_facts rows | `obs_ingredients(ingredient_id, value_mg, basis, form, verbatim_text)` + `dict_ingredients`; `ingredient.declared` assertions; `obs_nutrition` | Per-row `amount_kind`, `elemental_mg`, `compound`, `in_blend_mg`, `status`, source excerpt have no typed column (draft projection puts them in payload). |
| serving_size, servings_per_container | `obs_consumption(attribute in units_per_serving, unit_name, servings_per_container, servings_per_day_*)`; `usage.*` assertions | Good fit. |
| nutrients_count | derivable view (`count(*)` of latest `obs_ingredients`) | Must be a view, not a column. |
| other_ingredients | `formula.inactive_ingredients` assertion / `listing_text(other)` | No typed home. |
| proprietary_blends | — | Gap (could be `obs_ingredients` with a blend basis, not modelled). |
| price | `obs_price(price_type='current')`, `market.provider_current_price` | |
| bsr_current, bsr_30/90_days_avg | `obs_rank(rank_type)`; `market.provider_current_sales_rank`, `market.sales_rank_average_30d`, `market.provider_90day_average_sales_rank` | 30/90-day averages exist only as assertions. |
| monthly_sales, monthly_revenue | — | Gap (Keepa `monthly_sold`; revenue is a calculation → view). |
| rating_value, rating_count | `market.displayed_rating`, `market.displayed_rating_count` assertions | |
| Keepa history (BSR, price, sold, reviews) | `spy_metrics` (time series, 24,678 rows, Spy-tracked listings only), `spy_captures.keepa_stats/keepa_facts` | Gap for Scout's roster: needs `obs_market_series` (named in the draft). |
| Promotions (coupon, deal, S&S) | `spy_captures.coupon/discount/price_deal` for Spy listings | Gap for the roster. |
| feature_bullets_text, description_text | `listing_text(text_type in bullet, description)` | Bullets are one row per bullet; view must `string_agg` in `sequence` order. |
| claims_on_label, claims_all_sources | `listing_claims(claim_text, claim_type)`; `claim.*` assertions | |
| certifications, certifications_verified | `obs_certifications`; `certification.*` assertions (incl. `certification.registry.*`) | Registry-verification status has no typed column. |
| Raw reviews | `listing_text(text_type in review_title, review_body)` + `listing_fields('review_context')` (per the draft projection) | Not yet imported at volume. |
| Review synthesis themes | `review_aspects(aspect, sentiment, verbatim_text)`; `customer.*` assertions | `review_aspects` is empty; counts (`review_count`, `distinct_products`, `share_of_analyzed`, counter-evidence, ledger) have no home. |
| Marketing-asset verdicts | `creative.*`, `image.*`, `media.*` assertions; `spy_image_facts` | Category roll-up and experienced-vs-claimed verdicts have no home. |
| Web research claims | `research_sources` + `research_assertions(section='claims'|'market', predicate 'web.*')` | Fits (the draft already targets it); the counted roll-up per claim does not. |
| P5 deep research | `research_runs` + `research_assertions` + `research_sources` | Fits in structure; `full_research` markdown has no home. |
| P5 off-Amazon sources | `research_sources` / `dict_sources(source_type='brand_site')` | Fits. |
| Packaging intelligence | `obs_packaging`, `pack.*` / `packaging.*` assertions | Per-product rule output and category frequencies have no home. |
| product_intelligence (P6) | — | Gap. |
| market_intelligence (P7) | — | Gap. |
| formula_briefs.ingredients (P9–P13) | — | Gap. |
| Contradictions / unknowns | `contradictions`, `open_questions`, `research_questions` | Scout has `label_conflicts`; not read by formula phases. |

### Gap list, with a proposal each

1. **Category crosswalk** (Scout `categories.id`/`search_term` ↔ RnD
   `format_family`/program). New table `category_crosswalk(external_category_id
   uuid, search_term, format_family, approved_by, captured_at)` — the draft
   projection already emits candidates for it.
2. **Cohort tag** (`established|emerging|context`). New append-only
   `obs_cohort(product_id, category_id, cohort, inputs jsonb, source_id,
   evidence_state='calculated', captured_at)`, same pattern as
   `obs_competitor_selection`.
3. **Keepa time series** (BSR/price/sold/review-count history, 30/90-day
   averages). New table `obs_market_series(product_id, series, point_date,
   value, unit, category_context, source_id, evidence_state, captured_at)`
   (named in the draft); 30/90-day averages become a view over it.
4. **Monthly sales / revenue.** Sales as a row in `obs_market_series`
   (`series='monthly_sold'`); revenue as a view (`price × sold`), never a column.
5. **Promotions** (coupon, lightning deal, S&S). `obs_price` with new
   `price_type` values, or rows in `obs_market_series`.
6. **Label-row detail** (`amount_kind`, `elemental_mg`, `compound`,
   `in_blend_mg`, extraction `status`, source excerpt) and proprietary
   blends. Add nullable columns to `obs_ingredients` (`amount_kind`,
   `elemental_mg`, `compound`, `blend_name`, `excerpt`) rather than jsonb, so
   the dose views can use them.
7. **Review synthesis ledger + counted themes.** New
   `review_synthesis_runs(run_id → research_runs, scope, product_id|null,
   ledger jsonb, domain_breakdown jsonb)` plus `review_aspects` extended with
   `review_count, distinct_products, share_of_analyzed, counter_count,
   excerpts jsonb, polarity, domain` (evidence_state `inferred`). A jsonb
   ledger column is fine here: it is provenance, not a fact.
8. **Marketing-asset roll-up and experienced-vs-claimed.** New
   `creative_rollups(run_id, category_ref, rollup jsonb,
   experienced_vs_claimed jsonb, status)` — model-derived, category-scoped,
   so it is analysis output rather than an observation.
9. **Web-research counted roll-up** (per-claim independent vs brand-owned
   source counts). A view over `research_assertions` + `research_sources`
   grouping by claim label and ownership, if ownership becomes a column on
   `research_sources` (today it would sit in `locator`/`notes`).
10. **P5 `full_research` text and structured fields.** Store as
    `research_assertions(section='deep_research', predicate
    'research.brief.*')` plus a `research_runs` row per ASIN; the markdown
    body as a `research_sources` file ref.
11. **Packaging frequencies and strategy.** Per-product claims as
    `obs_packaging` rows; the category frequency table as a view; the
    "strategy" block is a derived recommendation and belongs with gap 13.
12. **`product_intelligence` (P6 scoring).** New append-only
    `analysis_product_scores(product_id, category_ref, run_id, payload jsonb,
    model, prompt_version, generated_at)`; latest per product via a view.
13. **Deliverables: `market_intelligence`, `formula_briefs.ingredients`
    (brief, QA, variants, benchmarking, FDA, sign-off).** New
    `formula_runs(id, category_ref, keyword, started_at)` +
    `formula_deliverables(run_id, kind, payload jsonb, text_body, model,
    prompt_version, generated_at)` with `kind in (market_intelligence,
    brief, qa, variants, benchmarking, fda_compliance, final_signoff)`.
    Append-only, so a re-run adds a row instead of the delete-and-reinsert
    that P9 does today (`phase8-formula-brief.js:1789`), and a view
    `v_formula_brief_current` reassembles the one-object shape.
14. **Raw reviews at volume.** Either import into `listing_text` as the
    draft projection proposes, or keep them in Scout and let the formula
    phases read only the synthesis (they already prefer it). Recommended:
    the latter, because every formula consumer uses the synthesis when it
    exists.

---

## 5. Views the database should expose to Scout

Design goal: each formula phase keeps its `.from(…).select(…)` calls and
only the table name (and, for reads, the client) changes. That means each
view returns **Scout column names and Scout jsonb shapes**, keyed by
Scout's `category_id` (through `category_crosswalk`) and exposing `asin` as
a plain column. Writes stay on Scout's DB until gaps 12–13 exist (a view
over joins is not writable, and RnD's append-only rule forbids the
read-merge-write that P6/P8/P10 do on `marketing_analysis`).

| View | Grain | Columns (Scout names) | Built from |
|---|---|---|---|
| `v_formula_roster` | one row per (category_id, asin) | `id` (synthetic, stable), `category_id, asin, brand, title, selected, selection_rank, cohort, packaging_type, main_image_url, price, bsr_current, bsr_30_days_avg, bsr_90_days_avg, monthly_sales, monthly_revenue, rating_value, rating_count, promo_flag, role` | `category_crosswalk`, `product_identifiers`, `dict_brands`, `obs_competitor_selection`, `obs_cohort`, `obs_format`, latest `obs_price`/`obs_rank`/`obs_market_series`, `market.*` assertions |
| `v_formula_label_facts` | (category_id, asin) | `supplement_facts_raw` (text, rebuilt `Name: amount` lines or the verbatim `listing_text`), `all_nutrients` (jsonb `[{name, amount, dv_percent}]`), `label_facts` (jsonb in the §3.2 `facts_v2` shape), `nutrients_count, serving_size, servings_per_container, other_ingredients, proprietary_blends` | `v_latest_ingredient_dose`, `dict_ingredients`, `v_latest_consumption`, `listing_text`, `formula.*` assertions |
| `v_formula_listing` | (category_id, asin) | `feature_bullets_text` (bullets joined by newline in `sequence` order), `description_text, claims_on_label` (text[]), `claims_all_sources` (jsonb), `certifications` (text[]), `certifications_verified` (jsonb) | `listing_text`, `listing_claims`, `obs_certifications`, `claim.*`/`certification.*` assertions |
| `v_formula_review_themes` | (keyword or category_id, scope, asin) | `keyword, category_id, scope, asin, ledger, themes, domain_breakdown, generated_at, model, prompt_version, status` — the exact `dovive_review_synthesis` columns | `review_synthesis_runs` + extended `review_aspects` |
| `v_formula_market_series` | (asin, series, point_date) | `asin, series, point_date, value, unit` plus a companion `v_formula_keepa` per asin with `price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d` (jsonb `[{date, rank}]`) | `obs_market_series` |
| `v_formula_claims` | (keyword or category_id) | `keyword, category_id, status, ledger, rollup, verification, model, generated_at` — the `dovive_web_research` columns | `research_sources` + `research_assertions` (`web.*`) |
| `v_formula_creative` | (keyword or category_id, scope) | `keyword, category_id, scope, ledger, rollup, experienced_vs_claimed, status, model, prompt_version, generated_at` — the `dovive_marketing_assets` columns | `creative_rollups` |
| `v_formula_deep_research` | (keyword, asin) | `asin, keyword, brand, bsr_rank, pool, benefits, formula_notes, key_strengths, key_weaknesses, competitor_angle, certifications, third_party_tested, full_research, researched_by` and a sibling `v_formula_p5_sources(asin, keyword, source_url, source_type, raw_html_excerpt, extracted)` | `research_runs`/`research_assertions`/`research_sources` |
| `v_formula_packaging` | keyword | `keyword, intelligence, generated_at, products_analyzed` | view over `obs_packaging` + gap 11 |
| `v_formula_product_intel` | (category_id, asin) | `marketing_analysis` jsonb = `{product_intelligence, packaging_intelligence, p5_research}` | `analysis_product_scores` + packaging + P5 rows |
| `v_formula_brief_current` | category_id | `id, category_id, ingredients` (jsonb reassembled from `formula_deliverables`), `created_at` | `formula_deliverables` (gap 13) |

A single convenience view, `v_formula_products`, that joins roster + label
facts + listing + product intel into one row with **every** column the
phases select from `products` today would let every `DASH.from('products')`
read become `from('v_formula_products')` with no other edit.

### Per-phase change needed

| Phase | Reads to repoint | Code change beyond the table name |
|---|---|---|
| P5 | `products` → `v_formula_products`; `dovive_research`/`dovive_ocr`/`dovive_reviews`/`dovive_keepa` → `v_formula_listing` / `v_formula_label_facts` / Scout (raw reviews) / `v_formula_keepa` | The four per-ASIN grounding reads key on `keyword` and `image_index`, which RnD does not have: the grounding block (`phase5-deep-research.js:185-222`) needs a small rewrite to read one row per ASIN from the views instead of per-image OCR rows. Writes stay on Scout. |
| P5b | `products` → `v_formula_products`; `dovive_p5_sources` → `v_formula_p5_sources` | Name only. Writes stay on Scout (or to `research_*` once imported). |
| P6 | `products` → `v_formula_products`; `dovive_review_synthesis` → `v_formula_review_themes` | Name only for reads. The write (`:676`) must stay on Scout or move to `analysis_product_scores`, and the write targets `products.id`, so the view's synthetic `id` must be Scout's `products.id` while writes stay on Scout. |
| P7 | same as P6 plus `v_formula_claims`, `v_formula_creative` | Name only. Worth fixing gap 2 (add `all_nutrients` to the select) at the same time. |
| P8 | `products` → `v_formula_products` | Name only for reads; writes stay on Scout. |
| P9 | `products` ×4, `dovive_*` ×5, `formula_briefs` | Names only, **plus** fix gap 1: read `formula_briefs.ingredients.market_intelligence.ai_market_analysis` (or `v_formula_brief_current`) instead of the missing `market_intelligence` table. Gap 3 fix: add `serving_size` to the "all" select. The delete-and-insert write needs `formula_deliverables` before it can leave Scout. |
| P10 | `products` → `v_formula_products`; `formula_briefs` → `v_formula_brief_current` | Names only, plus the same market-intel fix as P9 and `c.other_ingredients` instead of `c.marketing_analysis.other_ingredients`. |
| P11 | `products`, `dovive_phase5_research`, `dovive_p5_sources`, `formula_briefs` | Names only. |
| P12 | `formula_briefs` | Name only (NIH fetch is unchanged). |
| P13 | `formula_briefs` | Name only. |
| Selection loader | `utils/selected-competitors.js:25-31` `products` → `v_formula_roster` | Name only; the view must expose `selected` and `selection_rank`. |
| Stores | `utils/review-synthesis-store.js:21`, `utils/web-research-store.js:14`, `utils/marketing-assets-store.js:14` each export a `TABLE` constant | Change the constant. The staleness guard reads `dovive_reviews.scraped_at`; the view must expose a `latest_scraped_at` or the guard must read Scout. |

The cleanest implementation of the "client swap" is a third client,
`EVIDENCE = createClient(RND_URL, RND_KEY)`, used for reads only, with
`DASH` kept for every write. Because the views carry Scout's column names,
the per-call diff is `DASH.from('products')` → `EVIDENCE.from('v_formula_products')`.
