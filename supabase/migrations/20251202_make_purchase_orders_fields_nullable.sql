-- Make purchase_orders fields nullable to match tooling system behavior
-- This allows manual input to work like the tooling info system where fields can be empty

ALTER TABLE purchase_orders 
ALTER COLUMN inventory_number DROP NOT NULL,
ALTER COLUMN project_name DROP NOT NULL,
ALTER COLUMN part_name DROP NOT NULL,
ALTER COLUMN part_quantity DROP NOT NULL,
ALTER COLUMN unit DROP NOT NULL;

-- Add comments to explain the change
COMMENT ON COLUMN purchase_orders.inventory_number IS '库存编号 - 手动输入时可为空，系统会自动生成';
COMMENT ON COLUMN purchase_orders.project_name IS '项目名称 - 手动输入时可为空';
COMMENT ON COLUMN purchase_orders.part_name IS '零件名称 - 手动输入时可为空';
COMMENT ON COLUMN purchase_orders.part_quantity IS '零件数量 - 手动输入时可为空';
COMMENT ON COLUMN purchase_orders.unit IS '单位 - 手动输入时可为空';