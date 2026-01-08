-- Add part_id column to purchase_orders table for better tracking of external purchase parts
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS part_id VARCHAR(50);

-- Create index for faster lookup by part_id
CREATE INDEX IF NOT EXISTS idx_purchase_orders_part_id ON purchase_orders (part_id);

-- Add comment to explain the usage
COMMENT ON COLUMN purchase_orders.part_id IS 'Original part ID for external purchase parts, used for update detection when part name changes';