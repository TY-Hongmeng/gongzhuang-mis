import express from 'express'
import { query, transaction } from '../lib/db.js'

const router = express.Router()

let schemaReady = false

const ensureSchema = async () => {
  if (schemaReady) return
  await query(`
    CREATE TABLE IF NOT EXISTS standard_part_inbound (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      spec_model TEXT NOT NULL,
      tech_group TEXT NOT NULL,
      location TEXT NOT NULL,
      quantity NUMERIC NOT NULL CHECK (quantity >= 0),
      unit TEXT NOT NULL,
      unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      in_date DATE NOT NULL DEFAULT CURRENT_DATE,
      operator TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '正常',
      source_outbound_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS standard_part_outbound (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      spec_model TEXT NOT NULL,
      tech_group TEXT NOT NULL,
      location TEXT NOT NULL,
      quantity NUMERIC NOT NULL CHECK (quantity >= 0),
      unit TEXT NOT NULL,
      unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      out_date DATE NOT NULL DEFAULT CURRENT_DATE,
      operator TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '正常',
      source_inbound_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_spi_name_spec_loc ON standard_part_inbound(name, spec_model, location);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_spo_name_spec_loc ON standard_part_outbound(name, spec_model, location);`)
  schemaReady = true
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const normText = (v: any) => String(v || '').trim()

const defaultLocationFromGroup = (group: string) => {
  const g = normText(group)
  if (!g) return ''
  return g.endsWith('库') ? g : `${g}库`
}

const calcAverageMonthlyUsage = (totalQty: number, minDate: string | null, maxDate: string | null) => {
  if (!minDate || !maxDate || totalQty <= 0) return 0
  const start = new Date(`${minDate}T00:00:00`)
  const end = new Date(`${maxDate}T00:00:00`)
  const months = Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  )
  return totalQty / months
}

const getVisibilityByOperator = async (operator: string, userId?: string) => {
  const op = normText(operator)
  const uid = normText(userId)
  if (!op && !uid) return { isSuperAdmin: false, shouldScopeTeam: false, teamName: '' }
  const rs = await query(`
    SELECT
      COALESCE(t.name, '') AS team_name,
      COALESCE(r.name, '') AS role_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE ($2 <> '' AND CAST(u.id AS TEXT) = $2)
       OR ($2 = '' AND u.real_name = $1)
    ORDER BY u.updated_at DESC NULLS LAST
    LIMIT 1
  `, [op, uid])
  const row = rs.rows?.[0] || {}
  const roleName = normText(row.role_name)
  const teamName = normText(row.team_name)
  const isSuperAdmin = roleName.includes('超级管理员')
  const shouldScopeTeam = !isSuperAdmin && !!teamName
  return {
    isSuperAdmin,
    shouldScopeTeam,
    teamName
  }
}

