-- Add formula_version_id column to formula_conversations
ALTER TABLE formula_conversations 
ADD COLUMN formula_version_id uuid REFERENCES formula_brief_versions(id);

-- Create index for performance
CREATE INDEX idx_formula_conversations_version ON formula_conversations(formula_version_id);