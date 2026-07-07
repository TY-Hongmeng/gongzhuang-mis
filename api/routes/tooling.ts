import express from 'express';
import { supabase } from '../lib/supabase.js';
import { query } from '../lib/db.js';
import { sendSuccess, sendSuccessList, sendError, sendNotFound, sendCreated, sendUpdated, sendDeleted } from '../lib/response.js';

const router = express.Router();
let statusTableReady = false;
const ensureStatusTable = async () => {
  if (statusTableReady) return;
  statusTableReady = true;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    const mod = await import('pg') as any;
    const PgClient = (mod.Client || mod.default?.Client);
    if (!PgClient) return;
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS tooling_status (
      id BIGSERIAL PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      status TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS tooling_status_unique ON tooling_status(item_type, item_id)`);
    await client.end();
  } catch (e) {
    statusTableReady = false;
  }
};
let statusColumnsReady = false;
const ensurePurchaseStatusColumns = async () => {
  if (statusColumnsReady) return;
  statusColumnsReady = true;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    const mod = await import('pg') as any;
    const PgClient = (mod.Client || mod.default?.Client);
    if (!PgClient) return;
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS purchase_status TEXT`);
    await client.query(`ALTER TABLE child_items ADD COLUMN IF NOT EXISTS purchase_status TEXT`);
    // 添加 completed_steps 字段存储已完成的工序列表
    await client.query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS completed_steps JSONB DEFAULT '[]'`);
    try {
      await client.query(`UPDATE parts_info p
        SET purchase_status = s.status
        FROM tooling_status s
        WHERE s.item_type = 'part'
          AND s.item_id::text = p.id::text
          AND (p.purchase_status IS NULL OR p.purchase_status = '')`);
      await client.query(`UPDATE child_items c
        SET purchase_status = s.status
        FROM tooling_status s
        WHERE s.item_type = 'child'
          AND s.item_id::text = c.id::text
          AND (c.purchase_status IS NULL OR c.purchase_status = '')`);
    } catch {}
    await client.end();
  } catch (e) {
    statusColumnsReady = false;
  }
};
let devicePriceColumnReady = false;
const ensureDeviceProcessUnitPriceColumn = async () => {
  if (devicePriceColumnReady) return;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS process_unit_price NUMERIC`);
    devicePriceColumnReady = true;
  } catch (e) {}
};
let workHoursExtraColumnsReady = false;
const ensureWorkHoursExtraColumns = async () => {
  if (workHoursExtraColumnsReady) return;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    await query(`ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS aux_count NUMERIC DEFAULT 1`);
    await query(`ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS process_quantity NUMERIC DEFAULT 1`);
    await query(`ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS single_aux_minutes NUMERIC DEFAULT 0`);
    await query(`ALTER TABLE work_hours ADD COLUMN IF NOT EXISTS single_aux_count NUMERIC DEFAULT 0`);
    workHoursExtraColumnsReady = true;
  } catch (e) {}
};
let programEntriesTableReady = false;
const ensureProgramEntriesTable = async () => {
  if (programEntriesTableReady) return;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await query(`
      CREATE TABLE IF NOT EXISTS program_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        part_inventory_number TEXT NOT NULL,
        part_drawing_number TEXT NOT NULL DEFAULT '',
        process_name TEXT NOT NULL DEFAULT '',
        program_no TEXT NOT NULL DEFAULT '',
        program_duration_minutes NUMERIC NOT NULL DEFAULT 0 CHECK (program_duration_minutes >= 0),
        programmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        programmer TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_program_entries_programmed_at ON program_entries(programmed_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_program_entries_inventory_process ON program_entries(part_inventory_number, process_name)`);
    programEntriesTableReady = true;
  } catch (e) {}
};
const normalizeProgramManageInventoryNo = (v: any) => String(v || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .trim()
  .toUpperCase()
const normalizeProgramManageProcessKey = (v: any) => String(v || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, '')
  .trim()
  .toLowerCase()
const normalizeProgramManageProcessBaseKey = (v: any) => String(v || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, '')
  .replace(/^[0-9]+[.\-、:：]*/g, '')
  .trim()
  .toLowerCase()
const parseClockMinutes = (v: any) => {
  const raw = String(v || '').trim()
  if (!raw) return null
  const parts = raw.split(':').map((item) => Number(item || 0))
  if (parts.length < 2) return null
  const h = Number(parts[0] || 0)
  const m = Number(parts[1] || 0)
  const s = Number(parts[2] || 0)
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null
  return h * 60 + m + s / 60
}

// #region debug-point shared:report
const reportProgramEntriesRouteDebug = (hypothesisId: string, msg: string, data?: Record<string, any>) => {
  try {
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'program-entry-missing',
        runId: 'pre-fix',
        hypothesisId,
        location: 'api/routes/tooling.ts',
        msg,
        data: data || {},
        ts: Date.now()
      })
    }).catch(() => {})
  } catch {}
}
// #endregion
const addMinutesToDate = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000)
const resolveProgramProcessWindow = (row: any) => {
  const procHours = Number(row?.proc_hours || 0)
  if (!Number.isFinite(procHours) || procHours <= 0) return null
  const workDateRaw = String(row?.work_date || '').trim()
  const baseDate = workDateRaw ? new Date(`${workDateRaw}T00:00:00`) : new Date(String(row?.created_at || ''))
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) return null
  const auxStartMinutes = parseClockMinutes(row?.aux_start_time)
  const auxEndMinutes = parseClockMinutes(row?.aux_end_time)
  let startAt: Date | null = null
  if (auxEndMinutes !== null) {
    startAt = addMinutesToDate(baseDate, auxEndMinutes)
    if (auxStartMinutes !== null && auxEndMinutes < auxStartMinutes) {
      startAt = addMinutesToDate(startAt, 1440)
    }
  } else if (auxStartMinutes !== null) {
    const auxHours = Number(row?.aux_hours || 0)
    const auxMinutes = Number.isFinite(auxHours) ? auxHours * 60 : 0
    startAt = addMinutesToDate(baseDate, auxStartMinutes + auxMinutes)
  } else {
    const createdAt = new Date(String(row?.created_at || ''))
    if (!Number.isNaN(createdAt.getTime())) startAt = createdAt
  }
  if (!startAt) return null
  const endAt = addMinutesToDate(startAt, procHours * 60)
  return { startAt, endAt, procHours }
}
const formatProgramManageDateTime = (value: Date | null) => {
  if (!value || Number.isNaN(value.getTime())) return '-'
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hour = String(value.getHours()).padStart(2, '0')
  const minute = String(value.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}
const formatProgramManageHours = (value: number) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num <= 0) return '0.00'
  return num.toFixed(2)
}
const formatProgramManageQuantity = (value: number) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num <= 0) return '0'
  if (Math.abs(num - Math.round(num)) < 0.000001) return String(Math.round(num))
  return num.toFixed(2)
}
let toolingTotalsColumnsReady = false;
const ensureToolingTotalsColumns = async () => {
  if (toolingTotalsColumnsReady) return;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    await query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS material_total NUMERIC`);
    await query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS process_total NUMERIC`);
    await query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS totals_updated_at TIMESTAMPTZ`);
    toolingTotalsColumnsReady = true;
  } catch (e) {}
};
let partAmountColumnsReady = false;
const ensurePartAmountColumns = async () => {
  if (partAmountColumnsReady) return;
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) return;
  try {
    await query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS process_amount NUMERIC`);
    await query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS amounts_updated_at TIMESTAMPTZ`);
    partAmountColumnsReady = true;
  } catch (e) {}
};

const chunkItems = <T,>(items: T[], size: number): T[][] => {
  const safeSize = Math.max(1, size)
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize))
  }
  return chunks
}

const normalizeAmountDeviceNo = (v: any) => {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const dash = raw.split('-')[0]
  const leadingDigits = dash.match(/^\d+/)?.[0]
  if (leadingDigits) return leadingDigits
  return dash.trim()
}

const normalizeAmountInventoryNo = (v: any) => String(v || '').trim().toUpperCase()

const computeProcessAmountByInvMap = async (inventoryNos: string[]) => {
  const invList = Array.from(new Set((inventoryNos || []).map(normalizeAmountInventoryNo).filter(Boolean)))
  if (invList.length === 0) return {}
  await ensureDeviceProcessUnitPriceColumn()
  const workHourRowMap = new Map<string, any>()
  for (const invChunk of chunkItems(invList, 120)) {
    const [{ data: dataByInvNo }, { data: dataByPartInvNo }] = await Promise.all([
      supabase
        .from('work_hours')
        .select('id, inventory_no, part_inventory_number, process_name, aux_hours, proc_hours, device_no')
        .in('inventory_no', invChunk),
      supabase
        .from('work_hours')
        .select('id, inventory_no, part_inventory_number, process_name, aux_hours, proc_hours, device_no')
        .in('part_inventory_number', invChunk)
    ])
    ;([...((dataByInvNo || []) as any[]), ...((dataByPartInvNo || []) as any[])]).forEach((row: any, idx: number) => {
      const key = String(row?.id || `${row?.inventory_no || ''}|${row?.part_inventory_number || ''}|${row?.process_name || ''}|${row?.device_no || ''}|${row?.aux_hours || ''}|${row?.proc_hours || ''}|${idx}`)
      if (!workHourRowMap.has(key)) workHourRowMap.set(key, row)
    })
  }
  const workHourRows = Array.from(workHourRowMap.values())
  const deviceNoSet = new Set<string>()
  const normalizedRows = workHourRows.map((row: any) => {
    const inv = normalizeAmountInventoryNo(row?.inventory_no || row?.part_inventory_number)
    const totalHours = Number(row?.aux_hours || 0) + Number(row?.proc_hours || 0)
    const deviceNo = normalizeAmountDeviceNo(row?.device_no)
    if (deviceNo) deviceNoSet.add(deviceNo)
    return { inv, totalHours, deviceNo }
  })
  const devicePriceMap = new Map<string, number>()
  for (const deviceChunk of chunkItems(Array.from(deviceNoSet), 120)) {
    const { data: devices } = await supabase
      .from('devices')
      .select('device_no,process_unit_price')
      .in('device_no', deviceChunk)
    ;(devices || []).forEach((device: any) => {
      const no = normalizeAmountDeviceNo(device?.device_no)
      if (!no) return
      const unitPrice = Number(device?.process_unit_price || 0)
      devicePriceMap.set(no, Number.isFinite(unitPrice) ? unitPrice : 0)
    })
  }
  const amountByInv: Record<string, number> = {}
  normalizedRows.forEach(({ inv, totalHours, deviceNo }: any) => {
    if (!inv || !deviceNo || !Number.isFinite(totalHours) || totalHours <= 0) return
    const unitPrice = Number(devicePriceMap.get(deviceNo) || 0)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
    amountByInv[inv] = Number(amountByInv[inv] || 0) + totalHours * unitPrice
  })
  return amountByInv
}

const refreshToolingStoredAmounts = async (toolingIdInput: any, overrides?: { material_total?: number | null; process_total?: number | null }) => {
  await ensureToolingTotalsColumns()
  await ensurePartAmountColumns()
  const toolingId = String(toolingIdInput || '').trim()
  if (!toolingId) throw new Error('缺少工装ID')

  console.log(`[refreshToolingStoredAmounts] 开始处理工具: ${toolingId}`)
  console.log(`[refreshToolingStoredAmounts] 收到的overrides:`, JSON.stringify(overrides))

  // 如果前端传入了完整的覆盖值，直接使用（不重新计算，不查询Supabase）
  const hasMaterialOverride = overrides && typeof overrides.material_total === 'number' && Number.isFinite(overrides.material_total)
  const hasProcessOverride = overrides && typeof overrides.process_total === 'number' && Number.isFinite(overrides.process_total)

  console.log(`[refreshToolingStoredAmounts] hasMaterialOverride: ${hasMaterialOverride}, hasProcessOverride: ${hasProcessOverride}`)

  // ✅ 关键优化：如果前端传了两个值，直接保存，不查询任何表（避免 ERR_INSUFFICIENT_RESOURCES）
  if (hasMaterialOverride && hasProcessOverride) {
    const materialTotal = overrides!.material_total!
    const processTotal = overrides!.process_total!
    const updatedAt = new Date().toISOString()

    console.log(`[refreshToolingStoredAmounts] 🎯🎯🎯 使用前端传值，跳过Supabase查询 - material: ${materialTotal}, process: ${processTotal}`)

    if (process.env.SUPABASE_DB_URL || '') {
      await query(
        'UPDATE tooling_info SET material_total = $1, process_total = $2, totals_updated_at = $3::timestamptz WHERE id = $4',
        [materialTotal, processTotal, updatedAt, toolingId]
      )
      console.log(`[refreshToolingStoredAmounts] ✅✅✅ 已通过PG直接保存 - material=${materialTotal}, process=${processTotal}`)
    } else {
      const { error: updateError } = await supabase
        .from('tooling_info')
        .update({ material_total: materialTotal, process_total: processTotal, totals_updated_at: updatedAt })
        .eq('id', toolingId)
      if (updateError) throw new Error(updateError.message)
      console.log(`[refreshToolingStoredAmounts] ✅ 已通过Supabase直接保存`)
    }

    return {
      material_total: materialTotal,
      process_total: processTotal,
      totals_updated_at: updatedAt,
      part_process_amounts: {}
    }
  }

  // 只有缺少值时才进行计算和查询
  let materialTotal: number | null = hasMaterialOverride ? overrides!.material_total! : null
  let processTotal: number | null = hasProcessOverride ? overrides!.process_total! : null
  const updatedAt = new Date().toISOString()
  const partProcessAmountMap: Record<string, number> = {}

  console.log(`[refreshToolingStoredAmounts] 需要计算部分值 - material: ${!hasMaterialOverride}, process: ${!hasProcessOverride}`)

  const { data: parts, error: partsError } = await supabase
    .from('parts_info')
    .select('id,tooling_id,part_inventory_number,inventory_number,part_name,part_quantity,weight,material_id,process_amount')
    .eq('tooling_id', toolingId)
  if (partsError) throw new Error(partsError.message)

  const validParts = (parts || []).filter((part: any) => !String(part?.id || '').startsWith('blank-'))
  const meaningfulParts = validParts.filter((part: any) => {
    const inv = String(part?.part_inventory_number || part?.inventory_number || '').trim()
    const name = String(part?.part_name || '').trim()
    const qty = Number(part?.part_quantity || 0)
    const weight = Number(part?.weight || 0)
    return !!(inv || name || qty > 0 || weight > 0)
  })

  if (meaningfulParts.length > 0) {
    // 只在需要时计算 materialTotal
    if (!hasMaterialOverride) {
      const materialIds = Array.from(new Set(
        meaningfulParts
          .map((part: any) => String(part?.material_id || '').trim())
          .filter(Boolean)
      ))
      const materialUnitPriceMap = new Map<string, number>()
      for (const materialChunk of chunkItems(materialIds, 120)) {
        if (materialChunk.length === 0) continue
        const { data: materials } = await supabase
          .from('materials')
          .select('id,unit_price')
          .in('id', materialChunk)
        ;(materials || []).forEach((material: any) => {
          const materialId = String(material?.id || '').trim()
          if (!materialId) return
          const unitPrice = Number(material?.unit_price || 0)
          materialUnitPriceMap.set(materialId, Number.isFinite(unitPrice) ? unitPrice : 0)
        })
      }
      materialTotal = meaningfulParts.reduce((sum: number, part: any) => {
        const qty = Number(part?.part_quantity || 0)
        const unitWeight = Number(part?.weight || 0)
        const materialId = String(part?.material_id || '').trim()
        const unitPrice = materialId
          ? Number(materialUnitPriceMap.get(materialId) || 0)
          : 0
        const computedTotal = qty > 0 && unitWeight > 0 && unitPrice > 0
          ? qty * unitWeight * unitPrice
          : 0
        return sum + (Number.isFinite(computedTotal) ? computedTotal : 0)
      }, 0)
    }

    // 只在需要时计算 processTotal
    if (!hasProcessOverride) {
      const invList = meaningfulParts
        .map((part: any) => normalizeAmountInventoryNo(part?.part_inventory_number || part?.inventory_number))
        .filter(Boolean)
      const amountByInv = await computeProcessAmountByInvMap(invList)
      meaningfulParts.forEach((part: any) => {
        const id = String(part?.id || '')
        const inv = normalizeAmountInventoryNo(part?.part_inventory_number || part?.inventory_number)
        if (!id) return
        partProcessAmountMap[id] = Number(amountByInv[inv] || 0)
      })
      processTotal = meaningfulParts.reduce((sum: number, part: any) => {
        const id = String(part?.id || '')
        return sum + Number(partProcessAmountMap[id] || 0)
      }, 0)
    }

    // 更新零件的 process_amount（只在需要时）
    if (!hasProcessOverride && (process.env.SUPABASE_DB_URL || '')) {
      for (const part of validParts) {
        const partId = String(part?.id || '').trim()
        if (!partId) continue
        const partAmount = Object.prototype.hasOwnProperty.call(partProcessAmountMap, partId)
          ? Number(partProcessAmountMap[partId] || 0)
          : null
        await query(
          'UPDATE parts_info SET process_amount = $1, amounts_updated_at = $2::timestamptz WHERE id = $3',
          [partAmount, updatedAt, partId]
        )
      }
    } else if (!hasProcessOverride) {
      await Promise.all(validParts.map((part: any) => {
        const partId = String(part?.id || '').trim()
        if (!partId) return Promise.resolve(null)
        const partAmount = Object.prototype.hasOwnProperty.call(partProcessAmountMap, partId)
          ? Number(partProcessAmountMap[partId] || 0)
          : null
        return supabase
          .from('parts_info')
          .update({ process_amount: partAmount, amounts_updated_at: updatedAt })
          .eq('id', partId)
      }))
    }
  }

  if (process.env.SUPABASE_DB_URL || '') {
    for (const part of validParts) {
      const partId = String(part?.id || '').trim()
      if (!partId) continue
      const partAmount = Object.prototype.hasOwnProperty.call(partProcessAmountMap, partId)
        ? Number(partProcessAmountMap[partId] || 0)
        : null
      await query(
        'UPDATE parts_info SET process_amount = $1, amounts_updated_at = $2::timestamptz WHERE id = $3',
        [partAmount, updatedAt, partId]
      )
    }
    await query(
      'UPDATE tooling_info SET material_total = $1, process_total = $2, totals_updated_at = $3::timestamptz WHERE id = $4',
      [materialTotal, processTotal, updatedAt, toolingId]
    )
    console.log(`[refreshToolingStoredAmounts] ✅ 已保存到PG数据库 - material_total: ${materialTotal}, process_total: ${processTotal}`)
  } else {
    await Promise.all(validParts.map((part: any) => {
      const partId = String(part?.id || '').trim()
      if (!partId) return Promise.resolve(null)
      const partAmount = Object.prototype.hasOwnProperty.call(partProcessAmountMap, partId)
        ? Number(partProcessAmountMap[partId] || 0)
        : null
      return supabase
        .from('parts_info')
        .update({ process_amount: partAmount, amounts_updated_at: updatedAt })
        .eq('id', partId)
    }))
    const { error: updateError } = await supabase
      .from('tooling_info')
      .update({ material_total: materialTotal, process_total: processTotal, totals_updated_at: updatedAt })
      .eq('id', toolingId)
    if (updateError) throw new Error(updateError.message)
    console.log(`[refreshToolingStoredAmounts] ✅ 已保存到Supabase - material_total: ${materialTotal}, process_total: ${processTotal}`)
  }

  console.log(`[refreshToolingStoredAmounts] 返回值: material_total=${materialTotal}, process_total=${processTotal}`)

  return {
    material_total: materialTotal,
    process_total: processTotal,
    totals_updated_at: updatedAt,
    part_process_amounts: partProcessAmountMap
  }
}

const refreshToolingStoredAmountsByInventoryNos = async (inventoryNos: string[]) => {
  const invList = Array.from(new Set((inventoryNos || []).map(normalizeAmountInventoryNo).filter(Boolean)))
  if (invList.length === 0) return
  const toolingIds = new Set<string>()
  for (const invChunk of chunkItems(invList, 120)) {
    const [{ data: byPartInv }, { data: byInv }] = await Promise.all([
      supabase
        .from('parts_info')
        .select('tooling_id')
        .in('part_inventory_number', invChunk),
      supabase
        .from('parts_info')
        .select('tooling_id')
        .in('inventory_number', invChunk)
    ])
    ;([...(byPartInv || []), ...(byInv || [])] as any[]).forEach((row: any) => {
      const toolingId = String(row?.tooling_id || '').trim()
      if (toolingId) toolingIds.add(toolingId)
    })
  }
  for (const toolingId of toolingIds) {
    await refreshToolingStoredAmounts(toolingId)
  }
}

const normalizeWorkHoursOperator = (v: any) =>
  String(v || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

const resolveWorkHoursActor = async (userIdInput?: string, operatorInput?: string) => {
  const userId = String(userIdInput || '').trim()
  const operator = String(operatorInput || '').trim()
  let user: any = null
  if (userId) {
    const { data } = await supabase.from('users').select('id, role_id, real_name').eq('id', userId).limit(1)
    user = Array.isArray(data) ? data[0] : null
  } else if (operator) {
    const { data } = await supabase.from('users').select('id, role_id, real_name').ilike('real_name', operator).limit(1)
    user = Array.isArray(data) ? data[0] : null
  }
  const actorName = String(user?.real_name || operator || '').trim()
  if (!user?.role_id) return { isSuperAdmin: false, actorName }
  const { data: roleData } = await supabase.from('roles').select('name').eq('id', String(user.role_id)).limit(1)
  const roleName = String((Array.isArray(roleData) ? roleData[0] : null)?.name || '')
  return { isSuperAdmin: roleName.includes('超级管理员'), actorName }
}

// GET /api/tooling
// 支持分页、搜索、筛选与排序
router.get('/', async (req, res) => {
  try {
    await ensureToolingTotalsColumns()
    const {
      page = '1',
      pageSize = '20',
      search = '',
      production_unit,
      category,
      priority_level,
      start_date,
      end_date,
      sortField = 'created_at',
      sortOrder = 'desc'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.max(parseInt(pageSize, 10) || 20, 1);
    const from = (pageNum - 1) * sizeNum;
    const to = from + sizeNum - 1;

    let query = supabase
      .from('tooling_info')
      .select('*', { count: 'exact' });

    // 搜索（支持父表字段与子表盘存编号）
    if (search && search.trim()) {
      const raw = String(search).trim();
      const keyword = `%${raw}%`;
      let partsToolingIds: string[] = [];
      try {
        const ids = new Set<string>()
        const BATCH_SIZE = 1000
        let offset = 0
        while (true) {
          const { data: parts, error: perr } = await supabase
            .from('parts_info')
            .select('tooling_id, part_inventory_number, inventory_number')
            .or(`part_inventory_number.ilike.${keyword},inventory_number.ilike.${keyword}`)
            .range(offset, offset + BATCH_SIZE - 1)
          if (perr || !Array.isArray(parts) || parts.length === 0) break
          parts.forEach((p: any) => {
            const tid = String(p.tooling_id || '')
            if (tid) ids.add(tid)
          })
          if (parts.length < BATCH_SIZE) break
          offset += BATCH_SIZE
        }
        partsToolingIds = Array.from(ids)
      } catch {}

      const baseExpr = `inventory_number.ilike.${keyword},project_name.ilike.${keyword},recorder.ilike.${keyword}`;
      if (partsToolingIds.length > 0) {
        const inList = partsToolingIds
          .map((id) => `"${String(id || '').replace(/"/g, '')}"`)
          .join(',');
        // 将子表命中的父ID也纳入OR条件
        query = query.or(`${baseExpr},id.in.(${inList})`);
      } else {
        query = query.or(baseExpr);
      }
    }

    // 筛选
    if (production_unit) {
      query = query.ilike('production_unit', `%${production_unit}%`);
    }
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }
    if (priority_level) {
      const pv = Number(priority_level)
      if (!Number.isNaN(pv)) {
        query = query.eq('priority_level', pv)
      }
    }
    if (start_date) {
      query = query.gte('production_date', start_date);
    }
    if (end_date) {
      query = query.lte('production_date', end_date);
    }

    // 排序
    const ascending = String(sortOrder).toLowerCase() === 'asc';
    query = query.order(sortField, { ascending });

    // 分页：当 pageSize 为 0 或负数时，获取所有数据
    const noPagination = parseInt(pageSize, 10) <= 0;
    let data: any[] = [];
    let count: number | null = null;
    
    if (noPagination) {
      // 使用循环获取所有数据，绕过 Supabase 的 1000 条限制
      const BATCH_SIZE = 1000;
      let offset = 0;
      let totalCount: number | null = null;
      
      // 先获取总数
      const { count: c } = await supabase
        .from('tooling_info')
        .select('*', { count: 'exact', head: true });
      totalCount = c;
      
      // 循环获取所有数据
      while (true) {
        const { data: batch, error: batchErr } = await query.range(offset, offset + BATCH_SIZE - 1);
        if (batchErr) {
          console.error('Fetch tooling_info batch error:', batchErr);
          return res.status(500).json({ success: false, error: '查询失败' });
        }
        if (!batch || batch.length === 0) break;
        data.push(...batch);
        if (batch.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }
      count = totalCount;
    } else {
      const result = await query;
      data = result.data || [];
      count = result.count;
    }

    if (!data || data.length === 0) {
      return res.json({
        success: true,
        items: [],
        total: 0,
        page: pageNum,
        pageSize: sizeNum
      });
    }

    if (process.env.SUPABASE_DB_URL || '') {
      try {
        const ids = (data || []).map((item: any) => String(item?.id || '')).filter(Boolean)
        console.log(`[ToolingAPI] 准备查询${ids.length}个工具的总额数据, SUPABASE_DB_URL: ${process.env.SUPABASE_DB_URL ? '已配置' : '❌ 未配置'}`)
        if (ids.length > 0) {
          const pgTotals = await query(
            'SELECT id::text AS id, material_total, process_total, totals_updated_at FROM tooling_info WHERE id = ANY($1::text[])',
            [ids]
          )
          const totalsMap = new Map<string, any>()
          ;(pgTotals.rows || []).forEach((row: any) => {
            const id = String(row?.id || '')
            if (!id) return
            totalsMap.set(id, row)
          })
          console.log(`[ToolingAPI] 查询到${totalsMap.size}个有总额数据的工具`)
          let mergedCount = 0
          data = (data || []).map((item: any) => {
            const extra = totalsMap.get(String(item?.id || ''))
            if (!extra) return item
            mergedCount++
            return {
              ...item,
              material_total: extra.material_total,
              process_total: extra.process_total,
              totals_updated_at: extra.totals_updated_at
            }
          })
          console.log(`[ToolingAPI] 成功合并${mergedCount}个工具的总额数据`)
        }
      } catch (mergeErr) {
        console.warn('Merge tooling totals from PG failed:', mergeErr)
      }
    }

    res.json({
      success: true,
      items: data || [],
      total: typeof count === 'number' ? count : (data?.length || 0),
      page: pageNum,
      pageSize: sizeNum
    });
  } catch (err) {
    console.error('Tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

router.post('/status/batch', async (req, res) => {
  try {
    const { type, ids } = req.body || {};
    const itemType = String(type || '').trim();
    const list = Array.isArray(ids) ? ids.map((x: any) => String(x || '')).filter(Boolean) : [];
    if (!itemType || (itemType !== 'part' && itemType !== 'child')) {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }
    await ensureStatusTable();
    if (list.length === 0) return res.json({ success: true, map: {} });
    const map: Record<string, string> = {};
    const STATUS_BATCH_SIZE = 120;
    for (let i = 0; i < list.length; i += STATUS_BATCH_SIZE) {
      const slice = list.slice(i, i + STATUS_BATCH_SIZE);
      const { data, error } = await supabase
        .from('tooling_status')
        .select('item_id,status')
        .eq('item_type', itemType)
        .in('item_id', slice as any);
      if (error) return res.status(500).json({ success: false, error: error.message });
      (data || []).forEach((row: any) => {
        const k = String(row.item_id || '');
        if (k) map[k] = String(row.status || '');
      });
    }
    return res.json({ success: true, map });
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

router.post('/status', async (req, res) => {
  try {
    const { type, id, status, updated_by } = req.body || {};
    const itemType = String(type || '').trim();
    const itemId = String(id || '').trim();
    if (!itemType || !itemId || (itemType !== 'part' && itemType !== 'child')) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    await ensureStatusTable();
    const normalized = status === null || typeof status === 'undefined' ? '' : String(status || '').trim();
    if (!normalized) {
      const { error } = await supabase
        .from('tooling_status')
        .delete()
        .eq('item_type', itemType)
        .eq('item_id', itemId);
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true });
    }
    const payload = {
      item_type: itemType,
      item_id: itemId,
      status: normalized,
      updated_by: updated_by ? String(updated_by) : null,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from('tooling_status')
      .upsert(payload, { onConflict: 'item_type,item_id' });
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取设备列表
router.get('/devices', async (req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('device_no');

    if (error) throw error;
    res.json({ success: true, items: data });
  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取固定库存选项
router.get('/fixed-inventory-options', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fixed_inventory_options')
      .select('*')
      .order('option_value');

    if (error) throw error;
    res.json({ success: true, items: data });
  } catch (error) {
    console.error('获取固定库存选项失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除单个工装信息
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('tooling_info')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete tooling_info error:', error);
      return sendError(res, error.message, error.code);
    }

    return sendDeleted(res, '删除成功');
  } catch (err) {
    console.error('Delete tooling route error:', err);
    return sendError(res, '服务器错误');
  }
});

// 批量删除工装信息
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('tooling_info')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete tooling_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除单个零件
router.delete('/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先检查记录是否存在
    const { data: existing } = await supabase
      .from('parts_info')
      .select('id')
      .eq('id', id)
      .single();
    
    if (!existing) {
      return res.status(404).json({ success: false, error: '零件不存在' });
    }
    
    const { error } = await supabase
      .from('parts_info')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete part route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量删除零件
router.post('/parts/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('parts_info')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete parts route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 创建工装信息
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const inv = String((payload as any).inventory_number || '').trim()
    if (inv) {
      try {
        const { data: exists } = await supabase.from('tooling_info').select('*').eq('inventory_number', inv).limit(1)
        if (Array.isArray(exists) && exists[0]) {
          return res.json({ success: true, data: exists[0] })
        }
      } catch {}
    }

    const processedPayload: any = {}
    for (const k of Object.keys(payload)) {
      const v = (payload as any)[k]
      const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
      const isText = ['inventory_number','production_unit','category','project_name','recorder'].includes(k)
      if (isDate) {
        processedPayload[k] = (v === '' || v === null) ? null : v
      } else if (isText) {
        const sv = typeof v === 'string' ? v.trim() : v
        processedPayload[k] = (sv === '') ? null : sv
      } else {
        processedPayload[k] = v
      }
    }
    if (!('sets_count' in processedPayload)) processedPayload.sets_count = 1

    const { data, error } = await supabase
      .from('tooling_info')
      .insert([processedPayload])
      .select('*')
      .single();

  if (error) {
    console.error('Create tooling_info error:', error);
    const msg = String(error?.message || '服务器错误')
    const code = String((error as any)?.code || '')
    if (code === 'PGRST204' && (process.env.SUPABASE_DB_URL || '')) {
      try {
        // 预处理payload，将空日期字符串转换为null
        const processedPayload: any = {}
        for (const k in payload) {
          const value = (payload as any)[k]
          const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
          const isText = ['inventory_number','production_unit','category','project_name','recorder'].includes(k)
          if (isDate) {
            const sv = typeof value === 'string' ? value.trim() : value
            processedPayload[k] = (!sv) ? null : sv
          } else if (isText) {
            const sv = typeof value === 'string' ? value.trim() : value
            processedPayload[k] = (sv === '') ? null : sv
          } else {
            processedPayload[k] = value
          }
        }
        
        const keys = Object.keys(processedPayload)
        const values = keys.map(k => processedPayload[k])
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const colsSql = keys.map((k, i) => {
          const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
          return isDate ? `$${i + 1}::date` : `$${i + 1}`
        }).join(', ')
        const sql = `INSERT INTO tooling_info (${keys.join(',')}) VALUES (${colsSql}) RETURNING id`
        const r = await client.query(sql, values)
        await client.end()
        const row = (r.rows || [])[0]
        if (row?.id) {
          try {
            const mod2 = await import('pg') as any
            const PgClient2 = (mod2.Client || mod2.default?.Client)
            const client2 = new PgClient2({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
            await client2.connect()
            const r2 = await client2.query('SELECT * FROM tooling_info WHERE id = $1', [row.id])
            await client2.end()
            const full = (r2.rows || [])[0]
            if (full) return res.json({ success: true, data: full })
            return res.json({ success: true, data: { id: row.id } })
          } catch (e2: any) {
            return res.json({ success: true, data: { id: row.id } })
          }
        }
        return res.status(500).json({ success: false, error: '插入失败' })
      } catch (e: any) {
        console.error('PG fallback insert error:', e)
        return res.status(500).json({ success: false, error: e?.message || '服务器错误' })
      }
    }
    // 重复盘存编号，直接返回已存在记录
    if (code === '23505' && inv) {
      try {
        const { data: dup } = await supabase.from('tooling_info').select('*').eq('inventory_number', inv).limit(1)
        if (Array.isArray(dup) && dup[0]) return res.json({ success: true, data: dup[0] })
      } catch {}
    }
    const hint = '请检查必填字段与唯一约束，或执行迁移 20251112_relax_tooling_nullable.sql'
    return res.status(500).json({ success: false, error: msg, code, hint });
  }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Create tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 更新工装信息
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    // Prefer PG direct update for single-field updates to avoid schema cache issues
    const keys = Object.keys(payload || {})
    const allowed = ['inventory_number','production_unit','category','project_name','received_date','demand_date','completed_date','recorder','priority_level']
    if (keys.length === 1 && allowed.includes(keys[0]) && (process.env.SUPABASE_DB_URL || '')) {
      try {
        const k = keys[0]
        let v = (payload as any)[k]
        // 处理日期字段的空字符串
        const isDate = ['received_date','demand_date','completed_date'].includes(k)
        if (isDate && (!v || v.trim() === '')) {
          v = null
        }
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const sql = `UPDATE tooling_info SET ${k} = ${isDate ? '$1::date' : '$1'} WHERE id = $2 RETURNING id`
        const r = await client.query(sql, [v ?? null, id])
        await client.end()
        const row = (r.rows || [])[0]
        if (row) return res.json({ success: true })
      } catch (e: any) {
        console.error('PG preferred update error:', e)
      }
      // fallthrough to supabase if pg preferred path did not succeed
    }

    const { data, error } = await supabase
      .from('tooling_info')
      .update(payload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      const code = String((error as any)?.code || '')
      const msg = String((error as any)?.message || '')
      const keys = Object.keys(payload || {})
      const k = keys[0]
      const v = (payload as any)[k]
      const allowed = ['inventory_number','production_unit','category','project_name','received_date','demand_date','completed_date','priority_level']
      if (keys.length === 1 && allowed.includes(k) && (process.env.SUPABASE_DB_URL || '')) {
        try {
          // 处理日期字段的空字符串
          let processedV = v
          const isDate = ['received_date','demand_date','completed_date'].includes(k)
          if (isDate && (!v || v.trim() === '')) {
            processedV = null
          }
          const mod = await import('pg') as any
          const PgClient = (mod.Client || mod.default?.Client)
          const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
          await client.connect()
          const sql = `UPDATE tooling_info SET ${k} = ${isDate ? '$1::date' : '$1'} WHERE id = $2 RETURNING id`
          const r = await client.query(sql, [processedV ?? null, id])
          await client.end()
          const row = (r.rows || [])[0]
          if (row) return res.json({ success: true })
          return res.status(404).json({ success: false, error: '记录不存在或未更新' })
        } catch (e: any) {
          console.error('PG fallback update error:', e)
          return res.status(500).json({ success: false, error: e?.message || '服务器错误' })
        }
      }
      console.error('Update tooling_info error:', error);
      return res.status(500).json({ success: false, error: msg, code });
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('tooling_info')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select tooling_info after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      return res.json({ success: true, data: (exists as any)[0] });
    }

    res.json({ success: true, data: arr[0] });
  } catch (err) {
    console.error('Update tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取某工装的零件列表
router.get('/:id/parts', async (req, res) => {
  try {
    await ensurePurchaseStatusColumns();
    await ensureStatusTable();
    await ensurePartAmountColumns();
    const { id } = req.params;
    // 添加缓存控制头，确保获取最新数据
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
      const sel = [
        'id','tooling_id','part_inventory_number','part_drawing_number','part_name','part_quantity',
        'material_id','material_source_id','part_category','specifications','weight',
        'total_price','process_amount','amounts_updated_at','remarks','process_route','purchase_status','completed_steps'
      ].join(',')
      const { data, error } = await supabase
          .from('parts_info')
          .select(`${sel}, material:materials(*), material_source:material_sources(*)`)
          .eq('tooling_id', id);
      if (error) throw error
      let items = (data || []) as any[]
      
      // 按盘存编号自然排序（处理如 LJ260101-01, LJ260101-02, LJ260101-10 的情况）
      items.sort((a: any, b: any) => {
        const numA = String(a.part_inventory_number || '')
        const numB = String(b.part_inventory_number || '')
        // 提取前缀和数字后缀
        const matchA = numA.match(/^(.+?)-(\d+)$/)
        const matchB = numB.match(/^(.+?)-(\d+)$/)
        if (matchA && matchB) {
          const prefixA = matchA[1]
          const prefixB = matchB[1]
          // 先比较前缀
          if (prefixA !== prefixB) {
            return prefixA.localeCompare(prefixB)
          }
          // 前缀相同，比较数字后缀
          const suffixA = parseInt(matchA[2], 10)
          const suffixB = parseInt(matchB[2], 10)
          return suffixA - suffixB
        }
        // 不符合格式，按字符串排序
        return numA.localeCompare(numB)
      })
      
      const missingIds = items
        .filter(r => !String(r.purchase_status || '').trim())
        .map(r => String(r.id || ''))
        .filter(Boolean)
      if (missingIds.length > 0) {
        const statusMap = new Map<string, string>()
        const BATCH_SIZE = 120
        for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
          const slice = missingIds.slice(i, i + BATCH_SIZE)
          const { data: statusRows, error: statusErr } = await supabase
            .from('tooling_status')
            .select('item_id,status')
            .eq('item_type', 'part')
            .in('item_id', slice as any)
          if (statusErr) break
          ;(statusRows || []).forEach((r: any) => {
            const k = String(r.item_id || '')
            if (k) statusMap.set(k, String(r.status || ''))
          })
        }
        items.forEach((r: any) => {
          if (!String(r.purchase_status || '').trim()) {
            const s = statusMap.get(String(r.id || '')) || ''
            if (s) r.purchase_status = s
          }
        })
      }
      return res.json({ success: true, items })
    } catch (e: any) {
      console.warn('[Tooling] Supabase parts fetch failed, falling back to PG:', e?.message)
      try {
        const sql = `SELECT p.*, COALESCE(ts.status, p.purchase_status) AS purchase_status, row_to_json(m) AS material, row_to_json(s) AS material_source
          FROM parts_info p
          LEFT JOIN tooling_status ts ON ts.item_type = 'part' AND ts.item_id::text = p.id::text
          LEFT JOIN materials m ON p.material_id = m.id
          LEFT JOIN material_sources s ON p.material_source_id = s.id
          WHERE p.tooling_id = $1
          ORDER BY 
            -- 提取盘存编号的前缀部分（非数字部分）
            REGEXP_REPLACE(p.part_inventory_number, '[0-9]+$', '', 'g'),
            -- 提取盘存编号的数字后缀并转为整数排序
            CASE 
              WHEN p.part_inventory_number ~ '-[0-9]+$' THEN 
                (REGEXP_MATCHES(p.part_inventory_number, '-([0-9]+)$'))[1]::INTEGER
              ELSE 0
            END,
            p.part_inventory_number ASC`
        const r = await query(sql, [id])
        return res.json({ success: true, items: r.rows || [] })
      } catch (pgErr: any) {
        console.error('[Tooling] PG parts fetch error:', pgErr)
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err) {
    console.error('Get parts route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 新增零件
router.post('/:id/parts', async (req, res) => {
  try {
    await ensurePartAmountColumns();
    const { id } = req.params;
    let payload = { ...(req.body || {}), tooling_id: id };

    // 清理空的UUID字段，避免数据库错误
    if (payload.material_id === '') {
      delete payload.material_id;
    }
    if (payload.material_source_id === '' || payload.material_source_id === null) {
      delete payload.material_source_id;
    }
    
    // 清理integer字段的空字符串，避免数据库错误
    if (payload.part_quantity === '' || payload.part_quantity === null) {
      delete payload.part_quantity;
    }
    if (payload.weight === '' || payload.weight === null) {
      delete payload.weight;
    }
    
    // 清理盘存编号的空字符串
    if (payload.part_inventory_number === '' || payload.part_inventory_number === null) {
      delete payload.part_inventory_number;
    }

    // 清理分类字段的空字符串
    if (payload.part_category === '' || payload.part_category === null) {
      delete payload.part_category;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'total_price')) {
      delete (payload as any).total_price;
    }

    // 补齐材料来源：如果没有提供 material_source_id，但提供了 source 名称，则按名称匹配 material_sources 的 id
    try {
      const srcNameRaw = String((payload as any).material_source_id ? '' : ((payload as any).source || '')).trim()
      if (!payload.material_source_id && srcNameRaw) {
        const { data: srcs } = await supabase.from('material_sources').select('id, name').order('name')
        const match = (srcs || []).find((s: any) => String(s.name).trim() === srcNameRaw)
        if (match?.id) {
          (payload as any).material_source_id = match.id
        }
      }
    } catch {}

    // 如果有内容但没有盘存编号，尝试自动生成
    if ((payload.part_drawing_number || payload.part_name || payload.part_quantity) && !payload.part_inventory_number) {
      console.log('尝试为零件自动生成盘存编号...');
      
      // 获取父级工装的盘存编号
      const { data: toolingData, error: toolingError } = await supabase
        .from('tooling_info')
        .select('inventory_number')
        .eq('id', id)
        .single();
      
      if (!toolingError && toolingData?.inventory_number) {
        // 获取该工装下的所有零件数量，用于生成序号
        const { data: existingParts, error: countError } = await supabase
          .from('parts_info')
          .select('part_inventory_number')
          .eq('tooling_id', id);
        if (!countError) {
          const prefix = String(toolingData.inventory_number);
          const used = new Set<number>();
          (existingParts || []).forEach((p: any) => {
            const v = String(p.part_inventory_number || '').trim();
            if (v && v.startsWith(prefix)) {
              const n = Number(v.slice(prefix.length));
              if (Number.isFinite(n)) used.add(n);
            }
          });
          let s = 1;
          while (used.has(s)) s++;
          const width = Math.max(2, String(s).length);
          const newInventoryNumber = `${prefix}${String(s).padStart(width, '0')}`;
          payload.part_inventory_number = newInventoryNumber;
          console.log(`自动生成盘存编号: ${newInventoryNumber} (序号: ${s})`);
        }
      }
    }
    
    // 如果没有盘存编号，不创建记录
    if (!payload.part_inventory_number) {
      return res.status(400).json({ success: false, error: '盘存编号不能为空' });
    }

    const { data, error } = await supabase
      .from('parts_info')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(400).json({ success: false, error: '盘存编号已存在，不允许重复', code: error.code });
      }
      console.error('Create parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    try {
      await refreshToolingStoredAmounts(id)
    } catch (refreshErr) {
      console.warn('创建零件后刷新金额失败:', refreshErr)
    }
    const { data: latestPart } = await supabase
      .from('parts_info')
      .select('*')
      .eq('id', String(data?.id || ''))
      .single()
    res.json({ success: true, data: latestPart || data });
  } catch (err) {
    console.error('Create part route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

  // 更新零件
  router.put('/parts/:id', async (req, res) => {
  try {
    await ensurePartAmountColumns();
    const { id } = req.params;
    // 暂时禁用 ensurePurchaseStatusColumns，因为我们已经手动创建了 completed_steps 列
    // await ensurePurchaseStatusColumns();
    const payload = req.body || {};
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'purchase_status')

    // 清理空字符串的字段，避免数据库错误
    const cleanedPayload = { ...payload };
    
    // 清理UUID字段的空字符串
    if (cleanedPayload.material_id === '') {
      delete cleanedPayload.material_id;
    }
    if (cleanedPayload.material_source_id === '' || cleanedPayload.material_source_id === null) {
      delete cleanedPayload.material_source_id;
    }
    
    // 清理分类字段的空字符串
    if (cleanedPayload.part_category === '' || cleanedPayload.part_category === null) {
      delete cleanedPayload.part_category;
    }
    
    // 清理integer字段的空字符串
    if (cleanedPayload.part_quantity === '' || cleanedPayload.part_quantity === null) {
      delete cleanedPayload.part_quantity;
    }
    if (cleanedPayload.weight === '' || cleanedPayload.weight === null) {
      delete cleanedPayload.weight;
    }
    if (Object.prototype.hasOwnProperty.call(cleanedPayload, 'total_price')) {
      delete (cleanedPayload as any).total_price;
    }
    if (hasStatus) {
      delete cleanedPayload.purchase_status
    }
    // 处理 completed_steps 字段
    if (Object.prototype.hasOwnProperty.call(cleanedPayload, 'completed_steps')) {
      // 确保是数组格式
      if (!Array.isArray(cleanedPayload.completed_steps)) {
        try {
          cleanedPayload.completed_steps = JSON.parse(cleanedPayload.completed_steps) || []
        } catch {
          cleanedPayload.completed_steps = []
        }
      }
    }

    // 如果没有提供盘存编号但有内容，尝试自动生成一个唯一的盘存编号
    try {
      const hasContent = (cleanedPayload.part_drawing_number || cleanedPayload.part_name || cleanedPayload.part_quantity)
      const noInv = !cleanedPayload.part_inventory_number || String(cleanedPayload.part_inventory_number).trim() === ''
      if (hasContent && noInv) {
        const { data: partRow } = await supabase
          .from('parts_info')
          .select('tooling_id')
          .eq('id', id)
          .limit(1)
        const toolingId = Array.isArray(partRow) && partRow[0]?.tooling_id
        if (toolingId) {
          const { data: toolingData } = await supabase
            .from('tooling_info')
            .select('inventory_number')
            .eq('id', toolingId)
            .single()
          const prefix = String(toolingData?.inventory_number || '').trim()
          if (prefix) {
            const { data: existingParts } = await supabase
              .from('parts_info')
              .select('part_inventory_number')
              .eq('tooling_id', toolingId)
            const used = new Set<number>();
            (existingParts || []).forEach((p: any) => {
              const v = String(p.part_inventory_number || '').trim()
              if (v && v.startsWith(prefix)) {
                const n = Number(v.slice(prefix.length))
                if (Number.isFinite(n)) used.add(n)
              }
            })
            let s = 1
            while (used.has(s)) s++
            cleanedPayload.part_inventory_number = `${prefix}${String(s).padStart(2, '0')}`
            console.log('更新时自动生成盘存编号:', cleanedPayload.part_inventory_number)
          }
        }
      }
    } catch (genErr) {
      console.warn('更新时自动生成盘存编号失败:', genErr)
    }

    // 提取 completed_steps 字段
    const completedStepsToSave = cleanedPayload.completed_steps;
    if (Object.prototype.hasOwnProperty.call(cleanedPayload, 'completed_steps')) {
      delete (cleanedPayload as any).completed_steps;
    }
    
    // 使用 Supabase 客户端更新 completed_steps
    if (completedStepsToSave && Array.isArray(completedStepsToSave)) {
      try {
        const { error: csError } = await supabase
          .from('parts_info')
          .update({ completed_steps: completedStepsToSave })
          .eq('id', id);
        
        if (csError) {
          console.error('更新 completed_steps 失败:', csError);
        }
      } catch (csErr) {
        console.error('更新 completed_steps 异常:', csErr);
      }
    }
    
    // 如果 cleanedPayload 为空（只有 completed_steps 字段），直接返回成功
    if (Object.keys(cleanedPayload).length === 0) {
      return res.json({ success: true, data: { id, completed_steps: completedStepsToSave } });
    }
    
    const { data, error } = await supabase
      .from('parts_info')
      .update(cleanedPayload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(400).json({ success: false, error: '盘存编号已存在，不允许重复', code: error.code });
      }
      console.error('Update parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }
    
    // 立即查询验证更新结果
    const { data: verifyData, error: verifyError } = await supabase
      .from('parts_info')
      .select('*')
      .eq('id', id)
      .single();

    if (hasStatus) {
      await ensureStatusTable();
      const s = payload.purchase_status
      const status = (s === null || typeof s === 'undefined') ? '' : String(s || '').trim()
      if (!status) {
        await supabase
          .from('tooling_status')
          .delete()
          .eq('item_type', 'part')
          .eq('item_id', id)
      } else {
        await supabase
          .from('tooling_status')
          .upsert({
            item_type: 'part',
            item_id: id,
            status,
            updated_at: new Date().toISOString()
          }, { onConflict: 'item_type,item_id' })
      }
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('parts_info')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select parts_info after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      return res.json({ success: true, data: (exists as any)[0] });
    }

    // 使用验证查询的结果返回给前端，确保包含 completed_steps
    const finalData = verifyData || arr[0];

    // 联动更新采购单的总重量与总金额，确保审批端与工装信息一致
    // 只在材料ID、重量或数量发生变化时才执行，避免不必要的数据库查询
    try {
      const partRow = arr[0];
      const materialIdChanged = cleanedPayload.material_id !== undefined;
      const quantityChanged = cleanedPayload.part_quantity !== undefined;
      const weightChanged = cleanedPayload.weight !== undefined;

      if (materialIdChanged || quantityChanged || weightChanged) {
        const qty = Number(partRow?.part_quantity || 0);
        const unitW = Number(partRow?.weight || 0);
        const totalW = qty > 0 && unitW > 0 ? Math.round(qty * unitW * 1000) / 1000 : null;

        let unitPrice: number | null = null;
        const materialId = partRow?.material_id;
        if (materialId) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: prices } = await supabase
            .from('material_prices')
            .select('unit_price,effective_start_date,effective_end_date')
            .eq('material_id', materialId)
            .order('effective_start_date', { ascending: false });
          if (Array.isArray(prices) && prices.length > 0) {
            const applicable = prices.find((p: any) => (!p.effective_end_date || p.effective_end_date >= today) && p.effective_start_date <= today) || prices[0];
            unitPrice = Number(applicable?.unit_price || 0);
          }
        }
        if (unitPrice === null) unitPrice = 50; // 回退单价
        const totalPrice = totalW && unitPrice ? Math.round(totalW * unitPrice * 100) / 100 : null;

        await supabase
          .from('purchase_orders')
          .update({ weight: totalW, total_price: totalPrice })
          .eq('part_id', id);
        console.log(`[Tooling] 联动更新采购单成功 part_id=${id}, weight=${totalW}, total_price=${totalPrice}`);
      }
    } catch (linkErr) {
      console.warn('[Tooling] 联动更新采购单失败:', linkErr);
    }

    let refreshedData = finalData
    try {
      const toolingIdForRefresh = String(finalData?.tooling_id || arr[0]?.tooling_id || '')
      if (toolingIdForRefresh) {
        await refreshToolingStoredAmounts(toolingIdForRefresh)
        const { data: latestPart } = await supabase
          .from('parts_info')
          .select('*')
          .eq('id', id)
          .single()
        if (latestPart) refreshedData = latestPart
      }
    } catch (refreshErr) {
      console.warn('更新零件后刷新金额失败:', refreshErr)
    }

    // 使用验证查询的结果返回给前端，确保包含 completed_steps 与持久化金额
    res.json({ success: true, data: refreshedData });
  } catch (err) {
    console.error('Update part route error', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量写入工艺路线（按子表盘存编号）
router.post('/parts/process-routes', async (req, res) => {
  try {
    const { mappings } = req.body || {}
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ success: false, error: '缺少工艺路线映射' })
    }
    let updated = 0
    const failed: Array<{ key: string; reason: string }> = []
    for (const m of mappings) {
      const inv = String(m.part_inventory_number || '').trim()
      const drawing = String(m.part_drawing_number || '').trim()
      const route = String(m.process_route || '').trim()
      if ((!inv && !drawing) || !route) continue
      try {
        let q = supabase.from('parts_info').update({ process_route: route }).select('id')
        if (inv) {
          q = q.or(`part_inventory_number.eq.${inv},part_inventory_number.ilike.${inv}`)
        } else {
          q = q.eq('part_drawing_number', drawing)
        }
        const { data, error } = await q
        if (error) throw error
        const affected = Array.isArray(data) ? data.length : 0
        if (affected > 0) {
          updated += affected
        } else {
          failed.push({ key: inv || drawing, reason: '未匹配到记录' })
        }
      } catch (e: any) {
        // PG fallback
        try {
          let r
          if (inv) {
            r = await query('UPDATE parts_info SET process_route = $1 WHERE UPPER(part_inventory_number) = UPPER($2)', [route, inv])
          } else {
            r = await query('UPDATE parts_info SET process_route = $1 WHERE part_drawing_number = $2', [route, drawing])
          }
          const affected = r.rowCount || 0
          if (affected > 0) updated += affected
          else failed.push({ key: inv || drawing, reason: '未匹配到记录' })
        } catch (pgErr) {
          console.warn('[Tooling] process-route update failed for', inv || drawing, pgErr)
          failed.push({ key: inv || drawing, reason: String((pgErr as any)?.message || '更新失败') })
        }
      }
    }
    return res.json({ success: true, updated, failedCount: failed.length, failed: failed.slice(0, 50) })
  } catch (err) {
    console.error('Batch set process routes error:', err)
    return res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// 批量获取工装的编制信息（技术员标识）
router.get('/batch', async (req, res) => {
  try {
    const idsParam = (req.query.ids || []) as string[] | string
    const ids = Array.isArray(idsParam) ? idsParam : String(idsParam || '').split(',').filter(Boolean)
    if (!ids.length) {
      return res.json({ success: true, items: [] })
    }

    const { data, error } = await supabase
      .from('tooling_info')
      .select('id, responsible_person_id, recorder')
      .in('id', ids)

    if (error) {
      console.error('Fetch tooling batch error:', error)
      return res.status(500).json({ success: false, error: '查询编制信息失败' })
    }

    const items = (data || []).map((t: any) => ({
      id: String(t.id || ''),
      responsible_person_id: String(t.responsible_person_id || ''),
      recorder: String(t.recorder || '')
    }))
    res.json({ success: true, items })
  } catch (err: any) {
    console.error('Tooling batch route error:', err)
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// 列出所有盘存编号及零件基本信息（分页）
router.get('/parts/inventory-list', async (req, res) => {
  try {
    const { page = '1', pageSize = '50', search = '' } = req.query as Record<string, string>
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.max(parseInt(pageSize, 10) || 50, 1)
    const from = (pageNum - 1) * sizeNum
    const to = from + sizeNum - 1
    const keyword = String(search || '').trim()
    const matchExpr = keyword ? `%${keyword}%` : ''
    const BATCH_SIZE = 1000
    const fetchBatched = async <T = any>(build: (offset: number, limit: number) => any): Promise<T[]> => {
      const all: T[] = []
      let offset = 0
      while (true) {
        if (!keyword && from + offset > to) break
        const { data, error } = await build(offset, BATCH_SIZE)
        if (error) throw error
        const rows = Array.isArray(data) ? data : []
        all.push(...rows)
        if (rows.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
      return all
    }

    const partsRows = await fetchBatched((offset, limit) => {
      let q = supabase
        .from('parts_info')
        .select('id, part_inventory_number, inventory_number, part_name, part_drawing_number, tooling_id, process_route')
      if (matchExpr) {
        q = q.or(`part_inventory_number.ilike.${matchExpr},inventory_number.ilike.${matchExpr},part_name.ilike.${matchExpr},part_drawing_number.ilike.${matchExpr}`)
      }
      if (!keyword) {
        return q.order('part_inventory_number', { ascending: true }).range(from + offset, Math.min(to, from + offset + limit - 1))
      }
      return q.order('part_inventory_number', { ascending: true }).range(offset, offset + limit - 1)
    })
    const mergedMap = new Map<string, any>()
    ;(partsRows || []).forEach((p: any) => {
      const inv = String(p.part_inventory_number || p.inventory_number || '').trim()
      if (!inv) return
      mergedMap.set(inv.toUpperCase(), {
        id: String(p.id || ''),
        part_inventory_number: inv,
        part_name: String(p.part_name || ''),
        part_drawing_number: String(p.part_drawing_number || ''),
        tooling_id: String(p.tooling_id || ''),
        process_route: String(p.process_route || '')
      })
    })
    if (keyword) {
      const pgLike = `%${keyword}%`
      const keywordNorm = keyword.toUpperCase().replace(/[^A-Z0-9]/g, '')
      try {
        const pgParts = await query(
          `SELECT id, part_inventory_number, inventory_number, part_name, part_drawing_number, tooling_id, process_route
           FROM parts_info
           WHERE part_inventory_number ILIKE $1 OR inventory_number ILIKE $1 OR part_name ILIKE $1 OR part_drawing_number ILIKE $1
           ORDER BY part_inventory_number ASC`,
          [pgLike]
        )
        ;(pgParts.rows || []).forEach((p: any) => {
          const inv = String(p.part_inventory_number || p.inventory_number || '').trim()
          if (!inv) return
          mergedMap.set(inv.toUpperCase(), {
            id: String(p.id || ''),
            part_inventory_number: inv,
            part_name: String(p.part_name || ''),
            part_drawing_number: String(p.part_drawing_number || ''),
            tooling_id: String(p.tooling_id || ''),
            process_route: String(p.process_route || '')
          })
        })
      } catch {}
      if (keywordNorm) {
        try {
          const pgPartsNormalized = await query(
            `SELECT id, part_inventory_number, inventory_number, part_name, part_drawing_number, tooling_id, process_route
             FROM parts_info
             WHERE regexp_replace(upper(coalesce(part_inventory_number, inventory_number, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || $1 || '%'
             ORDER BY part_inventory_number ASC`,
            [keywordNorm]
          )
          ;(pgPartsNormalized.rows || []).forEach((p: any) => {
            const inv = String(p.part_inventory_number || p.inventory_number || '').trim()
            if (!inv) return
            mergedMap.set(inv.toUpperCase(), {
              id: String(p.id || ''),
              part_inventory_number: inv,
              part_name: String(p.part_name || ''),
              part_drawing_number: String(p.part_drawing_number || ''),
              tooling_id: String(p.tooling_id || ''),
              process_route: String(p.process_route || '')
            })
          })
        } catch {}
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => String(a.part_inventory_number || '').localeCompare(String(b.part_inventory_number || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
    const items = merged.slice(from, to + 1)
    res.json({ success: true, items, total: merged.length, page: pageNum, pageSize: sizeNum })
  } catch (err: any) {
    console.error('Inventory list error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 程序管理聚合列表
router.get('/program-management', async (req, res) => {
  try {
    await ensureProgramEntriesTable()
    const {
      page = '1',
      pageSize = '50',
      search = '',
      status = 'all'
    } = req.query as Record<string, string>
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.max(parseInt(pageSize, 10) || 50, 1)
    const from = (pageNum - 1) * sizeNum
    const keyword = String(search || '').trim()

    let programRows: any[] = []
    try {
      let q = supabase
        .from('program_entries')
        .select('id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer')
        .order('programmed_at', { ascending: false })
      if (keyword) {
        const likeKeyword = `%${keyword}%`
        q = q.or(`part_inventory_number.ilike.${likeKeyword},part_drawing_number.ilike.${likeKeyword},process_name.ilike.${likeKeyword},program_no.ilike.${likeKeyword},programmer.ilike.${likeKeyword}`)
      }
      const { data, error } = await q
      if (error) throw error
      programRows = Array.isArray(data) ? data : []
    } catch (sbErr: any) {
      if (!process.env.SUPABASE_DB_URL) throw sbErr
      const params: any[] = []
      const conds: string[] = []
      if (keyword) {
        params.push(`%${keyword}%`)
        const idx = params.length
        conds.push(`(
          part_inventory_number ILIKE $${idx}
          OR part_drawing_number ILIKE $${idx}
          OR process_name ILIKE $${idx}
          OR program_no ILIKE $${idx}
          OR programmer ILIKE $${idx}
        )`)
      }
      const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
      const result = await query(
        `SELECT id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer
         FROM program_entries
         ${whereSql}
         ORDER BY programmed_at DESC`,
        params
      )
      programRows = Array.isArray((result as any)?.rows) ? (result as any).rows : []
    }

    const groupedMap = new Map<string, any>()
    ;(programRows || []).forEach((row: any, index: number) => {
      const inventoryNo = normalizeProgramManageInventoryNo(row?.part_inventory_number)
      const rawProcessName = String(row?.process_name || '').trim()
      const processKey = normalizeProgramManageProcessKey(rawProcessName)
      const processBaseKey = normalizeProgramManageProcessBaseKey(rawProcessName)
      if (!inventoryNo || !processKey) return
      const groupKey = `${inventoryNo}__${processKey}`
      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          key: groupKey,
          part_inventory_number: String(row?.part_inventory_number || '').trim(),
          part_drawing_number: String(row?.part_drawing_number || '').trim(),
          process_name: rawProcessName,
          process_key: processKey,
          process_base_key: processBaseKey,
          program_segment_set: new Set<string>(),
          program_total_minutes: 0,
          programmer_set: new Set<string>(),
          latest_programmed_at_ms: 0,
          latest_programmed_at: '',
          sort_index: index
        })
      }
      const group = groupedMap.get(groupKey)
      const durationMinutes = Number(row?.program_duration_minutes || 0)
      const programNo = String(row?.program_no || '').trim()
      const programmer = String(row?.programmer || '').trim()
      const programmedAtText = String(row?.programmed_at || '').trim()
      const programmedAtMs = Date.parse(programmedAtText)
      if (!group.part_drawing_number) group.part_drawing_number = String(row?.part_drawing_number || '').trim()
      if (!group.process_name && rawProcessName) group.process_name = rawProcessName
      if (programNo) group.program_segment_set.add(programNo)
      if (programmer) group.programmer_set.add(programmer)
      if (Number.isFinite(durationMinutes)) group.program_total_minutes += durationMinutes
      if (Number.isFinite(programmedAtMs) && programmedAtMs >= Number(group.latest_programmed_at_ms || 0)) {
        group.latest_programmed_at_ms = programmedAtMs
        group.latest_programmed_at = programmedAtText
      }
    })

    const groupedBaseMap = new Map<string, any[]>()
    Array.from(groupedMap.values()).forEach((group: any) => {
      const inventoryNo = normalizeProgramManageInventoryNo(group?.part_inventory_number)
      const baseKey = String(group?.process_base_key || '').trim()
      if (!inventoryNo || !baseKey) return
      const mapKey = `${inventoryNo}__${baseKey}`
      const list = groupedBaseMap.get(mapKey) || []
      list.push(group)
      groupedBaseMap.set(mapKey, list)
    })

    const inventoryList = Array.from(new Set(Array.from(groupedMap.values()).map((item: any) => normalizeProgramManageInventoryNo(item?.part_inventory_number)).filter(Boolean)))
    const partMetaMap = new Map<string, {
      part_name: string
      part_drawing_number: string
      part_quantity: number
      tooling_id: string
      project_name: string
    }>()
    try {
      for (const invChunk of chunkItems(inventoryList, 120)) {
        let mergedPartRows: any[] = []
        try {
          const [{ data: byPartInv, error: byPartInvErr }, { data: byInventory, error: byInventoryErr }] = await Promise.all([
            supabase
              .from('parts_info')
              .select('part_inventory_number, inventory_number, part_name, part_drawing_number, part_quantity, tooling_id')
              .in('part_inventory_number', invChunk),
            supabase
              .from('parts_info')
              .select('part_inventory_number, inventory_number, part_name, part_drawing_number, part_quantity, tooling_id')
              .in('inventory_number', invChunk)
          ])
          if (byPartInvErr && byInventoryErr) throw byPartInvErr
          mergedPartRows = [...((byPartInv || []) as any[]), ...((byInventory || []) as any[])]
        } catch (sbErr: any) {
          if (!process.env.SUPABASE_DB_URL) throw sbErr
          const result = await query(
            `SELECT part_inventory_number, inventory_number, part_name, part_drawing_number, part_quantity, tooling_id
             FROM parts_info
             WHERE part_inventory_number = ANY($1) OR inventory_number = ANY($1)`,
            [invChunk]
          )
          mergedPartRows = (((result as any)?.rows) || []) as any[]
        }
        ;(mergedPartRows || []).forEach((row: any) => {
          const inventoryNo = normalizeProgramManageInventoryNo(row?.part_inventory_number || row?.inventory_number)
          if (!inventoryNo) return
          const prev = partMetaMap.get(inventoryNo)
          const partQuantity = Number(row?.part_quantity || 0)
          partMetaMap.set(inventoryNo, {
            part_name: String(row?.part_name || prev?.part_name || '').trim(),
            part_drawing_number: String(row?.part_drawing_number || prev?.part_drawing_number || '').trim(),
            part_quantity: Number.isFinite(partQuantity) && partQuantity > 0 ? partQuantity : Number(prev?.part_quantity || 0),
            tooling_id: String(row?.tooling_id || prev?.tooling_id || '').trim(),
            project_name: String(prev?.project_name || '').trim()
          })
        })
      }
      const toolingIdList = Array.from(new Set(Array.from(partMetaMap.values()).map((item) => String(item.tooling_id || '').trim()).filter(Boolean)))
      if (toolingIdList.length > 0) {
        const projectNameMap = new Map<string, string>()
        try {
          for (const toolingChunk of chunkItems(toolingIdList, 120)) {
            const { data, error } = await supabase
              .from('tooling_info')
              .select('id, project_name')
              .in('id', toolingChunk)
            if (error) throw error
            ;(data || []).forEach((row: any) => {
              const id = String(row?.id || '').trim()
              if (!id) return
              projectNameMap.set(id, String(row?.project_name || '').trim())
            })
          }
        } catch (sbErr: any) {
          if (!process.env.SUPABASE_DB_URL) throw sbErr
          const result = await query(
            `SELECT id, project_name
             FROM tooling_info
             WHERE id = ANY($1)`,
            [toolingIdList]
          )
          ;((((result as any)?.rows) || []) as any[]).forEach((row: any) => {
            const id = String(row?.id || '').trim()
            if (!id) return
            projectNameMap.set(id, String(row?.project_name || '').trim())
          })
        }
        partMetaMap.forEach((meta) => {
          if (!meta.tooling_id) return
          meta.project_name = String(projectNameMap.get(meta.tooling_id) || meta.project_name || '').trim()
        })
      }
    } catch (metaErr) {
      console.error('Program management metadata skipped:', metaErr)
    }
    Array.from(groupedMap.values()).forEach((group: any) => {
      const meta = partMetaMap.get(normalizeProgramManageInventoryNo(group?.part_inventory_number))
      if (!meta) return
      if (!group.part_drawing_number) group.part_drawing_number = meta.part_drawing_number || ''
      group.part_name = meta.part_name || ''
      group.part_quantity = Number(meta.part_quantity || 0)
      group.tooling_id = meta.tooling_id || ''
      group.project_name = meta.project_name || ''
    })
    const workHourMap = new Map<string, any>()
    try {
      for (const invChunk of chunkItems(inventoryList, 120)) {
        const baseSelect = 'id, inventory_no, part_inventory_number, process_name, completed_quantity, operator, device_no, work_date, aux_start_time, aux_end_time, aux_hours, proc_hours, created_at'
        const fallbackSelect = 'id, part_inventory_number, process_name, completed_quantity, operator, device_no, work_date, aux_start_time, aux_end_time, aux_hours, proc_hours, created_at'
        let mergedRows: any[] = []
        try {
          const [{ data: invData, error: invErr }, { data: partInvData, error: partInvErr }] = await Promise.all([
            supabase.from('work_hours').select(baseSelect).in('inventory_no', invChunk),
            supabase.from('work_hours').select(baseSelect).in('part_inventory_number', invChunk)
          ])
          if (invErr && partInvErr) throw invErr
          mergedRows = [...((invData || []) as any[]), ...((partInvData || []) as any[])]
        } catch (sbErr: any) {
          try {
            const { data: fallbackRows, error: fallbackErr } = await supabase
              .from('work_hours')
              .select(fallbackSelect)
              .in('part_inventory_number', invChunk)
            if (fallbackErr) throw fallbackErr
            mergedRows = (fallbackRows || []) as any[]
          } catch (fallbackSbErr: any) {
            if (!process.env.SUPABASE_DB_URL) throw fallbackSbErr
            const result = await query(
              `SELECT id, part_inventory_number, process_name, completed_quantity, operator, device_no, work_date, aux_start_time, aux_end_time, aux_hours, proc_hours, created_at
               FROM work_hours
               WHERE part_inventory_number = ANY($1)`,
              [invChunk]
            )
            mergedRows = (((result as any)?.rows) || []) as any[]
          }
        }
        ;(mergedRows || []).forEach((row: any, idx: number) => {
          const key = String(row?.id || `${row?.inventory_no || ''}|${row?.part_inventory_number || ''}|${row?.process_name || ''}|${row?.created_at || ''}|${idx}`)
          if (!workHourMap.has(key)) workHourMap.set(key, row)
        })
      }
    } catch (workHourErr) {
      console.error('Program management work hours skipped:', workHourErr)
    }

    Array.from(workHourMap.values()).forEach((row: any) => {
      const inventoryCandidates = Array.from(new Set([
        normalizeProgramManageInventoryNo(row?.part_inventory_number),
        normalizeProgramManageInventoryNo(row?.inventory_no)
      ].filter(Boolean)))
      const processName = String(row?.process_name || '').trim()
      const processKey = normalizeProgramManageProcessKey(processName)
      const processBaseKey = normalizeProgramManageProcessBaseKey(processName)
      if (inventoryCandidates.length === 0 || !processKey) return
      let group: any = null
      for (const inventoryNo of inventoryCandidates) {
        const exactGroup = groupedMap.get(`${inventoryNo}__${processKey}`)
        const fallbackGroups = processBaseKey ? (groupedBaseMap.get(`${inventoryNo}__${processBaseKey}`) || []) : []
        group = exactGroup || (fallbackGroups.length === 1 ? fallbackGroups[0] : null)
        if (group) break
      }
      if (!group) return
      if (!group.operator_hours_map) group.operator_hours_map = {}
      if (!group.device_set) group.device_set = new Set<string>()
      if (!group.work_hours_total) group.work_hours_total = 0
      if (!group.completed_quantity) group.completed_quantity = 0
      const completedQuantity = Number(row?.completed_quantity || 0)
      if (Number.isFinite(completedQuantity) && completedQuantity > 0) {
        group.completed_quantity += completedQuantity
      }
      const procHours = Number(row?.proc_hours || 0)
      if (Number.isFinite(procHours) && procHours > 0) {
        group.work_hours_total += procHours
        const operator = String(row?.operator || '').trim()
        if (operator) {
          group.operator_hours_map[operator] = Number(group.operator_hours_map[operator] || 0) + procHours
        }
        const windowInfo = resolveProgramProcessWindow(row)
        if (windowInfo?.startAt && (!group.program_start_at || windowInfo.startAt.getTime() < group.program_start_at.getTime())) {
          group.program_start_at = windowInfo.startAt
        }
        if (windowInfo?.endAt && (!group.program_end_at || windowInfo.endAt.getTime() > group.program_end_at.getTime())) {
          group.program_end_at = windowInfo.endAt
        }
      }
      const deviceNo = String(row?.device_no || '').trim()
      if (deviceNo) group.device_set.add(deviceNo)
    })

    const items = Array.from(groupedMap.values()).map((group: any) => {
      const operatorHoursEntries = Object.entries(group.operator_hours_map || {}) as Array<[string, any]>
      const runtimeHours = Number(group.work_hours_total || 0)
      const operatorSummary = operatorHoursEntries
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .map(([name, hours]) => {
          const hourValue = Number(hours || 0)
          if (operatorHoursEntries.length <= 1 || runtimeHours <= 0) return name
          const pct = runtimeHours > 0 ? (hourValue / runtimeHours) * 100 : 0
          return `${name} ${pct.toFixed(0)}%`
        })
        .join('、')
      const startAt = group.program_start_at instanceof Date ? group.program_start_at : null
      const endAt = group.program_end_at instanceof Date ? group.program_end_at : null
      const spanHours = startAt && endAt ? Math.max(0, (endAt.getTime() - startAt.getTime()) / 3600000) : 0
      const programTotalHours = Number(group.program_total_minutes || 0) / 60
      const programCount = (group.program_segment_set instanceof Set ? group.program_segment_set.size : 0) || 0
      const partQuantity = Math.max(Number(group.part_quantity || 0), 0)
      const totalQuantity = partQuantity
      const completedQuantity = Math.max(Number(group.completed_quantity || 0), 0)
      const displayCompletedQuantity = totalQuantity > 0 ? Math.min(completedQuantity, totalQuantity) : completedQuantity
      const isCompleted = totalQuantity > 0 && completedQuantity >= totalQuantity
      const hasRuntime = runtimeHours > 0
      const isProcessing = !isCompleted && hasRuntime
      const avgRuntimeBase = Math.max(completedQuantity, 1)
      const avgRuntimeHours = hasRuntime ? (runtimeHours / avgRuntimeBase) : null
      const progressDisplay = totalQuantity > 0
        ? `${formatProgramManageQuantity(displayCompletedQuantity)}/${formatProgramManageQuantity(totalQuantity)}`
        : formatProgramManageQuantity(completedQuantity)
      const runtimeDisplay = runtimeHours > 0 ? `${formatProgramManageHours(runtimeHours)}小时` : '-'
      const startEndDisplay = startAt && endAt ? `${formatProgramManageDateTime(startAt)} - ${formatProgramManageDateTime(endAt)}` : '-'
      const completionStatusKey = isCompleted ? 'completed' : (isProcessing ? 'processing' : 'pending')
      const deviceNos = group.device_set instanceof Set ? Array.from(group.device_set).sort((a: string, b: string) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })) : []
      return {
        key: group.key,
        part_inventory_number: group.part_inventory_number || '',
        project_name: group.project_name || '',
        part_name: group.part_name || '',
        part_drawing_number: group.part_drawing_number || '',
        process_name: group.process_name || '',
        total_quantity: Number(totalQuantity.toFixed(2)),
        completed_quantity: Number(completedQuantity.toFixed(2)),
        quantity_progress_display: progressDisplay,
        completion_status_key: completionStatusKey,
        program_count: programCount,
        program_total_hours: Number(programTotalHours.toFixed(2)),
        average_runtime_hours: avgRuntimeHours == null ? null : Number(avgRuntimeHours.toFixed(2)),
        average_runtime_hours_display: avgRuntimeHours == null ? '-' : formatProgramManageHours(avgRuntimeHours),
        program_runtime_hours: Number(runtimeHours.toFixed(2)),
        program_span_hours: Number(spanHours.toFixed(2)),
        program_runtime_display: runtimeDisplay,
        program_start_end_display: startEndDisplay,
        operator_display: operatorSummary || '-',
        device_no_display: deviceNos.length ? deviceNos.join('、') : '-',
        latest_programmed_at: group.latest_programmed_at || '',
        programmers: group.programmer_set instanceof Set ? Array.from(group.programmer_set).join('、') : ''
      }
    }).sort((a: any, b: any) => {
      const atDiff = Date.parse(String(b.latest_programmed_at || '')) - Date.parse(String(a.latest_programmed_at || ''))
      if (Number.isFinite(atDiff) && atDiff !== 0) return atDiff
      return String(a.part_inventory_number || '').localeCompare(String(b.part_inventory_number || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })

    const filteredItems = items.filter((item: any) => {
      if (status === 'all') return true
      return String(item?.completion_status_key || '') === String(status || '')
    })
    const pagedItems = filteredItems.slice(from, from + sizeNum)
    return res.json({
      success: true,
      items: pagedItems,
      total: filteredItems.length,
      page: pageNum,
      pageSize: sizeNum
    })
  } catch (err: any) {
    console.error('Get program management error:', err)
    return res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 批量提交程序录入
router.get('/program-entries', async (req, res) => {
  try {
    await ensureProgramEntriesTable()
    const {
      page = '1',
      pageSize = '200'
    } = req.query as Record<string, string>
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.max(parseInt(pageSize, 10) || 200, 1)
    const offset = (pageNum - 1) * sizeNum

    try {
      const { data, error, count } = await supabase
        .from('program_entries')
        .select('id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer', { count: 'exact' })
        .order('programmed_at', { ascending: false })
        .range(offset, offset + sizeNum - 1)
      if (error) throw error
      return res.json({
        success: true,
        items: Array.isArray(data) ? data : [],
        total: Number(count || 0),
        page: pageNum,
        pageSize: sizeNum
      })
    } catch (sbErr: any) {
      if (!process.env.SUPABASE_DB_URL) throw sbErr
      const countResult = await query(`SELECT COUNT(*)::int AS total FROM program_entries`)
      const result = await query(
        `SELECT id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer
         FROM program_entries
         ORDER BY programmed_at DESC
         LIMIT $1 OFFSET $2`,
        [sizeNum, offset]
      )
      return res.json({
        success: true,
        items: Array.isArray((result as any)?.rows) ? (result as any).rows : [],
        total: Number((countResult as any)?.rows?.[0]?.total || 0),
        page: pageNum,
        pageSize: sizeNum
      })
    }
  } catch (err: any) {
    console.error('Get program entries error:', err)
    return res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/program-entries/:id', async (req, res) => {
  try {
    await ensureProgramEntriesTable()
    const rowId = String(req.params?.id || '').trim()
    if (!rowId) {
      return res.status(400).json({ success: false, error: '缺少程序录入ID' })
    }

    try {
      const { data, error } = await supabase
        .from('program_entries')
        .delete()
        .eq('id', rowId)
        .select('id')
      if (error) throw error
      return res.json({
        success: true,
        deleted: Array.isArray(data) ? data.length : 0
      })
    } catch (sbErr: any) {
      if (!process.env.SUPABASE_DB_URL) throw sbErr
      const result = await query(`DELETE FROM program_entries WHERE id = $1::uuid`, [rowId])
      return res.json({
        success: true,
        deleted: Number((result as any)?.rowCount || 0)
      })
    }
  } catch (err: any) {
    console.error('Delete program entry error:', err)
    return res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/program-entries/batch', async (req, res) => {
  try {
    await ensureProgramEntriesTable()
    const body = req.body || {}
    const rawItems = Array.isArray(body?.items) ? body.items : []
    // #region debug-point A:route-entry
    reportProgramEntriesRouteDebug('A', '[DEBUG] program-entries route entered', {
      itemCount: rawItems.length,
      operator: String(body?.operator || ''),
      userId: String(body?.user_id || '')
    })
    // #endregion
    if (rawItems.length === 0) {
      return res.status(400).json({ success: false, error: '缺少程序录入数据' })
    }

    const requestedOperator = String(body.operator || '').trim()
    const userId = String(body.user_id || '').trim()
    const userPhone = String(body.user_phone || '').trim()
    let canonicalProgrammer = requestedOperator || '系统用户'
    try {
      let uq = supabase.from('users').select('id, real_name').limit(1)
      if (userId) uq = uq.eq('id', userId)
      else if (userPhone) uq = uq.eq('phone', userPhone)
      else if (requestedOperator) uq = uq.ilike('real_name', requestedOperator)
      const { data: usr } = await uq
      const userRow = Array.isArray(usr) ? usr[0] : null
      if ((userId || userPhone) && !userRow) {
        return res.status(400).json({ success: false, error: '用户信息已变更，请重新登录后再提交' })
      }
      if (userRow?.real_name) canonicalProgrammer = String(userRow.real_name || '').trim() || canonicalProgrammer
    } catch {}

    const nowIso = new Date().toISOString()
    const items = rawItems.map((item: any, index: number) => {
      const rowId = String(item?.id || '').trim()
      const partInventoryNumber = String(item?.part_inventory_number || '').trim()
      const partDrawingNumber = String(item?.part_drawing_number || '').trim()
      const processName = String(item?.process_name || '').trim()
      const programNo = String(item?.program_no || '').trim()
      const programDurationMinutes = Number(item?.program_duration_minutes)
      const programmedAt = String(item?.programmed_at || nowIso).trim() || nowIso

      if (!partInventoryNumber) {
        throw new Error(`第 ${index + 1} 行缺少盘存编号`)
      }
      if (!partDrawingNumber) {
        throw new Error(`第 ${index + 1} 行缺少零件编号`)
      }
      if (!processName) {
        throw new Error(`第 ${index + 1} 行缺少工艺工序`)
      }
      if (!programNo) {
        throw new Error(`第 ${index + 1} 行缺少程序编号`)
      }
      if (!Number.isFinite(programDurationMinutes) || programDurationMinutes < 0) {
        throw new Error(`第 ${index + 1} 行程序时长不合法`)
      }

      return {
        id: rowId,
        part_inventory_number: partInventoryNumber,
        part_drawing_number: partDrawingNumber,
        process_name: processName,
        program_no: programNo,
        program_duration_minutes: programDurationMinutes,
        programmed_at: programmedAt,
        programmer: canonicalProgrammer
      }
    })

    const payloadJson = JSON.stringify(items)
    // #region debug-point B:route-payload
    reportProgramEntriesRouteDebug('B', '[DEBUG] program-entries payload normalized', {
      items
    })
    // #endregion
    const insertSql = `
      INSERT INTO program_entries (
        id,
        part_inventory_number,
        part_drawing_number,
        process_name,
        program_no,
        program_duration_minutes,
        programmed_at,
        programmer
      )
      SELECT
        CASE
          WHEN coalesce(x.id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN x.id::uuid
          ELSE gen_random_uuid()
        END,
        x.part_inventory_number,
        x.part_drawing_number,
        x.process_name,
        x.program_no,
        x.program_duration_minutes,
        x.programmed_at::timestamptz,
        x.programmer
      FROM json_to_recordset($1::json) AS x(
        id text,
        part_inventory_number text,
        part_drawing_number text,
        process_name text,
        program_no text,
        program_duration_minutes numeric,
        programmed_at text,
        programmer text
      )
      ON CONFLICT (id) DO UPDATE SET
        part_inventory_number = EXCLUDED.part_inventory_number,
        part_drawing_number = EXCLUDED.part_drawing_number,
        process_name = EXCLUDED.process_name,
        program_no = EXCLUDED.program_no,
        program_duration_minutes = EXCLUDED.program_duration_minutes,
        programmed_at = EXCLUDED.programmed_at,
        programmer = EXCLUDED.programmer,
        updated_at = NOW()
      RETURNING *
    `
    const result = await query(insertSql, [payloadJson])
    // #region debug-point C:route-insert-result
    reportProgramEntriesRouteDebug('C', '[DEBUG] program-entries insert result', {
      rowCount: Number(result.rowCount || 0),
      firstRow: Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null
    })
    // #endregion
    return res.json({
      success: true,
      items: result.rows || [],
      inserted: Number(result.rowCount || 0)
    })
  } catch (err: any) {
    console.error('Create program entries error:', err)
    // #region debug-point D:route-error
    reportProgramEntriesRouteDebug('D', '[DEBUG] program-entries route failed', {
      message: String(err?.message || err || '')
    })
    // #endregion
    const detail = String(err?.message || '服务器错误')
    const isBadRequest = /缺少|不合法|用户信息已变更|第\s*\d+\s*行/.test(detail)
    return res.status(isBadRequest ? 400 : 500).json({ success: false, error: detail })
  }
})

// 统计零件完成情况（按父表ID汇总）
router.post('/parts/summary', async (req, res) => {
  try {
    const ids = Array.isArray((req.body || {})?.ids) ? (req.body as any).ids : []
    const toolingIds = ids.map((x: any) => String(x || '').trim()).filter((x: string) => !!x)
    if (toolingIds.length === 0) {
      return res.json({ success: true, items: [] })
    }

    const sql = `
      WITH t AS (
        SELECT unnest($1::text[]) AS tooling_id
      ),
      s AS (
        SELECT
          p.tooling_id::text AS tooling_id,
          COUNT(*)::int AS total,
          SUM(
            CASE
              WHEN COALESCE(ts.status, p.purchase_status) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 1
              ELSE 0
            END
          )::int AS completed
        FROM parts_info p
        LEFT JOIN tooling_status ts
          ON ts.item_type = 'part' AND ts.item_id::text = p.id::text
        WHERE p.tooling_id::text = ANY($1::text[])
        GROUP BY p.tooling_id
      )
      SELECT
        t.tooling_id,
        COALESCE(s.total, 0)::int AS total,
        COALESCE(s.completed, 0)::int AS completed
      FROM t
      LEFT JOIN s ON s.tooling_id = t.tooling_id;
    `
    const r = await query(sql, [toolingIds])
    const items = (r.rows || []).map((row: any) => {
      const total = Number(row.total || 0) || 0
      const completed = Number(row.completed || 0) || 0
      return {
        tooling_id: String(row.tooling_id || ''),
        total,
        completed,
        incomplete: Math.max(total - completed, 0)
      }
    })
    res.json({ success: true, items })
  } catch (err: any) {
    console.error('Parts summary error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 记录工时
router.post('/work-hours', async (req, res) => {
  try {
    await ensureWorkHoursExtraColumns()
    const payload = req.body || {}
    const required = ['part_inventory_number']
    for (const k of required) {
      if (!payload[k]) return res.status(400).json({ success: false, error: `缺少必填字段: ${k}` })
    }
    // 以用户ID/手机号为锚点解析最新姓名，避免改名后继续写入旧operator
    const requestedOperator = String(payload.operator || '').trim()
    const userId = String(payload.user_id || '').trim()
    const userPhone = String(payload.user_phone || '').trim()
    let canonicalOperator = requestedOperator
    let teamId = ''
    try {
      let uq = supabase.from('users').select('id, real_name, team_id').limit(1)
      if (userId) uq = uq.eq('id', userId)
      else if (userPhone) uq = uq.eq('phone', userPhone)
      else if (requestedOperator) uq = uq.ilike('real_name', requestedOperator)
      const { data: usr } = await uq
      const userRow = Array.isArray(usr) ? usr[0] : null
      if ((userId || userPhone) && !userRow) {
        return res.status(400).json({ success: false, error: '用户信息已变更，请重新登录后再提交' })
      }
      if (userRow?.real_name) canonicalOperator = String(userRow.real_name || '').trim() || canonicalOperator
      teamId = String((userRow as any)?.team_id || '')
    } catch {}
    // 若提交人名仍是旧名，立即做历史合并，避免工时管理出现新旧姓名并存
    try {
      if (requestedOperator && canonicalOperator && requestedOperator !== canonicalOperator) {
        const normalizeName = (v: any) =>
          String(v || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase()
        const targetOld = normalizeName(requestedOperator)
        const pageSize = 1000
        let from = 0
        const ids: string[] = []
        while (true) {
          const { data: rows, error: scanErr } = await supabase
            .from('work_hours')
            .select('id, operator')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)
          if (scanErr) break
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
          await supabase
            .from('work_hours')
            .update({ operator: canonicalOperator })
            .in('id', chunk as any)
        }
      }
    } catch {}

    // Apply team coefficients if available
    let auxCoeff = 1, procCoeff = 1
    try {
      if (!teamId && canonicalOperator) {
        const { data: usrByName } = await supabase.from('users').select('team_id').ilike('real_name', canonicalOperator).limit(1)
        teamId = String((Array.isArray(usrByName) ? usrByName[0] : null)?.team_id || '')
      }
      if (teamId) {
        const { data: team } = await supabase.from('teams').select('aux_coeff, proc_coeff').eq('id', teamId).single()
        if (team) {
          auxCoeff = Number(team.aux_coeff || 1) || 1
          procCoeff = Number(team.proc_coeff || 1) || 1
        }
      }
    } catch {}

    const auxCount = Math.max(Number(payload.aux_count || 1) || 1, 1)
    const processQuantity = Math.max(Number(payload.process_quantity || 1) || 1, 1)
    const auxHoursInput = Number(payload.aux_hours || 0)
    const auxMinutes = Math.max(0, Math.round(auxHoursInput * 60))
    const procMinutes = Math.max(0, Math.round(Number(payload.proc_hours || 0) * 60))
    if (auxMinutes > 660) {
      return res.status(400).json({ success: false, error: '辅助时长不能超过660分钟' })
    }
    if (procMinutes > 660) {
      return res.status(400).json({ success: false, error: '程序时长不能超过660分钟' })
    }
    const singleAuxMinutes = auxCount > 0 ? (auxMinutes / auxCount) : 0
    const singleAuxCount = processQuantity > 0 ? (auxCount / processQuantity) : 0
    const adjustedHours = Number(auxHoursInput) * auxCoeff + Number(payload.proc_hours || 0) * procCoeff

    // Device time order validation: ensure current start is after previous finish for same device
    try {
      const deviceNo = String(payload.device_no || '').trim()
      if (deviceNo) {
        try {
          const { data: d } = await supabase
            .from('devices')
            .select('max_aux_minutes')
            .eq('device_no', deviceNo)
            .limit(1)
          const d0 = Array.isArray(d) ? d[0] : null
          const maxAux = Number((d0 as any)?.max_aux_minutes)
          if (Number.isFinite(maxAux) && maxAux > 0 && singleAuxMinutes > maxAux) {
            return res.status(400).json({ success: false, error: `单次辅助时长(${singleAuxMinutes.toFixed(1)}分钟)不能超过设备最大辅助时间(${maxAux}分钟)` })
          }
        } catch {}
        const { data: prevList } = await supabase
          .from('work_hours')
          .select('work_date, aux_end_time, proc_hours')
          .eq('device_no', deviceNo)
          .order('created_at', { ascending: false })
          .limit(1)
        const prev = Array.isArray(prevList) ? prevList[0] : null
        if (prev) {
          if (!prev.aux_end_time) {
            return res.status(400).json({ success: false, error: '该设备上一个作业尚未结束，请先补充结束时间或删除后再提交' })
          }
          const pad = (n: number) => String(n).padStart(2, '0')
          const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
          const endMin = toMin(prev.aux_end_time as any)
          const pm = Math.round(Number((prev as any).proc_hours || 0) * 60)
          const compTotal = endMin + pm
          const daysAdd = Math.floor(compTotal / 1440)
          const comp = compTotal % 1440
          const hh = Math.floor(comp / 60)
          const mi = comp % 60
          const prevDateStr = String((prev as any).work_date)
          const prevEndTs = new Date(`${prevDateStr}T${pad(hh)}:${pad(mi)}:00`).getTime() + daysAdd * 86400000
          if (payload.work_date && payload.aux_start_time) {
            const currStartTs = new Date(`${payload.work_date}T${payload.aux_start_time}:00`).getTime()
            if (currStartTs < prevEndTs) {
              return res.status(400).json({ success: false, error: '本次辅助起始时间早于该设备上一次结束时间，请调整后再提交' })
            }
          }
        }
      }
    } catch {}

    const insertBody = {
      part_inventory_number: String(payload.part_inventory_number || ''),
      part_drawing_number: String(payload.part_drawing_number || ''),
      part_name: String(payload.part_name || ''),
      aux_hours: Number(payload.aux_hours || 0),
      proc_hours: Number(payload.proc_hours || 0),
      aux_start_time: payload.aux_start_time ? String(payload.aux_start_time || '') : null,
      aux_end_time: payload.aux_end_time ? String(payload.aux_end_time || '') : null,
      work_date: String(payload.work_date || ''),
      shift_date: String(payload.shift_date || ''),
      process_name: String(payload.process_name || ''),
      operator: canonicalOperator,
      completed_quantity: Number(payload.completed_quantity || 0),
      device_no: String(payload.device_no || ''),
      shift: String(payload.shift || ''),
      hours: adjustedHours,
      aux_count: auxCount,
      process_quantity: processQuantity,
      single_aux_minutes: singleAuxMinutes,
      single_aux_count: singleAuxCount
    }
    try {
      let dupQuery = supabase
        .from('work_hours')
        .select('*')
        .eq('work_date', insertBody.work_date)
        .eq('part_inventory_number', insertBody.part_inventory_number)
        .eq('operator', insertBody.operator)
        .order('created_at', { ascending: false })
        .limit(50)
      if (insertBody.process_name) dupQuery = dupQuery.eq('process_name', insertBody.process_name)
      if (insertBody.device_no) dupQuery = dupQuery.eq('device_no', insertBody.device_no)
      if (insertBody.shift) dupQuery = dupQuery.eq('shift', insertBody.shift)
      const { data: dupRows } = await dupQuery
      const incomingKey = buildWorkHourDedupKey(insertBody)
      const duplicated = (dupRows || []).find((r: any) => buildWorkHourDedupKey(r) === incomingKey)
      if (duplicated) {
        return res.json({ success: true, data: duplicated, deduplicated: true, message: '检测到重复提交，已自动忽略' })
      }
    } catch {}
    try {
      const { data, error } = await supabase
        .from('work_hours')
        .insert([insertBody])
        .select('*')
        .single()
      if (error) throw error
      try {
        await refreshToolingStoredAmountsByInventoryNos([String(insertBody.part_inventory_number || '')])
      } catch (refreshErr) {
        console.warn('工时提交后刷新存储金额失败:', refreshErr)
      }
      res.json({ success: true, data })
    } catch (e: any) {
      try {
        const keys = Object.keys(insertBody)
        const values = keys.map(k => (insertBody as any)[k])
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const colsSql = keys.map((k, i) => {
          if (k === 'work_date') return `$${i + 1}::date`
          if (k === 'aux_start_time' || k === 'aux_end_time') return `$${i + 1}::time`
          return `$${i + 1}`
        }).join(', ')
        const sql = `INSERT INTO work_hours (${keys.join(',')}) VALUES (${colsSql}) RETURNING *`
        const r = await client.query(sql, values)
        await client.end()
        const row = (r.rows || [])[0]
        if (row) {
          try {
            await refreshToolingStoredAmountsByInventoryNos([String(insertBody.part_inventory_number || '')])
          } catch (refreshErr) {
            console.warn('工时提交后刷新存储金额失败(PG):', refreshErr)
          }
          return res.json({ success: true, data: row })
        }
        return res.status(500).json({ success: false, error: '插入失败' })
      } catch (pgErr: any) {
        console.error('PG fallback insert work_hours error:', pgErr)
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err: any) {
    console.error('Create work hour error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

const normalizePartLookupKey = (value: any) => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase()

const getAuxMinutesFromRow = (row: any) => {
  const toMin = (t: string) => {
    const [h, m] = String(t || '').split(':').map((x) => Number(x || 0))
    return h * 60 + m
  }
  const hasRange = String(row?.aux_start_time || '') && String(row?.aux_end_time || '')
  if (hasRange) {
    const s = toMin(String(row.aux_start_time || ''))
    const e = toMin(String(row.aux_end_time || ''))
    return e >= s ? (e - s) : (e + 1440 - s)
  }
  return Math.max(0, Math.round(Number(row?.aux_hours || 0) * 60))
}

const enrichWorkHourAuxMetrics = (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  return rows.map((row: any) => {
    const auxCount = Math.max(Number(row?.aux_count || 1) || 1, 1)
    const processQuantity = Math.max(Number(row?.process_quantity || 1) || 1, 1)
    const auxMinutes = getAuxMinutesFromRow(row)
    const singleAuxMinutes = Number(row?.single_aux_minutes)
    const singleAuxCount = Number(row?.single_aux_count)
    const computedSingleAuxMinutes = auxCount > 0 ? (auxMinutes / auxCount) : 0
    const computedSingleAuxCount = processQuantity > 0 ? (auxCount / processQuantity) : 0
    return {
      ...row,
      aux_count: auxCount,
      process_quantity: processQuantity,
      single_aux_minutes: Number.isFinite(singleAuxMinutes) && singleAuxMinutes > 0 ? singleAuxMinutes : computedSingleAuxMinutes,
      single_aux_count: Number.isFinite(singleAuxCount) && singleAuxCount > 0 ? singleAuxCount : computedSingleAuxCount
    }
  })
}

const normalizeWorkHourDedupText = (v: any) => String(v || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, '')
  .trim()
  .toLowerCase()

const toWorkHourDedupNum = (v: any) => {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n.toFixed(6) : '0.000000'
}

const buildWorkHourDedupKey = (row: any) => [
  String(row?.work_date || '').trim(),
  String(row?.shift_date || '').trim(),
  normalizeWorkHourDedupText(row?.shift),
  normalizeWorkHourDedupText(row?.operator),
  normalizeWorkHourDedupText(row?.part_inventory_number),
  normalizeWorkHourDedupText(row?.part_drawing_number),
  normalizeWorkHourDedupText(row?.part_name),
  normalizeWorkHourDedupText(row?.process_name),
  normalizeWorkHourDedupText(row?.device_no),
  String(row?.aux_start_time || '').trim(),
  String(row?.aux_end_time || '').trim(),
  toWorkHourDedupNum(row?.aux_hours),
  toWorkHourDedupNum(row?.proc_hours),
  toWorkHourDedupNum(row?.completed_quantity),
  toWorkHourDedupNum(row?.aux_count),
  toWorkHourDedupNum(row?.process_quantity)
].join('|')

const dedupeWorkHoursRows = (rows: any[]) => {
  const list = Array.isArray(rows) ? rows : []
  if (list.length <= 1) return list
  const keyed = new Map<string, any>()
  list.forEach((row: any) => {
    const key = buildWorkHourDedupKey(row)
    const prev = keyed.get(key)
    if (!prev) {
      keyed.set(key, row)
      return
    }
    const prevTs = Date.parse(String(prev?.created_at || prev?.updated_at || ''))
    const rowTs = Date.parse(String(row?.created_at || row?.updated_at || ''))
    if ((Number.isFinite(rowTs) ? rowTs : 0) > (Number.isFinite(prevTs) ? prevTs : 0)) {
      keyed.set(key, row)
    }
  })
  return Array.from(keyed.values())
}

const enrichWorkHourPartMeta = async (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  const inventoryValues = Array.from(new Set(
    rows
      .map((row: any) => String(row?.part_inventory_number || '').trim())
      .filter(Boolean)
  ))
  if (inventoryValues.length === 0) return rows

  const partMetaMap = new Map<string, { name: string; drawing: string }>()
  const upsertPartMeta = (row: any) => {
    const name = String(row?.part_name || '').trim()
    const drawing = String(row?.part_drawing_number || '').trim()
    const invKey = normalizePartLookupKey(row?.part_inventory_number)
    const parentInvKey = normalizePartLookupKey(row?.inventory_number)
    const meta = { name, drawing }
    if (invKey && !partMetaMap.has(invKey)) partMetaMap.set(invKey, meta)
    if (parentInvKey && !partMetaMap.has(parentInvKey)) partMetaMap.set(parentInvKey, meta)
  }

  try {
    if (process.env.SUPABASE_DB_URL) {
      const r1 = await query(
        'SELECT part_inventory_number, inventory_number, part_drawing_number, part_name FROM parts_info WHERE part_inventory_number = ANY($1::text[]) OR inventory_number = ANY($1::text[])',
        [inventoryValues]
      )
      ;(r1.rows || []).forEach(upsertPartMeta)
    } else {
      const { data: partsByPartInv } = await supabase
        .from('parts_info')
        .select('part_inventory_number, inventory_number, part_drawing_number, part_name')
        .in('part_inventory_number', inventoryValues)
      ;(partsByPartInv || []).forEach(upsertPartMeta)
      const { data: partsByInv } = await supabase
        .from('parts_info')
        .select('part_inventory_number, inventory_number, part_drawing_number, part_name')
        .in('inventory_number', inventoryValues)
      ;(partsByInv || []).forEach(upsertPartMeta)
    }
  } catch {}

  return rows.map((row: any) => {
    const invKey = normalizePartLookupKey(row?.part_inventory_number)
    const meta = (invKey && partMetaMap.get(invKey)) || null
    if (!meta) return row
    return {
      ...row,
      part_name: meta.name || String(row?.part_name || ''),
      part_drawing_number: meta.drawing || String(row?.part_drawing_number || '')
    }
  })
}

// 获取工时记录与统计
router.get('/work-hours', async (req, res) => {
  try {
    const {
      page = '1',
      pageSize = '50',
      start_date = '',
      end_date = '',
      operator = '',
      search = '',
      shift = '',
      order = 'work_date',
      order_dir = 'desc'
    } = req.query as Record<string, string>

    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.max(parseInt(pageSize, 10) || 50, 1)
    const from = (pageNum - 1) * sizeNum
    const to = from + sizeNum - 1

    // Supabase查询，失败则PG回退
    let items: any[] = []
    let totalCount: number | null = null
    try {
      let q = supabase
        .from('work_hours')
        .select('*', { count: 'exact' })

      if (start_date) q = q.gte('work_date', start_date)
      if (end_date) q = q.lte('work_date', end_date)
      if (operator && operator.trim()) q = q.ilike('operator', `%${operator.trim()}%`)
      if (shift && shift.trim()) q = q.eq('shift', shift.trim())
      if (search && search.trim()) {
        const keyword = `%${search.trim()}%`
        q = q.or(`part_inventory_number.ilike.${keyword},part_drawing_number.ilike.${keyword},process_name.ilike.${keyword},device_no.ilike.${keyword}`)
      }
      q = q.order(order, { ascending: order_dir !== 'desc' })
      q = q.range(from, to)
      const { data, error, count } = await q
      if (error) throw error
      items = Array.isArray(data) ? data : []
      totalCount = typeof count === 'number' ? count : null
    } catch (sbErr: any) {
      if (process.env.SUPABASE_DB_URL) {
        try {
          const mod = await import('pg') as any
          const PgClient = (mod.Client || mod.default?.Client)
          const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
          await client.connect()
          const conds: string[] = []
          const params: any[] = []
          let pi = 1
          if (start_date) { conds.push(`work_date >= $${pi++}`); params.push(start_date) }
          if (end_date) { conds.push(`work_date <= $${pi++}`); params.push(end_date) }
          if (operator && operator.trim()) { conds.push(`operator ILIKE $${pi++}`); params.push(`%${operator.trim()}%`) }
          if (shift && shift.trim()) { conds.push(`shift = $${pi++}`); params.push(shift.trim()) }
          if (search && search.trim()) {
            const kw = `%${search.trim()}%`
            conds.push(`(part_inventory_number ILIKE $${pi} OR part_drawing_number ILIKE $${pi} OR process_name ILIKE $${pi} OR device_no ILIKE $${pi})`)
            params.push(kw); pi++
          }
          const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
          const orderSql = `ORDER BY ${order} ${order_dir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`
          const sql = `SELECT * FROM work_hours ${whereSql} ${orderSql} OFFSET $${pi} LIMIT $${pi + 1}`
          params.push(from, sizeNum)
          const r = await client.query(sql, params)
          items = r.rows || []
          const rc = await client.query(`SELECT COUNT(*) AS c FROM work_hours ${whereSql}`, params.slice(0, pi - 1))
          await client.end()
          totalCount = Number((rc.rows || [])[0]?.c || items.length)
        } catch (pgErr: any) {
          console.error('PG fallback get work hours failed:', pgErr)
          return res.status(500).json({ success: false, error: sbErr?.message || pgErr?.message || '服务器错误' })
        }
      } else {
        console.error('Supabase get work hours error:', sbErr)
        return res.status(500).json({ success: false, error: sbErr?.message || '服务器错误' })
      }
    }

    items = enrichWorkHourAuxMetrics(items)
    items = await enrichWorkHourPartMeta(items)
    items = dedupeWorkHoursRows(items)

    const totals = items.reduce(
      (acc: any, r: any) => {
        acc.total_hours += Number(r.hours || 0)
        acc.aux_hours += Number(r.aux_hours || 0)
        acc.proc_hours += Number(r.proc_hours || 0)
        acc.completed_quantity += Number(r.completed_quantity || 0)
        return acc
      },
      { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }
    )

    res.json({
      success: true, items: items, total: (totalCount ?? items.length), page: pageNum, pageSize: sizeNum, totals
    })
  } catch (err: any) {
    console.error('Get work hours error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/work-hours/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, error: '缺少记录ID' })
    const body = (req.body || {}) as any
    const userId = String((req.headers['x-user-id'] as any) || body.userId || req.query.userId || '').trim()
    const operator = String((req.headers['x-operator'] as any) || body.operator || req.query.operator || '').trim()
    const actor = await resolveWorkHoursActor(userId, operator)
    if (!actor.isSuperAdmin) {
      const { data: row, error: rowErr } = await supabase
        .from('work_hours')
        .select('id, operator')
        .eq('id', id)
        .single()
      if (rowErr || !row) return res.status(404).json({ success: false, error: '记录不存在' })
      const canDeleteOwn = normalizeWorkHoursOperator((row as any).operator) === normalizeWorkHoursOperator(actor.actorName)
      if (!canDeleteOwn) return res.status(403).json({ success: false, error: '仅可删除自己提交的数据' })
    }
    const { data: beforeDelete } = await supabase
      .from('work_hours')
      .select('part_inventory_number, inventory_no')
      .eq('id', id)
      .single()
    const { error, count } = await supabase.from('work_hours').delete({ count: 'exact' }).eq('id', id)
    if (error) throw error
    if (Number(count || 0) === 0) return res.status(404).json({ success: false, error: '记录不存在或无权限删除' })
    try {
      await refreshToolingStoredAmountsByInventoryNos([
        String((beforeDelete as any)?.part_inventory_number || ''),
        String((beforeDelete as any)?.inventory_no || '')
      ])
    } catch (refreshErr) {
      console.warn('删除工时后刷新存储金额失败:', refreshErr)
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 批量删除工时记录
router.post('/work-hours/batch-delete', async (req, res) => {
  try {
    const { ids, userId, operator } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' })
    }
    const actor = await resolveWorkHoursActor(userId, operator)
    if (!actor.isSuperAdmin) return res.status(403).json({ success: false, error: '仅超级管理员可删除工时数据' })
    const { data: rowsBeforeDelete } = await supabase
      .from('work_hours')
      .select('part_inventory_number, inventory_no')
      .in('id', ids)
    try {
      const { error } = await supabase.from('work_hours').delete().in('id', ids)
      if (error) throw error
      try {
        const invs = Array.from(new Set((rowsBeforeDelete || []).flatMap((row: any) => [
          String(row?.part_inventory_number || ''),
          String(row?.inventory_no || '')
        ]).filter(Boolean)))
        await refreshToolingStoredAmountsByInventoryNos(invs)
      } catch (refreshErr) {
        console.warn('批量删除工时后刷新存储金额失败:', refreshErr)
      }
      return res.json({ success: true, deleted: ids.length })
    } catch (e: any) {
      // PG fallback
      try {
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const sql = 'DELETE FROM work_hours WHERE id = ANY($1)'
        const r = await client.query(sql, [ids])
        await client.end()
        return res.json({ success: true, deleted: r.rowCount || 0 })
      } catch (pgErr: any) {
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 测试 completed_steps 更新
router.post('/test-completed-steps', async (req, res) => {
  try {
    const { id, completed_steps } = req.body || {}
    console.log('测试 completed_steps 更新:', { id, completed_steps })
    
    if (!id || !Array.isArray(completed_steps)) {
      return res.status(400).json({ success: false, error: '参数错误' })
    }
    
    const completedStepsJson = JSON.stringify(completed_steps);
    const result = await query(
      'UPDATE parts_info SET completed_steps = $1::jsonb WHERE id = $2',
      [completedStepsJson, id]
    );

    // 查询验证
    const { data, error } = await supabase
      .from('parts_info')
      .select('id, completed_steps')
      .eq('id', id)
      .single()

    res.json({ success: true, result, data, error })
  } catch (err: any) {
    console.error('测试失败:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 获取工时数据聚合（用于工艺路线完成状态与完成数量统计）
router.get('/work-hours/aggregates', async (req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const normalizeDeviceNo = (v: any) => {
      const raw = String(v || '').trim()
      if (!raw) return ''
      const dash = raw.split('-')[0]
      const leadingDigits = dash.match(/^\d+/)?.[0]
      if (leadingDigits) return leadingDigits
      return dash.trim()
    }
    const normalizeProcessKey = (v: any) => String(v || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase()
    const toTime = (row: any) => {
      const t = String(row?.created_at || row?.updated_at || row?.work_date || '')
      const ts = Date.parse(t)
      return Number.isFinite(ts) ? ts : 0
    }
    const { invs } = req.query as { invs?: string }
    if (!invs) {
      return res.json({ success: true, data: {}, completedQtyData: {}, processCompletedQtyData: {}, processHoursData: {}, processAmountData: {}, processLatestMetaData: {} })
    }

    const invList = String(invs).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    if (invList.length === 0) {
      return res.json({ success: true, data: {}, completedQtyData: {}, processCompletedQtyData: {}, processHoursData: {}, processAmountData: {}, processLatestMetaData: {} })
    }

    const chunkArray = <T,>(items: T[], size: number): T[][] => {
      const safeSize = Math.max(1, size)
      const chunks: T[][] = []
      for (let i = 0; i < items.length; i += safeSize) {
        chunks.push(items.slice(i, i + safeSize))
      }
      return chunks
    }

    // 工装信息模块按零件盘存编号聚合工时；工时录入也以 part_inventory_number 为主键。
    const baseSelect = 'id, part_inventory_number, process_name, completed_quantity, aux_hours, proc_hours, operator, shift, device_no, created_at, work_date'
    const mergeMap = new Map<string, any>()
    let lastQueryError: any = null
    for (const invChunk of chunkArray(invList, 120)) {
      const { data: partRows, error: partRowsErr } = await supabase
        .from('work_hours')
        .select(baseSelect)
        .in('part_inventory_number', invChunk)
      if (partRowsErr) {
        lastQueryError = partRowsErr
        continue
      }
      ;((partRows || []) as any[]).forEach((r: any, idx: number) => {
        const key = String(r?.id || `${r?.part_inventory_number || ''}|${r?.process_name || ''}|${r?.created_at || ''}|${idx}`)
        if (!mergeMap.has(key)) mergeMap.set(key, r)
      })
    }
    if (mergeMap.size === 0 && lastQueryError) throw lastQueryError
    const data = Array.from(mergeMap.values())

    const invForDevice = new Set<string>()
    // 按盘存编号聚合工序
    const aggregates: Record<string, string[]> = {}
    const completedQtyMap: Record<string, number> = {}
    const processCompletedQtyMap: Record<string, Record<string, number>> = {}
    const processHoursMap: Record<string, Record<string, number>> = {}
    const processAmountMap: Record<string, Record<string, number>> = {}
    const processLatestMetaData: Record<string, Record<string, { process_name: string; operator: string; shift: string; team_name: string; device_no: string; device_name: string; process_unit_price: number; completed_quantity: number; at: number }>> = {}
    const normalizedRows = (data || []).map((row: any) => {
      const inv = String(row.part_inventory_number || '').trim().toUpperCase()
      const process = String(row.process_name || '').trim()
      const processKey = normalizeProcessKey(process)
      const completedQty = Number(row.completed_quantity || 0)
      const auxHours = Number(row.aux_hours || 0)
      const procHours = Number(row.proc_hours || 0)
      const totalHours = (Number.isFinite(auxHours) ? auxHours : 0) + (Number.isFinite(procHours) ? procHours : 0)
      const deviceNo = normalizeDeviceNo(row.device_no)
      if (deviceNo) invForDevice.add(deviceNo)
      return { row, inv, process, processKey, completedQty, totalHours, deviceNo }
    })
    ;normalizedRows.forEach(({ inv, process, processKey, completedQty, totalHours, deviceNo, row }: any) => {
      if (inv && process) {
        if (!aggregates[inv]) aggregates[inv] = []
        if (!aggregates[inv].includes(process)) aggregates[inv].push(process)
      }
      if (inv) {
        completedQtyMap[inv] = Number(completedQtyMap[inv] || 0) + completedQty
      }
      if (inv && processKey) {
        if (!processCompletedQtyMap[inv]) processCompletedQtyMap[inv] = {}
        processCompletedQtyMap[inv][processKey] = Number(processCompletedQtyMap[inv][processKey] || 0) + completedQty
        if (!processHoursMap[inv]) processHoursMap[inv] = {}
        processHoursMap[inv][processKey] = Number(processHoursMap[inv][processKey] || 0) + totalHours
        if (!processLatestMetaData[inv]) processLatestMetaData[inv] = {}
        const prev = processLatestMetaData[inv][processKey]
        const at = toTime(row)
        if (!prev || at >= Number(prev.at || 0)) {
          processLatestMetaData[inv][processKey] = {
            process_name: process,
            operator: String(row.operator || '').trim(),
            shift: String(row.shift || '').trim(),
            team_name: '',
            device_no: deviceNo,
            device_name: '',
            process_unit_price: 0,
            completed_quantity: completedQty,
            at
          }
        }
      }
    })

    const deviceNoList = Array.from(invForDevice)
    if (deviceNoList.length > 0) {
      try {
        let deviceRows: any[] = []
        try {
          const r = await supabase
          .from('devices')
          .select('device_no, device_name, process_unit_price')
          .in('device_no', deviceNoList)
          if (r.error) throw r.error
          deviceRows = Array.isArray(r.data) ? r.data : []
        } catch {
          try {
            const q = await query(
              'SELECT device_no, device_name, process_unit_price FROM devices WHERE device_no = ANY($1)',
              [deviceNoList]
            )
            deviceRows = Array.isArray((q as any)?.rows) ? (q as any).rows : []
          } catch {}
        }
        const deviceNameMap = new Map<string, string>()
        const devicePriceMap = new Map<string, number>()
        ;(deviceRows || []).forEach((d: any) => {
          const no = normalizeDeviceNo(d.device_no)
          if (!no) return
          deviceNameMap.set(no, String(d.device_name || '').trim())
          const price = Number(d.process_unit_price || 0)
          devicePriceMap.set(no, Number.isFinite(price) ? price : 0)
        })
        Object.keys(processLatestMetaData).forEach((inv) => {
          const processMap = processLatestMetaData[inv] || {}
          Object.keys(processMap).forEach((pk) => {
            const meta = processMap[pk]
            const no = String(meta?.device_no || '').trim()
            if (!no) return
            if (deviceNameMap.has(no)) meta.device_name = String(deviceNameMap.get(no) || '')
            if (devicePriceMap.has(no)) meta.process_unit_price = Number(devicePriceMap.get(no) || 0)
          })
        })
        normalizedRows.forEach(({ inv, processKey, totalHours, deviceNo }: any) => {
          if (!inv || !processKey || !deviceNo || !Number.isFinite(totalHours) || totalHours <= 0) return
          const unitPrice = Number(devicePriceMap.get(deviceNo) || 0)
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
          if (!processAmountMap[inv]) processAmountMap[inv] = {}
          processAmountMap[inv][processKey] = Number(processAmountMap[inv][processKey] || 0) + totalHours * unitPrice
        })
      } catch {}
    }

    // 通过操作者反查真实班组名称（不是班次）
    try {
      const normalizeName = (v: any) => String(v || '').replace(/\s+/g, '').trim().toLowerCase()
      const operatorSet = new Set<string>()
      Object.keys(processLatestMetaData).forEach((inv) => {
        const processMap = processLatestMetaData[inv] || {}
        Object.keys(processMap).forEach((pk) => {
          const op = String(processMap[pk]?.operator || '').trim()
          if (op) operatorSet.add(op)
        })
      })
      const operatorList = Array.from(operatorSet)
      if (operatorList.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('real_name, team_id')
          .in('real_name', operatorList)
        const teamIds = Array.from(new Set((users || []).map((u: any) => String(u.team_id || '')).filter(Boolean)))
        let teamMap = new Map<string, string>()
        if (teamIds.length > 0) {
          const { data: teams } = await supabase
            .from('teams')
            .select('id, name')
            .in('id', teamIds)
          teamMap = new Map((teams || []).map((t: any) => [String(t.id || ''), String(t.name || '')]))
        }
        const userTeamByName = new Map<string, string>()
        ;(users || []).forEach((u: any) => {
          const k = normalizeName(u.real_name)
          const teamName = teamMap.get(String(u.team_id || '')) || ''
          if (k && teamName && !userTeamByName.has(k)) userTeamByName.set(k, teamName)
        })
        Object.keys(processLatestMetaData).forEach((inv) => {
          const processMap = processLatestMetaData[inv] || {}
          Object.keys(processMap).forEach((pk) => {
            const meta = processMap[pk]
            const teamName = userTeamByName.get(normalizeName(meta?.operator))
            if (teamName) meta.team_name = teamName
          })
        })
      }
    } catch {}

    const amountData: Record<string, number> = {}
    Object.keys(processAmountMap).forEach((inv) => {
      amountData[inv] = Object.values(processAmountMap[inv] || {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0)
    })
    res.json({ success: true, data: aggregates, completedQtyData: completedQtyMap, processCompletedQtyData: processCompletedQtyMap, processHoursData: processHoursMap, processAmountData: processAmountMap, amountData, processLatestMetaData })
  } catch (err: any) {
    console.error('获取工时聚合数据失败:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 🔥🔥🔥 全新专用接口：直接保存总额，零依赖
router.post('/:id/save-totals-direct', async (req, res) => {
  try {
    const { id } = req.params
    const toolingId = String(id || '').trim()
    if (!toolingId) {
      return res.status(400).json({ success: false, error: '缺少工装ID' })
    }

    const { material_total, process_total } = req.body || {}
    
    console.log(`[save-totals-direct] 💚💚💚 收到请求 - 工具: ${toolingId}`)
    console.log(`[save-totals-direct] material_total=${material_total}, type=${typeof material_total}`)
    console.log(`[save-totals-direct] process_total=${process_total}, type=${typeof process_total}`)

    // 验证值
    const matVal = Number(material_total ?? 0)
    const procVal = Number(process_total ?? 0)
    
    if (!Number.isFinite(matVal) && material_total !== null && material_total !== undefined) {
      return res.status(400).json({ success: false, error: 'material_total 不是有效数字' })
    }

    const updatedAt = new Date().toISOString()
    let updateResult: any = null

    // 方式1：PG 直连
    if (process.env.SUPABASE_DB_URL || '') {
      try {
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ 
          connectionString: process.env.SUPABASE_DB_URL, 
          ssl: { rejectUnauthorized: false } 
        })
        await client.connect()
        
        const sql = `
          UPDATE tooling_info 
          SET material_total = $1::numeric, 
              process_total = $2::numeric, 
              totals_updated_at = $3::timestamptz 
          WHERE id = $4 
          RETURNING id, material_total, process_total, totals_updated_at
        `
        const r = await client.query(sql, [
          material_total ?? null, 
          process_total ?? null, 
          updatedAt, 
          toolingId
        ])
        
        updateResult = (r.rows || [])[0]
        console.log(`[save-totals-direct] ✅ PG UPDATE 结果:`, JSON.stringify(updateResult))
        
        await client.end()
      } catch (pgErr: any) {
        console.error(`[save-totals-direct] ❌ PG 错误:`, pgErr.message)
        return res.status(500).json({ success: false, error: 'PG错误: ' + pgErr.message })
      }
    } else {
      // 方式2：Supabase 客户端
      const { data, error } = await supabase
        .from('tooling_info')
        .update({
          material_total: material_total ?? null,
          process_total: process_total ?? null,
          totals_updated_at: updatedAt
        })
        .eq('id', toolingId)
        .select('id, material_total, process_total, totals_updated_at')
        .single()

      if (error) {
        console.error(`[save-totals-direct] ❌ Supabase 错误:`, error.message)
        return res.status(500).json({ success: false, error: error.message })
      }
      
      updateResult = data
      console.log(`[save-totals-direct] ✅ Supabase UPDATE 结果:`, JSON.stringify(updateResult))
    }

    // 最终验证
    const { data: verifyData } = await supabase
      .from('tooling_info')
      .select('material_total, process_total, totals_updated_at')
      .eq('id', toolingId)
      .single()

    console.log(`[save-totals-direct] 🎯🎯🎯 数据库验证:`, JSON.stringify(verifyData))

    return res.json({
      success: true,
      data: verifyData,
      received: { material_total, process_total },
      message: '直接保存完成'
    })

  } catch (err: any) {
    console.error('[save-totals-direct] 致命错误:', err)
    return res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/:id/refresh-totals', async (req, res) => {
  try {
    const { id } = req.params
    const toolingId = String(id || '').trim()
    if (!toolingId) {
      return res.status(400).json({ success: false, error: '缺少工装ID' })
    }

    // 接受前端传来的覆盖值（可选）
    const rawBody = req.body
    console.log(`[refresh-totals] 🚀🚀🚀 v3.3.138 原始请求 body:`, JSON.stringify(rawBody))

    const overrides = rawBody && typeof rawBody === 'object' ? {
      material_total: rawBody.material_total !== undefined ? Number(rawBody.material_total) : undefined,
      process_total: rawBody.process_total !== undefined ? Number(rawBody.process_total) : undefined
    } : undefined

    console.log(`[refresh-totals] ✅ 解析结果: material=${overrides?.material_total}, process=${overrides?.process_total}`)
    console.log(`[refresh-totals] 🔍 类型检查: material_type=${typeof overrides?.material_total}, isFinite=${Number.isFinite(overrides?.material_total ?? NaN)}`)

    // 🔥 直接保存测试：不管其他逻辑，先尝试直接UPDATE
    if (overrides && (overrides.material_total !== undefined || overrides.process_total !== undefined)) {
      const updatedAt = new Date().toISOString()
      
      try {
        if (process.env.SUPABASE_DB_URL || '') {
          await query(
            'UPDATE tooling_info SET material_total = $1, process_total = $2, totals_updated_at = $3::timestamptz WHERE id = $4 RETURNING material_total, process_total',
            [overrides.material_total ?? null, overrides.process_total ?? null, updatedAt, toolingId]
          ).then((result: any) => {
            console.log(`[refresh-totals] 💥💥💅 PG UPDATE 返回:`, JSON.stringify(result.rows?.[0]))
            return result
          })
        } else {
          const { data: updateResult, error: updateError } = await supabase
            .from('tooling_info')
            .update({
              ...(overrides.material_total !== undefined && { material_total: overrides.material_total }),
              ...(overrides.process_total !== undefined && { process_total: overrides.process_total }),
              totals_updated_at: updatedAt
            })
            .eq('id', toolingId)
            .select('material_total, process_total')
          
          if (updateError) throw new Error(updateError.message)
          console.log(`[refresh-totals] 💥💥💅 Supabase UPDATE 返回:`, JSON.stringify(updateResult))
        }

        // 验证：查询刚更新的值
        const { data: verifyData } = await supabase
          .from('tooling_info')
          .select('material_total, process_total')
          .eq('id', toolingId)
          .single()
        
        console.log(`[refresh-totals] ✅✅✅ 数据库验证结果:`, JSON.stringify(verifyData))

        return res.json({ 
          success: true, 
          data: verifyData || {
            material_total: overrides.material_total,
            process_total: overrides.process_total,
            totals_updated_at: updatedAt,
            part_process_amounts: {}
          }
        })
      } catch (dbErr: any) {
        console.error('[refresh-totals] ❌ 直接保存失败:', dbErr.message)
        // 如果直接保存失败，回退到原有逻辑
      }
    }
    
    // 回退到原有的复杂计算逻辑
    console.log(`[refresh-totals] ⚠️ 回退到原有计算逻辑`)
    const payload = await refreshToolingStoredAmounts(toolingId, overrides)
    return res.json({ success: true, data: payload })
  } catch (err: any) {
    console.error('刷新工装总额失败:', err)
    return res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 调试API：查询零件的 completed_steps
router.get('/parts/:id/completed-steps', async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase
      .from('parts_info')
      .select('id, part_inventory_number, completed_steps')
      .eq('id', id)
      .single()
    
    if (error) throw error
    
    console.log('查询 completed_steps:', { id, data })
    res.json({ success: true, data })
  } catch (err: any) {
    console.error('查询 completed_steps 失败:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 设备管理
router.get('/devices', async (_req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const { data, error } = await supabase.from('devices').select('*').order('device_no', { ascending: true })
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 用户基础信息映射：操作者 → 车间/班组
router.get('/users/basic', async (req, res) => {
  try {
    const companyId = String((req.query as any)?.company_id || '').trim()
    let userQuery = supabase
      .from('users')
      .select('id, real_name, workshop_id, team_id, capability_coeff, company_id, role_id, status')
    if (companyId) userQuery = userQuery.eq('company_id', companyId)
    const { data, error } = await userQuery
    if (error) throw error
    const roleIds = [...new Set((data || []).map((u: any) => u.role_id).filter(Boolean))]
    let roles: any[] = []
    if (roleIds.length) {
      const rs = await supabase.from('roles').select('id, name').in('id', roleIds)
      roles = rs.data || []
    }
    const roleNameMap = Object.fromEntries(roles.map((r: any) => [r.id, String(r.name || '')]))
    const filteredUsers = (data || []).filter((u: any) => {
      const status = String(u?.status || '').trim()
      const roleName = String(roleNameMap[u?.role_id] || '').trim()
      return status === 'active' && roleName === '员工'
    })
    const workshopIds = [...new Set(filteredUsers.map((u: any) => u.workshop_id).filter(Boolean))]
    const teamIds = [...new Set(filteredUsers.map((u: any) => u.team_id).filter(Boolean))]
    let workshops: any[] = []
    let teams: any[] = []
    if (workshopIds.length) {
      const ws = await supabase.from('workshops').select('id, name').in('id', workshopIds)
      workshops = ws.data || []
    }
    if (teamIds.length) {
      const ts = await supabase.from('teams').select('id, name, aux_coeff, proc_coeff').in('id', teamIds)
      teams = ts.data || []
    }
    const wmap = Object.fromEntries(workshops.map((w: any) => [w.id, w.name]))
    const tmap = Object.fromEntries(teams.map((t: any) => [t.id, { name: t.name, aux_coeff: t.aux_coeff, proc_coeff: t.proc_coeff }]))
    const items = filteredUsers.map((u: any) => ({
      real_name: u.real_name,
      workshop: wmap[u.workshop_id] || '',
      team: (tmap[u.team_id] || {}).name || '',
      aux_coeff: Number((tmap[u.team_id] || {}).aux_coeff ?? 1),
      proc_coeff: Number((tmap[u.team_id] || {}).proc_coeff ?? 1),
      capability_coeff: Number(u.capability_coeff ?? 1)
    }))
    res.json({ success: true, items })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 组织机构：车间
router.get('/org/workshops', async (req, res) => {
  try {
    const { company_id } = req.query as any
    let q = supabase.from('workshops').select('id, company_id, name').order('name', { ascending: true })
    if (company_id) q = q.eq('company_id', String(company_id))
    const { data, error } = await q
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/org/workshops', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.company_id || !payload.name) return res.status(400).json({ success: false, error: '缺少公司或名称' })
    const { data, error } = await supabase.from('workshops').insert([payload]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/org/workshops/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const { data, error } = await supabase.from('workshops').update(payload).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/org/workshops/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('workshops').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 组织机构：班组
router.get('/org/teams', async (req, res) => {
  try {
    const { company_id, workshop_id } = req.query as any
    let q = supabase
      .from('teams')
      .select('id, company_id, workshop_id, name, aux_coeff, proc_coeff')
      .order('name', { ascending: true })
    if (company_id) q = q.eq('company_id', String(company_id))
    if (workshop_id) q = q.eq('workshop_id', String(workshop_id))
    const { data, error } = await q
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/org/teams', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.company_id || !payload.name) return res.status(400).json({ success: false, error: '缺少公司或名称' })
    const body = {
      company_id: payload.company_id,
      workshop_id: payload.workshop_id || null,
      name: payload.name,
      aux_coeff: Number(payload.aux_coeff ?? 1),
      proc_coeff: Number(payload.proc_coeff ?? 1)
    }
    const { data, error } = await supabase.from('teams').insert([body]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/org/teams/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const body: any = {}
    if (payload.name !== undefined) body.name = payload.name
    if (payload.workshop_id !== undefined) body.workshop_id = payload.workshop_id
    if (payload.aux_coeff !== undefined) body.aux_coeff = Number(payload.aux_coeff)
    if (payload.proc_coeff !== undefined) body.proc_coeff = Number(payload.proc_coeff)
    const { data, error } = await supabase.from('teams').update(body).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/org/teams/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// Fixed inventory options (repair management)
router.get('/fixed-inventory-options', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('created_at', { ascending: true })
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/fixed-inventory-options', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.option_value) return res.status(400).json({ success: false, error: '缺少选项值' })
    const option_label = payload.option_label || payload.option_value
    const { data, error } = await supabase.from('fixed_inventory_options').insert([{ option_value: payload.option_value, option_label, is_active: !!payload.is_active }]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/fixed-inventory-options/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const option_label = payload.option_label || payload.option_value
    const { data, error } = await supabase.from('fixed_inventory_options').update({ option_value: payload.option_value, option_label, is_active: !!payload.is_active }).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/fixed-inventory-options/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('fixed_inventory_options').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})
router.post('/devices', async (req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const payload = req.body || {}
    if (!payload.device_no || !payload.device_name) return res.status(400).json({ success: false, error: '缺少设备编号或名称' })
    let { data, error } = await supabase.from('devices').insert([payload]).select('*').single()
    if (error && /process_unit_price/i.test(String(error?.message || ''))) {
      const fallbackPayload = {
        device_no: String(payload.device_no || ''),
        device_name: String(payload.device_name || ''),
        max_aux_minutes: payload.max_aux_minutes ?? null
      }
      const retried = await supabase.from('devices').insert([fallbackPayload]).select('*').single()
      data = retried.data
      error = retried.error
    }
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/devices/:id', async (req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const { id } = req.params
    const payload = req.body || {}
    let { data, error } = await supabase.from('devices').update(payload).eq('id', id).select('*').single()
    if (error && /process_unit_price/i.test(String(error?.message || ''))) {
      const fallbackPayload = {
        device_no: String(payload.device_no || ''),
        device_name: String(payload.device_name || ''),
        max_aux_minutes: payload.max_aux_minutes ?? null
      }
      const retried = await supabase.from('devices').update(fallbackPayload).eq('id', id).select('*').single()
      data = retried.data
      error = retried.error
    }
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('devices').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/devices/update', async (req, res) => {
  try {
    await ensureDeviceProcessUnitPriceColumn()
    const payload = req.body || {}
    const id = String(payload.id || '')
    if (!id) return res.status(400).json({ success: false, error: '缺少设备ID' })
    let { data, error } = await supabase.from('devices').update(payload).eq('id', id).select('*').single()
    if (error && /process_unit_price/i.test(String(error?.message || ''))) {
      const fallbackPayload = {
        device_no: String(payload.device_no || ''),
        device_name: String(payload.device_name || ''),
        max_aux_minutes: payload.max_aux_minutes ?? null
      }
      const retried = await supabase.from('devices').update(fallbackPayload).eq('id', id).select('*').single()
      data = retried.data
      error = retried.error
    }
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/devices/delete', async (req, res) => {
  try {
    const payload = req.body || {}
    const id = String(payload.id || '')
    if (!id) return res.status(400).json({ success: false, error: '缺少设备ID' })
    const { error } = await supabase.from('devices').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// GET /api/tooling/batch
// 批量获取工装信息（用于获取编制信息）
router.get('/batch', async (req, res) => {
  try {
    // 从查询参数中获取ids数组 - Express将重复的查询参数解析为数组
    const ids = req.query.ids;
    
    if (!ids) {
      return res.status(400).json({ success: false, error: '缺少工装ID列表' });
    }

    // 确保ids是数组格式
    let idArray: string[];
    if (Array.isArray(ids)) {
      idArray = ids as string[];
    } else if (typeof ids === 'string') {
      idArray = [ids];
    } else {
      return res.status(400).json({ success: false, error: '工装ID格式不正确' });
    }

    if (idArray.length === 0) {
      return res.status(400).json({ success: false, error: '缺少工装ID列表' });
    }

    // 去重ID
    const uniqueIds = [...new Set(idArray)];
    console.log(`[Tooling Batch] Fetching responsible person for ${uniqueIds.length} tooling IDs:`, uniqueIds);
    
    const { data, error } = await supabase
      .from('tooling_info')
      .select('id, responsible_person_id, recorder')
      .in('id', uniqueIds);

    if (error) {
      console.error('Batch fetch tooling_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    console.log(`[Tooling Batch] Successfully fetched ${data?.length || 0} tooling records`);

    res.json({
      success: true,
      items: data || []
    });
  } catch (err) {
    console.error('Batch tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取某工装的标准件列表
router.get('/:id/child-items', async (req, res) => {
  try {
    await ensurePurchaseStatusColumns();
    await ensureStatusTable();
    const { id } = req.params;
    const { data, error } = await supabase
          .from('child_items')
          .select('*')
          .eq('tooling_id', id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Fetch child_items error:', error);
          return res.status(500).json({ success: false, error: error.message, code: error.code });
        }

        const items = (data || []) as any[]
        const missingIds = items
          .filter(r => !String(r.purchase_status || '').trim())
          .map(r => String(r.id || ''))
          .filter(Boolean)
        if (missingIds.length > 0) {
          const statusMap = new Map<string, string>()
          const BATCH_SIZE = 120
          for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
            const slice = missingIds.slice(i, i + BATCH_SIZE)
            const { data: statusRows, error: statusErr } = await supabase
              .from('tooling_status')
              .select('item_id,status')
              .eq('item_type', 'child')
              .in('item_id', slice as any)
            if (statusErr) break
            ;(statusRows || []).forEach((r: any) => {
              const k = String(r.item_id || '')
              if (k) statusMap.set(k, String(r.status || ''))
            })
          }
          items.forEach((r: any) => {
            if (!String(r.purchase_status || '').trim()) {
              const s = statusMap.get(String(r.id || '')) || ''
              if (s) r.purchase_status = s
            }
          })
        }
        res.json({ success: true, items });
  } catch (err) {
    console.error('Get child items route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 新增标准件
router.post('/:id/child-items', async (req, res) => {
  try {
    const { id } = req.params;
    let payload = { ...(req.body || {}), tooling_id: id };

    // 清理空字符串字段，避免数据库错误
    if (payload.name === '') {
      delete payload.name;
    }
    if (payload.model === '') {
      delete payload.model;
    }
    if (payload.unit === '') {
      delete payload.unit;
    }
    if (payload.required_date === '') {
      delete payload.required_date;
    }
    if (payload.quantity === '' || payload.quantity === null) {
      delete payload.quantity;
    }

    const { data, error } = await supabase
      .from('child_items')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Create child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Create child item route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 更新标准件
router.put('/child-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensurePurchaseStatusColumns();
    const payload = req.body || {};
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'purchase_status')
    
    console.log('更新标准件请求:', {
      childItemId: id,
      payload: payload
    });

    // 清理空字符串字段，避免数据库错误
    const cleanedPayload = { ...payload };
    
    if (cleanedPayload.name === '') {
      delete cleanedPayload.name;
    }
    if (cleanedPayload.model === '') {
      delete cleanedPayload.model;
    }
    if (cleanedPayload.unit === '') {
      delete cleanedPayload.unit;
    }
    if (cleanedPayload.required_date === '') {
      delete cleanedPayload.required_date;
    }
    if (cleanedPayload.quantity === '' || cleanedPayload.quantity === null) {
      delete cleanedPayload.quantity;
    }
    if (hasStatus) {
      delete cleanedPayload.purchase_status
    }
    
    console.log('清理后的payload:', cleanedPayload);

    const { data, error } = await supabase
      .from('child_items')
      .update(cleanedPayload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      console.error('Update child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }
    if (hasStatus) {
      await ensureStatusTable();
      const s = payload.purchase_status
      const status = (s === null || typeof s === 'undefined') ? '' : String(s || '').trim()
      if (!status) {
        await supabase
          .from('tooling_status')
          .delete()
          .eq('item_type', 'child')
          .eq('item_id', id)
      } else {
        await supabase
          .from('tooling_status')
          .upsert({
            item_type: 'child',
            item_id: id,
            status,
            updated_at: new Date().toISOString()
          }, { onConflict: 'item_type,item_id' })
      }
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('child_items')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select child_items after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      console.log('标准件更新成功 (回查):', exists[0]);
      return res.json({ success: true, data: (exists as any)[0] });
    }

    console.log('标准件更新成功:', arr[0]);
    res.json({ success: true, data: arr[0] });
  } catch (err) {
    console.error('Update child item route error', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除单个标准件
router.delete('/child-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先检查记录是否存在
    const { data: existing } = await supabase
      .from('child_items')
      .select('id')
      .eq('id', id)
      .single();
    
    if (!existing) {
      return res.status(404).json({ success: false, error: '标准件不存在' });
    }
    
    const { error } = await supabase
      .from('child_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete child item route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量删除标准件
router.post('/child-items/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('child_items')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete child items route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
