-- 为 purchase_orders 表增加重量与金额字段
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS weight NUMERIC(10,3),
ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2);

COMMENT ON COLUMN purchase_orders.weight IS '单件重量(kg)，用于计算总重';
COMMENT ON COLUMN purchase_orders.total_price IS '总金额(元)';