router.get('/stock-ledger', async (_req, res) => {
  try {
    await ensureSchema()
    const q = _req.query as any
    const forcedGroup = normText(q?.tech_group)
    const visibility = await getVisibilityByOperator(normText(q?.operator), normText(q?.userId))
    const scopedGroup = forcedGroup || (visibility.shouldScopeTeam ? visibility.teamName : '')
    const whereScoped = scopedGroup
      ? ` AND (tech_group = $1 OR (COALESCE(tech_group, '') = '' AND operator IN (
          SELECT u.real_name
          FROM users u
          LEFT JOIN teams t ON t.id = u.team_id
          WHERE COALESCE(t.name, '') = $1
        ))) `
      : ''
    const params = scopedGroup ? [scopedGroup] : []
    const sql = `
      WITH inbound AS (
        SELECT
          name,
          spec_model,
          tech_group,
          location,
          unit,
          SUM(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN quantity ELSE 0 END) AS inbound_total,
          MAX(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN unit_price ELSE 0 END) AS latest_inbound_price,
          MAX(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN created_at END) AS latest_inbound_at,
          (ARRAY_AGG(operator ORDER BY created_at DESC) FILTER (WHERE status NOT IN ('已删除','已退库','退库','退库入库')))[1] AS latest_inbound_operator
        FROM standard_part_inbound
        WHERE 1=1 ${whereScoped}
        GROUP BY name, spec_model, tech_group, location, unit
      ),
      outbound AS (
        SELECT
          name,
          spec_model,
          tech_group,
          location,
          unit,
          SUM(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN quantity ELSE 0 END) AS outbound_total,
          SUM(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN quantity ELSE 0 END) AS total_used_qty,
          MIN(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN out_date END) AS min_out_date,
          MAX(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN out_date END) AS max_out_date,
          MAX(CASE WHEN status NOT IN ('已删除','已退库','退库','退库入库') THEN created_at END) AS latest_outbound_at,
          (ARRAY_AGG(operator ORDER BY created_at DESC) FILTER (WHERE status NOT IN ('已删除','已退库','退库','退库入库')))[1] AS latest_outbound_operator
        FROM standard_part_outbound
        WHERE 1=1 ${whereScoped}
        GROUP BY name, spec_model, tech_group, location, unit
      ),
      merged AS (
        SELECT
          COALESCE(i.name, o.name) AS name,
          COALESCE(i.spec_model, o.spec_model) AS spec_model,
          COALESCE(i.tech_group, o.tech_group) AS tech_group,
          COALESCE(i.location, o.location) AS location,
          COALESCE(i.unit, o.unit) AS unit,
          COALESCE(i.inbound_total, 0) AS inbound_total,
          COALESCE(o.outbound_total, 0) AS outbound_total,
          COALESCE(i.latest_inbound_price, 0) AS unit_price,
          COALESCE(o.total_used_qty, 0) AS total_used_qty,
          o.min_out_date,
          o.max_out_date,
          i.latest_inbound_at,
          i.latest_inbound_operator,
          o.latest_outbound_at,
          o.latest_outbound_operator
        FROM inbound i
        FULL OUTER JOIN outbound o
          ON i.name = o.name
         AND i.spec_model = o.spec_model
         AND i.tech_group = o.tech_group
         AND i.location = o.location
         AND i.unit = o.unit
      )
      SELECT * FROM merged
      ORDER BY name ASC, spec_model ASC, tech_group ASC, location ASC
    `
    const rows = (await query(sql, params)).rows || []
    const items = rows.map((r: any) => {
      const inboundTotal = toNum(r.inbound_total)
      const outboundTotal = toNum(r.outbound_total)
      const balance = inboundTotal - outboundTotal
      const unitPrice = toNum(r.unit_price)
      const avgMonthly = calcAverageMonthlyUsage(toNum(r.total_used_qty), r.min_out_date || null, r.max_out_date || null)
      const safetyStock = avgMonthly
      const maxStock = avgMonthly * 3
      return {
        name: normText(r.name),
        spec_model: normText(r.spec_model),
        tech_group: normText(r.tech_group),
        location: normText(r.location),
        inbound_total: inboundTotal,
        outbound_total: outboundTotal,
        balance,
        unit: normText(r.unit),
        unit_price: unitPrice,
        total_amount: unitPrice * balance,
        safety_stock: safetyStock,
        max_stock: maxStock,
        operator: (r.latest_outbound_at && (!r.latest_inbound_at || String(r.latest_outbound_at) >= String(r.latest_inbound_at)))
          ? normText(r.latest_outbound_operator)
          : normText(r.latest_inbound_operator)
      }
    })
    res.json({ success: true, items })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载库存台账失败' })
  }
})

