-- Create activity_log table for tracking user actions
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_activity_log_host_id ON activity_log(host_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_team_id ON activity_log(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at); 