import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// 解析 order 查询参数，例如 name.asc 或 created_at.desc
function parseOrder(order?: string) {
  const def = { column: 'created_at', ascending: false };
  if (!order) return def;
  const [column, dir] = order.split('.');
  if (!column) return def;
  return { column, ascending: dir !== 'desc' };
}

// 获取材料列表
router.get('/', async (req, res) => {
  try {
    const { order } = req.query as { order?: string };
    const { column, ascending } = parseOrder(order);

    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('sort_order', { ascending: true })
      .order(column, { ascending });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('获取材料列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建材料
router.post('/', async (req, res) => {
  try {
    const { name, density, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '材料名称不能为空' });
    }
    if (typeof density !== 'number' || density <= 0) {
      return res.status(400).json({ success: false, error: '请填写有效的密度' });
    }

    const { data, error } = await supabase
      .from('materials')
      .insert([{ 
        name: name.trim(), 
        density, 
        description: description?.trim() || ''
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('创建材料失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新材料
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, density, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '材料名称不能为空' });
    }
    if (typeof density !== 'number' || density <= 0) {
      return res.status(400).json({ success: false, error: '请填写有效的密度' });
    }

    const { data, error } = await supabase
      .from('materials')
      .update({ 
        name: name.trim(), 
        density, 
        description: description?.trim() || ''
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('更新材料失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除材料
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除材料失败:', error);
    // 外键约束
    if ((error as any)?.code === '23503') {
      return res.status(400).json({ success: false, error: '该材料正在被使用，无法删除' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取材料价格历史
router.get('/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('material_prices')
      .select('*')
      .eq('material_id', id)
      .order('effective_start_date', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('获取价格历史失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建价格记录
router.post('/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { unit_price, effective_start_date, effective_end_date } = req.body;
    
    if (!unit_price || unit_price <= 0) {
      return res.status(400).json({ success: false, error: '请输入有效的单价' });
    }
    if (!effective_start_date) {
      return res.status(400).json({ success: false, error: '请输入生效开始日期' });
    }

    // 检查日期范围是否重叠
    // 查找与新区间有重叠的现有记录
    const { data: existingPrices } = await supabase
      .from('material_prices')
      .select('*')
      .eq('material_id', id)
      .or(`effective_end_date.is.null,and(effective_start_date.lte.${effective_end_date || '9999-12-31'})`)
      .or(`and(effective_end_date.gte.${effective_start_date},effective_start_date.lte.${effective_end_date || '9999-12-31'})`);

    if (existingPrices && existingPrices.length > 0) {
      return res.status(400).json({ success: false, error: '价格时间段不能与现有记录重叠' });
    }

    // 自动结束当前有效的价格记录（将effective_end_date设置为新价格的开始日期前一天）
    const { data: currentPrices } = await supabase
      .from('material_prices')
      .select('*')
      .eq('material_id', id)
      .is('effective_end_date', null);

    if (currentPrices && currentPrices.length > 0) {
      const startDate = new Date(effective_start_date);
      const endDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 前一天
      const endDateStr = endDate.toISOString().split('T')[0];

      for (const price of currentPrices) {
        await supabase
          .from('material_prices')
          .update({ effective_end_date: endDateStr })
          .eq('id', price.id);
      }
    }

    const { data, error } = await supabase
      .from('material_prices')
      .insert([{
        material_id: id,
        unit_price: Number(unit_price),
        effective_start_date,
        effective_end_date: effective_end_date || null
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('创建价格记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新价格记录
router.put('/:materialId/prices/:priceId', async (req, res) => {
  try {
    const { materialId, priceId } = req.params;
    const { unit_price, effective_start_date, effective_end_date } = req.body;
    
    if (!unit_price || unit_price <= 0) {
      return res.status(400).json({ success: false, error: '请输入有效的单价' });
    }
    if (!effective_start_date) {
      return res.status(400).json({ success: false, error: '请输入生效开始日期' });
    }

    // 检查日期范围是否重叠（排除当前记录）
    const { data: existingPrices } = await supabase
      .from('material_prices')
      .select('*')
      .eq('material_id', materialId)
      .neq('id', priceId) // 排除当前正在更新的记录
      .or(`effective_end_date.is.null,and(effective_start_date.lte.${effective_end_date || '9999-12-31'})`)
      .or(`and(effective_end_date.gte.${effective_start_date},effective_start_date.lte.${effective_end_date || '9999-12-31'})`);

    if (existingPrices && existingPrices.length > 0) {
      return res.status(400).json({ success: false, error: '价格时间段不能与现有记录重叠' });
    }

    const { data, error } = await supabase
      .from('material_prices')
      .update({
        unit_price: Number(unit_price),
        effective_start_date,
        effective_end_date: effective_end_date || null
      })
      .eq('id', priceId)
      .eq('material_id', materialId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('更新价格记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除价格记录
router.delete('/:materialId/prices/:priceId', async (req, res) => {
  try {
    const { materialId, priceId } = req.params;
    const { error } = await supabase
      .from('material_prices')
      .delete()
      .eq('id', priceId)
      .eq('material_id', materialId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除价格记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;