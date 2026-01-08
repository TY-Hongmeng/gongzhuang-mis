-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_no text UNIQUE NOT NULL,
  device_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_no ON devices(device_no);

-- Extend work_hours with aux/proc hours and completed quantity
ALTER TABLE work_hours
  ADD COLUMN IF NOT EXISTS aux_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS proc_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS completed_quantity integer;
