-- 彻底禁用采购单和下料单的 RLS 策略
-- 解决 42501 权限不足错误，特别是在没有 Supabase Auth Session 的情况下

-- 禁用 RLS
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE cutting_orders DISABLE ROW LEVEL SECURITY;

-- 允许所有用户访问
GRANT ALL PRIVILEGES ON purchase_orders TO authenticated;
GRANT ALL PRIVILEGES ON purchase_orders TO anon;
GRANT ALL PRIVILEGES ON cutting_orders TO authenticated;
GRANT ALL PRIVILEGES ON cutting_orders TO anon;

-- 如果需要删除旧策略（可选）
DROP POLICY IF EXISTS "任何人可查看采购单" ON purchase_orders;
DROP POLICY IF EXISTS "认证用户可创建采购单" ON purchase_orders;
DROP POLICY IF EXISTS "认证用户可更新采购单" ON purchase_orders;
DROP POLICY IF EXISTS "认证用户可删除采购单" ON purchase_orders;

DROP POLICY IF EXISTS "任何人可查看下料单" ON cutting_orders;
DROP POLICY IF EXISTS "认证用户可创建下料单" ON cutting_orders;
DROP POLICY IF EXISTS "认证用户可更新下料单" ON cutting_orders;
DROP POLICY IF EXISTS "认证用户可删除下料单" ON cutting_orders;

-- 确保序列权限
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
