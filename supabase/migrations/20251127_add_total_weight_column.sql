-- Add total_weight column to cutting_orders table
ALTER TABLE cutting_orders 
ADD COLUMN IF NOT EXISTS total_weight numeric(10,2) DEFAULT NULL;