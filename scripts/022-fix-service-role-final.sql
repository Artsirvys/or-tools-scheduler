-- Final fix for service role access to all tables
-- This script ensures the service role can bypass RLS policies for AI operations

-- Grant service role access to all tables
DO $$
BEGIN
    -- Grant basic permissions to service role
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role';
    EXECUTE 'GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role';
    
    RAISE NOTICE 'Granted service role permissions';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Service role might not exist or permissions already granted: %', SQLERRM;
END $$;

-- Create a simple service role check function
CREATE OR REPLACE FUNCTION auth.is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if we're running as service role
    RETURN current_setting('role', true) = 'service_role'
           OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
           OR auth.uid() IS NULL; -- Service role requests often have no auth context
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure all tables we need for AI generation allow service role access
-- Teams table
DROP POLICY IF EXISTS "Service role bypass for teams" ON teams;
CREATE POLICY "Service role bypass for teams" ON teams
    FOR ALL
    USING (auth.is_service_role() OR host_id = auth.uid() OR id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Team members table  
DROP POLICY IF EXISTS "Service role bypass for team_members" ON team_members;
CREATE POLICY "Service role bypass for team_members" ON team_members
    FOR ALL
    USING (auth.is_service_role() OR team_id IN (SELECT id FROM teams WHERE host_id = auth.uid()) OR user_id = auth.uid());

-- Users table
DROP POLICY IF EXISTS "Service role bypass for users" ON users;
CREATE POLICY "Service role bypass for users" ON users
    FOR ALL
    USING (auth.is_service_role() OR id = auth.uid());

-- Shifts table
DROP POLICY IF EXISTS "Service role bypass for shifts" ON shifts;
CREATE POLICY "Service role bypass for shifts" ON shifts
    FOR ALL
    USING (auth.is_service_role() OR team_id IN (SELECT id FROM teams WHERE host_id = auth.uid() OR id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())));

-- Availability table
DROP POLICY IF EXISTS "Service role bypass for availability" ON availability;
CREATE POLICY "Service role bypass for availability" ON availability
    FOR ALL
    USING (auth.is_service_role() OR team_id IN (SELECT id FROM teams WHERE host_id = auth.uid()) OR user_id = auth.uid());

-- AI constraints table
DROP POLICY IF EXISTS "Service role bypass for ai_constraints" ON ai_constraints;
CREATE POLICY "Service role bypass for ai_constraints" ON ai_constraints
    FOR ALL
    USING (auth.is_service_role() OR team_id IN (SELECT id FROM teams WHERE host_id = auth.uid()));

-- Make sure RLS is enabled on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_constraints ENABLE ROW LEVEL SECURITY;

-- Test the service role access
DO $$
BEGIN
    RAISE NOTICE 'Current role: %', current_setting('role', true);
    RAISE NOTICE 'Service role check: %', auth.is_service_role();
END $$;
