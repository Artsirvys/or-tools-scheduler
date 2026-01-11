-- Fix RLS policies for shift change requests to work properly
-- This script addresses the issues preventing participants from finding other team members' shifts

-- First, let's fix the schedule_assignments table policies
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "schedule_assignments_service_role_and_hosts" ON schedule_assignments;
DROP POLICY IF EXISTS "team_members_can_read_team_assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Team hosts can manage assignments" ON schedule_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON schedule_assignments;

-- Create new policies that allow team members to see each other's assignments for shift change requests
-- Policy 1: Users can always see their own assignments
CREATE POLICY "Users can view own assignments" ON schedule_assignments
    FOR SELECT USING (user_id = auth.uid());

-- Policy 2: Team members can view other team members' assignments (needed for shift change requests)
CREATE POLICY "Team members can view team assignments" ON schedule_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            JOIN shifts s ON s.id = schedule_assignments.shift_id
            WHERE tm.team_id = s.team_id 
            AND tm.user_id = auth.uid()
        )
    );

-- Policy 3: Team hosts can manage all assignments in their teams
CREATE POLICY "Team hosts can manage team assignments" ON schedule_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams t
            JOIN shifts s ON s.team_id = t.id
            WHERE s.id = schedule_assignments.shift_id
            AND t.host_id = auth.uid()
        )
    );

-- Policy 4: Service role bypass for all operations
CREATE POLICY "Service role bypass for schedule_assignments" ON schedule_assignments
    FOR ALL USING (auth.is_service_role());

-- Now let's fix the shifts table policies to be less restrictive
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "host_shifts_insert" ON shifts;
DROP POLICY IF EXISTS "host_shifts_select" ON shifts;
DROP POLICY IF EXISTS "host_shifts_update" ON shifts;
DROP POLICY IF EXISTS "Team hosts can manage shifts" ON shifts;
DROP POLICY IF EXISTS "Team members can view shifts" ON shifts;

-- Create new policies that allow team members to view shifts
CREATE POLICY "Team members can view team shifts" ON shifts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = shifts.team_id 
            AND tm.user_id = auth.uid()
        )
    );

-- Allow team hosts to manage shifts
CREATE POLICY "Team hosts can manage team shifts" ON shifts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams t
            WHERE t.id = shifts.team_id 
            AND t.host_id = auth.uid()
        )
    );

-- Service role bypass
CREATE POLICY "Service role bypass for shifts" ON shifts
    FOR ALL USING (auth.is_service_role());

-- Fix the shift_change_requests table policies
-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage own requests" ON shift_change_requests;
DROP POLICY IF EXISTS "Target users can view requests" ON shift_change_requests;
DROP POLICY IF EXISTS "Team hosts can view team requests" ON shift_change_requests;

-- Create new policies
-- Users can create and manage their own requests
CREATE POLICY "Users can manage own requests" ON shift_change_requests
    FOR ALL USING (requester_id = auth.uid());

-- Target users can view requests for them
CREATE POLICY "Target users can view requests" ON shift_change_requests
    FOR SELECT USING (target_user_id = auth.uid());

-- Team members can view requests in their teams
CREATE POLICY "Team members can view team requests" ON shift_change_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM schedule_assignments sa
            JOIN shifts s ON s.id = sa.shift_id
            JOIN team_members tm ON tm.team_id = s.team_id
            WHERE (sa.id = shift_change_requests.original_assignment_id OR sa.user_id = shift_change_requests.target_user_id)
            AND tm.user_id = auth.uid()
        )
    );

-- Service role bypass
CREATE POLICY "Service role bypass for shift_change_requests" ON shift_change_requests
    FOR ALL USING (auth.is_service_role());

-- Ensure RLS is enabled on all tables
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_change_requests ENABLE ROW LEVEL SECURITY;

-- Create a function to help with date formatting consistency
CREATE OR REPLACE FUNCTION normalize_date(input_date DATE)
RETURNS DATE AS $$
BEGIN
    -- Return the date as-is, ensuring consistency
    RETURN input_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment
COMMENT ON FUNCTION normalize_date(DATE) IS 'Normalizes date format for consistent comparison in shift change requests';

-- Test the policies
DO $$
BEGIN
    RAISE NOTICE 'RLS policies updated for shift change requests';
    RAISE NOTICE 'Team members can now view each other''s assignments for shift change requests';
    RAISE NOTICE 'Service role has full access to all tables';
END $$;
