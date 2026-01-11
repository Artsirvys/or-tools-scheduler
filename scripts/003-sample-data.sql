-- Sample data for testing team availability functionality

-- Insert sample users
INSERT INTO users (id, email, first_name, last_name, account_type, role, department) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'host@hospital.com', 'Dr. John', 'Smith', 'host', 'Doctor', 'Emergency Medicine'),
('550e8400-e29b-41d4-a716-446655440002', 'sarah.johnson@hospital.com', 'Dr. Sarah', 'Johnson', 'participant', 'Doctor', 'Emergency Medicine'),
('550e8400-e29b-41d4-a716-446655440003', 'mike.chen@hospital.com', 'Nurse Mike', 'Chen', 'participant', 'Nurse', 'Emergency Medicine'),
('550e8400-e29b-41d4-a716-446655440004', 'emily.davis@hospital.com', 'Dr. Emily', 'Davis', 'participant', 'Resident', 'Emergency Medicine'),
('550e8400-e29b-41d4-a716-446655440005', 'lisa.wong@hospital.com', 'Nurse Lisa', 'Wong', 'participant', 'Nurse', 'Emergency Medicine')
ON CONFLICT (email) DO NOTHING;

-- Insert sample team
INSERT INTO teams (id, name, description, department, host_id, workers_per_shift, availability_deadline) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'Emergency Department', 'Main emergency department team', 'Emergency Medicine', '550e8400-e29b-41d4-a716-446655440001', 2, '2024-12-31')
ON CONFLICT (id) DO NOTHING;

-- Insert team members
INSERT INTO team_members (team_id, user_id) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440002'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440003'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440004'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005')
ON CONFLICT (team_id, user_id) DO NOTHING;

-- Insert shifts
INSERT INTO shifts (id, team_id, name, start_time, end_time) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440010', 'Day Shift', '08:00:00', '20:00:00'),
('550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440010', 'Night Shift', '20:00:00', '08:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert sample availability data for December 2024
INSERT INTO availability (user_id, team_id, shift_id, date, status) VALUES
-- Dr. Sarah Johnson - has filled some availability
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01', 'available'),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01', 'unavailable'),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02', 'priority'),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-02', 'available'),

-- Nurse Mike Chen - has filled some availability
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01', 'unavailable'),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01', 'available'),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02', 'available'),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-02', 'priority'),

-- Dr. Emily Davis - has not filled any availability yet
-- (no records for this user)

-- Nurse Lisa Wong - has filled some availability
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01', 'available'),
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01', 'available'),
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02', 'priority'),
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '2024-12-02', 'unavailable')
ON CONFLICT (user_id, team_id, shift_id, date) DO NOTHING;

-- Insert sample schedule
INSERT INTO schedules (id, team_id, month, year, generated_by, status) VALUES
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440010', 12, 2024, '550e8400-e29b-41d4-a716-446655440001', 'active')
ON CONFLICT DO NOTHING;

-- Insert sample schedule assignments for December 2024
INSERT INTO schedule_assignments (schedule_id, user_id, shift_id, date) VALUES
-- Dr. Sarah Johnson assignments
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440021', '2024-12-02'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440020', '2024-12-03'),

-- Nurse Mike Chen assignments
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440021', '2024-12-03'),

-- Dr. Emily Davis assignments
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440020', '2024-12-04'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440021', '2024-12-05'),

-- Nurse Lisa Wong assignments
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440021', '2024-12-04'),
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440020', '2024-12-05')
ON CONFLICT DO NOTHING;

-- Insert sample shift change requests
INSERT INTO shift_change_requests (id, requester_id, original_assignment_id, requested_date, requested_shift_id, target_user_id, status, message) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440030', '2024-12-05', '550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440003', 'pending', 'Dr. Sarah wants to swap her Day Shift on Dec 1 with Nurse Mike''s Day Shift on Dec 5'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440031', '2024-12-03', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440005', 'pending', 'Dr. Emily wants to swap her Night Shift on Dec 4 with Nurse Lisa''s Night Shift on Dec 3')
ON CONFLICT DO NOTHING;

-- Insert sample activity log entries
INSERT INTO activity_log (host_id, actor_id, team_id, action, type) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Created Emergency Department team', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Added Dr. Sarah Johnson to team', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Added Nurse Mike Chen to team', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Added Dr. Emily Davis to team', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Added Nurse Lisa Wong to team', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Set availability deadline to 2024-12-31', 'team'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', 'Generated schedule for December 2024', 'schedule')
ON CONFLICT DO NOTHING; 