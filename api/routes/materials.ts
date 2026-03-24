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

export default router;
