-- Create table to record work hours per part
CREATE TABLE IF NOT EXISTS work_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES parts_info(id) ON DELETE SET NULL,
  part_inventory_number text NOT NULL,
  part_drawing_number text,
  operator text,
  process_name text,
  hours numeric(10,2) NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_hours_inventory ON work_hours(part_inventory_number);
CREATE INDEX IF NOT EXISTS idx_work_hours_date ON work_hours(work_date);
