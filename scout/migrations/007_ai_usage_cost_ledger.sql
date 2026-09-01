-- 007_ai_usage_cost_ledger.sql
-- Target project: jwkitkfufigldpldqtbq (the only live Supabase project — the
-- scout pipeline, the Lovable frontend, and scout_jobs all live here; the
-- "fhfqjcvwcxizbioftvdw" references in older comments/files are stale, see
-- scout/DEPLOY_NOTES.md 2026-09-01 entry).
--
-- APPLIED 2026-09-01 via `supabase db query --linked --file
-- scout/migrations/007_ai_usage_cost_ledger.sql` (CLI subcommand that runs
-- SQL directly against the linked project's DB via the Management API —
-- no migration-history bookkeeping involved, unlike `supabase db push`,
-- which was tried first and correctly refused: `--dry-run` hit
-- LegacyDbPushMissingLocalError because the remote migration history has
-- 26 versions this repo's supabase/migrations/ doesn't know about, Lovable
-- applies migrations directly out of band from the CLI's tracking table).
-- Verified live: ai_usage_log table + all 5 new scout_jobs columns +
-- categories.is_test all present, PostgREST already serving them (no
-- schema-cache reload needed). See DEPLOY_NOTES.md for the full trace.
--
-- Everything below is additive (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS) — no existing table or column is touched.

-- ─── ai_usage_log — one row per AI call, real token usage + computed cost ──
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_job_id      UUID,
  category_id       UUID,
  keyword           TEXT,
  phase             TEXT NOT NULL,          -- e.g. 'P8', 'P9', 'chat'
  model             TEXT NOT NULL,
  calls             INT NOT NULL DEFAULT 1,
  prompt_tokens     BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  reasoning_tokens  BIGINT,
  cached_tokens     BIGINT,
  cost_usd          NUMERIC(12, 6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_scout_job_id ON ai_usage_log (scout_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_category_id  ON ai_usage_log (category_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at   ON ai_usage_log (created_at);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Same anon-read policy shape as the rest of the dashboard tables (service
-- role, used by the pipeline + edge functions, bypasses RLS entirely; anon
-- gets read-only so the frontend cost cards can query directly).
DO $$ BEGIN
  CREATE POLICY "ai_usage_log_anon_select" ON ai_usage_log FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── scout_jobs — cost roll-up + cheap/test-run flags ──────────────────────
ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS total_cost_usd        NUMERIC(12, 6);
ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS total_prompt_tokens   BIGINT;
ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS total_completion_tokens BIGINT;
ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS cheap_mode            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS is_test               BOOLEAN NOT NULL DEFAULT false;

-- ─── categories — surface the "TEST" chip in the Library without a join ────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
