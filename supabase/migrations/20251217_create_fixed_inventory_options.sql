-- Fixed inventory options for maintenance/repair cases
CREATE TABLE IF NOT EXISTS fixed_inventory_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_value text UNIQUE NOT NULL,
  option_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_inventory_active ON fixed_inventory_options(is_active);
