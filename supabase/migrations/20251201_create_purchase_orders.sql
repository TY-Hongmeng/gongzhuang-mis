-- 创建采购单表
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_number TEXT NOT NULL,
  project_name TEXT NOT NULL,
  part_name TEXT NOT NULL,
  part_quantity INTEGER NOT NULL,
  unit TEXT NOT NULL,
  model TEXT,
  supplier TEXT,
  required_date DATE,
  remark TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
  created_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tooling_id UUID REFERENCES tooling_info(id) ON DELETE CASCADE,
  child_item_id UUID REFERENCES child_items(id) ON DELETE CASCADE
);

-- 添加索引
CREATE INDEX purchase_orders_created_date_idx ON purchase_orders(created_date);
CREATE INDEX purchase_orders_status_idx ON purchase_orders(status);
CREATE INDEX purchase_orders_inventory_number_idx ON purchase_orders(inventory_number);

-- 启用 RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略
-- 允许所有用户查看采购单
CREATE POLICY "任何人可查看采购单" ON purchase_orders
  FOR SELECT USING (true);

-- 允许认证用户创建采购单
CREATE POLICY "认证用户可创建采购单" ON purchase_orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 允许认证用户更新采购单
CREATE POLICY "认证用户可更新采购单" ON purchase_orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 允许认证用户删除采购单
CREATE POLICY "认证用户可删除采购单" ON purchase_orders
  FOR DELETE USING (auth.role() = 'authenticated');

-- 授予权限
GRANT ALL ON purchase_orders TO authenticated;
GRANT SELECT ON purchase_orders TO anon;