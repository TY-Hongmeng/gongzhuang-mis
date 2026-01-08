-- 为材料库表添加排序字段
ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 为现有数据设置默认排序值（按创建时间排序）
UPDATE materials 
SET sort_order = (
  SELECT COUNT(*) 
  FROM materials m2 
  WHERE m2.created_at <= materials.created_at
);

-- 添加索引优化排序查询
CREATE INDEX IF NOT EXISTS idx_materials_sort_order ON materials(sort_order);