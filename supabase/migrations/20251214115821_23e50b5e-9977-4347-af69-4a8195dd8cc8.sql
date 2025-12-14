-- Add type column to ingredient_analyses table for dual analysis support
ALTER TABLE ingredient_analyses 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'top_performers' NOT NULL;

-- Drop the existing unique constraint on category_id
ALTER TABLE ingredient_analyses 
DROP CONSTRAINT IF EXISTS ingredient_analyses_category_id_key;

-- Create a new unique constraint that includes type
ALTER TABLE ingredient_analyses 
ADD CONSTRAINT ingredient_analyses_category_type_unique 
UNIQUE (category_id, type);