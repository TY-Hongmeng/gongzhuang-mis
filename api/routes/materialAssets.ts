import express from 'express'
import { query, transaction } from '../lib/db.js'

const router = express.Router()

let schemaReady = false

const RESPONSIBILITY_STATUS = {
  pending: '待确认',
  confirmed: '已确认',
  transferPending: '待转移确认'
} as const

const ASSET_STATUS = {
  active: '在用',
  scrapped: '报废'
} as const

const SCRAP_STATUS = {
  none: '无',
  pending: '待报废',
  done: '已报废'
} as const

const normText = (value: any) => String(value || '').trim()

const isManagerRole = (roleName: string) => {
  const normalized = normText(roleName)
  return normalized.includes('超级管理员')
    || normalized.includes('库管')
    || normalized.includes('仓管')
    || normalized.includes('库房')
}

const escapeLike = (value: string) => value.replace(/[%_]/g, '\\$&')

const ensureSchema = async () => {
  if (schemaReady) return
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await query(`
    CREATE TABLE IF NOT EXISTS measure_tool_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      model_spec TEXT NOT NULL DEFAULT '',
      responsible_person TEXT NOT NULL DEFAULT '',
      responsible_user_id TEXT NOT NULL DEFAULT '',
      pending_responsible_person TEXT NOT NULL DEFAULT '',
      pending_responsible_user_id TEXT NOT NULL DEFAULT '',
      responsibility_status TEXT NOT NULL DEFAULT '待确认',
      asset_status TEXT NOT NULL DEFAULT '在用',
      scrap_status TEXT NOT NULL DEFAULT '无',
      scrap_reason TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_measure_tool_assets_code_unique ON measure_tool_assets(code)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_responsible_person ON measure_tool_assets(responsible_person)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_pending_responsible_person ON measure_tool_assets(pending_responsible_person)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_measure_tool_assets_status_mix ON measure_tool_assets(asset_status, responsibility_status, scrap_status)`)
  await query(`
    CREATE TABLE IF NOT EXISTS measure_tool_asset_histories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES measure_tool_assets(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      action_label TEXT NOT NULL,
      operator_name TEXT NOT NULL DEFAULT '',
      operator_user_id TEXT NOT NULL DEFAULT '',
      target_name TEXT NOT NULL DEFAULT '',
      target_user_id TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_measure_tool_asset_histories_asset_created ON measure_tool_asset_histories(asset_id, created_at DESC)`)
  schemaReady = true
}

type Actor = {
  userId: string
  actorName: string
  roleName: string
  isManager: boolean
}

const resolveActor = async (userIdInput?: any, operatorInput?: any): Promise<Actor> => {
  const userId = normText(userIdInput)
  const operator = normText(operatorInput)

  if (userId) {
    const rs = await query(`
      SELECT
        CAST(u.id AS TEXT) AS id,
        COALESCE(u.real_name, '') AS real_name,
        COALESCE(r.name, '') AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE CAST(u.id AS TEXT) = $1
      LIMIT 1
    `, [userId])
    const row = rs.rows?.[0] || {}
    const actorName = normText(row.real_name) || operator
    const roleName = normText(row.role_name)
    return {
      userId: normText(row.id) || userId,
      actorName,
      roleName,
      isManager: isManagerRole(roleName)
    }
  }

  if (operator) {
    const rs = await query(`
      SELECT
        CAST(u.id AS TEXT) AS id,
        COALESCE(u.real_name, '') AS real_name,
        COALESCE(r.name, '') AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.real_name = $1
      ORDER BY u.updated_at DESC NULLS LAST
      LIMIT 1
    `, [operator])
    const row = rs.rows?.[0] || {}
    const actorName = normText(row.real_name) || operator
    const roleName = normText(row.role_name)
    return {
      userId: normText(row.id),
      actorName,
      roleName,
      isManager: isManagerRole(roleName)
    }
  }

  return {
    userId: '',
    actorName: '',
    roleName: '',
    isManager: false
  }
}

