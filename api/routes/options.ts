import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// 获取所有投产单位
router.get('/production-units', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('production_units')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取投产单位失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建投产单位
router.post('/production-units', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '单位名称不能为空' });
    }

    const { data, error } = await supabase
      .from('production_units')
      .insert([{ name: name.trim(), description }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('创建投产单位失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新投产单位
router.put('/production-units/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '单位名称不能为空' });
    }

    const { data, error } = await supabase
      .from('production_units')
      .update({ name: name.trim(), description, is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('更新投产单位失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除投产单位
router.delete('/production-units/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('production_units')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('删除投产单位失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有工装类别
router.get('/tooling-categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tooling_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取工装类别失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建工装类别
router.post('/tooling-categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '类别名称不能为空' });
    }

    const { data, error } = await supabase
      .from('tooling_categories')
      .insert([{ name: name.trim(), description }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('创建工装类别失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新工装类别
router.put('/tooling-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '类别名称不能为空' });
    }

    const { data, error } = await supabase
      .from('tooling_categories')
      .update({ name: name.trim(), description, is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('更新工装类别失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除工装类别
router.delete('/tooling-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('tooling_categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('删除工装类别失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有材料来源
router.get('/material-sources', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('material_sources')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取材料来源失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建材料来源
router.post('/material-sources', async (req, res) => {
  try {
    const { name, description, is_active } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '材料来源名称不能为空' });
    }

    const { data, error } = await supabase
      .from('material_sources')
      .insert([{ name: name.trim(), description: description?.trim() || '', is_active: is_active ?? true }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('创建材料来源失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新材料来源
router.put('/material-sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '材料来源名称不能为空' });
    }

    const { data, error } = await supabase
      .from('material_sources')
      .update({ name: name.trim(), description: description?.trim() || '', is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('更新材料来源失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除材料来源
router.delete('/material-sources/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('material_sources')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除材料来源失败:', error);
    // 外键约束
    if ((error as any)?.code === '23503') {
      return res.status(400).json({ success: false, error: '该材料来源正在被使用，无法删除' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重新排序投产单位
router.post('/production-units/reorder', async (req, res) => {
  try {
    const { itemId, newIndex, oldIndex } = req.body;
    
    if (!itemId || newIndex === undefined || oldIndex === undefined) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }

    // 获取所有投产单位（包含所有必需字段）
    const { data: units, error: fetchError } = await supabase
      .from('production_units')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (fetchError) throw fetchError;

    // 重新计算排序
    const newItems = [...units];
    const [removed] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, removed);

    // 更新数据库中的排序（只更新sort_order字段）
    for (let i = 0; i < newItems.length; i++) {
      const { error: updateError } = await supabase
        .from('production_units')
        .update({ sort_order: i })
        .eq('id', newItems[i].id);

      if (updateError) throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('重新排序投产单位失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重新排序工装类别
router.post('/tooling-categories/reorder', async (req, res) => {
  try {
    const { itemId, newIndex, oldIndex } = req.body;
    
    if (!itemId || newIndex === undefined || oldIndex === undefined) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }

    // 获取所有工装类别（包含所有必需字段）
    const { data: categories, error: fetchError } = await supabase
      .from('tooling_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (fetchError) throw fetchError;

    // 重新计算排序
    const newItems = [...categories];
    const [removed] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, removed);

    // 更新数据库中的排序（只更新sort_order字段）
    for (let i = 0; i < newItems.length; i++) {
      const { error: updateError } = await supabase
        .from('tooling_categories')
        .update({ sort_order: i })
        .eq('id', newItems[i].id);

      if (updateError) throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('重新排序工装类别失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重新排序材料来源
router.post('/material-sources/reorder', async (req, res) => {
  try {
    const { itemId, newIndex, oldIndex } = req.body;
    
    if (!itemId || newIndex === undefined || oldIndex === undefined) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }

    // 获取所有材料来源（包含所有必需字段）
    const { data: sources, error: fetchError } = await supabase
      .from('material_sources')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (fetchError) throw fetchError;

    // 重新计算排序
    const newItems = [...sources];
    const [removed] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, removed);

    // 更新数据库中的排序（只更新sort_order字段）
    for (let i = 0; i < newItems.length; i++) {
      const { error: updateError } = await supabase
        .from('material_sources')
        .update({ sort_order: i })
        .eq('id', newItems[i].id);

      if (updateError) throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('重新排序材料来源失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有供应商
router.get('/suppliers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取供应商失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建供应商
router.post('/suppliers', async (req, res) => {
  try {
    const { name, contact, phone, address } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '供应商名称不能为空' });
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([{ 
        name: name.trim(), 
        contact: contact?.trim() || '', 
        phone: phone?.trim() || '', 
        address: address?.trim() || '' 
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('创建供应商失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新供应商
router.put('/suppliers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact, phone, address, is_active } = req.body;

    if (name !== undefined && !name?.trim()) {
      return res.status(400).json({ success: false, error: '供应商名称不能为空' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (contact !== undefined) updateData.contact = contact?.trim() || '';
    if (phone !== undefined) updateData.phone = phone?.trim() || '';
    if (address !== undefined) updateData.address = address?.trim() || '';
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('更新供应商失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除供应商
router.delete('/suppliers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除供应商失败:', error);
    // 外键约束
    if ((error as any)?.code === '23503') {
      return res.status(400).json({ success: false, error: '该供应商正在被使用，无法删除' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;