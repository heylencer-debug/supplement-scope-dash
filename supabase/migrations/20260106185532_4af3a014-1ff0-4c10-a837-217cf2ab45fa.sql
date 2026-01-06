-- Add columns to store original analysis configuration for accurate duplication
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS analysis_type TEXT,
ADD COLUMN IF NOT EXISTS product_forms TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN public.categories.analysis_type IS 'Type of analysis: category or targeted';
COMMENT ON COLUMN public.categories.product_forms IS 'Product forms used for category search (e.g., gummy, powder)';