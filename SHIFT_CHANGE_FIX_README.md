# Shift Change Request Fix

This document outlines the fixes needed to make the shift change request functionality work properly for participants.

## Issues Identified

1. **Restrictive RLS Policies**: The current RLS policies prevent participants from viewing other team members' shifts
2. **Date Format Mismatch**: Inconsistent date formatting between frontend and database
3. **Missing Service Role Access**: Limited access for service role operations

## Files Modified

### 1. Database RLS Policies (`scripts/024-fix-shift-change-rls.sql`)
- Fixed `schedule_assignments` table policies to allow team members to view each other's assignments
- Fixed `shifts` table policies to allow team members to view team shifts
- Fixed `shift_change_requests` table policies for proper access control
- Added service role bypass policies for all tables

### 2. Frontend Code (`app/participant/shift-change/page.tsx`)
- Improved date handling with multiple format fallbacks
- Simplified shift finding logic using direct joins
- Fixed data access patterns for shift details

### 3. Test Script (`scripts/test-shift-change-fix.sql`)
- Verification script to test the RLS policy fixes

## How to Apply the Fixes

### Step 1: Apply Database Fixes
Run the SQL script in your Supabase database:

```sql
-- Run this in Supabase SQL Editor
\i scripts/024-fix-shift-change-rls.sql
```

### Step 2: Test the Fixes
Run the test script to verify policies work:

```sql
-- Run this in Supabase SQL Editor
\i scripts/test-shift-change-fix.sql
```

### Step 3: Test the Frontend
1. Navigate to `/participant/shift-change`
2. Select a team
3. Choose a shift to change
4. Select a target date
5. Choose a preferred shift
6. Submit the request

## What the Fix Does

### Before (Broken)
- Participants couldn't see other team members' shifts due to restrictive RLS policies
- Date format mismatches caused queries to return no results
- Service role had limited access to tables

### After (Fixed)
- Team members can view each other's assignments for shift change requests
- Multiple date format fallbacks ensure queries work
- Service role has full access for AI operations
- Proper access control maintained for security

## Key Changes Made

1. **RLS Policy Updates**:
   - `schedule_assignments`: Team members can view team assignments
   - `shifts`: Team members can view team shifts
   - `shift_change_requests`: Proper access for request management

2. **Frontend Improvements**:
   - Better date handling with ISO and US format fallbacks
   - Direct joins to get shift details in one query
   - Simplified data processing logic

3. **Service Role Access**:
   - Full access to all tables for AI operations
   - Maintains security for regular users

## Testing the Fix

### Test Case 1: Basic Shift Change Request
1. Login as a participant
2. Go to shift change page
3. Select team and shifts
4. Submit request
5. Verify request is created successfully

### Test Case 2: Finding Other Team Members' Shifts
1. Check console logs for successful assignment queries
2. Verify that other team members' shifts are visible
3. Confirm target user selection works

### Test Case 3: Request Creation
1. Verify shift change request is inserted into database
2. Check that target user receives the request
3. Test accept/decline functionality

## Troubleshooting

### If RLS Policies Still Block Access
1. Check if the SQL script ran successfully
2. Verify RLS is enabled on tables
3. Check user authentication status
4. Review policy conditions

### If Date Queries Still Fail
1. Check browser console for date format logs
2. Verify database date column format
3. Test with different date formats manually

### If Service Role Access Fails
1. Verify `auth.is_service_role()` function exists
2. Check service role permissions in Supabase
3. Review policy conditions for service role bypass

## Security Considerations

- Team members can only see assignments within their teams
- Users can only manage their own shift change requests
- Service role access is properly controlled
- All operations maintain proper access control

## Next Steps

After applying these fixes:
1. Test the shift change request flow end-to-end
2. Monitor console logs for any remaining issues
3. Verify email notifications work properly
4. Test with different team configurations
5. Consider adding more comprehensive error handling

## Support

If issues persist after applying these fixes:
1. Check Supabase logs for database errors
2. Review browser console for frontend errors
3. Verify RLS policies are applied correctly
4. Test with a simple database query to isolate issues
