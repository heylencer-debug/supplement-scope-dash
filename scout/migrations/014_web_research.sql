-- 014_web_research.sql
-- Target project: jwkitkfufigldpldqtbq.
--
-- NOT APPLIED. Written 2026-09-27 with P5b category web research
-- (scout/phase5b-web-research.js, scout/utils/web-research.js,
-- scout/utils/source-classify.js, scout/utils/cert-registry-web.js).
-- Apply the same way as 007 / 012 (supabase db query --linked --file ...).
-- Additive: one new table, nothing existing touched. Until it is applied,
-- P5b's pre-flight read fails, it logs "migration 014 not applied" and stops
-- BEFORE any search, page fetch or model call (exit 0); P7 / P9 and the
-- dashboard's Web evidence card fall back to their previous behaviour.
--
-- One row per keyword (session label, e.g. "hydration powder #2"). P5b
-- upserts on keyword, so a re-run replaces the previous research.

CREATE TABLE IF NOT EXISTS dovive_web_research (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword         TEXT NOT NULL,
  category_id     UUID,
  -- Coverage: queries_planned/run/failed, sources_found, sources_skipped
  -- (by reason), fetched, fetch_failed, robots_disallowed, classified,
  -- extracted, extraction_batches, items_kept, items_dropped_unquoted,
  -- duplicates_removed, copied_marketing_quotes, by_page_type, by_ownership,
  -- cost_usd {search, extraction, total}, estimate, competitor_source.
  ledger          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Every unique URL found: title, snippet, found_by (query ids), fetch
  -- status, page_type (+ evidence), ownership (+ matched markers),
  -- duplicate_of / duplicate_kind / similarity, extraction (verbatim-quoted
  -- items), a 600-char excerpt. No full page text is stored.
  sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The executed search plan with its results, searched_at /
  -- last_attempt_at / failed_attempts per query (resume: a success inside
  -- P5B_FRESH_DAYS is reused; twice-failed waits P5B_RETRY_AFTER_DAYS).
  -- sources[] carry extracted_at / extraction_failed_attempts likewise.
  search_runs     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ingredient_claims / comparison_criteria / strengths / weaknesses: label,
  -- independent_sources, brand_owned_sources, affiliate_sources,
  -- sponsored_sources, unknown_sources, total_sources (distinct websites),
  -- duplicate_sources_excluded, copied_marketing_excluded, products,
  -- quotes[{url, domain, ownership, quote}]; plus pricing and
  -- products_discussed.
  rollup          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Claim checks: kind (registry | literature), registry / ingredient,
  -- lookup or PubMed URLs, status supported | not_found | not_checked |
  -- registry_unavailable, evidence_url. 'supported' only after a fetched hit
  -- (P5B_VERIFY=1); a registry page that did not return its listing format
  -- is 'registry_unavailable', never 'not_found'.
  verification    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'complete'
                  CHECK (status IN ('complete', 'partial', 'no_model')),
  model           TEXT,
  prompt_version  TEXT,
  cost_usd        NUMERIC(12, 6),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dovive_web_research_keyword ON dovive_web_research (keyword);
CREATE INDEX IF NOT EXISTS dovive_web_research_category ON dovive_web_research (category_id);

ALTER TABLE dovive_web_research ENABLE ROW LEVEL SECURITY;

-- Same shape as 007 / 012: the pipeline writes with the service role
-- (bypasses RLS); the dashboard reads with anon.
DO $$ BEGIN
  CREATE POLICY "dovive_web_research_anon_select" ON dovive_web_research FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
