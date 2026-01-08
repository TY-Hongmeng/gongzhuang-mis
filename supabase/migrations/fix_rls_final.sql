-- 最终修复RLS策略错误
-- 解决 "new row violates row-level security policy for table tooling_info" 错误

-- 首先完全禁用RLS，然后重新配置
ALTER TABLE tooling_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE parts_info DISABLE ROW LEVEL SECURITY;

-- 删除所有现有策略
DROP POLICY IF EXISTS "materials_select_policy" ON materials;
DROP POLICY IF EXISTS "materials_insert_policy" ON materials;
DROP POLICY IF EXISTS "materials_update_policy" ON materials;
DROP POLICY IF EXISTS "materials_delete_policy" ON materials;

DROP POLICY IF EXISTS "tooling_info_select_policy" ON tooling_info;
DROP POLICY IF EXISTS "tooling_info_insert_policy" ON tooling_info;
DROP POLICY IF EXISTS "tooling_info_update_policy" ON tooling_info;
DROP POLICY IF EXISTS "tooling_info_delete_policy" ON tooling_info;

DROP POLICY IF EXISTS "parts_info_select_policy" ON parts_info;
DROP POLICY IF EXISTS "parts_info_insert_policy" ON parts_info;
DROP POLICY IF EXISTS "parts_info_update_policy" ON parts_info;
DROP POLICY IF EXISTS "parts_info_delete_policy" ON parts_info;

-- 重新启用RLS
ALTER TABLE tooling_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_info ENABLE ROW LEVEL SECURITY;

-- 为tooling_info表创建最宽松的策略
CREATE POLICY "tooling_info_all_access" ON tooling_info
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 为materials表创建最宽松的策略
CREATE POLICY "materials_all_access" ON materials
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 为parts_info表创建最宽松的策略
CREATE POLICY "parts_info_all_access" ON parts_info
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 确保表权限正确设置
GRANT ALL PRIVILEGES ON tooling_info TO authenticated;
GRANT ALL PRIVILEGES ON materials TO authenticated;
GRANT ALL PRIVILEGES ON parts_info TO authenticated;

-- 为anon用户提供读取权限
GRANT SELECT ON tooling_info TO anon;
GRANT SELECT ON materials TO anon;
GRANT SELECT ON parts_info TO anon;

-- 确保序列权限正确
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 确保函数权限正确
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;