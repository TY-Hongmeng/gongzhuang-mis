-- 将圆料、圆环、板料割圆的体积公式从半径改为直径计算
-- 圆料: π*半径²*高 → π*(直径²/4)*高
-- 圆环: π*(外半径²-内半径²)*高 → π*((外径²-内径²)/4)*高  
-- 板料割圆: π*半径²*厚 → π*(直径²/4)*厚

UPDATE part_types SET volume_formula = 'π*(直径²/4)*高' WHERE name = '圆料';
UPDATE part_types SET volume_formula = 'π*((外径²-内径²)/4)*高' WHERE name = '圆环';
UPDATE part_types SET volume_formula = 'π*(直径²/4)*厚' WHERE name = '板料割圆';