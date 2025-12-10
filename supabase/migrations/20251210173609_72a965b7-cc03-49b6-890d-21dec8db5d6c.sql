-- Create packaging_analyses table for storing AI packaging design analysis results
CREATE TABLE public.packaging_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT packaging_analyses_category_id_unique UNIQUE (category_id)
);

-- Enable RLS
ALTER TABLE public.packaging_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies (same pattern as ingredient_analyses)
CREATE POLICY "Public Read Packaging Analyses" 
ON public.packaging_analyses 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Packaging Analyses" 
ON public.packaging_analyses 
FOR ALL 
USING (true)
WITH CHECK (true);