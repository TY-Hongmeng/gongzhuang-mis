-- 更新 parts_info 表中 part_category 字段的约束，支持更多料型
ALTER TABLE parts_info 
  DROP CONSTRAINT IF EXISTS parts_info_part_category_check;

ALTER TABLE parts_info 
  ADD CONSTRAINT parts_info_part_category_check 
  CHECK (part_category IN ('板料', '圆料', '圆环', '圆管', '板料割圆', '锯床割方', '原料'));

-- 允许 part_category 为 NULL
ALTER TABLE parts_info 
  ALTER COLUMN part_category DROP NOT NULL;