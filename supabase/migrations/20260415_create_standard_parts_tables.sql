CREATE TABLE IF NOT EXISTS standard_part_inbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  spec_model TEXT NOT NULL,
  tech_group TEXT NOT NULL,
  location TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  operator TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '正常',
  source_outbound_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS standard_part_outbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  spec_model TEXT NOT NULL,
  tech_group TEXT NOT NULL,
  location TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  out_date DATE NOT NULL DEFAULT CURRENT_DATE,
  operator TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '正常',
  source_inbound_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spi_name_spec_loc ON standard_part_inbound(name, spec_model, location);
CREATE INDEX IF NOT EXISTS idx_spo_name_spec_loc ON standard_part_outbound(name, spec_model, location);
