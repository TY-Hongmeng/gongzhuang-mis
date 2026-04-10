ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS aux_count NUMERIC DEFAULT 1;
ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS process_quantity NUMERIC DEFAULT 1;
ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS single_aux_minutes NUMERIC DEFAULT 0;
ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS single_aux_count NUMERIC DEFAULT 0;

UPDATE work_hours
SET
  aux_count = CASE WHEN COALESCE(aux_count, 0) <= 0 THEN 1 ELSE aux_count END,
  process_quantity = CASE WHEN COALESCE(process_quantity, 0) <= 0 THEN 1 ELSE process_quantity END;

UPDATE work_hours
SET
  single_aux_minutes = CASE
    WHEN COALESCE(aux_count, 0) > 0 THEN ROUND((COALESCE(aux_hours, 0) * 60 / aux_count)::numeric, 2)
    ELSE 0
  END,
  single_aux_count = CASE
    WHEN COALESCE(process_quantity, 0) > 0 THEN ROUND((aux_count / process_quantity)::numeric, 4)
    ELSE 0
  END;
