-- 创建料型基础数据表
CREATE TABLE IF NOT EXISTS part_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 添加更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_part_types_updated_at 
  BEFORE UPDATE ON part_types 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 插入默认料型数据
INSERT INTO part_types (name, description) VALUES 
  ('板料', '板材类零件'),
  ('圆料', '圆棒类零件'),
  ('圆环', '环形类零件'),
  ('圆管', '圆管类零件'),
  ('板料割圆', '板材切割圆形零件'),
  ('锯床割方', '锯床切割方形零件')
ON CONFLICT (name) DO NOTHING;

-- 授予权限
GRANT ALL ON part_types TO authenticated;
GRANT SELECT ON part_types TO anon;