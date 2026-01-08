-- 创建工装类别表
CREATE TABLE tooling_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE TRIGGER update_tooling_categories_updated_at
  BEFORE UPDATE ON tooling_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 授予权限
GRANT ALL ON tooling_categories TO authenticated;
GRANT SELECT ON tooling_categories TO anon;
GRANT USAGE, SELECT ON SEQUENCE tooling_categories_id_seq TO authenticated;

-- 插入默认数据
INSERT INTO tooling_categories (name, description) VALUES
  ('冲压模具', '用于冲压加工的模具'),
  ('注塑模具', '用于塑料注塑的模具'),
  ('压铸模具', '用于金属压铸的模具'),
  ('检具', '检测用工装夹具'),
  ('夹具', '装夹用工装'),
  ('治具', '辅助加工治具');