-- 为采购订单表添加缺失的字段
-- 这些字段用于从tooling_info表中获取相关数据

ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS production_unit TEXT,
ADD COLUMN IF NOT EXISTS demand_date DATE,
ADD COLUMN IF NOT EXISTS applicant TEXT;

-- 添加字段注释
COMMENT ON COLUMN purchase_orders.production_unit IS '投产单位，从关联的tooling_info表中获取';
COMMENT ON COLUMN purchase_orders.demand_date IS '需求日期，从关联的tooling_info表中获取';
COMMENT ON COLUMN purchase_orders.applicant IS '提交人，从关联的tooling_info表中的录入人获取';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_purchase_orders_production_unit ON purchase_orders (production_unit);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_demand_date ON purchase_orders (demand_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_applicant ON purchase_orders (applicant);