-- Create basic_constraints table
CREATE TABLE IF NOT EXISTS basic_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    max_consecutive_days INTEGER,
    min_rest_hours INTEGER,
    max_days_per_month INTEGER,
    workers_per_shift INTEGER,
    shift_specific_workers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_basic_constraints_team_id ON basic_constraints(team_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_basic_constraints_updated_at 
    BEFORE UPDATE ON basic_constraints 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
