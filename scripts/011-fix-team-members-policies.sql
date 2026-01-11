-- Fix team_members RLS policies to resolve circular dependencies and bugs
-- This script replaces the problematic policies with simpler, non-circular ones

-- First, drop all existing team_members policies
DROP POLICY IF EXISTS "Team hosts can manage members" ON "public"."team_members";
DROP POLICY IF EXISTS "Team members can view own memberships" ON "public"."team_members";
DROP POLICY IF EXISTS "host_team_members_delete" ON "public"."team_members";
DROP POLICY IF EXISTS "host_team_members_insert" ON "public"."team_members";
DROP POLICY IF EXISTS "host_team_members_select" ON "public"."team_members";
DROP POLICY IF EXISTS "participant_team_members_select" ON "public"."team_members";

-- Create new, simplified policies that avoid circular dependencies

-- 1. Allow team hosts to add members to their teams (simplified)
CREATE POLICY "hosts_add_team_members"
ON "public"."team_members"
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
);

-- 2. Allow team hosts to remove members from their teams
CREATE POLICY "hosts_remove_team_members"
ON "public"."team_members"
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
);

-- 3. Allow users to view their own team memberships
CREATE POLICY "users_view_own_memberships"
ON "public"."team_members"
FOR SELECT
TO public
USING (
  user_id = auth.uid()
);

-- 4. Allow team hosts to view members of their teams
CREATE POLICY "hosts_view_team_members"
ON "public"."team_members"
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
);

-- 5. Allow users to update their own team member record (e.g., experience level)
CREATE POLICY "users_update_own_membership"
ON "public"."team_members"
FOR UPDATE
TO public
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

-- 6. Allow team hosts to update member records in their teams
CREATE POLICY "hosts_update_team_members"
ON "public"."team_members"
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
);

-- Enable RLS on team_members table
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;

-- Verify the new policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'team_members'
ORDER BY policyname; 