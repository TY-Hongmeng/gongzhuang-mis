ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS workshop_id uuid;

CREATE INDEX IF NOT EXISTS idx_teams_workshop ON teams(workshop_id);
