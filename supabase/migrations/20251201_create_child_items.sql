-- 创建标准件信息表 (子级记录)
CREATE TABLE child_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tooling_id UUID NOT NULL REFERENCES tooling_info(id) ON DELETE CASCADE, -- 关联工装信息
    name VARCHAR(200) NOT NULL, -- 名称
    model VARCHAR(200), -- 型号
    quantity INTEGER NOT NULL DEFAULT 1, -- 数量
    unit VARCHAR(50), -- 单位
    required_date DATE, -- 需求日期
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_child_items_tooling_id ON child_items(tooling_id);

-- 启用行级安全策略
ALTER TABLE child_items ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略 - 所有认证用户可读写
CREATE POLICY "标准件信息_查看" ON child_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "标准件信息_管理" ON child_items FOR ALL TO authenticated USING (true);

-- 授权给anon和authenticated角色
GRANT SELECT ON child_items TO anon;
GRANT ALL PRIVILEGES ON child_items TO authenticated;

-- 创建更新时间触发器
CREATE TRIGGER update_child_items_updated_at BEFORE UPDATE ON child_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();