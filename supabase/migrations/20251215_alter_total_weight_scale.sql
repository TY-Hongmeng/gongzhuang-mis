-- Increase total_weight precision to 3 decimals
ALTER TABLE cutting_orders
  ALTER COLUMN total_weight TYPE numeric(10,3);
