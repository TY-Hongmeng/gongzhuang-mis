CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS measure_tool_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  model_spec TEXT NOT NULL DEFAULT '',
  responsible_person TEXT NOT NULL DEFAULT '',
  responsible_user_id TEXT NOT NULL DEFAULT '',
  pending_responsible_person TEXT NOT NULL DEFAULT '',
  pending_responsible_user_id TEXT NOT NULL DEFAULT '',
  responsibility_status TEXT NOT NULL DEFAULT '待确认',
  asset_status TEXT NOT NULL DEFAULT '在用',
  scrap_status TEXT NOT NULL DEFAULT '无',
  scrap_reason TEXT NOT NULL DEFAULT '',
  borrower_name TEXT NOT NULL DEFAULT '',
  borrower_user_id TEXT NOT NULL DEFAULT '',
  borrow_status TEXT NOT NULL DEFAULT '无',
  borrow_note TEXT NOT NULL DEFAULT '',
  borrow_return_note TEXT NOT NULL DEFAULT '',
  borrowed_at TIMESTAMPTZ NULL,
  return_requested_at TIMESTAMPTZ NULL,
  returned_at TIMESTAMPTZ NULL,
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_measure_tool_assets_responsibility_status
    CHECK (responsibility_status IN ('待确认', '已确认', '待转移确认')),
  CONSTRAINT chk_measure_tool_assets_asset_status
    CHECK (asset_status IN ('在用', '报废')),
  CONSTRAINT chk_measure_tool_assets_scrap_status
    CHECK (scrap_status IN ('无', '待报废', '已报废')),
  CONSTRAINT chk_measure_tool_assets_borrow_status
    CHECK (borrow_status IN ('无', '借用中', '待归还确认'))
);

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_code
  ON measure_tool_assets(code);

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_responsible_person
  ON measure_tool_assets(responsible_person);

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_pending_responsible_person
  ON measure_tool_assets(pending_responsible_person);

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_responsibility_status
  ON measure_tool_assets(responsibility_status);

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_borrower_name
  ON measure_tool_assets(borrower_name);

CREATE TABLE IF NOT EXISTS measure_tool_asset_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES measure_tool_assets(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_label TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  operator_user_id TEXT NOT NULL DEFAULT '',
  target_name TEXT NOT NULL DEFAULT '',
  target_user_id TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measure_tool_asset_histories_asset_created
  ON measure_tool_asset_histories(asset_id, created_at DESC);
