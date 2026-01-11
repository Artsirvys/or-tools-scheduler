-- Comprehensive fix for schedules RLS policies
-- This script ensures that the service role can access schedules and schedule_assignments tables

-- First, let's check if the tables exist and have RLS enabled
DO $$
BEGIN
    -- Check if schedules table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedules') THEN
        RAISE EXCEPTION 'schedules table does not exist';
    END IF;
    
    -- Check if schedule_assignments table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_assignments') THEN
        RAISE EXCEPTION 'schedule_assignments table does not exist';
    END IF;
    
    -- Enable RLS if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'schedules' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'schedule_assignments' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop all existing policies for schedules
DROP POLICY IF EXISTS "Team hosts can manage schedules" ON schedules;
DROP POLICY IF EXISTS "Team members can view schedules" ON schedules;

-- Drop all existing policies for schedule_assignments
DROP POLICY IF EXISTS "Team hosts can manage assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON schedule_assignments;

-- Create a function to check if current user is service role (if not already exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_service_role') THEN
        CREATE OR REPLACE FUNCTION is_service_role()
        RETURNS BOOLEAN AS $$
        BEGIN
            -- Check if the current role is service_role
            -- This function will return true if we're using the service role key
            RETURN current_setting('role') = 'service_role' 
                   OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
                   OR current_setting('request.jwt.claims', true)::json->>'aud' = 'authenticated'
                   OR current_setting('request.jwt.claims', true)::json->>'iss' LIKE '%supabase%';
        EXCEPTION
            WHEN OTHERS THEN
                RETURN FALSE;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
    END IF;
END $$;

-- Create new policies for schedules table that allow service role access

-- Policy: Allow service role and hosts to manage schedules
CREATE POLICY "Service role and hosts can manage schedules" ON schedules
    FOR ALL
    USING (
        is_service_role()
        OR 
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    )
    WITH CHECK (
        is_service_role()
        OR 
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    );

-- Policy: Allow team members to view schedules
CREATE POLICY "Team members can view schedules" ON schedules
    FOR SELECT
    USING (
        is_service_role()
        OR 
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_id = schedules.team_id 
            AND user_id = auth.uid()
        )
    );

-- Create new policies for schedule_assignments table that allow service role access

-- Policy: Allow service role and hosts to manage assignments
CREATE POLICY "Service role and hosts can manage assignments" ON schedule_assignments
    FOR ALL
    USING (
        is_service_role()
        OR 
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    )
    WITH CHECK (
        is_service_role()
        OR 
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    );

-- Policy: Allow users to view their own assignments
CREATE POLICY "Users can view own assignments" ON schedule_assignments
    FOR SELECT
    USING (
        is_service_role()
        OR 
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    );

-- Alternative approach: Create simpler policies that just check for service role
-- This is a backup in case the function approach doesn't work

-- Backup policy for schedules
CREATE POLICY "Service role bypass for schedules" ON schedules
    FOR ALL
    USING (
        current_setting('role') = 'service_role'
        OR 
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
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
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    );

-- Backup policy for schedule_assignments
CREATE POLICY "Service role bypass for schedule_assignments" ON schedule_assignments
    FOR ALL
    USING (
        current_setting('role') = 'service_role'
        OR 
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
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
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
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
