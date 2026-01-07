-- Create packaging_mockup_history table to store all generated mockups
CREATE TABLE public.packaging_mockup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  formula_version_id UUID REFERENCES public.formula_brief_versions(id) ON DELETE SET NULL,
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('match_leaders', 'match_disruptors')),
  image_url TEXT NOT NULL,
  packaging_format TEXT,
  design_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_mockup_history_category_strategy ON public.packaging_mockup_history(category_id, strategy_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.packaging_mockup_history ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (no auth in this project)
CREATE POLICY "Allow all access to packaging_mockup_history"
ON public.packaging_mockup_history
FOR ALL
USING (true)
WITH CHECK (true);