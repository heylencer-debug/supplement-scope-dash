-- Manufacturer Feedback Table
CREATE TABLE IF NOT EXISTS manufacturer_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  feedback_text text,
  image_urls jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'reviewed', 'dismissed')),
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  claude_verdict text CHECK (claude_verdict IN ('accepted', 'partially_accepted', 'questioned', 'rejected')),
  claude_response text,
  claude_changes jsonb DEFAULT '[]',
  resulting_version_id uuid REFERENCES formula_brief_versions(id) ON DELETE SET NULL,
  submitted_by text DEFAULT 'user',
  notes text
);

CREATE INDEX IF NOT EXISTS idx_manufacturer_feedback_category ON manufacturer_feedback(category_id);
CREATE INDEX IF NOT EXISTS idx_manufacturer_feedback_status ON manufacturer_feedback(status);

-- Allow anon read/write (no auth in this app)
ALTER TABLE manufacturer_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all manufacturer_feedback" ON manufacturer_feedback FOR ALL USING (true) WITH CHECK (true);
