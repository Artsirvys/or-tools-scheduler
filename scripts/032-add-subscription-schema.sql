-- Add subscription and billing tables for Stripe integration
-- This script adds the necessary tables to support subscription plans and billing

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly_cents INTEGER NOT NULL,
    price_yearly_cents INTEGER,
    stripe_price_id_monthly VARCHAR(255),
    stripe_price_id_yearly VARCHAR(255),
    max_teams INTEGER NOT NULL DEFAULT 1,
    max_members_per_team INTEGER NOT NULL DEFAULT 5,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid')),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create billing_history table for invoices and payments
CREATE TABLE IF NOT EXISTS billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(255) UNIQUE,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50) NOT NULL CHECK (status IN ('paid', 'open', 'void', 'uncollectible')),
    invoice_url TEXT,
    hosted_invoice_url TEXT,
    pdf_url TEXT,
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default subscription plans
INSERT INTO subscription_plans (name, display_name, description, price_monthly_cents, max_teams, max_members_per_team, features) VALUES
('free', 'Free Plan', 'Perfect for small teams getting started', 0, 1, 5, '["Basic scheduling", "Up to 5 team members", "Email support"]'),
('team', 'Team Plan', 'Ideal for growing teams', 600, 1, 25, '["Advanced scheduling", "Up to 25 team members", "Priority support", "Custom constraints"]'),
('department', 'Department Plan', 'Perfect for departments with multiple teams', 2000, 3, 50, '["Multi-team management", "Up to 3 teams", "Up to 50 members per team", "Advanced analytics", "Priority support"]'),
('enterprise', 'Enterprise Plan', 'Custom solutions for large organizations', 0, -1, -1, '["Unlimited teams", "Unlimited members", "Custom integrations", "Dedicated support", "SLA guarantee"]');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_stripe_invoice_id ON billing_history(stripe_invoice_id);

-- Enable RLS on new tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subscription_plans (public read access)
CREATE POLICY "subscription_plans_select_all" ON subscription_plans
    FOR SELECT USING (is_active = true);

-- Create RLS policies for subscriptions
CREATE POLICY "subscriptions_select_own" ON subscriptions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "subscriptions_insert_own" ON subscriptions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscriptions_update_own" ON subscriptions
    FOR UPDATE USING (user_id = auth.uid());

-- Create RLS policies for billing_history
CREATE POLICY "billing_history_select_own" ON billing_history
    FOR SELECT USING (user_id = auth.uid());

-- Add subscription_id to users table for easier access
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);

-- Add subscription_id to teams table to track which subscription covers each team
ALTER TABLE teams ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);

-- Create function to check subscription limits
CREATE OR REPLACE FUNCTION check_subscription_limits(user_uuid UUID, team_count INTEGER, member_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    user_subscription RECORD;
    plan_details RECORD;
BEGIN
    -- Get user's active subscription
    SELECT s.*, sp.max_teams, sp.max_members_per_team
    INTO user_subscription
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.user_id = user_uuid 
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- If no subscription, check free plan limits
    IF user_subscription IS NULL THEN
        SELECT max_teams, max_members_per_team
        INTO plan_details
        FROM subscription_plans
        WHERE name = 'free';
        
        RETURN team_count <= plan_details.max_teams AND member_count <= plan_details.max_members_per_team;
    END IF;

    -- Check against subscription limits
    -- -1 means unlimited
    IF user_subscription.max_teams = -1 THEN
        RETURN true; -- Unlimited teams
    END IF;

    IF user_subscription.max_members_per_team = -1 THEN
        RETURN team_count <= user_subscription.max_teams; -- Unlimited members per team
    END IF;

    RETURN team_count <= user_subscription.max_teams AND member_count <= user_subscription.max_members_per_team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
