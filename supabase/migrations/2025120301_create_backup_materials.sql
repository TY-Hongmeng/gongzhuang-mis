-- 创建备用材料表
CREATE TABLE IF NOT EXISTS backup_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_name VARCHAR(255) NOT NULL,
  model VARCHAR(255),
  quantity INTEGER,
  unit VARCHAR(50) NOT NULL,
  project_name VARCHAR(255),
  supplier VARCHAR(255),
  price DECIMAL(10,2),
  demand_date DATE,
  created_date DATE DEFAULT CURRENT_DATE,
  applicant VARCHAR(100),
  is_manual BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_backup_materials_material_name ON backup_materials(material_name);
CREATE INDEX IF NOT EXISTS idx_backup_materials_project_name ON backup_materials(project_name);
CREATE INDEX IF NOT EXISTS idx_backup_materials_supplier ON backup_materials(supplier);
CREATE INDEX IF NOT EXISTS idx_backup_materials_created_date ON backup_materials(created_date);
CREATE INDEX IF NOT EXISTS idx_backup_materials_is_manual ON backup_materials(is_manual);

-- 创建更新触发器
CREATE OR REPLACE FUNCTION update_backup_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_backup_materials_updated_at
  BEFORE UPDATE ON backup_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_backup_materials_updated_at();

-- 授予权限
GRANT ALL PRIVILEGES ON backup_materials TO authenticated;
GRANT SELECT ON backup_materials TO anon;