import express from 'express'
import { query, supabaseQuery, supabaseInsert, supabaseUpdate, supabaseDelete } from '../lib/db.js'
import { 
  sendList, 
  sendSuccess, 
  sendCreated, 
  sendUpdated, 
  sendDeleted, 
  sendError, 
  sendNotFound,
  asyncHandler 
} from '../lib/response.js'

const router = express.Router()

/**
 * GET /api/cutting-orders
 * 获取下料单列表，支持分页、筛选和排序
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    page = '1',
    pageSize = '20',
    keyword = '',
    status = '',
    material_id = '',
    startDate = '',
    endDate = '',
    sortBy = 'created_date',
    sortOrder = 'desc'
  } = req.query

  const pageNum = parseInt(page as string)
  const pageSizeNum = parseInt(pageSize as string)
  const offset = (pageNum - 1) * pageSizeNum
  const startTime = Date.now()

  try {
    // 使用简单的SQL查询，避免复杂的连接
    let sql = `
      SELECT 
        co.id,
        co.inventory_number,
        CASE WHEN co.project_name IS NULL OR co.project_name = '' OR co.project_name = '未命名项目'
             THEN ti.project_name ELSE co.project_name END AS project_name,
        co.part_drawing_number,
        co.part_name,
        co.material,
        co.specifications,
        co.part_quantity,
        co.total_weight,
        co.material_source,
        co.created_date,
        co.tooling_id,
        co.part_id,
        ti.category as tooling_category,
        ti.production_unit,
        ti.sets_count
      FROM cutting_orders co
      LEFT JOIN tooling_info ti ON co.tooling_id = ti.id
      WHERE co.is_deleted = false
    `
    
    const params: any[] = []
    let paramIndex = 1
    
    // 添加过滤条件
    if (keyword) {
      const keywordParam = `%${keyword}%`
      sql += ` AND (co.project_name ILIKE $${paramIndex} OR co.inventory_number ILIKE $${paramIndex} OR co.part_name ILIKE $${paramIndex})`
      params.push(keywordParam)
      paramIndex++
    }
    
    if (status) {
      sql += ` AND co.material_source = $${paramIndex}`
      params.push(status)
      paramIndex++
    }
    
    if (material_id) {
      sql += ` AND co.material = $${paramIndex}`
      params.push(material_id)
      paramIndex++
    }
    
    if (startDate) {
      sql += ` AND co.created_date >= $${paramIndex}`
      params.push(startDate)
      paramIndex++
    }
    
    if (endDate) {
      sql += ` AND co.created_date <= $${paramIndex}`
      params.push(endDate)
      paramIndex++
    }
    
    // 获取总数
    const countSql = `SELECT COUNT(*) as count FROM (${sql}) as filtered`
    const countResult = await query(countSql, params)
    const total = parseInt(countResult.rows[0].count)
    
    // 添加排序和分页
    const orderColumn = sortBy === 'created_at' ? 'created_date' : sortBy
    sql += ` ORDER BY co.${orderColumn} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(pageSizeNum, offset)
    
    // 执行数据查询
    const dataResult = await query(sql, params)
    
    // 为了向后兼容，使用items而不是data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.json({
      success: true,
      items: dataResult.rows,
      total: total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
      queryTime: Date.now() - startTime
    })
  } catch (error: any) {
    console.error('[CuttingOrders] Error fetching data:', error)
    
    // 如果数据库连接失败，返回空数据而不是错误
    if (error.message.includes('Connection terminated') || error.message.includes('timeout')) {
      console.warn('[CuttingOrders] Database connection issue, returning empty data')
      return res.json({
        success: true,
        items: [],
        total: 0,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: 0,
        queryTime: Date.now() - startTime
      })
    }
    
    return res.status(500).json({
      success: false,
      error: '获取下料单列表失败',
      code: 'DATABASE_ERROR',
      details: error.message
    })
  }
}))

/**
 * GET /api/cutting-orders/:id
 * 获取单个下料单详情
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // 获取下料单基本信息
  const orderResult = await query(`
    SELECT 
      co.*,
      ti.inventory_number,
      ti.project_name,
      ti.category as tooling_category,
      ti.production_unit,
      ti.sets_count,
      m.name as material_name,
      m.density as material_density,
      m.unit as material_unit,
      m.price_per_unit as material_price
    FROM cutting_orders co
    LEFT JOIN tooling_info ti ON co.tooling_info_id = ti.id
    LEFT JOIN materials m ON co.material_id = m.id
    WHERE co.id = $1
  `, [id])

  if (orderResult.rows.length === 0) {
    return sendNotFound(res, '下料单')
  }

  const order = orderResult.rows[0]

  // 获取下料明细
  const items = await supabaseQuery('cutting_order_items', {
    filters: { cutting_order_id: id },
    orderBy: { column: 'created_at', ascending: true }
  })

  return sendSuccess(res, {
    ...order,
    items: items || []
  })
}))

/**
 * POST /api/cutting-orders
 * 创建下料单
 */
