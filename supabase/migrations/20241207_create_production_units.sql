-- 创建投产单位表
CREATE TABLE production_units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_production_units_updated_at
  BEFORE UPDATE ON production_units
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 授予权限
GRANT ALL ON production_units TO authenticated;
GRANT SELECT ON production_units TO anon;
GRANT USAGE, SELECT ON SEQUENCE production_units_id_seq TO authenticated;

-- 插入默认数据
INSERT INTO production_units (name, description) VALUES
  ('制造一部', '主要负责机械加工制造'),
  ('制造二部', '主要负责装配制造'),
  ('制造三部', '主要负责电气装配'),
  ('质检部', '质量检测部门'),
  ('工艺部', '工艺技术部门');