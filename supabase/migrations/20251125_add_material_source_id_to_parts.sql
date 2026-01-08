-- 为parts_info表添加material_source_id字段
ALTER TABLE parts_info 
ADD COLUMN IF NOT EXISTS material_source_id INTEGER REFERENCES material_sources(id);

-- 添加注释
COMMENT ON COLUMN parts_info.material_source_id IS '材料来源ID，关联material_sources表';

-- 更新现有数据，将source字段转换为material_source_id
UPDATE parts_info 
SET material_source_id = (
  SELECT id FROM material_sources 
  WHERE 
    (source = '自备' AND name = '自备料') OR
    (source = '下料' AND name = '备料') OR
    (source = '外购' AND name = '外购')
  LIMIT 1
)
WHERE source IN ('自备', '下料', '外购');

-- 允许material_source_id为NULL
ALTER TABLE parts_info 
ALTER COLUMN material_source_id DROP NOT NULL;