import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ success: false, error: '加载用户列表失败' })
    }

    res.json({ success: true, items: data || [] })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '加载用户列表失败' })
  }
})

// 公司列表
router.get('/companies', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name')
    if (error) {
      return res.status(500).json({ success: false, error: '加载公司列表失败' })
    }
    res.json({ success: true, items: data || [] })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '加载公司列表失败' })
  }
})

// 角色列表
router.get('/roles', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('name')
    if (error) {
      return res.status(500).json({ success: false, error: '加载角色列表失败' })
    }
    res.json({ success: true, items: data || [] })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '加载角色列表失败' })
  }
})

// 更新用户状态
router.put('/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const { status } = req.body || {}
    if (!id || !status) {
      return res.status(400).json({ success: false, error: '缺少必要参数' })
    }
    const { error } = await supabase
      .from('users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      return res.status(500).json({ success: false, error: '更新用户状态失败' })
    }
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '更新用户状态失败' })
  }
})

// 更新用户基本信息
router.put('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const payload = req.body || {}
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少用户ID' })
    }
    const { data: beforeUser } = await supabase
      .from('users')
      .select('real_name')
      .eq('id', id)
      .single()
    const oldRealNameRaw = String((beforeUser as any)?.real_name || '')
    const newRealNameRaw = String(payload.real_name || '')
    const oldRealName = oldRealNameRaw.trim()
    const newRealName = newRealNameRaw.trim()

    const allowed: any = {
      real_name: payload.real_name,
      phone: payload.phone,
      id_card: payload.id_card,
      company_id: payload.company_id,
      role_id: payload.role_id,
      capability_coeff: payload.capability_coeff,
      workshop_id: payload.workshop_id ?? null,
      team_id: payload.team_id ?? null,
      status: payload.status,
      updated_at: new Date().toISOString()
    }
    const { error } = await supabase
      .from('users')
      .update(allowed)
      .eq('id', id)
    if (error) {
      return res.status(500).json({ success: false, error: '更新用户失败' })
    }
    // 用户改名时，同步更新工时记录中的操作人名称，确保工时管理显示一致
    if (oldRealName && newRealName && oldRealName !== newRealName) {
      const { error: syncErr } = await supabase
        .from('work_hours')
        .update({ operator: newRealName })
        .eq('operator', oldRealName)
      if (syncErr) {
        return res.status(500).json({ success: false, error: `用户已更新，但工时同步失败: ${syncErr.message}` })
      }
      // 兜底：全量分页扫描，避免历史数据量大时遗漏，确保新旧姓名不会并存
      const normalizeName = (v: any) =>
        String(v || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s+/g, '')
          .toLowerCase()
      const targetOld = normalizeName(oldRealNameRaw)
      if (targetOld) {
        const pageSize = 1000
        let from = 0
        const ids: string[] = []
        while (true) {
          const { data: rows, error: scanErr } = await supabase
            .from('work_hours')
            .select('id, operator')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)
          if (scanErr) {
            return res.status(500).json({ success: false, error: `用户已更新，但工时补同步失败: ${scanErr.message}` })
          }
          const list = rows || []
          if (list.length === 0) break
          list.forEach((r: any) => {
            if (normalizeName(r?.operator) === targetOld) ids.push(String(r.id || ''))
          })
          if (list.length < pageSize) break
          from += pageSize
        }
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500)
          if (!chunk.length) continue
          const { error: patchErr } = await supabase
            .from('work_hours')
            .update({ operator: newRealName })
            .in('id', chunk as any)
          if (patchErr) {
            return res.status(500).json({ success: false, error: `用户已更新，但工时补同步失败: ${patchErr.message}` })
          }
        }
      }
    }
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '更新用户失败' })
  }
})

export default router
