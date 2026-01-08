-- 为备用材料表添加材质和料型字段
ALTER TABLE backup_materials 
ADD COLUMN IF NOT EXISTS material VARCHAR(255),
ADD COLUMN IF NOT EXISTS material_type VARCHAR(255);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_backup_materials_material ON backup_materials(material);
CREATE INDEX IF NOT EXISTS idx_backup_materials_material_type ON backup_materials(material_type);