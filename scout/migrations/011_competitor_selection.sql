-- 011_competitor_selection.sql
-- Target project: jwkitkfufigldpldqtbq (the only live Supabase project).
--
-- Purpose: "Select 40 relevant, established competitors" (owner, 2026-09-26).
-- P1 now builds an ~80-ASIN candidate pool from several searches
-- (human-bsr.js + utils/query-variants.js + utils/serp-pool.js); after P2
-- Keepa, select-competitors.js (run from migrate-keepa-to-dash.js) collapses
-- flavors/pack sizes to one competitor per variation family, checks for
-- promotion-driven sales and variation-shared reviews, and marks the top 40
-- `selected` with a written reason. P3/P4/P5/P8 read `selected = true`
-- ordered by `selection_rank`.
--
-- Additive only (ADD COLUMN IF NOT EXISTS) — no existing column touched.
-- Every writer and reader tolerates this migration being absent:
--   - human-bsr.js / keepa-phase2.js retry their upsert without the new
--     columns on PGRST204 and stop sending them;
--   - select-competitors.js reads Keepa signals from dovive_keepa.raw_json
--     (present on every row already), and skips its write with one warning;
--   - P3/P4/P5/P8 keep "top N by BSR" until products.selected is populated.
-- Pre-migration rows have selected = NULL; NULL means "not yet evaluated",
-- never "rejected". Re-running migrate-keepa-to-dash.js "<keyword>" (no Keepa
-- or AI spend) — or `node select-competitors.js "<keyword>"` — populates a
-- category that already has P1 + P2 data.

-- ── dovive_research: which searches surfaced each ASIN ─────────────────
-- { search_queries[], serp_positions{query:pos}, sponsored_in[],
--   best_position, base_position, rrf_score, pool_rank }
ALTER TABLE dovive_research ADD COLUMN IF NOT EXISTS selection_signals JSONB;

-- ── dovive_keepa: variation family, promotions, review history ─────────
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS parent_asin TEXT;
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS variation_asins TEXT[];
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS review_count_history_90d JSONB; -- [{date, count}] from csv[17]
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS price_avg_90d NUMERIC;          -- stats.avg90, Amazon→New→Buy Box
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS coupon JSONB;                   -- {one_time:{kind,value}|null, subscribe_and_save:{…}|null}
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS coupon_active BOOLEAN;          -- one-time (clip) coupon live now
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS lightning_deal_active BOOLEAN;  -- lightning or Prime deal live now
ALTER TABLE dovive_keepa ADD COLUMN IF NOT EXISTS sns_discount_pct NUMERIC;       -- standing Subscribe & Save %, not a promotion

CREATE INDEX IF NOT EXISTS idx_dovive_keepa_parent_asin ON dovive_keepa (parent_asin);

-- ── products: the selection itself ─────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS selected BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selection_rank INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selection_reason JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_flag BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shared_reviews_with TEXT[];

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_selection_rank_check;
ALTER TABLE products
  ADD CONSTRAINT products_selection_rank_check
  CHECK (selection_rank IS NULL OR (selection_rank >= 1 AND selected IS TRUE));

-- P3/P4/P5/P8 all ask "selected competitors of this category, by rank".
CREATE INDEX IF NOT EXISTS idx_products_selection
  ON products (category_id, selection_rank)
  WHERE selected IS TRUE;

-- ── Optional data repair (NOT required by the code; run separately if wanted) ──
-- Until 2026-09-26 keepa-phase2.js stored stats.current[16] (star rating ×10,
-- e.g. 47) as the review count and updateResearch() copied it into
-- dovive_research.review_count (1,283 of 1,630 rows), from where
-- migrate-p1-to-dash.js re-runs carried it into products.rating_count (756 of
-- 3,555 rows, 29 categories). select-competitors.js and the cohort tagging
-- already ignore such counts at read time (usableDisplayedReviews); these two
-- statements repair the stored values from Keepa's real per-ASIN count,
-- stats.current[17], which every dovive_keepa.raw_json still holds.
--
-- A row is repaired ONLY when its count looks like the corruption: ≤ 50 and
-- within 1 of rating×10 (either the row's own rating or Keepa's current[16]),
-- or < 50 while Keepa's count is ≥ 10× larger — the same rule the code uses.
-- Assumes dovive_keepa.raw_json is jsonb. Commented out on purpose: it
-- rewrites existing data. Preview first by turning each into a SELECT.
--
-- UPDATE products p
--    SET rating_count = (k.raw_json->'stats'->'current'->>17)::int
--   FROM dovive_keepa k
--  WHERE k.asin = p.asin
--    AND jsonb_typeof(k.raw_json->'stats'->'current') = 'array'
--    AND (k.raw_json->'stats'->'current'->>17)::int > 0
--    AND p.rating_count IS NOT NULL
--    AND p.rating_count <= 50
--    AND (
--          abs(p.rating_count - round(coalesce(p.rating_value, 0) * 10)) <= 1
--       OR abs(p.rating_count - (k.raw_json->'stats'->'current'->>16)::int) <= 1
--       OR (p.rating_count < 50 AND (k.raw_json->'stats'->'current'->>17)::int >= 10 * p.rating_count)
--        );
--
-- UPDATE dovive_research r
--    SET review_count = (k.raw_json->'stats'->'current'->>17)::int
--   FROM dovive_keepa k
--  WHERE k.asin = r.asin
--    AND jsonb_typeof(k.raw_json->'stats'->'current') = 'array'
--    AND (k.raw_json->'stats'->'current'->>17)::int > 0
--    AND r.review_count IS NOT NULL
--    AND r.review_count <= 50
--    AND (
--          abs(r.review_count - round(coalesce(r.rating, 0) * 10)) <= 1
--       OR abs(r.review_count - (k.raw_json->'stats'->'current'->>16)::int) <= 1
--       OR (r.review_count < 50 AND (k.raw_json->'stats'->'current'->>17)::int >= 10 * r.review_count)
--        );
