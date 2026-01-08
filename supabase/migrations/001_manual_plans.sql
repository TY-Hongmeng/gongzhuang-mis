create table if not exists public.manual_purchase_plans (
  id uuid primary key default gen_random_uuid(),
  inventory_number text,
  project_name text,
  part_name text not null,
  part_quantity integer,
  unit text not null,
  model text,
  supplier text,
  required_date date,
  remark text,
  status text default 'draft',
  created_date timestamptz default now(),
  updated_date timestamptz,
  production_unit text,
  demand_date date,
  applicant text
);

-- helpful index
create index if not exists idx_manual_plans_created_date on public.manual_purchase_plans (created_date desc);
create index if not exists idx_manual_plans_project_name on public.manual_purchase_plans (project_name);
