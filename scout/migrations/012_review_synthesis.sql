-- 012_review_synthesis.sql
-- Target project: jwkitkfufigldpldqtbq.
--
-- NOT APPLIED. Written 2026-09-26 with the P3b review synthesis
-- (scout/phase3b-review-synthesis.js, scout/utils/review-synthesis.js).
-- Apply the same way as 007 (supabase db query --linked --file ...).
-- Everything is additive: one new table, no existing table or column touched.
-- Until it is applied, P3b logs an upsert failure and exits 0, and every
-- consumer (P6a, P7, P8, migrate-reviews-to-dash.js, the dashboard's Review
-- evidence card) falls back to its previous behaviour.
--
-- One row per (keyword, scope, asin): scope 'category' has asin NULL, scope
-- 'product' has one row per ASIN. P3b upserts on (keyword, scope, asin_key),
-- so re-running replaces the previous synthesis instead of piling up rows.

CREATE TABLE IF NOT EXISTS dovive_review_synthesis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword          TEXT NOT NULL,
  category_id      UUID,
  scope            TEXT NOT NULL CHECK (scope IN ('category', 'product')),
  asin             TEXT,
  -- '' for the category row, so one unique index covers both scopes
  -- (NULLs never collide in a unique index).
  asin_key         TEXT GENERATED ALWAYS AS (COALESCE(asin, '')) STORED,
  -- Coverage: rows_collected, duplicate_rows_removed, reviews_collected,
  -- reviews_analyzed, reviews_with_text, cap_applied, products_with_reviews,
  -- distinct_asins, product_families, date_range, reviews_by_year,
  -- verified_share, vine_share, star_distribution, average_rating,
  -- per_product (category row), theme_pass (model, batches, failures, cost).
  ledger           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Array of themes: label, domain, polarity, review_ids, review_count,
  -- distinct_products {count, asin_count, asins}, scope, verified_count,
  -- verified_share, date_range, excerpts[], counter_evidence {review_ids,
  -- count, products, paired_theme_labels, excerpt}, merged_labels.
  themes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Zero-cost lexicon breakdown per issue domain (negative/positive counts
  -- and product counts).
  domain_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL DEFAULT 'complete'
                   CHECK (status IN ('complete', 'partial', 'deterministic_only')),
  model            TEXT,
  prompt_version   TEXT,
  cost_usd         NUMERIC(12, 6),
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dovive_review_synthesis_scope_asin CHECK (
    (scope = 'category' AND asin IS NULL) OR (scope = 'product' AND asin IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dovive_review_synthesis_key
  ON dovive_review_synthesis (keyword, scope, asin_key);
CREATE INDEX IF NOT EXISTS dovive_review_synthesis_category
  ON dovive_review_synthesis (category_id, scope);

ALTER TABLE dovive_review_synthesis ENABLE ROW LEVEL SECURITY;

-- Same shape as ai_usage_log (007): the pipeline writes with the service role
-- (bypasses RLS); the dashboard reads with anon.
DO $$ BEGIN
  CREATE POLICY "dovive_review_synthesis_anon_select" ON dovive_review_synthesis FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
