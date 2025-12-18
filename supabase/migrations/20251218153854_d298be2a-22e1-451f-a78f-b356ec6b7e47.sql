-- Add formula_version_id to analysis tables to support version-based analysis management
ALTER TABLE ingredient_analyses 
ADD COLUMN formula_version_id UUID REFERENCES formula_brief_versions(id);

ALTER TABLE packaging_analyses 
ADD COLUMN formula_version_id UUID REFERENCES formula_brief_versions(id);

ALTER TABLE competitive_analyses 
ADD COLUMN formula_version_id UUID REFERENCES formula_brief_versions(id);

-- Create indexes for efficient queries
CREATE INDEX idx_ingredient_analyses_version ON ingredient_analyses(formula_version_id);
CREATE INDEX idx_packaging_analyses_version ON packaging_analyses(formula_version_id);
CREATE INDEX idx_competitive_analyses_version ON competitive_analyses(formula_version_id);