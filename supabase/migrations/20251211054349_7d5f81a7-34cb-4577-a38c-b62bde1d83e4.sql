-- Create table for caching competitive analysis results
CREATE TABLE public.competitive_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE REFERENCES public.categories(id) ON DELETE CASCADE,
  analysis jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitive_analyses ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public Read Competitive Analyses"
ON public.competitive_analyses
FOR SELECT
USING (true);

-- Service role full access
CREATE POLICY "Service Role Full Access Competitive Analyses"
ON public.competitive_analyses
FOR ALL
USING (true)
WITH CHECK (true);