-- Add date columns for tooling_info, keeping nulls allowed
ALTER TABLE tooling_info
  ADD COLUMN IF NOT EXISTS received_date DATE;

-- demand_date may already exist; ensure type is DATE (skip if already present/type differs)
ALTER TABLE tooling_info
  ADD COLUMN IF NOT EXISTS demand_date DATE;

ALTER TABLE tooling_info
  ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Optional: create indices for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_tooling_info_received_date ON tooling_info (received_date);
CREATE INDEX IF NOT EXISTS idx_tooling_info_demand_date ON tooling_info (demand_date);
CREATE INDEX IF NOT EXISTS idx_tooling_info_completed_date ON tooling_info (completed_date);