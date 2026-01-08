ALTER TABLE packaging_analyses
ADD COLUMN IF NOT EXISTS customizations jsonb DEFAULT NULL;