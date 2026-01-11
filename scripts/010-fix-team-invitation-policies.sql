-- Fix RLS policies for team invitations and user profile creation
-- This script adds the missing policies needed for team member invitations

-- 1. Allow users to create their own profile during signup (modify existing policy)
DROP POLICY IF EXISTS "Users can insert own profile" ON "public"."users";

CREATE POLICY "Users can insert own profile"
ON "public"."users"
FOR INSERT
TO public
WITH CHECK (
  (auth.uid() = id) OR 
  (auth.uid() IS NULL AND id IS NOT NULL) -- Allow during signup when auth.uid() might not be available yet
);

-- 2. Allow team hosts to add members to their teams
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

-- 3. Allow users to view team members of teams they belong to
CREATE POLICY "users_view_team_members"
ON "public"."team_members"
FOR SELECT
TO public
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM "public"."teams" 
    WHERE id = team_id AND host_id = auth.uid()
  )
);

-- 4. Allow team hosts to remove members from their teams
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

-- 5. Allow users to view their own team memberships
CREATE POLICY "users_view_own_memberships"
ON "public"."team_members"
FOR SELECT
TO public
USING (
  user_id = auth.uid()
);

-- 6. Allow users to update their own team member record (e.g., experience level)
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

-- 7. Allow users to view other users' basic info for team management
CREATE POLICY "users_view_team_user_info"
ON "public"."users"
FOR SELECT
TO public
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM "public"."team_members" tm
    JOIN "public"."teams" t ON tm.team_id = t.id
    WHERE tm.user_id = auth.uid() AND t.host_id = users.id
  ) OR
  EXISTS (
    SELECT 1 FROM "public"."team_members" tm
    JOIN "public"."teams" t ON tm.team_id = t.id
    WHERE tm.user_id = users.id AND t.host_id = auth.uid()
  )
);

-- Enable RLS on team_members table if not already enabled
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;

-- Verify the policies were created
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
WHERE tablename IN ('users', 'team_members')
ORDER BY tablename, policyname; 