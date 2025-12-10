-- Create a new table specifically for AI ingredient analysis results
-- This does NOT modify any existing tables or data

CREATE TABLE public.ingredient_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category_id)
);

-- Enable RLS
ALTER TABLE public.ingredient_analyses ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public Read Ingredient Analyses"
ON public.ingredient_analyses
FOR SELECT
USING (true);

-- Service role full access
CREATE POLICY "Service Role Full Access Ingredient Analyses"
ON public.ingredient_analyses
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger to update updated_at
CREATE TRIGGER update_ingredient_analyses_updated_at
BEFORE UPDATE ON public.ingredient_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();