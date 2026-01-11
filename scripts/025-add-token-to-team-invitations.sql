-- Add token field to team_invitations table for secure invitation links
ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS token VARCHAR(255) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email_status ON team_invitations(email, status);
