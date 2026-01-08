-- 放宽 tooling_info 字段约束以支持新增行时为空值
ALTER TABLE tooling_info
  ALTER COLUMN inventory_number DROP NOT NULL,
  ALTER COLUMN production_date DROP NOT NULL,
  ALTER COLUMN demand_date DROP NOT NULL,
  ALTER COLUMN sets_count DROP DEFAULT,
  ALTER COLUMN sets_count DROP NOT NULL;

-- 说明：
-- 1) inventory_number 允许为 NULL；唯一约束允许多个 NULL，不影响后续人工填写唯一值
-- 2) production_date / demand_date 允许为 NULL；lead_time 将在存在两日期时计算，否则为 NULL
-- 3) sets_count 允许为 NULL；前端在保存时再进行必填与数字校验
