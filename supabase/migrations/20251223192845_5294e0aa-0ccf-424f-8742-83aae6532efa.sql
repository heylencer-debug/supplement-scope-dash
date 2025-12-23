-- Create table to store pending/completed formula generation tasks
CREATE TABLE public.formula_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  request_payload JSONB NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient polling queries
CREATE INDEX idx_formula_generation_tasks_status ON public.formula_generation_tasks(id, status);
CREATE INDEX idx_formula_generation_tasks_created ON public.formula_generation_tasks(created_at);

-- Enable RLS
ALTER TABLE public.formula_generation_tasks ENABLE ROW LEVEL SECURITY;

-- Public read access (for polling)
CREATE POLICY "Public Read Generation Tasks"
  ON public.formula_generation_tasks
  FOR SELECT
  USING (true);

-- Service role full access
CREATE POLICY "Service Role Full Access Generation Tasks"
  ON public.formula_generation_tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow anon insert (to create tasks from client)
CREATE POLICY "Allow anon insert generation tasks"
  ON public.formula_generation_tasks
  FOR INSERT
  WITH CHECK (true);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_formula_generation_tasks_updated_at
  BEFORE UPDATE ON public.formula_generation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add table to realtime for live status updates (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.formula_generation_tasks;