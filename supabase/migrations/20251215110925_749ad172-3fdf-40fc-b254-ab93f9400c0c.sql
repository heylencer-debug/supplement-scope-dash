-- Add image_analysis field to packaging_analyses table for storing AI visual analysis results
ALTER TABLE public.packaging_analyses 
ADD COLUMN IF NOT EXISTS image_analysis jsonb DEFAULT NULL;