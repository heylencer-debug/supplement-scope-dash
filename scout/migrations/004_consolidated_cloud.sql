-- 004_consolidated_cloud.sql — Consolidate the Scout pipeline onto the live
-- dashboard Supabase project (jwkitkfufigldpldqtbq).
--
-- Background: the old Scout pipeline DB (fhfqjcvwcxizbioftvdw) is permanently
-- gone (confirmed NXDOMAIN 2026-08-27 — see scout/DEPLOY_NOTES.md). The
-- decision is to run the pipeline's raw `dovive_*` scrape tables in the SAME
-- Supabase project as the dashboard (`jwkitkfufigldpldqtbq`) instead of a
-- separate project — one DB, `SUPABASE_URL` == `DASH_URL` going forward.
--
-- This is 100% additive: every statement is CREATE TABLE IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS. None of the tables already live in
-- jwkitkfufigldpldqtbq (categories, products, formula_briefs, reviews,
-- manufacturer_*, competitors, etc. — verified via a PostgREST schema read
-- before writing this file) are touched.
--
-- Run this ONCE, in full, in the jwkitkfufigldpldqtbq Supabase dashboard SQL
-- editor. DDL cannot be applied from any automated session against this
-- project (standing policy) — this file is written to be safe to paste and
-- run directly, and safe to re-run if partially applied.
--
-- Schemas below were reverse-engineered from the actual insert/upsert/select
-- calls in each script (the old project's schema was never captured in this
-- repo — it was created ad hoc via the old dashboard) — see the file/line
-- comments next to each table for the source of truth.
--
-- DATA-COMPLETENESS REQUIREMENT (2026-08-27): every phase's output must land
-- in a queryable Supabase table, not just a local file/log — the app will
-- build future UI/analysis on top of these tables. Audited all 12 phases
-- against that bar while writing this file:
--   - P1 (human-bsr), P2 (keepa), P3 (apify-reviews), P4 (OCR/text-extract),
--     P5 (deep-research), P7 (packaging) already wrote to dovive_* tables —
--     included below, PLUS a `raw_json` jsonb column added to dovive_keepa
--     and dovive_reviews so the raw source payload survives alongside the
--     normalized columns (dovive_research/dovive_ocr already carried enough
--     raw jsonb — bullet_points/specs/images/raw_text — to not need one).
--   - P6 (product intelligence), P8 (formula brief), P9 (QA), P10 (competitive
--     benchmarking), P11 (FDA compliance) already write their FULL raw
--     text/JSON output (not just parsed summaries) into
--     formula_briefs.ingredients / products.marketing_analysis — confirmed by
--     reading each phase's save call, no changes needed.
--   - P0 (market opportunity scanner) was the one real gap: it only ever
--     wrote its ranked category scan to a local markdown file
--     (scout/output/*.md), never to Supabase. Added
--     dovive_market_opportunities below + a save call in
--     phase0-market-opportunity.js.

-- ─── scout_jobs (Cloud Run Job queue — from 003, included here so 004 is a
-- complete single paste) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scout_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | claimed | running | complete | error
  force BOOLEAN NOT NULL DEFAULT false,
  from_phase INT,
  only_phases TEXT,
  use_ai BOOLEAN NOT NULL DEFAULT false,
  current_phase INT,
  current_phase_name TEXT,
  total_phases INT DEFAULT 12,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  cloud_run_execution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scout_jobs_status ON scout_jobs(status, created_at);

CREATE OR REPLACE FUNCTION claim_scout_job(p_job_id UUID DEFAULT NULL)
RETURNS SETOF scout_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE scout_jobs
  SET status = 'claimed', claimed_at = now(), updated_at = now()
  WHERE id = COALESCE(
          p_job_id,
          (SELECT id FROM scout_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1)
        )
    AND status = 'queued'
  RETURNING *;
END;
$$;

-- ─── dovive_keywords — scout/human-bsr.js:148-169, scout/keepa-phase2.js:306-320,
-- scout/apify-reviews.js:335, scout/scout-agent.js:1666 ───────────────────
-- Tracked columns from actual code: keyword, active, last_keepa_run.
-- scout-agent.js also filters/orders by other columns (product_type,
-- priority) that were never seen written by any script still in the
-- pipeline path — added as nullable so a future write doesn't 400.
CREATE TABLE IF NOT EXISTS dovive_keywords (
  id bigint generated always as identity primary key,
  keyword text UNIQUE NOT NULL,
  active boolean DEFAULT true,
  product_type text,
  priority int,
  last_keepa_run timestamptz,
  last_apify_run timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─── dovive_research — scout/human-bsr.js:184-215 (P1 scrape), updated by
-- scout/keepa-phase2.js:208-231 (P2 validated overwrite) ─────────────────
CREATE TABLE IF NOT EXISTS dovive_research (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text NOT NULL,
  title text,
  brand text,
  description text,
  bullet_points jsonb,
  specs jsonb,
  images jsonb,
  main_image text,
  bsr integer,
  rank_position integer,
  rating numeric,
  review_count integer,
  price numeric,
  category text,
  is_sponsored boolean DEFAULT false,
  url text,
  source text,
  raw_json jsonb,
  scraped_at timestamptz DEFAULT now(),
  UNIQUE(asin, keyword)
);
-- raw_json (2026-08-27): full raw response payload from whichever scrape
-- method wrote this row (Bright Data fallback path in scout/bright-data-amazon.js
-- via scout/human-bsr.js). NULL for rows written by the Playwright path
-- (which already has enough structured columns). ADD COLUMN IF NOT EXISTS so
-- this is safe to re-run against a DB that already has the table from before
-- this column existed.
ALTER TABLE dovive_research ADD COLUMN IF NOT EXISTS raw_json jsonb;
CREATE INDEX IF NOT EXISTS idx_dovive_research_keyword ON dovive_research(keyword);
CREATE INDEX IF NOT EXISTS idx_dovive_research_asin ON dovive_research(asin);

-- ─── dovive_history — scout/human-bsr.js:200-215 (append-only scrape log,
-- one row per product per scrape run) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS dovive_history (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text,
  title text,
  brand text,
  price numeric,
  bsr integer,
  rating numeric,
  review_count integer,
  rank_position integer,
  is_sponsored boolean DEFAULT false,
  category text,
  source text,
  scraped_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dovive_history_asin ON dovive_history(asin);

-- ─── dovive_reviews — scout/apify-reviews.js:99-171 (full customer reviews) ─
CREATE TABLE IF NOT EXISTS dovive_reviews (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text,
  reviewer_name text,
  rating numeric,
  title text,
  body text,
  review_date date,
  verified_purchase boolean DEFAULT false,
  helpful_votes integer DEFAULT 0,
  raw_json jsonb, -- full Apify actor item for this review — added 2026-08-27 per "keep raw + structured" requirement
  scraped_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dovive_reviews_asin ON dovive_reviews(asin);

-- ─── dovive_keepa — scout/keepa-phase2.js:98-187 (parseKeepa() return shape) ─
CREATE TABLE IF NOT EXISTS dovive_keepa (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text,
  title text,
  brand text,
  manufacturer text,
  category text,
  product_group text,
  description text,
  features jsonb,
  dimensions jsonb,
  images jsonb,
  upc text,
  ean text,
  part_number text,
  release_date date,
  listed_since date,
  price_usd numeric,
  price_history_30d jsonb,
  bsr_current integer,
  bsr_category text,
  bsr_history_30d jsonb,
  bsr_history_90d jsonb,
  bsr_drops_30d integer,
  bsr_drops_90d integer,
  monthly_sales_est integer,
  rating numeric,
  review_count integer,
  buybox_seller text,
  fulfillment text,
  availability text,
  total_offers integer,
  fba_offers integer,
  fbm_offers integer,
  is_sns_eligible boolean DEFAULT false,
  monthly_sold_history jsonb,
  raw_json jsonb, -- full raw Keepa API product object (minus its own huge csv[] time-series, which parseKeepa() already distilled into the columns above) — added 2026-08-27 per "keep raw + structured" requirement
  parsed_at timestamptz,
  UNIQUE(asin)
);
CREATE INDEX IF NOT EXISTS idx_dovive_keepa_keyword ON dovive_keepa(keyword);

-- ─── dovive_phase5_research — scout/phase5-deep-research.js:181-238
-- (parseResearchOutput() return shape; the two ALTERs it self-documents
-- as a fallback (pool, full_research) are included directly here) ─────────
CREATE TABLE IF NOT EXISTS dovive_phase5_research (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text NOT NULL,
  brand text,
  bsr_rank integer,
  pool text, -- 'top10' | 'newbrands'
  benefits jsonb,
  features jsonb,
  formula_notes text,
  certifications jsonb,
  awards jsonb,
  third_party_tested boolean DEFAULT false,
  transparency_flag boolean DEFAULT false,
  reddit_sentiment text,
  reddit_notes text,
  reddit_sources jsonb,
  external_reviews jsonb,
  healthline_covered boolean DEFAULT false,
  labdoor_score numeric,
  key_weaknesses text,
  key_strengths text,
  competitor_angle text,
  full_research text,
  researched_at timestamptz DEFAULT now(),
  researched_by text,
  phase int DEFAULT 5,
  UNIQUE(asin, keyword)
);
CREATE INDEX IF NOT EXISTS idx_dovive_phase5_keyword ON dovive_phase5_research(keyword);
-- Safe even on a fresh CREATE — matches phase5-deep-research.js's own
-- self-healing ALTER fallback (lines 288-289) in case this file's CREATE
-- above ever drifts from the code again.
ALTER TABLE dovive_phase5_research ADD COLUMN IF NOT EXISTS pool text;
ALTER TABLE dovive_phase5_research ADD COLUMN IF NOT EXISTS full_research text;

-- ─── dovive_ocr — scout/phase4-text-extract.js:169-187 (text-extraction path,
-- image_index=99) and scout/ocr-phase4.js:100-125 (image-OCR path, real
-- image_index per photo) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dovive_ocr (
  id bigint generated always as identity primary key,
  asin text NOT NULL,
  keyword text,
  image_url text,
  image_index integer NOT NULL,
  serving_size text,
  servings_per_container text,
  supplement_facts jsonb,
  other_ingredients text,
  health_claims jsonb,
  certifications jsonb,
  raw_text text,
  gpt_model text,
  processed_at timestamptz DEFAULT now(),
  UNIQUE(asin, image_index)
);
CREATE INDEX IF NOT EXISTS idx_dovive_ocr_keyword ON dovive_ocr(keyword);

-- ─── dovive_packaging_intelligence — scout/phase7-packaging-intelligence.js:289-292
-- (category-level summary; script already tolerates this table being
-- absent, but included for completeness) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS dovive_packaging_intelligence (
  id bigint generated always as identity primary key,
  keyword text UNIQUE NOT NULL,
  intelligence jsonb,
  generated_at timestamptz DEFAULT now(),
  products_analyzed integer
);

-- ─── dovive_scout_config — scout/keepa-phase2.js:71, scout/phase0-market-opportunity.js:189,
-- scout/scout-agent.js:131 (simple key/value lookup, e.g. keepa_api_key) ───
-- NOTE: this table starts EMPTY. The Keepa API key that used to live here
-- was in the now-dead project and is NOT recoverable from this repo — it
-- must be re-entered manually, e.g.:
--   insert into dovive_scout_config (config_key, config_value)
--   values ('keepa_api_key', '<paste the real Keepa key here>')
--   on conflict (config_key) do update set config_value = excluded.config_value;
CREATE TABLE IF NOT EXISTS dovive_scout_config (
  id bigint generated always as identity primary key,
  config_key text UNIQUE NOT NULL,
  config_value text,
  updated_at timestamptz DEFAULT now()
);

-- ─── dovive_market_opportunities — scout/phase0-market-opportunity.js
-- saveOpportunitiesToSupabase() (added 2026-08-27). Previously P0's ranked
-- category scan only ever landed in a local markdown file under
-- scout/output/ — never in Supabase, so the dashboard had no way to see scan
-- history. One row per (scan_date, category_name); re-running the same day's
-- scan upserts (updates scores) rather than duplicating. ────────────────────
CREATE TABLE IF NOT EXISTS dovive_market_opportunities (
  id bigint generated always as identity primary key,
  scan_date date NOT NULL,
  category_name text NOT NULL,
  rank int,
  total_score numeric,
  score_breakdown jsonb, -- {rev, growth, perProd, gap, quality}
  total_products int,
  total_revenue numeric,
  avg_revenue numeric,
  avg_rating numeric,
  avg_price numeric,
  median_bsr int,
  growth_pct numeric,
  rising_count int,
  competition_gap_pct numeric,
  keepa_coverage_pct int,
  rationale text,
  raw_metrics jsonb, -- full computeMetrics()/scoreCategories() object
  created_at timestamptz DEFAULT now(),
  UNIQUE(scan_date, category_name)
);
CREATE INDEX IF NOT EXISTS idx_dovive_market_opp_date ON dovive_market_opportunities(scan_date);
CREATE INDEX IF NOT EXISTS idx_dovive_market_opp_score ON dovive_market_opportunities(total_score DESC);

-- ─── dovive_jobs — scout/scout-agent.js + scout/trigger-scout.js (LEGACY
-- poller queue; NOT the Cloud Run Job queue — that's scout_jobs above. Kept
-- for completeness since scout-agent.js/trigger-scout.js still read
-- process.env.SUPABASE_URL and would 404 without it) ───────────────────────
CREATE TABLE IF NOT EXISTS dovive_jobs (
  id bigint generated always as identity primary key,
  status text DEFAULT 'queued',
  triggered_by text,
  current_keyword text,
  current_product_type text,
  products_scraped integer DEFAULT 0,
  reviews_scraped integer DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── RLS: match the pattern from 001_scout_v2_tables.sql (service-role key
-- bypasses RLS anyway; anon policy is what let the old dashboard's anon key
-- read these directly if it ever needed to) ────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scout_jobs', 'dovive_keywords', 'dovive_research', 'dovive_history',
    'dovive_reviews', 'dovive_keepa', 'dovive_phase5_research', 'dovive_ocr',
    'dovive_packaging_intelligence',
    'dovive_market_opportunities', 'dovive_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_all_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY anon_all_%I ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- dovive_scout_config holds secrets (e.g. the Keepa API key): RLS on, and NO
-- anon policy — only the service-role key (which bypasses RLS) can read it.
-- Safe for a public app: the frontend's anon/publishable key gets nothing.
ALTER TABLE dovive_scout_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_dovive_scout_config ON dovive_scout_config;
