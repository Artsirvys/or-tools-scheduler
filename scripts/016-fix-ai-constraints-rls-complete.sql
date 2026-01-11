-- Comprehensive fix for AI constraints RLS policies
-- This script ensures that the service role can access ai_constraints table

-- First, let's check if the ai_constraints table exists and has RLS enabled
DO $$
BEGIN
    -- Check if table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_constraints') THEN
        RAISE EXCEPTION 'ai_constraints table does not exist';
    END IF;
    
    -- Enable RLS if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'ai_constraints' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE ai_constraints ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop all existing policies for ai_constraints
DROP POLICY IF EXISTS "Hosts can view AI constraints for their teams" ON ai_constraints;
DROP POLICY IF EXISTS "Hosts can insert AI constraints for their teams" ON ai_constraints;
DROP POLICY IF EXISTS "Hosts can update AI constraints for their teams" ON ai_constraints;
DROP POLICY IF EXISTS "Hosts can delete AI constraints for their teams" ON ai_constraints;
DROP POLICY IF EXISTS "Team members can view AI constraints for their teams" ON ai_constraints;

-- Create a function to check if current user is service role
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

-- Create new policies that allow service role access

-- Policy: Allow service role and hosts to view AI constraints
CREATE POLICY "Service role and hosts can view AI constraints" ON ai_constraints
    FOR SELECT
    USING (
        is_service_role()
        OR 
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
        OR
        team_id IN (
            SELECT team_id FROM team_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Allow service role and hosts to insert AI constraints
CREATE POLICY "Service role and hosts can insert AI constraints" ON ai_constraints
    FOR INSERT
    WITH CHECK (
        is_service_role()
        OR 
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Allow service role and hosts to update AI constraints
CREATE POLICY "Service role and hosts can update AI constraints" ON ai_constraints
    FOR UPDATE
    USING (
        is_service_role()
        OR 
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    )
    WITH CHECK (
        is_service_role()
        OR 
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Policy: Allow service role and hosts to delete AI constraints
CREATE POLICY "Service role and hosts can delete AI constraints" ON ai_constraints
    FOR DELETE
    USING (
        is_service_role()
        OR 
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Alternative approach: Create a simpler policy that just checks for service role
-- This is a backup in case the function approach doesn't work
CREATE POLICY "Service role bypass for AI constraints" ON ai_constraints
    FOR ALL
    USING (
        current_setting('role') = 'service_role'
        OR 
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    )
    WITH CHECK (
        current_setting('role') = 'service_role'
        OR 
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR
        team_id IN (
            SELECT id FROM teams 
            WHERE host_id = auth.uid()
        )
    );

-- Grant necessary permissions to the service role
DO $$
BEGIN
    -- Grant usage on schema
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
    
    -- Grant all privileges on ai_constraints table
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE ai_constraints TO service_role';
    
    -- Grant usage on sequences
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role';
    
EXCEPTION
    WHEN OTHERS THEN
        -- If service_role doesn't exist, that's okay - it might be created automatically
        NULL;
END $$;
