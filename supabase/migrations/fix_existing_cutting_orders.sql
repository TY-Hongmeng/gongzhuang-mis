-- Fix existing cutting_orders with null material and total_weight
-- This script updates the material and total_weight fields based on the parts_info data

UPDATE cutting_orders 
SET material = (
  SELECT m.name 
  FROM parts_info p 
  JOIN materials m ON p.material_id = m.id 
  WHERE p.id = cutting_orders.part_id
)
WHERE material IS NULL 
AND part_id IN (SELECT id FROM parts_info WHERE material_id IS NOT NULL);

UPDATE cutting_orders 
SET total_weight = (
  SELECT ROUND(p.weight * p.part_quantity * 1000) / 1000
  FROM parts_info p 
  WHERE p.id = cutting_orders.part_id AND p.weight > 0
)
WHERE total_weight IS NULL 
AND part_id IN (SELECT id FROM parts_info WHERE weight > 0);