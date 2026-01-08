-- 放宽 parts_info 表中 material_id 字段的 NOT NULL 约束
ALTER TABLE parts_info 
  ALTER COLUMN material_id DROP NOT NULL;