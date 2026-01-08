-- 为parts_info表添加specifications_text字段
ALTER TABLE parts_info 
ADD COLUMN IF NOT EXISTS specifications_text TEXT;

-- 添加注释
COMMENT ON COLUMN parts_info.specifications_text IS '规格文本（用于输入和显示）';