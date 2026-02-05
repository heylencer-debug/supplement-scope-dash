-- Create market_trend_analyses table
CREATE TABLE public.market_trend_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  product_type TEXT,
  analysis JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX idx_market_trend_analyses_category_id ON public.market_trend_analyses(category_id);
CREATE INDEX idx_market_trend_analyses_status ON public.market_trend_analyses(status);

-- Enable RLS
ALTER TABLE public.market_trend_analyses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Public Read Market Trend Analyses"
ON public.market_trend_analyses
FOR SELECT
USING (true);

CREATE POLICY "Service Role Full Access Market Trend Analyses"
ON public.market_trend_analyses
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_market_trend_analyses_updated_at
BEFORE UPDATE ON public.market_trend_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();