-- Enable RLS on basic_constraints and custom_constraints tables
ALTER TABLE basic_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_constraints ENABLE ROW LEVEL SECURITY;

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
