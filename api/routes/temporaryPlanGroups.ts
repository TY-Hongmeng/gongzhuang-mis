import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('temporary_plan_groups')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      return res.status(500).json({ success: false, error: error.message })
    }

    res.json({ success: true, data: data || [] })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

router.post('/', async (req, res) => {
  try {
    const body = req.body || {}
    const code = String(body.code || '').trim()
    const monthKey = String(body.month_key || body.monthKey || '').trim()
    const items = Array.isArray(body.items) ? body.items : []

    if (!code) {
      return res.status(400).json({ success: false, error: '缺少分组编码' })
    }

    const payload = {
      code,
      month_key: monthKey || null,
      items,
      created_by: String(body.created_by || '').trim() || null,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('temporary_plan_groups')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ success: false, error: error.message })
    }

    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const body = req.body || {}
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (body.items !== undefined) {
      updates.items = Array.isArray(body.items) ? body.items : []
    }
    if (body.code !== undefined) {
      updates.code = String(body.code || '').trim()
    }
    if (body.month_key !== undefined || body.monthKey !== undefined) {
      updates.month_key = String(body.month_key || body.monthKey || '').trim() || null
    }

    const { data, error } = await supabase
      .from('temporary_plan_groups')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
    if (!data) {
      return res.status(404).json({ success: false, error: '未找到分组' })
    }

    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

router.post('/batch-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (!ids.length) {
      return res.status(400).json({ success: false, error: '缺少ID列表' })
    }

    const { error } = await supabase
      .from('temporary_plan_groups')
      .delete()
      .in('id', ids)

    if (error) {
      return res.status(500).json({ success: false, error: error.message })
    }

    res.json({ success: true, deleted: ids.length })
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

export default router
