-- 删除 parts_info 表中 part_category 字段的检查约束，以支持动态料型
ALTER TABLE parts_info 
  DROP CONSTRAINT IF EXISTS parts_info_part_category_check;
