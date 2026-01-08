-- Add part_inventory_number field to parts_info table
ALTER TABLE parts_info 
ADD COLUMN IF NOT EXISTS part_inventory_number VARCHAR(50);

-- Add comment for the new field
COMMENT ON COLUMN parts_info.part_inventory_number IS '零件自动生成的盘存编号，格式为{父级盘存编号}{序号}';