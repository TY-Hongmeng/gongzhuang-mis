/**
 * 料型基础数据管理
 */

import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

// 获取料型列表
router.get('/', async (req, res) => {
  try {
    const { order = 'created_at.desc' } = req.query
    
    let query = supabase
      .from('part_types')
      .select('id, name, description, volume_formula, input_format, created_at, updated_at')
      .order('sort_order', { ascending: true })
    
    if (order) {
      const [field, direction] = (order as string).split('.')
      query = query.order(field, { ascending: direction === 'asc' })
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('获取料型列表失败:', error)
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        code: error.code 
      })
    }
    
    res.json({ 
      success: true, 
      data: data || [] 
    })
  } catch (error: any) {
    console.error('获取料型列表失败:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || '服务器错误' 
    })
  }
})

// 创建料型
router.post('/', async (req, res) => {
  try {
    const { name, description, volume_formula, input_format } = req.body
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: '料型名称不能为空' 
      })
    }
    
    const { data, error } = await supabase
      .from('part_types')
      .insert([{ 
        name: name.trim(), 
        description: description?.trim() || null,
        volume_formula: volume_formula?.trim() || null,
        input_format: input_format?.trim() || null
      }])
      .select()
      .single()
    
    if (error) {
      console.error('创建料型失败:', error)
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        code: error.code 
      })
    }
    
    res.json({ 
      success: true, 
      data 
    })
  } catch (error: any) {
    console.error('创建料型失败:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || '服务器错误' 
    })
  }
})

// 更新料型
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, volume_formula, input_format } = req.body
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: '料型名称不能为空' 
      })
    }
    
    const { data, error } = await supabase
      .from('part_types')
      .update({ 
        name: name.trim(), 
        description: description?.trim() || null,
        volume_formula: volume_formula?.trim() || null,
        input_format: input_format?.trim() || null
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('更新料型失败:', error)
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        code: error.code 
      })
    }
    
    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: '料型不存在' 
      })
    }
    
    res.json({ 
      success: true, 
      data 
    })
  } catch (error: any) {
    console.error('更新料型失败:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || '服务器错误' 
    })
  }
})

// 删除料型
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    // 检查是否被使用
    const { data: usageData, error: usageError } = await supabase
      .from('parts_info')
      .select('id')
      .eq('part_category', id)
      .limit(1)
    
    if (usageError) {
      console.error('检查料型使用情况失败:', usageError)
      return res.status(500).json({ 
        success: false, 
        error: usageError.message 
      })
    }
    
    if (usageData && usageData.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '该料型正在被使用，无法删除' 
      })
    }
    
    const { error } = await supabase
      .from('part_types')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('删除料型失败:', error)
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        code: error.code 
      })
    }
    
    res.json({ 
      success: true 
    })
  } catch (error: any) {
    console.error('删除料型失败:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || '服务器错误' 
    })
  }
})

// 重新排序料型
router.post('/reorder', async (req, res) => {
  try {
    const { itemId, newIndex, oldIndex } = req.body;
    
    if (!itemId || newIndex === undefined || oldIndex === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: '参数不完整' 
      });
    }

    // 获取所有料型（包含所有必需字段）
    const { data: partTypes, error: fetchError } = await supabase
      .from('part_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (fetchError) {
      console.error('获取料型列表失败:', fetchError)
      return res.status(500).json({ 
        success: false, 
        error: fetchError.message 
      });
    }

    // 重新计算排序
    const newItems = [...partTypes];
    const [removed] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, removed);

    // 更新数据库中的排序（只更新sort_order字段）
    for (let i = 0; i < newItems.length; i++) {
      const { error: updateError } = await supabase
        .from('part_types')
        .update({ sort_order: i })
        .eq('id', newItems[i].id);

      if (updateError) {
        console.error('更新料型排序失败:', updateError)
        return res.status(500).json({ 
          success: false, 
          error: updateError.message 
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('重新排序料型失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || '服务器错误' 
    });
  }
});

export default router