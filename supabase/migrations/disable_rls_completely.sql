-- 完全禁用RLS策略 - 紧急修复
-- 这是为了解决持续的RLS错误问题

-- 完全禁用所有表的RLS
ALTER TABLE tooling_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE parts_info DISABLE ROW LEVEL SECURITY;

-- 删除所有现有策略
DROP POLICY IF EXISTS "tooling_info_all_access" ON tooling_info;
DROP POLICY IF EXISTS "materials_all_access" ON materials;
DROP POLICY IF EXISTS "parts_info_all_access" ON parts_info;

-- 删除旧策略（如果存在）
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

-- 确保表权限正确设置
GRANT ALL PRIVILEGES ON tooling_info TO authenticated;
GRANT ALL PRIVILEGES ON materials TO authenticated;
GRANT ALL PRIVILEGES ON parts_info TO authenticated;
GRANT ALL PRIVILEGES ON tooling_info TO anon;
GRANT ALL PRIVILEGES ON materials TO anon;
GRANT ALL PRIVILEGES ON parts_info TO anon;

-- 确保序列权限
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;