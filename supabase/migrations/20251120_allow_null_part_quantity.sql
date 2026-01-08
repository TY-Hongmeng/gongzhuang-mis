-- 允许part_quantity为NULL，这样不输入时就是NULL而不是默认值
ALTER TABLE parts_info 
ALTER COLUMN part_quantity DROP NOT NULL;