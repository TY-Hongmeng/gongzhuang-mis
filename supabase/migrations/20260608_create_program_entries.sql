CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS program_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_inventory_number TEXT NOT NULL,
  part_drawing_number TEXT NOT NULL DEFAULT '',
  process_name TEXT NOT NULL DEFAULT '',
  program_no TEXT NOT NULL DEFAULT '',
  program_duration_minutes NUMERIC NOT NULL DEFAULT 0 CHECK (program_duration_minutes >= 0),
  programmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  programmer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_entries_programmed_at
  ON program_entries(programmed_at DESC);

CREATE INDEX IF NOT EXISTS idx_program_entries_inventory_process
  ON program_entries(part_inventory_number, process_name);
