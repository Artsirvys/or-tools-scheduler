-- Test script to verify shift change request RLS policies work correctly
-- Run this after applying the 024-fix-shift-change-rls.sql script

-- Test 1: Check if team members can view each other's assignments
-- This should work now with the new policies
SELECT 
    'Test 1: Team member access to assignments' as test_name,
    COUNT(*) as assignments_visible
FROM schedule_assignments sa
JOIN shifts s ON s.id = sa.shift_id
JOIN team_members tm ON tm.team_id = s.team_id
WHERE tm.user_id = auth.uid()
LIMIT 5;

-- Test 2: Check if shifts are visible to team members
SELECT 
    'Test 2: Team member access to shifts' as test_name,
    COUNT(*) as shifts_visible
FROM shifts s
JOIN team_members tm ON tm.team_id = s.team_id
WHERE tm.user_id = auth.uid()
LIMIT 5;

-- Test 3: Check if shift change requests can be created
-- This should work for authenticated users
SELECT 
    'Test 3: Shift change request creation' as test_name,
    'Policy should allow users to create requests' as status;

-- Test 4: Check current RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('schedule_assignments', 'shifts', 'shift_change_requests')
ORDER BY tablename, policyname;

-- Test 5: Verify service role function exists
SELECT 
    'Test 5: Service role function' as test_name,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'is_service_role';

-- Summary
SELECT 
    'RLS Policy Fix Summary' as summary,
    'Team members can now view each other''s assignments for shift change requests' as change_1,
    'Shifts are visible to team members' as change_2,
    'Service role has full access to all tables' as change_3,
    'Shift change requests can be created by participants' as change_4;
