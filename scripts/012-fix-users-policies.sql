-- Fix users table RLS policies to avoid circular dependencies
-- This script simplifies the users policies to prevent recursion

-- Drop existing users policies that might cause circular dependencies
DROP POLICY IF EXISTS "Users can insert own profile" ON "public"."users";
DROP POLICY IF EXISTS "Users can read their own profile" ON "public"."users";
DROP POLICY IF EXISTS "Users can update own profile" ON "public"."users";
DROP POLICY IF EXISTS "Users can view own profile" ON "public"."users";

-- Create new, simplified policies that avoid circular dependencies

-- 1. Allow users to create their own profile (simplified)
CREATE POLICY "users_insert_own_profile"
ON "public"."users"
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = id
);

-- 2. Allow users to read their own profile
CREATE POLICY "users_read_own_profile"
ON "public"."users"
FOR SELECT
TO public
USING (
  auth.uid() = id
);

-- 3. Allow users to update their own profile
CREATE POLICY "users_update_own_profile"
ON "public"."users"
FOR UPDATE
TO public
USING (
  auth.uid() = id
)
WITH CHECK (
  auth.uid() = id
);

-- 4. Allow team hosts to view basic info of their team members
CREATE POLICY "hosts_view_team_user_info"
ON "public"."users"
FOR SELECT
TO public
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM "public"."teams" t
    WHERE t.host_id = auth.uid()
  )
);

-- Enable RLS on users table
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

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
WHERE tablename = 'users'
ORDER BY policyname; 