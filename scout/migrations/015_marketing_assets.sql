-- 015_marketing_assets.sql
-- Target project: jwkitkfufigldpldqtbq.
--
-- NOT APPLIED. Written 2026-09-27 with P7b marketing assets
-- (scout/phase7b-marketing-assets.js, scout/utils/marketing-assets.js).
-- Apply the same way as 007 / 012 (supabase db query --linked --file ...).
-- Everything is additive: one new table and one new nullable column on
-- products. No existing table, column or row is changed.
-- (Numbered 015 as assigned for this change.)
--
-- Until it is applied, P7b's pre-flight sees the missing table, logs it and
-- exits 0 before any model call (nothing spent); P7 / P9 prompts stay
-- byte-identical; the dashboard's Marketing assets card says "not generated".
--
-- One row per (keyword, scope, asin): scope 'category' has asin NULL, scope
-- 'product' has one row per in-scope ASIN. P7b upserts on
-- (keyword, scope, asin_key), so a re-run replaces instead of piling up.
--
-- products.packaging_image_analysis is NOT reused: it holds the dashboard
-- edge function analyze-packaging-images' single-MAIN-image result
-- (packaging / label_content / messaging_tone / product_contents, 52 rows
-- today) — a different shape, written by a different producer, and
-- overwriting it would destroy that output.

CREATE TABLE IF NOT EXISTS dovive_marketing_assets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword                TEXT NOT NULL,
  category_id            UUID,
  scope                  TEXT NOT NULL CHECK (scope IN ('category', 'product')),
  asin                   TEXT,
  -- '' for the category row, so one unique index covers both scopes.
  asin_key               TEXT GENERATED ALWAYS AS (COALESCE(asin, '')) STORED,
  -- Coverage: products, products_analyzed/cached/failed/not_attempted,
  -- images_available, gallery/a_plus/brand_story images available+analyzed,
  -- images_sent_this_run, images_unreadable, a_plus_available/analyzed,
  -- videos_available, videos_analyzed (0) + videos_note, claims dropped for
  -- missing evidence, scope (selection | top_bsr), model, cost, plan_digest,
  -- synthesis_generated_at.
  ledger                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Product: the inventory (gallery, a_plus {available, images, videos},
  -- brand_story, videos, selected_images, per_image). Category: a compact
  -- per-product list.
  assets                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Product only: the validated vision result (target_audience, main_promise,
  -- recurring_messages, demonstrated_use_cases, packaging,
  -- comparison_table_claims, text_seen, images_unreadable, validation).
  analysis               JSONB,
  -- Category only: counted roll-up (recurring_messages, main_promises,
  -- audience_segments, use_cases, comparison_table_claims, packaging).
  rollup                 JSONB,
  -- Category only: claimed benefit → P3b review theme join with verdict
  -- (experienced | claimed_only | contradicted | no_review_signal) and the
  -- lexical rule that matched.
  experienced_vs_claimed JSONB,
  -- Product: { key = sha1(prompt version + ordered image URLs), ok, status,
  --   failed_attempts (billed failures on THIS key; 2 → skipped until --force), skipped,
  -- attempts, error, cost_usd, model, analyzed_at } — the resume key.
  -- Category: { asin: { key, ok, status } }.
  batch_results          JSONB,
  status                 TEXT NOT NULL DEFAULT 'complete'
                         CHECK (status IN ('complete', 'partial', 'inventory_only', 'failed', 'not_attempted', 'no_images')),
  model                  TEXT,
  prompt_version         TEXT,
  cost_usd               NUMERIC(12, 6),
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dovive_marketing_assets_scope_asin CHECK (
    (scope = 'category' AND asin IS NULL) OR (scope = 'product' AND asin IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dovive_marketing_assets_key
  ON dovive_marketing_assets (keyword, scope, asin_key);
CREATE INDEX IF NOT EXISTS dovive_marketing_assets_category
  ON dovive_marketing_assets (category_id, scope);
CREATE INDEX IF NOT EXISTS dovive_marketing_assets_asin
  ON dovive_marketing_assets (asin) WHERE asin IS NOT NULL;

ALTER TABLE dovive_marketing_assets ENABLE ROW LEVEL SECURITY;

-- Same shape as 007 / 012: the pipeline writes with the service role
-- (bypasses RLS); the dashboard reads with anon.
DO $$ BEGIN
  CREATE POLICY "dovive_marketing_assets_anon_select" ON dovive_marketing_assets FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pointer on the product row (source, keyword, status, generated_at,
-- images_analyzed, main_promise, target_audience, recurring_messages count).
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_asset_analysis JSONB;
