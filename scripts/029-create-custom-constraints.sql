-- Create custom_constraints table
CREATE TABLE IF NOT EXISTS custom_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    ai_translation JSONB,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_custom_constraints_team_id ON custom_constraints(team_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_custom_constraints_updated_at 
    BEFORE UPDATE ON custom_constraints 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
