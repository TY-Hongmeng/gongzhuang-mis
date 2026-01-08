-- 为cutting_orders表添加updated_date列
ALTER TABLE cutting_orders 
ADD COLUMN updated_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS cutting_orders_updated_date_idx ON cutting_orders(updated_date);