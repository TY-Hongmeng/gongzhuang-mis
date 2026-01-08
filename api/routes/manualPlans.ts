import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

// GET /api/manual-plans
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('manual_purchase_plans')
      .select('*')
      .order('created_date', { ascending: false })

    if (error) return res.status(500).json({ success: false, error: error.message })
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// POST /api/manual-plans
router.post('/', async (req, res) => {
  try {
    const { orders } = req.body || {}
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, error: '缺少数据' })
    }

    const isValidDate = (s: any): boolean => {
      if (typeof s !== 'string') return false
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
      const d = new Date(s)
      return !isNaN(d.getTime())
    }

    // 仅允许名称与单位必填；数量可选
    const sanitized = orders.map((o: any) => ({
      inventory_number: o.inventory_number || null,
      project_name: o.project_name || null,
      part_name: String(o.part_name || '').trim(),
      part_quantity: typeof o.part_quantity === 'number' ? o.part_quantity : null,
      unit: String(o.unit || '').trim(),
      model: o.model || null,
      supplier: o.supplier || null,
      required_date: isValidDate(o.required_date) ? o.required_date : null,
      remark: o.remark || null,
      status: 'draft',
      created_date: o.created_date || new Date().toISOString(),
      production_unit: o.production_unit || null,
      demand_date: isValidDate(o.demand_date) ? o.demand_date : null,
      applicant: o.applicant || null,
    }))


    const { data, error } = await supabase
      .from('manual_purchase_plans')
      .insert(sanitized)
      .select('*')

    if (error) return res.status(500).json({ success: false, error: error.message })
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// PUT /api/manual-plans/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body || {}

    const { data, error } = await supabase
      .from('manual_purchase_plans')
      .update({ ...updates, updated_date: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return res.status(500).json({ success: false, error: error.message })
    if (!data) return res.status(404).json({ success: false, error: '未找到记录' })
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// DELETE /api/manual-plans/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase
      .from('manual_purchase_plans')
      .delete()
      .eq('id', id)
      .select('*')
      .single()

    if (error) return res.status(500).json({ success: false, error: error.message })
    if (!data) return res.status(404).json({ success: false, error: '未找到记录' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// POST /api/manual-plans/batch-delete
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少ID列表' })
    }

    const { error } = await supabase
      .from('manual_purchase_plans')
      .delete()
      .in('id', ids)

    if (error) return res.status(500).json({ success: false, error: error.message })
    res.json({ success: true, deleted: ids.length })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

export default router
