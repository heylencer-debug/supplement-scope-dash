-- Add column to store AI-generated product mockup image
ALTER TABLE public.packaging_analyses 
ADD COLUMN IF NOT EXISTS mockup_image_url TEXT;