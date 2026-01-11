-- Fix RLS policies to allow team members to read their team details
-- This addresses the PGRST116 error and empty team data issues

-- Drop existing teams policies that might be too restrictive
DROP POLICY IF EXISTS "hosts_manage_teams" ON teams;
DROP POLICY IF EXISTS "members_view_teams" ON teams;
DROP POLICY IF EXISTS "users_view_teams" ON teams;

-- Create new policies that allow proper access
-- 1. Hosts can manage their own teams
CREATE POLICY "hosts_manage_teams" ON teams
  FOR ALL USING (
    host_id = auth.uid()
  );

-- 2. Team members can view their team details
CREATE POLICY "members_view_teams" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_id = teams.id 
      AND user_id = auth.uid()
    )
  );

-- 3. Anyone can view teams (for public info)
CREATE POLICY "public_view_teams" ON teams
  FOR SELECT USING (true);

-- Ensure RLS is enabled
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Also fix team_members policies to ensure participants can read their memberships
DROP POLICY IF EXISTS "users_view_own_memberships" ON team_members;
DROP POLICY IF EXISTS "hosts_view_team_members" ON team_members;

-- Recreate team_members policies
CREATE POLICY "users_view_own_memberships" ON team_members
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "hosts_view_team_members" ON team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams 
      WHERE teams.id = team_members.team_id 
      AND teams.host_id = auth.uid()
    )
  );

-- Ensure RLS is enabled on team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY; 