CREATE UNIQUE INDEX IF NOT EXISTS ux_parts_info_part_inventory_number
ON parts_info(part_inventory_number)
WHERE part_inventory_number IS NOT NULL;

