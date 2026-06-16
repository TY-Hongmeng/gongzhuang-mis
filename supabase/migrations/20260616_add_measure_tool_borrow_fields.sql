ALTER TABLE public.measure_tool_assets
  ADD COLUMN IF NOT EXISTS borrower_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS borrower_user_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS borrow_status TEXT NOT NULL DEFAULT '无',
  ADD COLUMN IF NOT EXISTS borrow_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS borrow_return_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS borrowed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_measure_tool_assets_borrow_status'
  ) THEN
    ALTER TABLE public.measure_tool_assets
      ADD CONSTRAINT chk_measure_tool_assets_borrow_status
      CHECK (borrow_status IN ('无', '借用中', '待归还确认'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_borrower_name
  ON public.measure_tool_assets(borrower_name);
