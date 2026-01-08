-- 修复工装信息相关表的RLS策略
-- 解决 "new row violates row-level security policy" 错误

-- 首先删除现有的策略（如果存在）
DROP POLICY IF EXISTS "材料库_查看" ON materials;
DROP POLICY IF EXISTS "材料库_管理" ON materials;
DROP POLICY IF EXISTS "工装信息_查看" ON tooling_info;
DROP POLICY IF EXISTS "工装信息_管理" ON tooling_info;
DROP POLICY IF EXISTS "零件信息_查看" ON parts_info;
DROP POLICY IF EXISTS "零件信息_管理" ON parts_info;

-- 为materials表创建更宽松的RLS策略
CREATE POLICY "materials_select_policy" ON materials
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "materials_insert_policy" ON materials
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "materials_update_policy" ON materials
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "materials_delete_policy" ON materials
    FOR DELETE TO authenticated
    USING (true);

-- 为tooling_info表创建更宽松的RLS策略
CREATE POLICY "tooling_info_select_policy" ON tooling_info
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "tooling_info_insert_policy" ON tooling_info
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "tooling_info_update_policy" ON tooling_info
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "tooling_info_delete_policy" ON tooling_info
    FOR DELETE TO authenticated
    USING (true);

-- 为parts_info表创建更宽松的RLS策略
CREATE POLICY "parts_info_select_policy" ON parts_info
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "parts_info_insert_policy" ON parts_info
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "parts_info_update_policy" ON parts_info
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "parts_info_delete_policy" ON parts_info
    FOR DELETE TO authenticated
    USING (true);

-- 确保表权限正确设置
GRANT ALL PRIVILEGES ON materials TO authenticated;
GRANT ALL PRIVILEGES ON tooling_info TO authenticated;
GRANT ALL PRIVILEGES ON parts_info TO authenticated;

-- 为anon用户提供读取权限（如果需要）
GRANT SELECT ON materials TO anon;
GRANT SELECT ON tooling_info TO anon;
GRANT SELECT ON parts_info TO anon;

-- 确保序列权限正确（如果使用了序列）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;