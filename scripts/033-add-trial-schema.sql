-- Add trial period tracking for 14-day trials
-- This script adds the necessary tables and functions to support trial periods

-- Create trial_periods table to track trial information
CREATE TABLE IF NOT EXISTS trial_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    trial_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    trial_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
    schedule_generations_used INTEGER DEFAULT 0,
    max_schedule_generations INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add trial_id to subscriptions table to link trials with subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_id UUID REFERENCES trial_periods(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_trial_periods_user_id ON trial_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_periods_status ON trial_periods(status);
CREATE INDEX IF NOT EXISTS idx_trial_periods_trial_end ON trial_periods(trial_end);

-- Enable RLS on trial_periods table
ALTER TABLE trial_periods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for trial_periods
CREATE POLICY "trial_periods_select_own" ON trial_periods
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trial_periods_insert_own" ON trial_periods
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trial_periods_update_own" ON trial_periods
    FOR UPDATE USING (user_id = auth.uid());

-- Create function to check if user is in trial period
CREATE OR REPLACE FUNCTION is_user_in_trial(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    trial_record RECORD;
BEGIN
    -- Get user's active trial
    SELECT * INTO trial_record
    FROM trial_periods
    WHERE user_id = user_uuid 
    AND status = 'active'
    AND trial_end > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- Return true if trial exists and is still active
    RETURN trial_record IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get trial information for a user
CREATE OR REPLACE FUNCTION get_user_trial_info(user_uuid UUID)
RETURNS TABLE (
    trial_id UUID,
    plan_id UUID,
    plan_name VARCHAR,
    plan_display_name VARCHAR,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    days_remaining INTEGER,
    schedule_generations_used INTEGER,
    max_schedule_generations INTEGER,
    status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tp.id as trial_id,
        tp.plan_id,
        sp.name as plan_name,
        sp.display_name as plan_display_name,
        tp.trial_start,
        tp.trial_end,
        EXTRACT(DAYS FROM (tp.trial_end - NOW()))::INTEGER as days_remaining,
        tp.schedule_generations_used,
        tp.max_schedule_generations,
        tp.status
    FROM trial_periods tp
    JOIN subscription_plans sp ON tp.plan_id = sp.id
    WHERE tp.user_id = user_uuid 
    AND tp.status = 'active'
    AND tp.trial_end > NOW()
    ORDER BY tp.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to increment trial schedule generation count
CREATE OR REPLACE FUNCTION increment_trial_schedule_generations(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    trial_record RECORD;
BEGIN
    -- Get user's active trial
    SELECT * INTO trial_record
    FROM trial_periods
    WHERE user_id = user_uuid 
    AND status = 'active'
    AND trial_end > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no active trial, return false
    IF trial_record IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user has exceeded generation limit
    IF trial_record.schedule_generations_used >= trial_record.max_schedule_generations THEN
        RETURN false;
    END IF;

    -- Increment the counter
    UPDATE trial_periods 
    SET 
        schedule_generations_used = schedule_generations_used + 1,
        updated_at = NOW()
    WHERE id = trial_record.id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check trial schedule generation limit
CREATE OR REPLACE FUNCTION can_generate_schedule_trial(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    trial_record RECORD;
BEGIN
    -- Get user's active trial
    SELECT * INTO trial_record
    FROM trial_periods
    WHERE user_id = user_uuid 
    AND status = 'active'
    AND trial_end > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no active trial, return false
    IF trial_record IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user has exceeded generation limit
    RETURN trial_record.schedule_generations_used < trial_record.max_schedule_generations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to expire old trials
CREATE OR REPLACE FUNCTION expire_old_trials()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE trial_periods 
    SET 
        status = 'expired',
        updated_at = NOW()
    WHERE status = 'active' 
    AND trial_end <= NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
