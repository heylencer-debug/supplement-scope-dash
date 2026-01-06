-- Create formula_prompts table to store AI-generated evaluation prompts
CREATE TABLE public.formula_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  formula_version_id UUID REFERENCES public.formula_brief_versions(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('optimization', 'critical')),
  title TEXT NOT NULL,
  short_label TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_formula_prompts_category ON public.formula_prompts(category_id);
CREATE INDEX idx_formula_prompts_version ON public.formula_prompts(formula_version_id);

-- Enable RLS
ALTER TABLE public.formula_prompts ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (no auth in this app)
CREATE POLICY "Allow all operations on formula_prompts"
ON public.formula_prompts
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_formula_prompts_updated_at
  BEFORE UPDATE ON public.formula_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();