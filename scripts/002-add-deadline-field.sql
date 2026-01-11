-- Add deadline field to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS availability_deadline TIMESTAMP WITH TIME ZONE; 