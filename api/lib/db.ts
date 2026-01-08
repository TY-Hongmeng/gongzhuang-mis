/**
 * 统一数据库访问层
 * 提供Supabase客户端和PostgreSQL连接池的统一封装
 */

import { createClient } from '@supabase/supabase-js'
import pkg from 'pg'
const { Pool } = pkg

// Supabase客户端实例
let supabaseClient: any = null

// PostgreSQL连接池实例
let pgPool: pkg.Pool | null = null

// 数据库配置
const dbConfig = {
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  query_timeout: 30000
}

/**
 * 初始化Supabase客户端
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
  }
  return supabaseClient
}

/**
 * 初始化PostgreSQL连接池
 */
export async function getPgPool(): Promise<pkg.Pool> {
  if (!pgPool) {
    pgPool = new Pool(dbConfig)
    
    // 连接池事件监听
    pgPool.on('connect', (client) => {
      console.log('[Database] New client connected')
      // 设置连接参数
      client.query('SET statement_timeout = 30000').catch(err => {
        console.error('[Database] Error setting statement_timeout:', err)
      })
    })
    
    pgPool.on('error', (err) => {
      console.error('[Database] Pool error:', err)
    })
    
    // 预初始化连接池
    try {
      const client = await pgPool.connect()
      await client.query('SELECT 1')
      client.release()
      console.log('[Database] Connection pool pre-initialized successfully')
    } catch (error) {
      console.error('[Database] Failed to pre-initialize connection pool:', error)
      throw error
    }
  }
  
  return pgPool
}

/**
 * 执行SQL查询
 */
export async function query(sql: string, params?: any[]): Promise<any> {
  const pool = await getPgPool()
  const client = await pool.connect()
  
  try {
    const result = await client.query(sql, params)
    return result
  } catch (error) {
    console.error('[Database] Query error:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * 执行事务
 */
export async function transaction<T>(
  callback: (client: pkg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getPgPool()
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Supabase查询封装
 */
export async function supabaseQuery(
  table: string,
  options: {
    select?: string
    filters?: Record<string, any>
    orderBy?: { column: string; ascending?: boolean }
    limit?: number
    offset?: number
  } = {}
) {
  const supabase = getSupabaseClient()
  let query = supabase.from(table).select(options.select || '*')
  
  // 添加过滤条件
  if (options.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    })
  }
  
  // 添加排序
  if (options.orderBy) {
    query = query.order(options.orderBy.column, { 
      ascending: options.orderBy.ascending !== false 
    })
  }
  
  // 添加分页
  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + options.limit - 1)
  }
  
  const { data, error } = await query
  
  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`)
  }
  
  return data
}

/**
 * Supabase插入封装
 */
export async function supabaseInsert(table: string, data: any) {
  const supabase = getSupabaseClient()
  const { data: result, error } = await supabase.from(table).insert(data).select()
  
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`)
  }
  
  return result
}

/**
 * Supabase更新封装
 */
export async function supabaseUpdate(
  table: string,
  data: any,
  filters: Record<string, any>
) {
  const supabase = getSupabaseClient()
  let query = supabase.from(table).update(data)
  
  // 添加过滤条件
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value)
    }
  })
  
  const { data: result, error } = await query.select()
  
  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`)
  }
  
  return result
}

/**
 * Supabase删除封装
 */
export async function supabaseDelete(
  table: string,
  filters: Record<string, any>
) {
  const supabase = getSupabaseClient()
  let query = supabase.from(table).delete()
  
  // 添加过滤条件
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value)
    }
  })
  
  const { data, error } = await query
  
  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`)
  }
  
  return data
}

/**
 * 获取数据库连接状态
 */
export async function getDatabaseStatus(): Promise<{
  supabase: boolean
  postgresql: boolean
  details: Record<string, any>
}> {
  const status = {
    supabase: false,
    postgresql: false,
    details: {} as Record<string, any>
  }
  
  // 测试Supabase连接
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('tooling_info').select('id').limit(1)
    status.supabase = !error && data !== null
    status.details.supabase = error ? error.message : 'Connected'
  } catch (error: any) {
    status.details.supabase = error.message
  }
  
  // 测试PostgreSQL连接
  try {
    const pool = await getPgPool()
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT 1')
      status.postgresql = result.rows.length > 0
      status.details.postgresql = 'Connected'
    } finally {
      client.release()
    }
  } catch (error: any) {
    status.details.postgresql = error.message
  }
  
  return status
}

export default {
  getSupabaseClient,
  getPgPool,
  query,
  transaction,
  supabaseQuery,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
  getDatabaseStatus
}