router.get('/catalog', async (_req, res) => {
  try {
    await ensureSchema()
    const q = _req.query as any
    const forcedGroup = normText(q?.tech_group)
    const visibility = await getVisibilityByOperator(normText(q?.operator), normText(q?.userId))
    const scopedGroup = forcedGroup || (visibility.shouldScopeTeam ? visibility.teamName : '')
    const whereScoped = scopedGroup
      ? ` AND (tech_group = $1 OR (COALESCE(tech_group, '') = '' AND operator IN (
          SELECT u.real_name
          FROM users u
          LEFT JOIN teams t ON t.id = u.team_id
          WHERE COALESCE(t.name, '') = $1
        ))) `
      : ''
    const params = scopedGroup ? [scopedGroup] : []
    const stockRows = (await query(`
      WITH inbound AS (
        SELECT name, spec_model, tech_group, location, unit, SUM(quantity) AS in_qty, MAX(unit_price) AS price
        FROM standard_part_inbound
        WHERE status NOT IN ('已删除','已退库','退库','退库入库') ${whereScoped}
        GROUP BY name, spec_model, tech_group, location, unit
      ),
      outbound AS (
        SELECT name, spec_model, tech_group, location, unit, SUM(quantity) AS out_qty
        FROM standard_part_outbound
        WHERE status NOT IN ('已删除','已退库','退库','退库入库') ${whereScoped}
        GROUP BY name, spec_model, tech_group, location, unit
      )
      SELECT
        COALESCE(i.name, o.name) AS name,
        COALESCE(i.spec_model, o.spec_model) AS spec_model,
        COALESCE(i.tech_group, o.tech_group) AS tech_group,
        COALESCE(i.location, o.location) AS location,
        COALESCE(i.unit, o.unit) AS unit,
        COALESCE(i.price, 0) AS unit_price,
        COALESCE(i.in_qty, 0) - COALESCE(o.out_qty, 0) AS balance
      FROM inbound i
      FULL OUTER JOIN outbound o
        ON i.name = o.name
       AND i.spec_model = o.spec_model
       AND i.tech_group = o.tech_group
       AND i.location = o.location
       AND i.unit = o.unit
      ORDER BY 1,2,3,4
    `, params)).rows || []
    res.json({ success: true, items: stockRows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载目录失败' })
  }
})

router.get('/inbound', async (_req, res) => {
  try {
    await ensureSchema()
    const q = _req.query as any
    const forcedGroup = normText(q?.tech_group)
    const visibility = await getVisibilityByOperator(normText(q?.operator), normText(q?.userId))
    const scopedGroup = forcedGroup || (visibility.shouldScopeTeam ? visibility.teamName : '')
    const whereScoped = scopedGroup
      ? ` AND (tech_group = $1 OR (COALESCE(tech_group, '') = '' AND operator IN (
          SELECT u.real_name
          FROM users u
          LEFT JOIN teams t ON t.id = u.team_id
          WHERE COALESCE(t.name, '') = $1
        ))) `
      : ''
    const params = scopedGroup ? [scopedGroup] : []
    const rows = (await query(`
      SELECT * FROM standard_part_inbound
      WHERE status NOT IN ('已删除','已退库','退库','退库入库')
      ${whereScoped}
      ORDER BY in_date DESC, created_at DESC
    `, params)).rows || []
    res.json({ success: true, items: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载入库台账失败' })
  }
})

router.get('/outbound', async (_req, res) => {
  try {
    await ensureSchema()
    const q = _req.query as any
    const forcedGroup = normText(q?.tech_group)
    const visibility = await getVisibilityByOperator(normText(q?.operator), normText(q?.userId))
    const scopedGroup = forcedGroup || (visibility.shouldScopeTeam ? visibility.teamName : '')
    const whereScoped = scopedGroup
      ? ` AND (tech_group = $1 OR (COALESCE(tech_group, '') = '' AND operator IN (
          SELECT u.real_name
          FROM users u
          LEFT JOIN teams t ON t.id = u.team_id
          WHERE COALESCE(t.name, '') = $1
        ))) `
      : ''
    const params = scopedGroup ? [scopedGroup] : []
    const rows = (await query(`
      SELECT * FROM standard_part_outbound
      WHERE status NOT IN ('已删除','已退库','退库','退库入库')
      ${whereScoped}
      ORDER BY out_date DESC, created_at DESC
    `, params)).rows || []
    res.json({ success: true, items: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '加载出库台账失败' })
  }
})

router.post('/inbound/batch', async (req, res) => {
  try {
    await ensureSchema()
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const visibility = await getVisibilityByOperator(normText(req.body?.operator) || normText(items?.[0]?.operator))
    if (items.length === 0) return res.status(400).json({ success: false, error: '缺少入库数据' })
    const inserted = await transaction(async (client) => {
      const rows: any[] = []
      for (const raw of items) {
        const name = normText(raw?.name)
        const spec = normText(raw?.spec_model)
        const rawTechGroup = normText(raw?.tech_group)
        const techGroup = visibility.shouldScopeTeam ? visibility.teamName : rawTechGroup
        const location = normText(raw?.location) || defaultLocationFromGroup(techGroup)
        const quantity = toNum(raw?.quantity)
        const unit = normText(raw?.unit)
        const unitPrice = toNum(raw?.unit_price)
        const inDate = normText(raw?.in_date) || new Date().toISOString().slice(0, 10)
        const operator = normText(raw?.operator)
        const status = normText(raw?.status) || '正常'
        if (!name || !spec || !location || !unit || quantity <= 0) {
          throw new Error('入库数据不完整，名称/规格/库位/单位/数量为必填')
        }
        const rs = await client.query(`
          INSERT INTO standard_part_inbound
          (name, spec_model, tech_group, location, quantity, unit, unit_price, in_date, operator, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *
        `, [name, spec, techGroup, location, quantity, unit, unitPrice, inDate, operator, status])
        rows.push(rs.rows[0])
      }
      return rows
    })
    res.json({ success: true, items: inserted })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '批量入库失败' })
  }
})

router.post('/outbound/batch', async (req, res) => {
  try {
    await ensureSchema()
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const visibility = await getVisibilityByOperator(normText(req.body?.operator) || normText(items?.[0]?.operator))
    if (items.length === 0) return res.status(400).json({ success: false, error: '缺少出库数据' })
    const inserted = await transaction(async (client) => {
      const rows: any[] = []
      for (const raw of items) {
        const name = normText(raw?.name)
        const spec = normText(raw?.spec_model)
        const rawTechGroup = normText(raw?.tech_group)
        const techGroup = visibility.shouldScopeTeam ? visibility.teamName : rawTechGroup
        const location = normText(raw?.location) || defaultLocationFromGroup(techGroup)
        const quantity = toNum(raw?.quantity)
        const unit = normText(raw?.unit)
        const unitPrice = toNum(raw?.unit_price)
        const outDate = normText(raw?.out_date) || new Date().toISOString().slice(0, 10)
        const operator = normText(raw?.operator)
        const status = normText(raw?.status) || '正常'
        if (!name || !spec || !location || !unit || quantity <= 0) {
          throw new Error('出库数据不完整，名称/规格/库位/单位/数量为必填')
        }
        const stockRow = await client.query(`
          SELECT
            COALESCE((SELECT SUM(quantity) FROM standard_part_inbound WHERE status NOT IN ('已删除','已退库','退库','退库入库') AND name=$1 AND spec_model=$2 AND tech_group=$3 AND location=$4 AND unit=$5), 0)
            -
            COALESCE((SELECT SUM(quantity) FROM standard_part_outbound WHERE status NOT IN ('已删除','已退库','退库','退库入库') AND name=$1 AND spec_model=$2 AND tech_group=$3 AND location=$4 AND unit=$5), 0)
            AS balance
        `, [name, spec, techGroup, location, unit])
        const balance = toNum(stockRow.rows?.[0]?.balance)
        if (quantity > balance) {
          throw new Error(`${name} ${spec} 在 ${location} 库存不足，当前结余 ${balance}`)
        }
        const rs = await client.query(`
          INSERT INTO standard_part_outbound
          (name, spec_model, tech_group, location, quantity, unit, unit_price, out_date, operator, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *
        `, [name, spec, techGroup, location, quantity, unit, unitPrice, outDate, operator, status])
        rows.push(rs.rows[0])
      }
      return rows
    })
    res.json({ success: true, items: inserted })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '批量出库失败' })
  }
})

