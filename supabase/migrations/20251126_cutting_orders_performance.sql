-- 下料单表性能优化
-- 解决模糊搜索慢和精确计数问题

-- 1. 创建pg_trgm扩展（如果尚未创建）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 为模糊搜索字段创建GIN索引（支持ilike '%keyword%'）
CREATE INDEX IF NOT EXISTS gin_cutting_orders_inventory_number ON cutting_orders USING gin (inventory_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS gin_cutting_orders_project_name ON cutting_orders USING gin (project_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS gin_cutting_orders_part_drawing_number ON cutting_orders USING gin (part_drawing_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS gin_cutting_orders_part_name ON cutting_orders USING gin (part_name gin_trgm_ops);

-- 3. 创建覆盖索引优化常用查询（包含所有常用字段）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_covering ON cutting_orders 
USING btree (created_date DESC, material_source) 
INCLUDE (inventory_number, project_name, part_drawing_number, part_name, specifications, part_quantity, heat_treatment);

-- 4. 创建复合索引优化排序和分页
CREATE INDEX IF NOT EXISTS idx_cutting_orders_sort ON cutting_orders (created_date DESC, id);