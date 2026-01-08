-- 为工装类别表添加排序字段
ALTER TABLE tooling_categories 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 为现有数据设置默认排序值（按创建时间排序）
UPDATE tooling_categories 
SET sort_order = (
  SELECT COUNT(*) 
  FROM tooling_categories tc2 
  WHERE tc2.created_at <= tooling_categories.created_at
);

-- 添加索引优化排序查询
CREATE INDEX IF NOT EXISTS idx_tooling_categories_sort_order ON tooling_categories(sort_order);