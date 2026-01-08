-- Add material column to cutting_orders table
ALTER TABLE cutting_orders 
ADD COLUMN IF NOT EXISTS material TEXT;

-- Update existing records to have empty material if null
UPDATE cutting_orders SET material = '' WHERE material IS NULL;