-- 016_reviews_unique.sql
-- Target project: jwkitkfufigldpldqtbq.
--
-- NOT APPLIED. Written 2026-09-29 with the Phase 3 collector's upsert
-- (scout/playwright-reviews.js → scout/utils/review-rows.js). Apply the same
-- way as 007 / 012 (supabase db query --linked --file ...).
--
-- Why: dovive_reviews was append-only, so every re-scrape of an ASIN inserted
-- the reviews it already held again. The collector now upserts on
-- (keyword, asin, review_id); this migration gives it that key.
--
-- What it does, in one transaction:
--   1. adds dovive_reviews.review_id, a STORED generated column copied from
--      raw_json->'raw'->>'review_id' (Amazon's review id; every Bright Data row
--      has one, Playwright rows now carry theirs there too). Nullable: rows
--      without an id are never de-duplicated or blocked;
--   2. collapses existing duplicates on (keyword, asin, review_id), keeping the
--      LOWEST id of each group (the id P3b evidence already points at — see
--      utils/review-synthesis.js prepareReviews) after lifting its scraped_at
--      and helpful_votes to the group's newest/highest, so no ASIN looks older
--      to the READ-FIRST planner (inventory.js freshness = max(scraped_at))
--      and gets re-scraped for nothing;
--   3. adds the unique index the collector's ON CONFLICT names.
--
-- Measured 2026-09-29 (read-only), before applying:
--   51,023 rows, all with a review_id, none with a NULL keyword.
--   Step 2 will DELETE 9,794 rows (8 keywords affected) and keep 41,229.
--   No keyword drops below the verifier's 200-row P3 floor.
--   Steps 2's UPDATE/DELETE touch nothing when no group has >1 row, so a
--   re-run is a no-op.
--
-- Why (keyword, asin, review_id) and not (keyword, review_id): a review shared
-- by variation ASINs keeps one row PER ASIN. Keying on (keyword, review_id)
-- would delete another 2,927 rows and leave 36 keyword/ASIN pairs with no rows
-- at all — those ASINs would then read as "never scraped" and be re-fetched
-- (and re-paid) on every P3 run. Cross-ASIN copies are still collapsed at read
-- time by utils/review-synthesis.js and migrate-reviews-to-dash.js, which use
-- them as the evidence that ASINs form one product family.
--
-- Why a plain (not partial) unique index: PostgREST's on_conflict cannot name
-- a partial index's predicate, so ON CONFLICT inference against
-- "... WHERE review_id IS NOT NULL" fails with 42P10. NULLs are distinct in a
-- unique index, so rows without a review_id never collide either way.
--
-- Until this is applied the collector's upsert gets 42703/42P10 and falls back
-- to the old plain insert (utils/review-rows.js), so nothing is lost.

BEGIN;

-- Block concurrent writers between the de-duplication and the index build.
LOCK TABLE dovive_reviews IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE dovive_reviews
  ADD COLUMN IF NOT EXISTS review_id text GENERATED ALWAYS AS (raw_json -> 'raw' ->> 'review_id') STORED;

DO $$
DECLARE
  dup_groups bigint;
  lifted bigint;
  removed bigint;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT 1 FROM dovive_reviews
    WHERE review_id IS NOT NULL AND keyword IS NOT NULL
    GROUP BY keyword, asin, review_id
    HAVING count(*) > 1
  ) g;

  IF dup_groups = 0 THEN
    RAISE NOTICE '016: no duplicate (keyword, asin, review_id) groups — nothing to remove';
    RETURN;
  END IF;

  -- Keep the lowest id; carry the group's freshest scrape time and highest
  -- helpful count onto it before its copies go.
  WITH g AS (
    SELECT keyword, asin, review_id,
           min(id) AS keep_id,
           max(scraped_at) AS newest,
           max(helpful_votes) AS most_helpful
    FROM dovive_reviews
    WHERE review_id IS NOT NULL AND keyword IS NOT NULL
    GROUP BY keyword, asin, review_id
    HAVING count(*) > 1
  )
  UPDATE dovive_reviews r
     SET scraped_at = g.newest,
         helpful_votes = GREATEST(COALESCE(r.helpful_votes, 0), COALESCE(g.most_helpful, 0))
    FROM g
   WHERE r.id = g.keep_id
     AND (r.scraped_at IS DISTINCT FROM g.newest OR COALESCE(r.helpful_votes, 0) < COALESCE(g.most_helpful, 0));
  GET DIAGNOSTICS lifted = ROW_COUNT;

  DELETE FROM dovive_reviews d
   USING (
     SELECT id FROM (
       SELECT id, row_number() OVER (PARTITION BY keyword, asin, review_id ORDER BY id) AS rn
       FROM dovive_reviews
       WHERE review_id IS NOT NULL AND keyword IS NOT NULL
     ) x
     WHERE x.rn > 1
   ) dup
   WHERE d.id = dup.id;
  GET DIAGNOSTICS removed = ROW_COUNT;

  RAISE NOTICE '016: % duplicate groups — % kept rows refreshed, % copies removed', dup_groups, lifted, removed;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dovive_reviews_keyword_asin_review_id_key
  ON dovive_reviews (keyword, asin, review_id);

COMMIT;
