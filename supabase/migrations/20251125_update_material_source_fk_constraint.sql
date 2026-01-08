-- 修改material_source_id外键约束，设置为SET NULL
-- 首先删除现有的外键约束（如果存在）
ALTER TABLE parts_info 
DROP CONSTRAINT IF EXISTS parts_info_material_source_id_fkey;

-- 添加新的外键约束，设置为SET NULL
ALTER TABLE parts_info 
ADD CONSTRAINT parts_info_material_source_id_fkey 
FOREIGN KEY (material_source_id) REFERENCES material_sources(id) 
ON DELETE SET NULL;