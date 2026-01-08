-- Add logo_image_url column to categories table
ALTER TABLE public.categories 
ADD COLUMN logo_image_url TEXT;