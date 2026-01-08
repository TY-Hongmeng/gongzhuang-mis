-- 为part_types表添加体积计算公式字段
ALTER TABLE part_types 
ADD COLUMN IF NOT EXISTS volume_formula TEXT;

-- 更新现有料型的体积计算公式
UPDATE part_types SET volume_formula = 
CASE 
    WHEN name = '板料' THEN '长*宽*高'
    WHEN name = '圆料' THEN 'π*半径²*高'
    WHEN name = '圆环' THEN 'π*(外半径²-内半径²)*高'
    WHEN name = '圆管' THEN 'π*(外半径²-内半径²)*长'
    WHEN name = '板料割圆' THEN 'π*半径²*厚'
    WHEN name = '锯床割方' THEN '长*宽*高'
    ELSE '长*宽*高'
END;

-- 为将来新增的料型设置默认公式
ALTER TABLE part_types 
ALTER COLUMN volume_formula SET DEFAULT '长*宽*高';