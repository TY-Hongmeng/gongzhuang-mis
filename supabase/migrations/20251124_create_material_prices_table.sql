-- 创建材料价格历史表
CREATE TABLE IF NOT EXISTS material_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  unit_price DECIMAL(10,2) NOT NULL,
  effective_start_date DATE NOT NULL,
  effective_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_material_prices_material_id ON material_prices(material_id);
CREATE INDEX IF NOT EXISTS idx_material_prices_date_range ON material_prices(effective_start_date, effective_end_date);

-- 创建唯一约束，确保同一材料在同一时间段内只有一个价格
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_material_price_date 
ON material_prices(material_id, effective_start_date) 
WHERE effective_end_date IS NULL;

-- 迁移现有材料的价格数据到价格历史表
INSERT INTO material_prices (material_id, unit_price, effective_start_date)
SELECT id, unit_price, COALESCE(effective_date, '2024-01-01')
FROM materials 
WHERE unit_price IS NOT NULL;

-- 移除materials表中的价格字段（因为我们现在使用价格历史表）
ALTER TABLE materials DROP COLUMN IF EXISTS unit_price;
ALTER TABLE materials DROP COLUMN IF EXISTS effective_date;