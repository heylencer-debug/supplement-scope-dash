-- Enable RLS on competitors table
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

-- Enable RLS on category_scores table
ALTER TABLE public.category_scores ENABLE ROW LEVEL SECURITY;

-- Enable RLS on formula_briefs table
ALTER TABLE public.formula_briefs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on nlp_aspects table
ALTER TABLE public.nlp_aspects ENABLE ROW LEVEL SECURITY;

-- Add public read policies for competitors
CREATE POLICY "Public Read Competitors" 
ON public.competitors 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Competitors" 
ON public.competitors 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add public read policies for category_scores
CREATE POLICY "Public Read Category Scores" 
ON public.category_scores 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Category Scores" 
ON public.category_scores 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add public read policies for formula_briefs
CREATE POLICY "Public Read Formula Briefs" 
ON public.formula_briefs 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Formula Briefs" 
ON public.formula_briefs 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add public read policies for nlp_aspects
CREATE POLICY "Public Read NLP Aspects" 
ON public.nlp_aspects 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access NLP Aspects" 
ON public.nlp_aspects 
FOR ALL 
USING (true)
WITH CHECK (true);