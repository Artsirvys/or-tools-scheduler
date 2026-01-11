-- Quick fix for schedules RLS policies
-- This script fixes the RLS policies for schedules and schedule_assignments tables

-- Drop existing policies for schedules
DROP POLICY IF EXISTS "Team hosts can manage schedules" ON schedules;
DROP POLICY IF EXISTS "Team members can view schedules" ON schedules;

-- Drop existing policies for schedule_assignments
DROP POLICY IF EXISTS "Team hosts can manage assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON schedule_assignments;

-- Create simple policies that allow service role for schedules
CREATE POLICY "Allow service role and hosts for schedules" ON schedules
    FOR ALL
    USING (
        current_setting('role') = 'service_role'
        OR 
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    )
    WITH CHECK (
        current_setting('role') = 'service_role'
        OR 
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    );

-- Create simple policies that allow service role for schedule_assignments
CREATE POLICY "Allow service role and hosts for schedule_assignments" ON schedule_assignments
    FOR ALL
    USING (
        current_setting('role') = 'service_role'
        OR 
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    )
    WITH CHECK (
        current_setting('role') = 'service_role'
        OR 
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    );
