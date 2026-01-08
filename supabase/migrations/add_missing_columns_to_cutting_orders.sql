-- Align cutting_orders schema with API expectations
ALTER TABLE cutting_orders
  ADD COLUMN IF NOT EXISTS tooling_info_id uuid REFERENCES tooling_info(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_date date,
  ADD COLUMN IF NOT EXISTS required_date date,
  ADD COLUMN IF NOT EXISTS completed_date date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Ensure indexes for joins and filters
CREATE INDEX IF NOT EXISTS idx_cutting_orders_tooling_info_id ON cutting_orders(tooling_info_id);
CREATE INDEX IF NOT EXISTS idx_cutting_orders_material_id ON cutting_orders(material_id);
