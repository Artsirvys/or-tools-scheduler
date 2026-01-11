e---- Fix RLS policies to allow service role to bypass them
-- This script adds policies that allow the service role to access data

-- Update AI constraints policies to allow service role
DROP POLICY IF EXISTS "Hosts can view AI constraints for their teams" ON ai_constraints;
CREATE POLICY "Hosts can view AI constraints for their teams" ON ai_constraints
    FOR SELECT
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS "Hosts can insert AI constraints for their teams" ON ai_constraints;
CREATE POLICY "Hosts can insert AI constraints for their teams" ON ai_constraints
    FOR INSERT
    WITH CHECK (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS "Hosts can update AI constraints for their teams" ON ai_constraints;
CREATE POLICY "Hosts can update AI constraints for their teams" ON ai_constraints
    FOR UPDATE
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    )
    WITH CHECK (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS "Hosts can delete AI constraints for their teams" ON ai_constraints;
CREATE POLICY "Hosts can delete AI constraints for their teams" ON ai_constraints
    FOR DELETE
    USING (
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );

-- Update schedules policies to allow service role
DROP POLICY IF EXISTS "Team hosts can manage schedules" ON schedules;
CREATE POLICY "Team hosts can manage schedules" ON schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );

-- Update schedule assignments policies to allow service role
DROP POLICY IF EXISTS "Team hosts can manage assignments" ON schedule_assignments;
CREATE POLICY "Team hosts can manage assignments" ON schedule_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
        OR 
        current_setting('role') = 'service_role'
    );
