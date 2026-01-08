-- 为tooling_parts表添加规格和重量字段
ALTER TABLE tooling_parts 
ADD COLUMN IF NOT EXISTS specifications TEXT,
ADD COLUMN IF NOT EXISTS weight NUMERIC(10,3);

-- 添加注释
COMMENT ON COLUMN tooling_parts.specifications IS '零件规格尺寸，JSON格式存储';
COMMENT ON COLUMN tooling_parts.weight IS '零件重量，自动计算得出';