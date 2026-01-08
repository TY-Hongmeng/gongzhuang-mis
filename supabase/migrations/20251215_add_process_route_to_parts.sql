-- Add process_route column to parts_info for persistent routing text
ALTER TABLE parts_info
  ADD COLUMN IF NOT EXISTS process_route TEXT;

CREATE INDEX IF NOT EXISTS idx_parts_info_process_route ON parts_info(process_route);
