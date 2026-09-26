-- 013_label_verification.sql
-- Target project: jwkitkfufigldpldqtbq.
--
-- NOT APPLIED. Written 2026-09-27 with "Verify labels and product information"
-- (scout/utils/label-facts.js, label-variant.js, label-sources.js,
-- cert-registry.js, verify-certifications.js). Apply the same way as 007
-- (supabase db query --linked --file ...).
--
-- Additive only (ADD COLUMN IF NOT EXISTS) — no existing column touched, and
-- the legacy columns keep their old shape and meaning:
--   dovive_ocr.supplement_facts   still [{ name, amount, dv_percent }]
--   products.all_nutrients / serving_size / servings_per_container /
--   claims_on_label / nutrients_count / ocr_confidence   still written as before.
--
-- Until this is applied:
--   - ocr-phase4.js / phase4-text-extract.js retry their dovive_ocr upsert
--     once without facts_v2 / label_product_match and stop sending them
--     (PGRST204 / 42703), warning once;
--   - migrate-ocr-to-dash.js reads dovive_ocr without the two new columns,
--     rebuilds v2 rows from the legacy facts in memory, still applies the
--     per-field resolution to the legacy product columns, and drops the five
--     new products columns from its update with one warning;
--   - verify-certifications.js logs one warning and writes nothing;
--   - the dashboard's "Label evidence" panel does not render (columns absent).

-- ── dovive_ocr: per-row v2 facts and the label/listing check ─────────────
-- facts_v2: { schema_version: 2, serving: {raw, units, form, discrete,
--   serving_mass_g, per_day_units, range, servings_per_container},
--   rows: [{ name, nutrient, amount_mg, amount_raw, unit_raw, unit_basis,
--   basis, basis_source, per_unit_mg, per_serving_mg, amount_kind, form,
--   compound, compounds, elemental_mg, elemental_basis, elemental_factor,
--   extract {ratio, extract_mg, equivalent_whole_plant_mg, equivalent_basis,
--   standardised_to, note}, dv_percent, status, variants, in_blend_mg,
--   source {row_id, asin, image_url, image_index, excerpt, excerpt_source} }],
--   warnings: [] }
ALTER TABLE dovive_ocr ADD COLUMN IF NOT EXISTS facts_v2 JSONB;
-- label_product_match: { title_tokens_overlap, flavor_match, count_match,
--   brand_match, parent_asin, listing {…}, label {…},
--   verdict: 'match'|'mismatch'|'unknown', why }
-- NULL on text-extraction rows (image_index 99): they read the listing's own copy.
ALTER TABLE dovive_ocr ADD COLUMN IF NOT EXISTS label_product_match JSONB;

-- ── products: resolved label evidence ──────────────────────────────────
-- label_facts: the v2 record of the row chosen for nutrients (same shape as
--   dovive_ocr.facts_v2, with source.row_id filled in).
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_facts JSONB;
-- label_sources: field → where it came from.
--   { nutrients: {row_id, image_url, image_index, processed_at},
--     serving_size: {… , rule?}, servings_per_container: {…},
--     certifications: [{claim, sources: [{row_id, image_url, image_index, processed_at}]}],
--     other_ingredients: {…}, excluded: [{row_id, image_url, image_index, why}] }
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_sources JSONB;
-- label_conflicts: field → every value the sources gave, each with its source.
--   { "serving_size": [{value, row_id, image_url, image_index, processed_at}],
--     "nutrient:<name>": [{value, amount_mg, note, row_id, image_url, image_index, processed_at}] }
--   {} when the sources agree.
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_conflicts JSONB;
-- label_product_match: the nutrient source row's check (see dovive_ocr above).
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_product_match JSONB;
-- certifications_verified: { schema_version: 1, checked_at, lookups_enabled,
--   results: [{ claim, claim_key, registry, scope,
--   status: 'verified'|'not_found'|'registry_unavailable'|'no_registry'|'not_checked',
--   checked_at, evidence_url, match {company, product, quality}, reason }] }
ALTER TABLE products ADD COLUMN IF NOT EXISTS certifications_verified JSONB;
