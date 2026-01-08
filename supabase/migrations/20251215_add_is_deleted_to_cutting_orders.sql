-- Soft delete for cutting_orders to prevent "deleted records reappearing"
ALTER TABLE cutting_orders
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cutting_orders_is_deleted ON cutting_orders(is_deleted);
