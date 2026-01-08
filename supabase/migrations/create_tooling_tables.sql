-- 创建材料库表
CREATE TABLE materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE, -- 材料名称 (45#, H13, 5CrNiMo, Cu等)
    density DECIMAL(8,3) NOT NULL, -- 密度 (g/cm³)
    description TEXT, -- 材料描述
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建工装信息表 (父级记录)
CREATE TABLE tooling_info (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    production_unit VARCHAR(100) NOT NULL, -- 投产单位 (凯撒、喜佛地等)
    category VARCHAR(100) NOT NULL, -- 类别 (铝锻、cpc铝铸、重力铸造、量具、刀具等)
    inventory_number VARCHAR(50) NOT NULL UNIQUE, -- 盘存编号 (LD251001格式)
    project_name VARCHAR(200) NOT NULL, -- 项目名称
    sets_count INTEGER NOT NULL DEFAULT 1, -- 套数
    production_date DATE NOT NULL, -- 投产日期
    demand_date DATE NOT NULL, -- 需求日期
    lead_time INTEGER GENERATED ALWAYS AS (demand_date - production_date) STORED, -- 工期(天数，自动计算)
    recorder VARCHAR(100) NOT NULL, -- 录入人
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 创建零件信息表 (子级记录)
CREATE TABLE parts_info (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tooling_id UUID NOT NULL REFERENCES tooling_info(id) ON DELETE CASCADE, -- 关联工装信息
    part_name VARCHAR(200) NOT NULL, -- 零件名称
    part_drawing_number VARCHAR(100) NOT NULL, -- 零件图号
    part_quantity INTEGER NOT NULL DEFAULT 1, -- 零件数量
    material_id UUID NOT NULL REFERENCES materials(id), -- 材质(关联材料库)
    part_category VARCHAR(50) NOT NULL CHECK (part_category IN ('板料', '原料', '圆环')), -- 类别
    specifications JSONB NOT NULL, -- 规格尺寸 (存储不同类别的尺寸数据)
    weight DECIMAL(10,3), -- 重量(KG，根据材质密度和规格计算)
    source VARCHAR(50) NOT NULL CHECK (source IN ('下料', '自备', '外购')), -- 来源
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_tooling_info_inventory_number ON tooling_info(inventory_number);
CREATE INDEX idx_tooling_info_category ON tooling_info(category);
CREATE INDEX idx_tooling_info_production_date ON tooling_info(production_date);
CREATE INDEX idx_parts_info_tooling_id ON parts_info(tooling_id);
CREATE INDEX idx_parts_info_material_id ON parts_info(material_id);

-- 插入初始材料数据
INSERT INTO materials (name, density, description) VALUES
('45#', 7.85, '45号碳素结构钢'),
('H13', 7.80, 'H13热作模具钢'),
('5CrNiMo', 7.85, '5CrNiMo合金结构钢'),
('Cu', 8.96, '纯铜'),
('6061铝合金', 2.70, '6061铝合金'),
('7075铝合金', 2.81, '7075铝合金'),
('304不锈钢', 7.93, '304不锈钢'),
('316不锈钢', 8.00, '316不锈钢');

-- 启用行级安全策略
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tooling_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_info ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
-- 材料库：所有认证用户可读，管理员可写
CREATE POLICY "材料库_查看" ON materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "材料库_管理" ON materials FOR ALL TO authenticated USING (true);

-- 工装信息：所有认证用户可读写
CREATE POLICY "工装信息_查看" ON tooling_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "工装信息_管理" ON tooling_info FOR ALL TO authenticated USING (true);

-- 零件信息：所有认证用户可读写
CREATE POLICY "零件信息_查看" ON parts_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "零件信息_管理" ON parts_info FOR ALL TO authenticated USING (true);

-- 授权给anon和authenticated角色
GRANT SELECT ON materials TO anon;
GRANT ALL PRIVILEGES ON materials TO authenticated;
GRANT ALL PRIVILEGES ON tooling_info TO authenticated;
GRANT ALL PRIVILEGES ON parts_info TO authenticated;

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为表添加更新时间触发器
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON materials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tooling_info_updated_at BEFORE UPDATE ON tooling_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parts_info_updated_at BEFORE UPDATE ON parts_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();