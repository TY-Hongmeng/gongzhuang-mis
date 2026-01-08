-- 为料型表添加排序字段
ALTER TABLE part_types 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 为现有数据设置默认排序值（按创建时间排序）
UPDATE part_types 
SET sort_order = (
  SELECT COUNT(*) 
  FROM part_types pt2 
  WHERE pt2.created_at <= part_types.created_at
);

-- 添加索引优化排序查询
CREATE INDEX IF NOT EXISTS idx_part_types_sort_order ON part_types(sort_order);