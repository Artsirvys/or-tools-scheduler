-- Complete cleanup and fix for schedules RLS policies
-- This script removes ALL existing policies and creates clean new ones

-- First, let's see what policies currently exist
-- (This is just for reference - we'll drop them all)

-- Drop ALL existing policies for schedules table
DROP POLICY IF EXISTS "Team hosts can manage schedules" ON schedules;
DROP POLICY IF EXISTS "Team members can view schedules" ON schedules;
DROP POLICY IF EXISTS "Service role and hosts can manage schedules" ON schedules;
DROP POLICY IF EXISTS "Service role bypass for schedules" ON schedules;
DROP POLICY IF EXISTS "Allow service role and hosts for schedules" ON schedules;
DROP POLICY IF EXISTS "member_view_schedules" ON schedules;
DROP POLICY IF EXISTS "host_schedules_select" ON schedules;
DROP POLICY IF EXISTS "host_schedules_insert" ON schedules;
DROP POLICY IF EXISTS "host_schedules_update" ON schedules;
DROP POLICY IF EXISTS "host_schedules_delete" ON schedules;

-- Drop ALL existing policies for schedule_assignments table
DROP POLICY IF EXISTS "Team hosts can manage assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Service role and hosts can manage assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Service role bypass for schedule_assignments" ON schedules;
DROP POLICY IF EXISTS "Allow service role and hosts for schedule_assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "host_schedule_assignments_select" ON schedule_assignments;
DROP POLICY IF EXISTS "participant_schedule_assignments_select" ON schedule_assignments;
DROP POLICY IF EXISTS "host_schedule_assignments_insert" ON schedule_assignments;
DROP POLICY IF EXISTS "host_schedule_assignments_update" ON schedule_assignments;
DROP POLICY IF EXISTS "host_schedule_assignments_delete" ON schedule_assignments;

-- Now create clean, simple policies for schedules table
CREATE POLICY "schedules_service_role_and_hosts" ON schedules
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

-- Create clean, simple policies for schedule_assignments table
CREATE POLICY "schedule_assignments_service_role_and_hosts" ON schedule_assignments
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

-- Grant necessary permissions to the service role
DO $$
BEGIN
    -- Grant usage on schema
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
    
    -- Grant all privileges on schedules table
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE schedules TO service_role';
    
    -- Grant all privileges on schedule_assignments table
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE schedule_assignments TO service_role';
    
    -- Grant usage on sequences
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role';
    
EXCEPTION
    WHEN OTHERS THEN
        -- If service_role doesn't exist, that's okay - it might be created automatically
        NULL;
END $$;
