ALTER TABLE work_hours
  ADD COLUMN IF NOT EXISTS aux_start_time time,
  ADD COLUMN IF NOT EXISTS aux_end_time time;

