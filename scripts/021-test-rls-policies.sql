-- Test script to verify RLS policies are working correctly
-- Run this in Supabase SQL Editor to check if service role can access tables

-- Test 1: Check if service role can access schedules table
DO $$
BEGIN
    -- Set role to service_role for testing
    SET ROLE service_role;
    
    -- Try to select from schedules
    BEGIN
        PERFORM 1 FROM schedules LIMIT 1;
        RAISE NOTICE 'SUCCESS: Service role can SELECT from schedules table';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'ERROR: Service role cannot SELECT from schedules table: %', SQLERRM;
    END;
    
    -- Try to insert into schedules (this will fail if no data, but should not be RLS error)
    BEGIN
        -- This will fail due to constraints, but should not be RLS error
        INSERT INTO schedules (team_id, month, year, generated_by) 
        VALUES ('00000000-0000-0000-0000-000000000000', 1, 2024, '00000000-0000-0000-0000-000000000000');
        RAISE NOTICE 'SUCCESS: Service role can INSERT into schedules table';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'SUCCESS: Service role can INSERT into schedules table (foreign key error expected)';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%row-level security%' OR SQLERRM LIKE '%RLS%' THEN
                RAISE NOTICE 'ERROR: Service role cannot INSERT into schedules table due to RLS: %', SQLERRM;
            ELSE
                RAISE NOTICE 'SUCCESS: Service role can INSERT into schedules table (other error expected): %', SQLERRM;
            END IF;
    END;
    
    -- Test 2: Check if service role can access schedule_assignments table
    BEGIN
        PERFORM 1 FROM schedule_assignments LIMIT 1;
        RAISE NOTICE 'SUCCESS: Service role can SELECT from schedule_assignments table';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'ERROR: Service role cannot SELECT from schedule_assignments table: %', SQLERRM;
    END;
    
    -- Reset role
    RESET ROLE;
    
    RAISE NOTICE 'RLS test completed';
END $$;
