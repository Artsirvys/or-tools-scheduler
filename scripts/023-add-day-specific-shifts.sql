-- Add day-specific shift configurations
-- This allows teams to have different shift hours for different days of the week

-- Add day_of_week column to shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

-- Add comment to explain the day_of_week values
COMMENT ON COLUMN shifts.day_of_week IS 'Day of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, NULL=applies to all days';

-- Create index for better performance when querying by day
CREATE INDEX IF NOT EXISTS idx_shifts_day_of_week ON shifts(day_of_week);

-- Update existing shifts to apply to all days (NULL means applies to all days)
UPDATE shifts SET day_of_week = NULL WHERE day_of_week IS NULL;
