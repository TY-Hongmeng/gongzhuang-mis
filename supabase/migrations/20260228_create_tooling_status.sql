CREATE TABLE IF NOT EXISTS tooling_status (
  id BIGSERIAL PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tooling_status_unique ON tooling_status(item_type, item_id);
ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS purchase_status TEXT;
ALTER TABLE child_items ADD COLUMN IF NOT EXISTS purchase_status TEXT;
