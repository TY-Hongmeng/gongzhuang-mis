-- 创建材料来源表
create table material_sources (
  id serial primary key,
  name text not null unique,
  description text default '',
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 创建更新时间触发器
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_material_sources_updated_at
    before update on material_sources
    for each row
    execute function update_updated_at_column();

-- 添加基本数据
insert into material_sources (name, description) values 
  ('自备料', '企业自备的原材料'),
  ('备料', '提前准备的材料'),
  ('锯切', '通过锯切工艺获得的材料'),
  ('火切', '通过火焰切割工艺获得的材料'),
  ('外购', '外部采购的材料');

-- 启用 RLS
alter table material_sources enable row level security;

-- 创建策略
create policy "Enable read access for all users" on material_sources
    for select using (true);

create policy "Enable insert for authenticated users" on material_sources
    for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated users" on material_sources
    for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated users" on material_sources
    for delete using (auth.role() = 'authenticated');

-- 授予权限
grant select on material_sources to anon, authenticated;
grant insert, update, delete on material_sources to authenticated;