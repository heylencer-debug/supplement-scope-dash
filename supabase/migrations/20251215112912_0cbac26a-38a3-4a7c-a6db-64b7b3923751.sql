-- Add packaging_image_analysis column to products table for per-product AI analysis storage
ALTER TABLE products ADD COLUMN IF NOT EXISTS packaging_image_analysis jsonb DEFAULT NULL;