router.post('/inbound/delete', async (req, res) => {
  try {
    await ensureSchema()
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要删除的数据' })
    const rs = await query(`UPDATE standard_part_inbound SET status='已删除', updated_at=NOW() WHERE id = ANY($1::uuid[])`, [ids])
    res.json({ success: true, affected: rs.rowCount || 0 })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '删除入库记录失败' })
  }
})

router.post('/outbound/delete', async (req, res) => {
  try {
    await ensureSchema()
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要删除的数据' })
    const rs = await query(`UPDATE standard_part_outbound SET status='已删除', updated_at=NOW() WHERE id = ANY($1::uuid[])`, [ids])
    res.json({ success: true, affected: rs.rowCount || 0 })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '删除出库记录失败' })
  }
})

router.post('/inbound/return', async (req, res) => {
  try {
    await ensureSchema()
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const operator = normText(req.body?.operator)
    if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要退库的数据' })
    await transaction(async (client) => {
      const selected = await client.query(`
        SELECT * FROM standard_part_inbound
        WHERE id = ANY($1::uuid[]) AND status <> '已删除'
      `, [ids])
      for (const row of selected.rows || []) {
        if (String(row.status) === '已退库') continue
        await client.query(`
          INSERT INTO standard_part_outbound
          (name, spec_model, tech_group, location, quantity, unit, unit_price, out_date, operator, status, source_inbound_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'退库',$10)
        `, [
          row.name, row.spec_model, row.tech_group, row.location, row.quantity, row.unit, row.unit_price,
          new Date().toISOString().slice(0, 10), operator || row.operator || '', row.id
        ])
        await client.query(`UPDATE standard_part_inbound SET status='已退库', updated_at=NOW() WHERE id=$1`, [row.id])
      }
    })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '入库退库失败' })
  }
})

router.post('/outbound/return', async (req, res) => {
  try {
    await ensureSchema()
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const operator = normText(req.body?.operator)
    if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要退库的数据' })
    await transaction(async (client) => {
      const selected = await client.query(`
        SELECT * FROM standard_part_outbound
        WHERE id = ANY($1::uuid[]) AND status <> '已删除'
      `, [ids])
      for (const row of selected.rows || []) {
        if (String(row.status) === '已退库') continue
        await client.query(`
          INSERT INTO standard_part_inbound
          (name, spec_model, tech_group, location, quantity, unit, unit_price, in_date, operator, status, source_outbound_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'退库入库',$10)
        `, [
          row.name, row.spec_model, row.tech_group, row.location, row.quantity, row.unit, row.unit_price,
          new Date().toISOString().slice(0, 10), operator || row.operator || '', row.id
        ])
        await client.query(`UPDATE standard_part_outbound SET status='已退库', updated_at=NOW() WHERE id=$1`, [row.id])
      }
    })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '出库退库失败' })
  }
})

export default router
