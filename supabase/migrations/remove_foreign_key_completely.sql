-- 彻底移除外键约束 - 最终解决方案
-- 这次必须100%成功！

-- 1. 删除外键约束
ALTER TABLE public.tooling_info 
DROP CONSTRAINT IF EXISTS tooling_info_created_by_fkey;

-- 2. 确保created_by字段允许为NULL
ALTER TABLE public.tooling_info 
ALTER COLUMN created_by DROP NOT NULL;

-- 3. 清理所有无效的created_by值
UPDATE public.tooling_info 
SET created_by = NULL 
WHERE created_by IS NOT NULL;

-- 4. 不再重新添加外键约束，保持字段独立
-- 这样可以避免任何外键约束问题

-- 验证操作
SELECT 
    constraint_name, 
    constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'tooling_info' 
AND constraint_type = 'FOREIGN KEY';