-- Drop existing constraint that blocks flat_ prefixed strategy types
ALTER TABLE packaging_mockup_history 
DROP CONSTRAINT IF EXISTS packaging_mockup_history_strategy_type_check;

-- Add new constraint that allows both 3D mockup and flat layout strategy types
ALTER TABLE packaging_mockup_history
ADD CONSTRAINT packaging_mockup_history_strategy_type_check 
CHECK (strategy_type = ANY (ARRAY[
  'match_leaders'::text, 
  'match_disruptors'::text, 
  'flat_match_leaders'::text, 
  'flat_match_disruptors'::text
]));