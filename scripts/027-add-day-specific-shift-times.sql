-- Add day-specific time overrides to shifts table
-- This allows shifts to have different hours for different days of the week

-- Add new columns to shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS day_specific_times JSONB DEFAULT '{}';

-- Add comment explaining the JSONB structure
COMMENT ON COLUMN shifts.day_specific_times IS 'JSONB object with day-of-week keys (0=Sunday, 1=Monday, etc.) and time values. Example: {"1": {"start_time": "18:00:00", "end_time": "08:00:00"}, "6": {"start_time": "16:00:00", "end_time": "08:00:00"}}';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_shifts_day_specific_times ON shifts USING GIN (day_specific_times);

-- Update existing shifts to use the new structure
-- For now, we'll keep existing start_time and end_time as defaults
-- Teams can later configure day-specific overrides
