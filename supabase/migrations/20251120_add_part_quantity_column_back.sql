-- 重新添加 part_quantity 列，允许为空
ALTER TABLE parts_info ADD COLUMN part_quantity INTEGER;