const resolveUserByIdentity = async (userIdInput?: any, userNameInput?: any) => {
  const userId = normText(userIdInput)
  const userName = normText(userNameInput)

  if (userId) {
    const rs = await query(`
      SELECT CAST(id AS TEXT) AS id, COALESCE(real_name, '') AS real_name
      FROM users
      WHERE CAST(id AS TEXT) = $1
      LIMIT 1
    `, [userId])
    const row = rs.rows?.[0]
    if (row) {
      return {
        userId: normText(row.id),
        realName: normText(row.real_name)
      }
    }
  }

  if (userName) {
    const rs = await query(`
      SELECT CAST(id AS TEXT) AS id, COALESCE(real_name, '') AS real_name
      FROM users
      WHERE real_name = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `, [userName])
    const row = rs.rows?.[0]
    if (row) {
      return {
        userId: normText(row.id),
        realName: normText(row.real_name) || userName
      }
    }
  }

  return {
    userId,
    realName: userName
  }
}

const canMatchActor = (asset: any, actor: Actor, fieldName: 'responsible' | 'pending') => {
  if (actor.isManager) return true
  if (fieldName === 'responsible') {
    return (
      (actor.userId && actor.userId === normText(asset.responsible_user_id))
      || (actor.actorName && actor.actorName === normText(asset.responsible_person))
    )
  }
  return (
    (actor.userId && actor.userId === normText(asset.pending_responsible_user_id))
    || (actor.actorName && actor.actorName === normText(asset.pending_responsible_person))
  )
}

const insertHistory = async (
  client: any,
  assetId: string,
  payload: {
    actionType: string
    actionLabel: string
    operatorName?: string
    operatorUserId?: string
    targetName?: string
    targetUserId?: string
    remark?: string
    detail?: Record<string, any>
  }
) => {
  await client.query(`
    INSERT INTO measure_tool_asset_histories (
      asset_id,
      action_type,
      action_label,
      operator_name,
      operator_user_id,
      target_name,
      target_user_id,
      remark,
      detail_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
  `, [
    assetId,
    payload.actionType,
    payload.actionLabel,
    normText(payload.operatorName),
    normText(payload.operatorUserId),
    normText(payload.targetName),
    normText(payload.targetUserId),
    normText(payload.remark),
    JSON.stringify(payload.detail || {})
  ])
}

const loadAssetById = async (assetId: string) => {
  const rs = await query('SELECT * FROM measure_tool_assets WHERE id = $1 LIMIT 1', [assetId])
  return rs.rows?.[0] || null
}

