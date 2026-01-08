-- 为材料来源表添加排序字段
ALTER TABLE material_sources 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 为现有数据设置默认排序值（按创建时间排序）
UPDATE material_sources 
SET sort_order = (
  SELECT COUNT(*) 
  FROM material_sources ms2 
  WHERE ms2.created_at <= material_sources.created_at
);

-- 添加索引优化排序查询
CREATE INDEX IF NOT EXISTS idx_material_sources_sort_order ON material_sources(sort_order);