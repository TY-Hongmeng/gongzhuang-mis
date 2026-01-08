-- 统一修复 purchase_orders 中的重量与金额为“总重量/总金额”
-- 面向从工装信息（parts_info）生成的采购单：按数量×单重更新总重，金额按材料最新单价或默认50元/kg

UPDATE purchase_orders po
SET 
  weight = ROUND(p.weight * COALESCE(p.part_quantity, 0) * 1000) / 1000,
  total_price = ROUND((p.weight * COALESCE(p.part_quantity, 0)) * COALESCE(
    (
      SELECT mp.unit_price 
      FROM material_prices mp 
      WHERE mp.material_id = p.material_id 
        AND (mp.effective_end_date IS NULL OR mp.effective_end_date >= CURRENT_DATE)
      ORDER BY mp.effective_start_date DESC NULLS LAST
      LIMIT 1
    ), 50
  ) * 100) / 100
FROM parts_info p
WHERE po.part_id::uuid = p.id
  AND (
    po.weight IS NULL 
    OR po.weight <> ROUND(p.weight * COALESCE(p.part_quantity, 0) * 1000) / 1000
    OR po.total_price IS NULL
  );

-- 可选：对标准件（child_items）来源的采购单，若后续要求也维护总重/总金额，可在此补充逻辑
