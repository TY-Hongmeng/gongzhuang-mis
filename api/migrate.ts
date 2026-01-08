import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

let ran = false

export async function runAutoMigrate() {
  if (ran) return
  ran = true
  dotenv.config()
  const allow = String(process.env.ALLOW_AUTO_MIGRATE || '').toLowerCase() === 'true'
  const dbUrl = process.env.SUPABASE_DB_URL || ''
  if (!allow || !dbUrl) {
    return
  }
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const sqlPaths = [
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251112_relax_tooling_nullable.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251117_add_tooling_dates.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251217_create_workshops_teams.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251218_add_users_fk_org.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251219_alter_work_hours_add_aux_times.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251219_alter_users_add_capability_coeff.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251219_alter_devices_add_max_aux_minutes.sql'),
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20251226_alter_work_hours_add_shift_date.sql'),
  ]
  try {
    const sqlList = sqlPaths
      .filter(p => fs.existsSync(p))
      .map(p => ({ p, sql: fs.readFileSync(p, 'utf8') }))
    // lazy import pg to avoid hard crash when dep missing
    const mod = await import('pg') as any
    const PgClient = (mod.Client || mod.default?.Client)
    const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const executed: string[] = []
    for (const { p, sql } of sqlList) {
      try {
        await client.query(sql)
        executed.push(path.basename(p))
      } catch (err: any) {
        try { console.warn('[migrate] skip file due to error:', path.basename(p), err?.code || err?.message) } catch {}
        // continue
      }
    }
    await client.end()
    if (executed.length) console.log('[migrate] executed migrations:', executed.join(', '))
  } catch (err) {
    try {
      console.error('[migrate] failed', err)
    } catch {}
  }
}
