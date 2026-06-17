CREATE TABLE IF NOT EXISTS temporary_plan_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  month_key VARCHAR(10),
  items JSONB DEFAULT '[]'::jsonb,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
