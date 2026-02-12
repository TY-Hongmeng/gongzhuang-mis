-- Add recorder column to cutting_orders table for tracking who created the order
ALTER TABLE cutting_orders
  ADD COLUMN IF NOT EXISTS recorder text DEFAULT '系统用户';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_cutting_orders_recorder ON cutting_orders(recorder);
