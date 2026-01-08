-- 修改标准件数量列允许为空
ALTER TABLE child_items ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE child_items ALTER COLUMN quantity DROP DEFAULT;