-- 009_products_cohort.sql
-- Target project: jwkitkfufigldpldqtbq (the only live Supabase project).
--
-- Purpose: cohort separation of "Established" vs "Emerging" competitors so
-- P8 (phase8-formula-brief.js) can split its recommendation into a
-- table-stakes "proven baseline" layer (derived only from established
-- winners) and a labelled-risk "emerging edge" layer (what younger fast-
-- growing brands do differently), instead of blending both into one
-- undifferentiated set of "top performers."
--
-- 'established' — years on market + high stable sales + big review base
--                  (the Liquid I.V./Nuun tier a category leader is expected
--                  to match on table-stakes).
-- 'emerging'     — young listing + fast review velocity + climbing BSR (a
--                  real, still-unproven trend worth flagging as upside/risk).
-- 'context'      — everything else: not a model to follow either way, kept
--                  only for market-size/pricing context elsewhere in the app.
--
-- Computed deterministically (no AI cost) in migrate-keepa-to-dash.js, which
-- already has every signal this needs (Keepa listed_since/release_date,
-- bsr_current, bsr_drops history, review_count) loaded per-ASIN right after
-- P2 Keepa. See scout/utils/cohort.js for the actual classifier + its
-- env-tunable thresholds.
--
-- Additive only (ADD COLUMN IF NOT EXISTS) — no existing column touched.
-- Pre-migration rows simply have cohort = NULL until the next Keepa sync
-- (migrate-keepa-to-dash.js re-run, or the one-shot backfill script
-- scout/backfill-cohort.js) tags them; NULL must be treated as "not yet
-- classified," not as 'context'.

ALTER TABLE products ADD COLUMN IF NOT EXISTS cohort TEXT;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_cohort_check;

ALTER TABLE products
  ADD CONSTRAINT products_cohort_check
  CHECK (cohort IS NULL OR cohort IN ('established', 'emerging', 'context'));

CREATE INDEX IF NOT EXISTS idx_products_cohort ON products (category_id, cohort);
