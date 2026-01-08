-- 在part_types表中添加input_format字段用于存储输入格式提示
ALTER TABLE part_types ADD COLUMN IF NOT EXISTS input_format TEXT;

-- 更新现有料型的输入格式
UPDATE part_types SET input_format = CASE 
    WHEN name = '板料' THEN 'A*B*C'
    WHEN name = '圆料' THEN 'φA*B'
    WHEN name = '圆环' THEN 'φA-B*C'
    WHEN name = '板料割圆' THEN 'φA*B'
    WHEN name = '锯床割方' THEN '长*宽*高'
    WHEN name = '圆管' THEN '长*宽*高'
    ELSE '长*宽*高'
END;

-- 设置默认值
ALTER TABLE part_types ALTER COLUMN input_format SET DEFAULT '长*宽*高';