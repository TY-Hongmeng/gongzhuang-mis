-- 修复tooling_info表的外键约束问题
-- 只处理tooling_info表，因为materials和parts_info表没有created_by字段

-- 1. 首先删除现有的外键约束
ALTER TABLE public.tooling_info 
DROP CONSTRAINT IF EXISTS tooling_info_created_by_fkey;

-- 2. 修改created_by字段允许为NULL
ALTER TABLE public.tooling_info 
ALTER COLUMN created_by DROP NOT NULL;

-- 3. 清理可能存在的无效created_by值
UPDATE public.tooling_info 
SET created_by = NULL 
WHERE created_by IS NOT NULL 
AND created_by NOT IN (SELECT id FROM auth.users);

-- 4. 重新添加外键约束，但允许NULL值
-- 这样如果用户存在就引用，不存在就设为NULL
ALTER TABLE public.tooling_info 
ADD CONSTRAINT tooling_info_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;