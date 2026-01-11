-- Simple fix for RLS policies - remove circular dependencies
-- This addresses the infinite recursion errors

-- First, disable RLS temporarily to clear all policies
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "hosts_manage_teams" ON teams;
DROP POLICY IF EXISTS "members_view_teams" ON teams;
DROP POLICY IF EXISTS "public_view_teams" ON teams;
DROP POLICY IF EXISTS "users_view_own_memberships" ON team_members;
DROP POLICY IF EXISTS "hosts_view_team_members" ON team_members;

-- Create simple, non-circular policies for teams
CREATE POLICY "teams_select_all" ON teams
  FOR SELECT USING (true);

CREATE POLICY "teams_insert_hosts" ON teams
  FOR INSERT WITH CHECK (
    host_id = auth.uid()
  );

CREATE POLICY "teams_update_hosts" ON teams
  FOR UPDATE USING (
    host_id = auth.uid()
  );

CREATE POLICY "teams_delete_hosts" ON teams
  FOR DELETE USING (
    host_id = auth.uid()
  );

-- Create simple, non-circular policies for team_members
CREATE POLICY "team_members_select_all" ON team_members
  FOR SELECT USING (true);

CREATE POLICY "team_members_insert_hosts" ON team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams 
      WHERE teams.id = team_members.team_id 
      AND teams.host_id = auth.uid()
    )
  );

CREATE POLICY "team_members_update_hosts" ON team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams 
      WHERE teams.id = team_members.team_id 
      AND teams.host_id = auth.uid()
    )
  );

CREATE POLICY "team_members_delete_hosts" ON team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams 
      WHERE teams.id = team_members.team_id 
      AND teams.host_id = auth.uid()
    )
  );

-- Re-enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY; 