router.post('/', asyncHandler(async (req, res) => {
  const { orders = [] } = req.body
  if (!Array.isArray(orders) || orders.length === 0) {
    return sendError(res, '没有可创建的下料单', 'EMPTY_ORDERS', null, 400)
  }

  const inserted: any[] = []
  const updatedArr: any[] = []
  let skipped = 0

  for (const raw of orders) {
    const payload: any = {
      inventory_number: String(raw.inventory_number || '').trim(),
      project_name: String(raw.project_name || '').trim(),
      part_drawing_number: String(raw.part_drawing_number || ''),
      part_name: String(raw.part_name || '').trim(),
      specifications: String(raw.specifications || ''),
      part_quantity: Number(raw.part_quantity || 0),
      material_source: String(raw.material_source || '').trim() || '锯切',
      created_date: raw.created_date || new Date().toISOString(),
      material: raw.material || '',
      total_weight: raw.total_weight ?? null,
      tooling_id: raw.tooling_id || null,
      part_id: raw.part_id || null,
      tooling_info_id: raw.tooling_id || null
    }
    // remarks 列：若传入 remarks 则使用；若仅有 heat_treatment 标记则写入“需调质”
    if (typeof raw.remarks === 'string' && raw.remarks.trim()) {
      payload.remarks = String(raw.remarks).trim()
    } else if (raw.heat_treatment) {
      payload.remarks = '需调质'
    }

    // 必填校验（允许项目名称为空，列表会回填父级项目名）
    if (!payload.inventory_number || !payload.part_name || !payload.material_source || !(payload.part_quantity > 0)) {
      skipped++
      continue
    }

    // 查重：同 inventory_number 且未删除的记录存在则更新以对齐最新零件信息
    let existingId: string | null = null
    try {
      const dup = await supabaseQuery('cutting_orders', { filters: { inventory_number: payload.inventory_number, is_deleted: false } })
      if (Array.isArray(dup) && dup.length > 0) {
        existingId = dup[0].id
      }
    } catch (err) {
      console.warn('[CuttingOrders] duplicate check warning:', err)
    }

    // 服务器端回填总重（若未提供），以保证与零件信息一致
    if ((payload.total_weight === null || payload.total_weight === undefined) && payload.part_id && payload.part_quantity > 0) {
      try {
        const parts = await supabaseQuery('parts_info', { filters: { id: payload.part_id } })
        const unitW = parts?.[0]?.weight ? Number(parts[0].weight) : 0
        if (unitW && unitW > 0) {
          payload.total_weight = Math.round(unitW * payload.part_quantity * 1000) / 1000
        }
      } catch (err) {
        console.warn('[CuttingOrders] Fallback compute total_weight failed:', err)
      }
    }

    if (existingId) {
      // 执行更新，恢复软删除标志为false，并写入更新时间
      const updatePayload = { ...payload, is_deleted: false, updated_date: new Date().toISOString() }
      const rows = await supabaseUpdate('cutting_orders', updatePayload, { id: existingId })
      if (rows && rows.length > 0) updatedArr.push(rows[0])
    } else {
      const rows = await supabaseInsert('cutting_orders', payload)
      if (rows && rows.length > 0) inserted.push(rows[0])
    }
  }

  return sendCreated(res, {
    success: true,
    stats: { inserted: inserted.length, updated: updatedArr.length, skipped },
    data: [...inserted, ...updatedArr]
  })
}))

