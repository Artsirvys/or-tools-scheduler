-- Add max_days_per_month field to ai_constraints table
ALTER TABLE ai_constraints ADD COLUMN IF NOT EXISTS max_days_per_month INTEGER DEFAULT 20;

-- Update existing records to have a default value
UPDATE ai_constraints SET max_days_per_month = 20 WHERE max_days_per_month IS NULL;
