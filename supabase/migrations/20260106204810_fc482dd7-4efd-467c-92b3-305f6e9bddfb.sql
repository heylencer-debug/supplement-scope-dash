-- Create table for formula prompt history
CREATE TABLE public.formula_prompt_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  formula_version_id UUID REFERENCES public.formula_brief_versions(id) ON DELETE SET NULL,
  prompt_id TEXT NOT NULL,
  prompt_title TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  response_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_formula_prompt_history_category ON public.formula_prompt_history(category_id);
CREATE INDEX idx_formula_prompt_history_created ON public.formula_prompt_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.formula_prompt_history ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (no auth required for this app)
CREATE POLICY "Allow all operations on formula_prompt_history" 
ON public.formula_prompt_history 
FOR ALL 
USING (true) 
WITH CHECK (true);