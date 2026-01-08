-- 移除parts_info表中part_quantity字段的默认值
ALTER TABLE parts_info 
ALTER COLUMN part_quantity DROP DEFAULT;