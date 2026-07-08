ALTER TABLE public.measure_tool_assets
  ADD COLUMN IF NOT EXISTS certificate_expire_date DATE NULL,
  ADD COLUMN IF NOT EXISTS certificate_remind_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS last_certificate_reminded_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_certificate_expire_date
  ON public.measure_tool_assets(certificate_expire_date);
