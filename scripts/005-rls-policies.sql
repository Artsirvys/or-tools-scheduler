-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE basic_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_constraints ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Allow users to insert their own profile during signup
CREATE POLICY "Users can insert their own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Allow team hosts to view team member profiles
CREATE POLICY "Team hosts can view member profiles" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE host_id = auth.uid() 
            AND id IN (
                SELECT team_id FROM team_members 
                WHERE user_id = users.id
            )
        )
    );

-- Teams table policies
-- Allow users to create teams
CREATE POLICY "Users can create teams" ON teams
    FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Allow team hosts to view and update their teams
CREATE POLICY "Team hosts can manage their teams" ON teams
    FOR ALL USING (auth.uid() = host_id);

-- Allow team members to view their teams
CREATE POLICY "Team members can view their teams" ON teams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_id = teams.id 
            AND user_id = auth.uid()
        )
    );

-- Team members table policies
-- Allow team hosts to manage team members
CREATE POLICY "Team hosts can manage members" ON team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = team_members.team_id 
            AND host_id = auth.uid()
        )
    );

-- Allow team members to view their own memberships
CREATE POLICY "Team members can view own memberships" ON team_members
    FOR SELECT USING (user_id = auth.uid());

-- Shifts table policies
-- Allow team hosts to manage shifts
CREATE POLICY "Team hosts can manage shifts" ON shifts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = shifts.team_id 
            AND host_id = auth.uid()
        )
    );

-- Allow team members to view their team's shifts
CREATE POLICY "Team members can view shifts" ON shifts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_id = shifts.team_id 
            AND user_id = auth.uid()
        )
    );

-- Availability table policies
-- Allow users to manage their own availability
CREATE POLICY "Users can manage own availability" ON availability
    FOR ALL USING (user_id = auth.uid());

-- Allow team hosts to view team member availability
CREATE POLICY "Team hosts can view member availability" ON availability
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = availability.team_id 
            AND host_id = auth.uid()
        )
    );

-- Schedules table policies
-- Allow team hosts to manage schedules
CREATE POLICY "Team hosts can manage schedules" ON schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE id = schedules.team_id 
            AND host_id = auth.uid()
        )
    );

-- Allow team members to view their team's schedules
CREATE POLICY "Team members can view schedules" ON schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_id = schedules.team_id 
            AND user_id = auth.uid()
        )
    );

-- Schedule assignments table policies
-- Allow team hosts to manage assignments
CREATE POLICY "Team hosts can manage assignments" ON schedule_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN teams t ON s.team_id = t.id
            WHERE s.id = schedule_assignments.schedule_id 
            AND t.host_id = auth.uid()
        )
    );

-- Allow users to view their own assignments
CREATE POLICY "Users can view own assignments" ON schedule_assignments
    FOR SELECT USING (user_id = auth.uid());

-- Shift change requests table policies
-- Allow users to create and manage their own requests
CREATE POLICY "Users can manage own requests" ON shift_change_requests
    FOR ALL USING (requester_id = auth.uid());

-- Allow target users to view requests for them
CREATE POLICY "Target users can view requests" ON shift_change_requests
    FOR SELECT USING (target_user_id = auth.uid());

-- Allow team hosts to view all requests in their teams
CREATE POLICY "Team hosts can view team requests" ON shift_change_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM schedule_assignments sa
            JOIN schedules s ON sa.schedule_id = s.id
            JOIN teams t ON s.team_id = t.id
            WHERE sa.id = shift_change_requests.original_assignment_id
            AND t.host_id = auth.uid()
        )
    );

-- Usage tracking table policies
-- Allow users to view and manage their own usage
CREATE POLICY "Users can manage own usage" ON usage_tracking
    FOR ALL USING (user_id = auth.uid());

-- Basic constraints table policies
-- Service role bypass for basic constraints
CREATE POLICY "Service role bypass for basic constraints" ON basic_constraints
    FOR ALL USING (auth.role() = 'service_role'::text);

-- Hosts can view basic constraints for their teams
CREATE POLICY "Hosts can view basic constraints for their teams" ON basic_constraints
    FOR SELECT USING (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid())));

-- Hosts can insert basic constraints for their teams
CREATE POLICY "Hosts can insert basic constraints for their teams" ON basic_constraints
    FOR INSERT WITH CHECK (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid())));

-- Hosts can update basic constraints for their teams
CREATE POLICY "Hosts can update basic constraints for their teams" ON basic_constraints
    FOR UPDATE USING (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid())));

-- Custom constraints table policies
-- Service role bypass for custom constraints
CREATE POLICY "Service role bypass for custom constraints" ON custom_constraints
    FOR ALL USING (auth.role() = 'service_role'::text);

-- Hosts can view custom constraints for their teams
CREATE POLICY "Hosts can view custom constraints for their teams" ON custom_constraints
    FOR SELECT USING (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid())));

-- Hosts can insert custom constraints for their teams
CREATE POLICY "Hosts can insert custom constraints for their teams" ON custom_constraints
    FOR INSERT WITH CHECK (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid())));

-- Hosts can update custom constraints for their teams
CREATE POLICY "Hosts can update custom constraints for their teams" ON custom_constraints
    FOR UPDATE USING (team_id IN (SELECT teams.id FROM teams WHERE (teams.host_id = auth.uid()))); 