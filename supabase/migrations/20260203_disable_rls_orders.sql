-- Disable RLS for critical tables to allow GitHub Pages (No Backend) version to work
-- Run this in your Supabase SQL Editor

ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE cutting_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE manual_purchase_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE backup_materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE tooling_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE parts_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE child_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_hours DISABLE ROW LEVEL SECURITY;

-- Alternatively, add permissive policies (less secure but keeps RLS on)
/*
CREATE POLICY "Allow all for purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for cutting_orders" ON cutting_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for manual_purchase_plans" ON manual_purchase_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for backup_materials" ON backup_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for tooling_info" ON tooling_info FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for parts_info" ON parts_info FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for child_items" ON child_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for work_hours" ON work_hours FOR ALL USING (true) WITH CHECK (true);
*/
