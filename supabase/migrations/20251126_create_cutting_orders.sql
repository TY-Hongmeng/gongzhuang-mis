-- 创建下料单表
create table cutting_orders (
  id uuid primary key default gen_random_uuid(),
  inventory_number text not null,
  project_name text not null,
  part_drawing_number text not null,
  part_name text not null,
  specifications text not null,
  part_quantity integer not null,
  heat_treatment boolean default false,
  material_source text not null,
  created_date timestamp with time zone default now(),
  tooling_id uuid references tooling_info(id) on delete cascade,
  part_id uuid references parts_info(id) on delete cascade
);

-- 添加索引
create index cutting_orders_created_date_idx on cutting_orders(created_date);
create index cutting_orders_material_source_idx on cutting_orders(material_source);

-- 启用 RLS
alter table cutting_orders enable row level security;

-- 创建 RLS 策略
-- 允许所有用户查看下料单
CREATE POLICY "任何人可查看下料单" ON cutting_orders
  FOR SELECT USING (true);

-- 允许认证用户创建下料单
CREATE POLICY "认证用户可创建下料单" ON cutting_orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 允许认证用户更新下料单
CREATE POLICY "认证用户可更新下料单" ON cutting_orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 允许认证用户删除下料单
CREATE POLICY "认证用户可删除下料单" ON cutting_orders
  FOR DELETE USING (auth.role() = 'authenticated');

-- 授予权限
GRANT ALL ON cutting_orders TO authenticated;
GRANT SELECT ON cutting_orders TO anon;