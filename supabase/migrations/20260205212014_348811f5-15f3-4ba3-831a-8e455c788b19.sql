-- Create formula_fit_analyses table
CREATE TABLE public.formula_fit_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  analysis jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add index for faster lookups by category
CREATE INDEX idx_formula_fit_analyses_category_id ON public.formula_fit_analyses(category_id);

-- Enable RLS
ALTER TABLE public.formula_fit_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public Read Formula Fit Analyses" 
ON public.formula_fit_analyses 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Formula Fit Analyses" 
ON public.formula_fit_analyses 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_formula_fit_analyses_updated_at
BEFORE UPDATE ON public.formula_fit_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();