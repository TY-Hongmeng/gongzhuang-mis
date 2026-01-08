-- 添加单价和生效日期到材料表
ALTER TABLE materials ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS effective_date DATE;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_materials_effective_date ON materials(effective_date);

-- 更新现有材料数据，设置默认价格和生效日期
UPDATE materials SET 
    unit_price = CASE 
        WHEN name LIKE '%钢%' THEN 8.50
        WHEN name LIKE '%铝%' THEN 15.20
        WHEN name LIKE '%铜%' THEN 68.00
        WHEN name LIKE '%铁%' THEN 6.80
        ELSE 10.00
    END,
    effective_date = '2024-01-01'
WHERE unit_price IS NULL;