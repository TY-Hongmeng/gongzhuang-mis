-- 修复零件盘存编号字段长度限制
-- 将 part_inventory_number 从 varchar(100) 改为 TEXT，取消字符限制
-- 日期: 2026-05-21

ALTER TABLE parts_info 
ALTER COLUMN part_inventory_number TYPE TEXT USING part_inventory_number::TEXT;
