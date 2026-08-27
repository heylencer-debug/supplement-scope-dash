-- 003_scout_jobs_cloud_run.sql
-- Run this manually in the Dovive Supabase SQL editor (project fhfqjcvwcxizbioftvdw).
-- Service-role DML works from scripts, but DDL (CREATE TABLE) must go through
-- the dashboard SQL editor — see project_dovive.md / scout_memory.md.
--
-- Purpose: queue table that drives the Cloud Run Job worker (scout/cloud-worker.js).
-- The Lovable "New Analysis" flow (or any caller) INSERTs a 'queued' row here;
-- the trigger-scout-job edge function fires a Cloud Run Job execution;
-- cloud-worker.js claims the row atomically, runs run-pipeline.js, and writes
-- progress back to current_phase/total_phases so the dashboard can show
-- "Phase X/12" while it runs.

CREATE TABLE IF NOT EXISTS scout_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | claimed | running | complete | error
  force BOOLEAN NOT NULL DEFAULT false,
  from_phase INT,               -- optional: resume from a specific phase
  only_phases TEXT,             -- optional: comma list e.g. "9,10,11,12"
  use_ai BOOLEAN NOT NULL DEFAULT false,
  current_phase INT,
  current_phase_name TEXT,
  total_phases INT DEFAULT 12,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  cloud_run_execution TEXT,     -- set by trigger-scout-job edge function for traceability
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_jobs_status ON scout_jobs(status, created_at);

-- Atomic claim: the worker calls this instead of a plain SELECT+UPDATE to avoid
-- two containers claiming the same row (Cloud Run can double-fire on retry).
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
