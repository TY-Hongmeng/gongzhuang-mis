import { Router } from 'express'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()

router.get('/tooling-nullable', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({
        success: true,
        connected: false,
        reason: 'SUPABASE_DB_URL not configured',
        columns: null,
      })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'tooling_info'
        AND column_name IN ('inventory_number','production_date','demand_date','sets_count')
      ORDER BY column_name;
    `
    const r = await client.query(sql)
    await client.end()
    const cols = r.rows || []
    return res.json({ success: true, connected: true, columns: cols })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

// 查询 parts_info 的规格字段示例
router.get('/parts-specs', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, rows: [] })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT id, part_name, specifications FROM parts_info ORDER BY created_at DESC LIMIT 5;`
    const r = await client.query(sql)
    await client.end()
    const rows = r.rows || []
    return res.json({ success: true, connected: true, rows })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/parts-count', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, count: 0 })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT COUNT(*) AS total_parts FROM parts_info;`
    const r = await client.query(sql)
    await client.end()
    const row = (r.rows || [])[0] || { total_parts: 0 }
    return res.json({ success: true, connected: true, total_parts: Number(row.total_parts || 0) })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/cutting-orders/summary', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, rows: [] })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT COUNT(*) as total_count, COUNT(DISTINCT created_date::date) as unique_dates, COUNT(DISTINCT material_source) as unique_materials, COUNT(DISTINCT tooling_id) as unique_toolings FROM cutting_orders;`
    const r = await client.query(sql)
    await client.end()
    return res.json({ success: true, connected: true, rows: r.rows || [] })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/cutting-orders/by-date', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, rows: [] })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT created_date::date as date, material_source, COUNT(*) as count FROM cutting_orders GROUP BY created_date::date, material_source ORDER BY date, material_source;`
    const r = await client.query(sql)
    await client.end()
    return res.json({ success: true, connected: true, rows: r.rows || [] })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/cutting-orders/by-tooling', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, rows: [] })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT tooling_id, material_source, COUNT(*) as count FROM cutting_orders GROUP BY tooling_id, material_source ORDER BY count DESC;`
    const r = await client.query(sql)
    await client.end()
    return res.json({ success: true, connected: true, rows: r.rows || [] })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/cutting-orders/missing-fields', async (req, res) => {
  try {
    const dbUrl = process.env.SUPABASE_DB_URL || ''
    if (!dbUrl) {
      return res.status(200).json({ success: true, connected: false, rows: [] })
    }
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const sql = `SELECT COUNT(*) as total, COUNT(CASE WHEN tooling_id IS NULL THEN 1 END) as missing_tooling, COUNT(CASE WHEN material_source IS NULL THEN 1 END) as missing_material, COUNT(CASE WHEN created_date IS NULL THEN 1 END) as missing_date FROM cutting_orders;`
    const r = await client.query(sql)
    await client.end()
    return res.json({ success: true, connected: true, rows: r.rows || [] })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) })
  }
})

router.get('/database-status', async (req, res) => {
  try {
    const { getDatabaseStatus } = await import('../lib/db.js')
    const status = await getDatabaseStatus()
    res.json({ success: true, status })
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get database status', 
      details: err?.message || String(err) 
    })
  }
})

export default router
