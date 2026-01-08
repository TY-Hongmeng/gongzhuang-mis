import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// 获取所有备用材料
router.get('/', async (req, res) => {
  try {
    console.log('=== 获取备用材料列表 ===');
    
    const { data, error } = await supabase
      .from('backup_materials')
      .select('*')
      .order('created_date', { ascending: false });

    if (error) {
      console.error('获取备用材料失败:', error);
      return res.status(500).json({ 
        success: false, 
        error: '获取备用材料失败',
        details: error.message 
      });
    }

    console.log('获取到备用材料数量:', data?.length || 0);
    
    return res.json({ 
      success: true, 
      data: data || [] 
    });
  } catch (error) {
    console.error('获取备用材料异常:', error);
    return res.status(500).json({ 
      success: false, 
      error: '获取备用材料异常',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 创建备用材料
router.post('/', async (req, res) => {
  try {
    console.log('=== 创建备用材料 ===');
    console.log('请求体:', JSON.stringify(req.body, null, 2));
    
    const { materials } = req.body;
    
    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供备用材料数据' 
      });
    }

    const results = [];
    
    for (const material of materials) {
      try {
        console.log('处理备用材料:', material);
        
        // 临时计划阶段不做必填校验，生成采购单时统一校验

        // 构建数据库数据
        const dbData: any = {
          material_name: (material.material_name || '').trim(),
          unit: (material.unit || '').trim(),
          project_name: material.project_name || '',
          // 兼容前端显示字段：production_unit 映射到 supplier 列存储
          supplier: (material.production_unit || material.supplier || ''),
          model: material.model || '',
          material: material.material || '',
          material_type: material.material_type || '',
          applicant: material.applicant || '手动录入',
          created_date: material.created_date || new Date().toISOString().split('T')[0],
          is_manual: true
        };

        // 处理需求日期：仅在有效格式时写入，否则不设置该字段
        if (material.demand_date && typeof material.demand_date === 'string') {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (dateRegex.test(material.demand_date)) {
            dbData.demand_date = material.demand_date
          }
        }

        // 处理数量
        if (material.quantity !== undefined && material.quantity !== '') {
          const quantity = parseInt(String(material.quantity));
          if (!isNaN(quantity) && quantity > 0) {
            dbData.quantity = quantity;
          }
        }

        // 处理价格
        if (material.price !== undefined && material.price !== '') {
          const price = parseFloat(String(material.price));
          if (!isNaN(price) && price >= 0) {
            dbData.price = price;
          }
        }

        console.log('插入数据库的数据:', dbData);

        const { data, error } = await supabase
          .from('backup_materials')
          .insert([dbData])
          .select()
          .single();

        if (error) {
          console.error('创建备用材料失败:', error);
          results.push({
            success: false,
            error: `创建备用材料失败: ${error.message}`,
            data: material
          });
        } else {
          console.log('创建备用材料成功:', data);
          results.push({
            success: true,
            data: data
          });
        }
      } catch (error) {
        console.error('处理单个备用材料异常:', error);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : '处理备用材料异常',
          data: material
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`批量创建备用材料完成: 成功 ${successCount} 个, 失败 ${errorCount} 个`);

    return res.json({
      success: errorCount === 0,
      message: `创建完成: 成功 ${successCount} 个, 失败 ${errorCount} 个`,
      results: results
    });
  } catch (error) {
    console.error('创建备用材料异常:', error);
    return res.status(500).json({
      success: false,
      error: '创建备用材料异常',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

  // 更新备用材料
  router.put('/:id', async (req, res) => {
  try {
    console.log('=== 更新备用材料 ===');
    console.log('记录ID:', req.params.id);
    console.log('更新数据:', req.body);
    
    const { id } = req.params;
    const updateData = req.body;

    // 保留原字段含义：material 为材质，material_name 为名称

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供更新数据' 
      });
    }

    // 临时计划阶段不做必填校验，生成采购单时统一校验

    // 处理数量（如为空值则不写入；如为有效数字则写入）
    if (updateData.quantity !== undefined) {
      if (updateData.quantity === '' || updateData.quantity === null) {
        delete updateData.quantity
      } else {
        const quantity = parseInt(String(updateData.quantity))
        if (!isNaN(quantity) && quantity > 0) {
          updateData.quantity = quantity
        } else {
          delete updateData.quantity
        }
      }
    }

    // 处理价格（如为空值则不写入；如为有效数字则写入）
    if (updateData.price !== undefined) {
      if (updateData.price === '' || updateData.price === null) {
        delete updateData.price
      } else {
        const price = parseFloat(String(updateData.price))
        if (!isNaN(price) && price >= 0) {
          updateData.price = price
        } else {
          delete updateData.price
        }
      }
    }

    // 处理需求日期（仅在有效格式时写入，否则移除）
    if (updateData.demand_date !== undefined) {
      if (updateData.demand_date && String(updateData.demand_date).trim() !== '') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(String(updateData.demand_date))) {
          delete updateData.demand_date
        }
      } else {
        delete updateData.demand_date
      }
    }

    // 处理创建日期（仅在有效格式时写入，否则移除）
    if (updateData.created_date !== undefined) {
      if (updateData.created_date && String(updateData.created_date).trim() !== '') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(String(updateData.created_date))) {
          delete updateData.created_date
        }
      } else {
        delete updateData.created_date
      }
    }

    // 仅允许白名单字段更新，避免未知字段导致数据库错误
    const allowedKeys = new Set([
      'material_name', 'unit', 'project_name', 'supplier', 'model', 'material', 'material_type',
      'applicant', 'created_date', 'demand_date', 'quantity', 'price'
    ])
    Object.keys(updateData).forEach((k) => {
      if (!allowedKeys.has(k)) delete updateData[k]
    })

    // 如果清理后没有任何可更新字段，直接返回成功（无变化）
    if (Object.keys(updateData).length === 0) {
      console.log('无可更新字段，直接返回成功')
      return res.json({ success: true, data: null })
    }

    // 字段兼容：前端的 production_unit 显示字段写入到数据库的 supplier 列
    if (updateData.production_unit !== undefined) {
      updateData.supplier = String(updateData.production_unit || '')
      delete updateData.production_unit
    }

    console.log('更新数据库的数据:', updateData);

    const { data, error } = await supabase
      .from('backup_materials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新备用材料失败:', error);
      return res.status(500).json({ 
        success: false, 
        error: '更新备用材料失败',
        details: error.message 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: '备用材料不存在' 
      });
    }

    console.log('更新备用材料成功:', data);
    return res.json({ 
      success: true, 
      data: data 
    });
  } catch (error) {
    console.error('更新备用材料异常:', error);
    return res.status(500).json({ 
      success: false, 
      error: '更新备用材料异常',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 批量删除备用材料
router.post('/batch-delete', async (req, res) => {
  try {
    console.log('=== 批量删除备用材料 ===');
    console.log('请求数据:', req.body);
    
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供要删除的备用材料ID列表' 
      });
    }

    console.log('要删除的备用材料ID:', ids);

    const { data, error } = await supabase
      .from('backup_materials')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('批量删除备用材料失败:', error);
      return res.status(500).json({ 
        success: false, 
        error: '批量删除备用材料失败',
        details: error.message 
      });
    }

    console.log('批量删除备用材料成功，删除数量:', ids.length);
    
    return res.json({ 
      success: true, 
      message: `成功删除 ${ids.length} 条备用材料`,
      deletedCount: ids.length 
    });
  } catch (error) {
    console.error('批量删除备用材料异常:', error);
    return res.status(500).json({ 
      success: false, 
      error: '批量删除备用材料异常',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
