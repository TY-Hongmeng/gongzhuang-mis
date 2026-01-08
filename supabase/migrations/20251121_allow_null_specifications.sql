-- 允许 specifications 字段为 NULL
ALTER TABLE parts_info 
  ALTER COLUMN specifications DROP NOT NULL;