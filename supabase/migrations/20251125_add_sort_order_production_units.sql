-- 为投产单位表添加排序字段
ALTER TABLE production_units 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 为现有数据设置默认排序值（按创建时间排序）
UPDATE production_units 
SET sort_order = (
  SELECT COUNT(*) 
  FROM production_units pu2 
  WHERE pu2.created_at <= production_units.created_at
);

-- 添加索引优化排序查询
CREATE INDEX IF NOT EXISTS idx_production_units_sort_order ON production_units(sort_order);