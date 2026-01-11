-- Enable RLS on ai_constraints table
ALTER TABLE ai_constraints ENABLE ROW LEVEL SECURITY;

-- Policy: Hosts can view AI constraints for their own teams
CREATE POLICY "Hosts can view AI constraints for their teams" ON ai_constraints
    FOR SELECT
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Hosts can insert AI constraints for their own teams
CREATE POLICY "Hosts can insert AI constraints for their teams" ON ai_constraints
    FOR INSERT
    WITH CHECK (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Hosts can update AI constraints for their own teams
CREATE POLICY "Hosts can update AI constraints for their teams" ON ai_constraints
    FOR UPDATE
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    )
    WITH CHECK (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Hosts can delete AI constraints for their own teams
CREATE POLICY "Hosts can delete AI constraints for their teams" ON ai_constraints
    FOR DELETE
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Team members can view AI constraints for teams they belong to (read-only)
CREATE POLICY "Team members can view AI constraints for their teams" ON ai_constraints
    FOR SELECT
    USING (
        team_id IN (
            SELECT team_id FROM team_members 
            WHERE user_id = auth.uid()
        )
    );
