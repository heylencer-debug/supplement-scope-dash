-- Manufacturer Chat Agent
-- Turns the one-shot manufacturer_feedback flow into a real running thread
-- per category. The agent sees the FULL document corpus for the category
-- (formula brief, QA report, P11 benchmarking, P12 compliance, P13 sign-off,
-- market intelligence) and can carry a conversation. When it proposes a
-- formula change it never applies it silently — it emits a structured
-- change_card that a human must approve before the manufacturer-chat edge
-- function creates a new formula_brief_versions row (the SAME version
-- mechanism process-manufacturer-feedback already uses — this table never
-- writes to formula_briefs directly and never touches
-- formula_briefs.ingredients.final_signoff).
--
-- This is 100% additive — does not touch manufacturer_feedback,
-- formula_brief_versions, formula_briefs, or any existing table/column.
--
-- Apply via the Supabase management API / SQL editor (service role required
-- for DDL — this file is NOT auto-applied by the app). See the coordinator's
-- report for the exact curl.

CREATE TABLE IF NOT EXISTS manufacturer_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  session_token text,
  role text NOT NULL CHECK (role IN ('user', 'manufacturer', 'agent')),
  content text,
  change_card jsonb,
  card_status text CHECK (card_status IN ('proposed', 'approved', 'rejected', 'applied')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manufacturer_chat_messages_category_created
  ON manufacturer_chat_messages (category_id, created_at);

-- ─── RLS: same anon-policy style as migration 004_consolidated_cloud.sql's
-- FOREACH block. Deliberately anon SELECT + INSERT only (no anon UPDATE) —
-- card_status transitions (proposed → approved/rejected/applied) and the
-- resulting formula_brief_versions writes are done exclusively by the
-- manufacturer-chat edge function under its service-role key, which bypasses
-- RLS entirely. This keeps the anon/publishable key from being able to
-- self-approve a change card or edit another party's message content. ───────
ALTER TABLE manufacturer_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_select_manufacturer_chat_messages ON manufacturer_chat_messages;
CREATE POLICY anon_select_manufacturer_chat_messages
  ON manufacturer_chat_messages FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_insert_manufacturer_chat_messages ON manufacturer_chat_messages;
CREATE POLICY anon_insert_manufacturer_chat_messages
  ON manufacturer_chat_messages FOR INSERT TO anon WITH CHECK (true);