router.get('/ledger', async (req, res) => {
  try {
    await ensureSchema()
    const page = Math.max(Number(req.query.page || 1) || 1, 1)
    const pageSize = Math.max(Number(req.query.pageSize || 200) || 200, 1)
    const offset = (page - 1) * pageSize
    const search = normText(req.query.search)
    const assetStatus = normText(req.query.assetStatus)
    const responsibilityStatus = normText(req.query.responsibilityStatus)
    const scrapStatus = normText(req.query.scrapStatus)

    const whereClauses: string[] = ['1=1']
    const params: any[] = []

    if (search) {
      params.push(`%${escapeLike(search)}%`)
      const idx = params.length
      whereClauses.push(`(
        name ILIKE $${idx} ESCAPE '\\'
        OR code ILIKE $${idx} ESCAPE '\\'
        OR model_spec ILIKE $${idx} ESCAPE '\\'
        OR responsible_person ILIKE $${idx} ESCAPE '\\'
        OR pending_responsible_person ILIKE $${idx} ESCAPE '\\'
        OR remark ILIKE $${idx} ESCAPE '\\'
        OR scrap_reason ILIKE $${idx} ESCAPE '\\'
      )`)
    }

    if (assetStatus) {
      params.push(assetStatus)
      whereClauses.push(`asset_status = $${params.length}`)
    }
    if (responsibilityStatus) {
      params.push(responsibilityStatus)
      whereClauses.push(`responsibility_status = $${params.length}`)
    }
    if (scrapStatus) {
      params.push(scrapStatus)
      whereClauses.push(`scrap_status = $${params.length}`)
    }

    const whereSql = whereClauses.join(' AND ')
    const countRs = await query(`SELECT COUNT(*)::int AS total FROM measure_tool_assets WHERE ${whereSql}`, params)
    const listParams = [...params, pageSize, offset]
    const rowsRs = await query(`
      SELECT
        a.*,
        COALESCE(h.history_count, 0) AS history_count
      FROM measure_tool_assets a
      LEFT JOIN (
        SELECT asset_id, COUNT(*)::int AS history_count
        FROM measure_tool_asset_histories
        GROUP BY asset_id
      ) h ON h.asset_id = a.id
      WHERE ${whereSql}
      ORDER BY a.updated_at DESC, a.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `, listParams)

    res.json({
      success: true,
      items: rowsRs.rows || [],
      total: Number(countRs.rows?.[0]?.total || 0),
      page,
      pageSize
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载量具台账失败' })
  }
})

router.get('/mine', async (req, res) => {
  try {
    await ensureSchema()
    const actor = await resolveActor(req.query.userId, req.query.operator)
    if (!actor.actorName && !actor.userId) {
      return res.status(400).json({ success: false, error: '缺少当前用户信息' })
    }

    const ownedRs = await query(`
      SELECT *
      FROM measure_tool_assets
      WHERE (
        ($1 <> '' AND responsible_user_id = $1)
        OR ($2 <> '' AND responsible_person = $2)
      )
      ORDER BY updated_at DESC, created_at DESC
    `, [actor.userId, actor.actorName])

    const pendingRs = await query(`
      SELECT *
      FROM measure_tool_assets
      WHERE responsibility_status IN ($3, $4)
        AND (
          ($1 <> '' AND pending_responsible_user_id = $1)
          OR ($2 <> '' AND pending_responsible_person = $2)
        )
      ORDER BY updated_at DESC, created_at DESC
    `, [actor.userId, actor.actorName, RESPONSIBILITY_STATUS.pending, RESPONSIBILITY_STATUS.transferPending])

    res.json({
      success: true,
      ownedItems: ownedRs.rows || [],
      pendingConfirmItems: pendingRs.rows || []
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载我的量具失败' })
  }
})

router.get('/:id/history', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    if (!assetId) return res.status(400).json({ success: false, error: '缺少量具ID' })
    const rows = await query(`
      SELECT *
      FROM measure_tool_asset_histories
      WHERE asset_id = $1
      ORDER BY created_at DESC
    `, [assetId])
    res.json({ success: true, items: rows.rows || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载历史记录失败' })
  }
})

router.post('/', async (req, res) => {
  try {
    await ensureSchema()
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    if (!actor.isManager) {
      return res.status(403).json({ success: false, error: '仅库管或超级管理员可以新增量具' })
    }

    const name = normText(req.body?.name)
    const code = normText(req.body?.code)
    const modelSpec = normText(req.body?.model_spec)
    const responsibleInput = normText(req.body?.responsible_person)
    const remark = normText(req.body?.remark)
    const assetStatus = normText(req.body?.asset_status) === ASSET_STATUS.scrapped ? ASSET_STATUS.scrapped : ASSET_STATUS.active
    const resolvedPendingUser = await resolveUserByIdentity(req.body?.responsible_user_id, responsibleInput)

    if (!name || !code || !responsibleInput) {
      return res.status(400).json({ success: false, error: '名称、编号、责任人不能为空' })
    }

    const inserted = await transaction(async (client) => {
      const rs = await client.query(`
        INSERT INTO measure_tool_assets (
          name,
          code,
          model_spec,
          responsible_person,
          responsible_user_id,
          pending_responsible_person,
          pending_responsible_user_id,
          responsibility_status,
          asset_status,
          scrap_status,
          scrap_reason,
          remark,
          created_by,
          created_by_user_id
        )
        VALUES ($1,$2,$3,'','',$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [
        name,
        code,
        modelSpec,
        resolvedPendingUser.realName || responsibleInput,
        resolvedPendingUser.userId,
        RESPONSIBILITY_STATUS.pending,
        assetStatus,
        assetStatus === ASSET_STATUS.scrapped ? SCRAP_STATUS.done : SCRAP_STATUS.none,
        assetStatus === ASSET_STATUS.scrapped ? normText(req.body?.scrap_reason || req.body?.remark) : '',
        remark,
        actor.actorName,
        actor.userId
      ])

      const asset = rs.rows[0]
      await insertHistory(client, asset.id, {
        actionType: 'create',
        actionLabel: '新增量具',
        operatorName: actor.actorName,
        operatorUserId: actor.userId,
        targetName: resolvedPendingUser.realName || responsibleInput,
        targetUserId: resolvedPendingUser.userId,
        remark,
        detail: {
          name,
          code,
          model_spec: modelSpec,
          asset_status: assetStatus
        }
      })
      return asset
    })

    res.json({ success: true, item: inserted })
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.includes('measure_tool_assets_code_unique') || message.includes('duplicate key')) {
      return res.status(400).json({ success: false, error: '编号已存在，不能重复' })
    }
    res.status(500).json({ success: false, error: message || '新增量具失败' })
  }
})

router.post('/batch-import', async (req, res) => {
  try {
    await ensureSchema()
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    if (!actor.isManager) {
      return res.status(403).json({ success: false, error: '仅库管或超级管理员可以导入量具' })
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: '缺少导入数据' })
    }

    const codeSet = new Set<string>()
    for (const raw of items) {
      const code = normText(raw?.code)
      if (!code) return res.status(400).json({ success: false, error: '导入数据缺少编号' })
      if (codeSet.has(code)) {
        return res.status(400).json({ success: false, error: `导入文件中存在重复编号：${code}` })
      }
      codeSet.add(code)
    }

    const createdItems = await transaction(async (client) => {
      const insertedRows: any[] = []
      for (const raw of items) {
        const name = normText(raw?.name)
        const code = normText(raw?.code)
        const modelSpec = normText(raw?.model_spec)
        const responsibleInput = normText(raw?.responsible_person)
        const remark = normText(raw?.remark)
        const assetStatus = normText(raw?.asset_status) === ASSET_STATUS.scrapped ? ASSET_STATUS.scrapped : ASSET_STATUS.active
        const resolvedPendingUser = await resolveUserByIdentity(raw?.responsible_user_id, responsibleInput)

        if (!name || !code || !responsibleInput) {
          throw new Error(`编号 ${code || '-'} 的名称、编号、责任人不能为空`)
        }

        const rs = await client.query(`
          INSERT INTO measure_tool_assets (
            name,
            code,
            model_spec,
            responsible_person,
            responsible_user_id,
            pending_responsible_person,
            pending_responsible_user_id,
            responsibility_status,
            asset_status,
            scrap_status,
            scrap_reason,
            remark,
            created_by,
            created_by_user_id
          )
          VALUES ($1,$2,$3,'','',$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING *
        `, [
          name,
          code,
          modelSpec,
          resolvedPendingUser.realName || responsibleInput,
          resolvedPendingUser.userId,
          RESPONSIBILITY_STATUS.pending,
          assetStatus,
          assetStatus === ASSET_STATUS.scrapped ? SCRAP_STATUS.done : SCRAP_STATUS.none,
          assetStatus === ASSET_STATUS.scrapped ? normText(raw?.scrap_reason || raw?.remark) : '',
          remark,
          actor.actorName,
          actor.userId
        ])
        const asset = rs.rows[0]
        insertedRows.push(asset)

        await insertHistory(client, asset.id, {
          actionType: 'import',
          actionLabel: 'Excel导入',
          operatorName: actor.actorName,
          operatorUserId: actor.userId,
          targetName: resolvedPendingUser.realName || responsibleInput,
          targetUserId: resolvedPendingUser.userId,
          remark,
          detail: {
            name,
            code,
            model_spec: modelSpec,
            asset_status: assetStatus
          }
        })
      }
      return insertedRows
    })

    res.json({ success: true, items: createdItems, count: createdItems.length })
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.includes('measure_tool_assets_code_unique') || message.includes('duplicate key')) {
      return res.status(400).json({ success: false, error: '导入失败，存在重复编号' })
    }
    res.status(500).json({ success: false, error: message || '导入量具失败' })
  }
})

router.post('/:id/confirm-responsible', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    const asset = await loadAssetById(assetId)
    if (!asset) return res.status(404).json({ success: false, error: '量具不存在' })
    if (!normText(asset.pending_responsible_person)) {
      return res.status(400).json({ success: false, error: '当前没有待确认责任人' })
    }
    if (!canMatchActor(asset, actor, 'pending')) {
      return res.status(403).json({ success: false, error: '仅待确认责任人本人可以确认' })
    }

    const updated = await transaction(async (client) => {
      const nextResponsibleName = normText(asset.pending_responsible_person) || actor.actorName
      const nextResponsibleUserId = normText(asset.pending_responsible_user_id) || actor.userId
      const rs = await client.query(`
        UPDATE measure_tool_assets
        SET
          responsible_person = $2,
          responsible_user_id = $3,
          pending_responsible_person = '',
          pending_responsible_user_id = '',
          responsibility_status = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [assetId, nextResponsibleName, nextResponsibleUserId, RESPONSIBILITY_STATUS.confirmed])
      const row = rs.rows[0]
      await insertHistory(client, assetId, {
        actionType: 'confirm_responsible',
        actionLabel: '确认责任人',
        operatorName: actor.actorName || nextResponsibleName,
        operatorUserId: actor.userId || nextResponsibleUserId,
        targetName: nextResponsibleName,
        targetUserId: nextResponsibleUserId,
        detail: {
          previous_responsible_person: normText(asset.responsible_person),
          confirmed_responsible_person: nextResponsibleName
        }
      })
      return row
    })

    res.json({ success: true, item: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '确认责任人失败' })
  }
})

router.post('/:id/transfer', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    const asset = await loadAssetById(assetId)
    if (!asset) return res.status(404).json({ success: false, error: '量具不存在' })
    if (!canMatchActor(asset, actor, 'responsible')) {
      return res.status(403).json({ success: false, error: '仅当前责任人本人可以发起转移' })
    }
    if (normText(asset.asset_status) === ASSET_STATUS.scrapped) {
      return res.status(400).json({ success: false, error: '已报废量具不能转移责任人' })
    }

    const target = await resolveUserByIdentity(req.body?.target_user_id, req.body?.target_name)
    if (!target.realName) {
      return res.status(400).json({ success: false, error: '请选择接收责任人' })
    }
    if (
      target.realName === normText(asset.responsible_person)
      || (target.userId && target.userId === normText(asset.responsible_user_id))
    ) {
      return res.status(400).json({ success: false, error: '不能转移给当前责任人本人' })
    }

    const updated = await transaction(async (client) => {
      const rs = await client.query(`
        UPDATE measure_tool_assets
        SET
          pending_responsible_person = $2,
          pending_responsible_user_id = $3,
          responsibility_status = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [assetId, target.realName, target.userId, RESPONSIBILITY_STATUS.transferPending])
      const row = rs.rows[0]
      await insertHistory(client, assetId, {
        actionType: 'transfer_responsible',
        actionLabel: '发起责任人转移',
        operatorName: actor.actorName || normText(asset.responsible_person),
        operatorUserId: actor.userId || normText(asset.responsible_user_id),
        targetName: target.realName,
        targetUserId: target.userId,
        remark: normText(req.body?.remark),
        detail: {
          from: normText(asset.responsible_person),
          to: target.realName
        }
      })
      return row
    })

    res.json({ success: true, item: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '转移责任人失败' })
  }
})

router.post('/:id/cancel-transfer', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    const asset = await loadAssetById(assetId)
    if (!asset) return res.status(404).json({ success: false, error: '量具不存在' })
    if (normText(asset.responsibility_status) !== RESPONSIBILITY_STATUS.transferPending) {
      return res.status(400).json({ success: false, error: '当前没有可撤销的转移申请' })
    }
    if (!canMatchActor(asset, actor, 'responsible')) {
      return res.status(403).json({ success: false, error: '仅当前责任人本人可以撤销转移' })
    }

    const updated = await transaction(async (client) => {
      const rs = await client.query(`
        UPDATE measure_tool_assets
        SET
          pending_responsible_person = '',
          pending_responsible_user_id = '',
          responsibility_status = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [assetId, RESPONSIBILITY_STATUS.confirmed])
      const row = rs.rows[0]
      await insertHistory(client, assetId, {
        actionType: 'cancel_transfer',
        actionLabel: '撤销责任人转移',
        operatorName: actor.actorName || normText(asset.responsible_person),
        operatorUserId: actor.userId || normText(asset.responsible_user_id),
        targetName: normText(asset.pending_responsible_person),
        targetUserId: normText(asset.pending_responsible_user_id),
        detail: {
          canceled_target: normText(asset.pending_responsible_person)
        }
      })
      return row
    })

    res.json({ success: true, item: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '撤销转移失败' })
  }
})

router.post('/:id/scrap-request', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    const asset = await loadAssetById(assetId)
    if (!asset) return res.status(404).json({ success: false, error: '量具不存在' })
    if (!canMatchActor(asset, actor, 'responsible')) {
      return res.status(403).json({ success: false, error: '仅当前责任人本人可以申请报废' })
    }
    if (normText(asset.asset_status) === ASSET_STATUS.scrapped) {
      return res.status(400).json({ success: false, error: '该量具已报废' })
    }
    const reason = normText(req.body?.reason)
    if (!reason) {
      return res.status(400).json({ success: false, error: '请填写报废原因' })
    }

    const updated = await transaction(async (client) => {
      const rs = await client.query(`
        UPDATE measure_tool_assets
        SET
          scrap_status = $2,
          scrap_reason = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [assetId, SCRAP_STATUS.pending, reason])
      const row = rs.rows[0]
      await insertHistory(client, assetId, {
        actionType: 'scrap_request',
        actionLabel: '申请报废',
        operatorName: actor.actorName || normText(asset.responsible_person),
        operatorUserId: actor.userId || normText(asset.responsible_user_id),
        remark: reason,
        detail: {
          reason
        }
      })
      return row
    })

    res.json({ success: true, item: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '申请报废失败' })
  }
})

router.post('/:id/approve-scrap', async (req, res) => {
  try {
    await ensureSchema()
    const assetId = normText(req.params.id)
    const actor = await resolveActor(req.body?.userId, req.body?.operator)
    if (!actor.isManager) {
      return res.status(403).json({ success: false, error: '仅库管或超级管理员可以确认报废' })
    }
    const asset = await loadAssetById(assetId)
    if (!asset) return res.status(404).json({ success: false, error: '量具不存在' })
    if (normText(asset.scrap_status) !== SCRAP_STATUS.pending) {
      return res.status(400).json({ success: false, error: '当前没有待确认的报废申请' })
    }

    const updated = await transaction(async (client) => {
      const rs = await client.query(`
        UPDATE measure_tool_assets
        SET
          asset_status = $2,
          scrap_status = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [assetId, ASSET_STATUS.scrapped, SCRAP_STATUS.done])
      const row = rs.rows[0]
      await insertHistory(client, assetId, {
        actionType: 'approve_scrap',
        actionLabel: '确认报废',
        operatorName: actor.actorName,
        operatorUserId: actor.userId,
        remark: normText(asset.scrap_reason),
        detail: {
          reason: normText(asset.scrap_reason)
        }
      })
      return row
    })

    res.json({ success: true, item: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '确认报废失败' })
  }
})

export default router
