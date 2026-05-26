-- 修复: 添加 tooling_info 表的总额字段 (v3.3.142)
-- 请在 Supabase Dashboard → SQL Editor 中执行此脚本

ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS material_total NUMERIC;
ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS process_total NUMERIC;
ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS totals_updated_at TIMESTAMPTZ;

-- 添加注释
COMMENT ON COLUMN tooling_info.material_total IS '材料总额 - 由系统根据零件自动计算';
COMMENT ON COLUMN tooling_info.process_total IS '加工总额 - 由系统根据零件加工费自动计算';
COMMENT ON COLUMN tooling_info.totals_updated_at IS '总额最后更新时间';

-- 验证列是否创建成功
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tooling_info' 
AND column_name IN ('material_total', 'process_total', 'totals_updated_at');
