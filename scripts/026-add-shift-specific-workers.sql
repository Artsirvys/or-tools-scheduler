-- Add shift-specific worker column to ai_constraints table
-- This allows teams to set different worker requirements for different shift types

ALTER TABLE ai_constraints 
ADD COLUMN IF NOT EXISTS shift_specific_workers JSONB DEFAULT '{}';

-- Add comment to explain the new column
COMMENT ON COLUMN ai_constraints.shift_specific_workers IS 'JSON object mapping shift IDs to required number of workers. Format: {"shift_id": workers_needed}. If empty, uses workers_per_shift.';

-- Update existing records to have empty JSON object
UPDATE ai_constraints 
SET shift_specific_workers = '{}'
WHERE shift_specific_workers IS NULL;
