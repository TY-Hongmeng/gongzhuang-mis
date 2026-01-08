-- 简化版下料单表创建（避免复杂操作）
create table if not exists cutting_orders (
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
  tooling_id uuid,
  part_id uuid
);

-- 简单的权限授予（避免复杂的RLS策略）
grant select, insert, update, delete on cutting_orders to authenticated;
grant select on cutting_orders to anon;