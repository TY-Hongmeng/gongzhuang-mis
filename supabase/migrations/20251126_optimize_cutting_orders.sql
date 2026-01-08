-- 优化下料单表查询性能
-- 为常用查询字段添加索引

-- 材料来源索引
CREATE INDEX IF NOT EXISTS idx_cutting_orders_material_source ON cutting_orders(material_source);

-- 创建日期索引（用于日期范围查询）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_created_date ON cutting_orders(created_date);

-- 复合索引：材料来源 + 创建日期（用于组合查询）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_material_date ON cutting_orders(material_source, created_date);

-- 库存编号索引（用于搜索）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_inventory_number ON cutting_orders(inventory_number);

-- 项目编号索引（用于搜索）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_project_name ON cutting_orders(project_name);

-- 零件图号索引（用于搜索）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_part_drawing_number ON cutting_orders(part_drawing_number);

-- 零件名称索引（用于搜索）
CREATE INDEX IF NOT EXISTS idx_cutting_orders_part_name ON cutting_orders(part_name);