/**
 * PUT /api/cutting-orders/:id
 * 更新下料单
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const {
    tooling_info_id,
    material_id,
    order_date,
    required_date,
    completed_date,
    notes,
    status,
    items
  } = req.body

  // 检查下料单是否存在
  const existingOrder = await supabaseQuery('cutting_orders', {
    filters: { id }
  })

  if (existingOrder.length === 0) {
    return sendNotFound(res, '下料单')
  }

  // 验证工装信息（如果提供）
  if (tooling_info_id) {
    const toolingInfo = await supabaseQuery('tooling_info', {
      filters: { id: tooling_info_id }
    })

    if (toolingInfo.length === 0) {
      return sendError(res, '工装信息不存在', 'INVALID_TOOLING_INFO', null, 400)
    }
  }

  // 验证材料（如果提供）
  if (material_id) {
    const material = await supabaseQuery('materials', {
      filters: { id: material_id }
    })

    if (material.length === 0) {
      return sendError(res, '材料不存在', 'INVALID_MATERIAL', null, 400)
    }
  }

  // 构建更新数据
  const updateData: any = {}
  if (tooling_info_id !== undefined) updateData.tooling_info_id = tooling_info_id
  if (material_id !== undefined) updateData.material_id = material_id
  if (order_date !== undefined) updateData.order_date = order_date
  if (required_date !== undefined) updateData.required_date = required_date
  if (completed_date !== undefined) updateData.completed_date = completed_date
  if (notes !== undefined) updateData.notes = notes
  // 后端数据库当前无 status 列，忽略该字段更新

  // 如果更新了明细，重新计算总重量和总价格
  if (items && items.length > 0) {
    const totalWeight = items.reduce((sum: number, item: any) => {
      return sum + (item.weight * item.quantity)
    }, 0)

    const totalPrice = items.reduce((sum: number, item: any) => {
      return sum + item.total_price
    }, 0)

    updateData.total_weight = totalWeight
    updateData.total_price = totalPrice
  }

  // 更新下料单
  await supabaseUpdate('cutting_orders', updateData, { id })

  // 如果更新了明细，先删除旧明细，再插入新明细
  if (items && items.length > 0) {
    await supabaseDelete('cutting_order_items', { cutting_order_id: id })

    const itemsData = items.map((item: any, index: number) => ({
      cutting_order_id: id,
      item_number: index + 1,
      part_name: item.part_name,
      specifications: item.specifications || {},
      quantity: item.quantity,
      weight: item.weight,
      total_price: item.total_price,
      notes: item.notes,
      status: item.status || 'pending'
    }))

    await supabaseInsert('cutting_order_items', itemsData)
  }

  // 返回更新后的下料单
  const updatedOrder = await query(`
    SELECT 
      co.*,
      ti.inventory_number,
      ti.project_name,
      ti.category as tooling_category,
      ti.production_unit,
      ti.sets_count,
      m.name as material_name,
      m.density as material_density,
      m.unit as material_unit
    FROM cutting_orders co
    LEFT JOIN tooling_info ti ON co.tooling_info_id = ti.id
    LEFT JOIN materials m ON co.material_id = m.id
    WHERE co.id = $1
  `, [id])

  return sendUpdated(res, updatedOrder.rows[0], '下料单更新成功')
}))

/**
 * DELETE /api/cutting-orders/:id
 * 删除下料单
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // 检查下料单是否存在
  const existingOrder = await supabaseQuery('cutting_orders', {
    filters: { id }
  })

  if (existingOrder.length === 0) {
    return sendNotFound(res, '下料单')
  }

  // 先删除下料明细
  await supabaseDelete('cutting_order_items', { cutting_order_id: id })

  // 再删除下料单
  await supabaseDelete('cutting_orders', { id })

  return sendDeleted(res, '下料单删除成功')
}))

/**
 * POST /api/cutting-orders/batch-delete
 * 批量删除下料单
 */
router.post('/batch-delete', asyncHandler(async (req, res) => {
  const { ids = [] } = req.body as { ids: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return sendError(res, '没有可删除的ID', 'EMPTY_IDS', null, 400)
  }

  // 先通过 Supabase 删除（RLS/缓存兼容）
  for (const id of ids) {
    try {
      await supabaseDelete('cutting_order_items', { cutting_order_id: id })
      await supabaseDelete('cutting_orders', { id })
    } catch (err) {
      console.warn('[CuttingOrders] Supabase delete warning:', err)
    }
  }

  // 过滤合法UUID，避免SQL错误
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const validIds = ids.filter(id => typeof id === 'string' && uuidRegex.test(id))

  // 使用事务保证原子性
  let deleted = 0
  // 先做软删除，保证列表立即不显示
  try {
    await supabaseUpdate('cutting_orders', { is_deleted: true }, { id: validIds[0] })
    // 批量软删：使用原生SQL
    await query(`UPDATE cutting_orders SET is_deleted = true WHERE id = ANY($1::uuid[])`, [validIds])
  } catch (err) {
    console.warn('[CuttingOrders] Soft delete warning:', err)
  }
  try {
    await transaction(async (client) => {
      const itemsResult = await client.query(
        `DELETE FROM cutting_order_items WHERE cutting_order_id = ANY($1::uuid[])`, [validIds]
      )
      const ordersResult = await client.query(
        `DELETE FROM cutting_orders WHERE id = ANY($1::uuid[])`, [validIds]
      )
      deleted = (itemsResult.rowCount || 0) + (ordersResult.rowCount || 0)
    })
  } catch (err) {
    console.error('[CuttingOrders] Transaction batch delete error:', err)
  }

  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  return sendSuccess(res, { deleted })
}))

/**
 * GET /api/cutting-orders/summary
 * 获取下料单汇总信息
 */
router.get('/summary', asyncHandler(async (req, res) => {
  const { startDate = '', endDate = '' } = req.query

  let sql = `
    SELECT 
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
      SUM(total_weight) as total_weight,
      SUM(total_price) as total_price,
      AVG(total_weight) as avg_weight,
      AVG(total_price) as avg_price
    FROM cutting_orders
    WHERE 1=1
  `

  const params: any[] = []
  
  if (startDate) {
    sql += ` AND order_date >= $${params.length + 1}`
    params.push(startDate)
  }
  
  if (endDate) {
    sql += ` AND order_date <= $${params.length + 1}`
    params.push(endDate)
  }

  const result = await query(sql, params)

  return sendSuccess(res, result.rows[0] || {
    total_orders: 0,
    completed_orders: 0,
    pending_orders: 0,
    total_weight: 0,
    total_price: 0,
    avg_weight: 0,
    avg_price: 0
  })
}))

export default router
