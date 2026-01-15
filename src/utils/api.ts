export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  // 清理URL中的反引号和空格
  const cleanUrl = url.replace(/[`]/g, '').trim()
  
  // 所有API路径都直接使用客户端API处理，不经过外部API
  const apiPaths = [
    '/api/auth/',
    '/api/options/', 
    '/api/materials', 
    '/api/part-types',
    '/api/tooling',
    '/api/tooling/devices', 
    '/api/tooling/fixed-inventory-options'
  ]
  const isApiPath = apiPaths.some(path => cleanUrl.startsWith(path))
  
  // 优先调用客户端API处理所有API路径，无论是否在GitHub Pages环境中
  if (cleanUrl.startsWith('/') && isApiPath) {
    // 使用相对路径调用客户端API处理，避免使用外部函数URL
    // 确保传递给handleClientSideApi的URL格式一致，都是相对路径，没有空格
    const handled = await handleClientSideApi(cleanUrl, init)
    if (handled) return handled
  }
  
  // 下面的代码只处理其他类型的请求
  const DEFAULT_FUNCTION_BASE = 'https://oltsiocyesbgezlrcxze.functions.supabase.co'
  const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
  const rawBase = (import.meta as any)?.env?.VITE_API_URL || DEFAULT_FUNCTION_BASE
  const normalizeBase = (b: string): string => {
    if (!b) return ''
    let out = b.replace(/\/$/, '')
    if (/functions\.supabase\.co$/.test(out)) {
      out += '/functions/v1'
    } else if (/functions\.supabase\.co\/functions\/v1(\/)?$/.test(out)) {
      out = out.replace(/\/$/, '')
    }
    return out
  }
  const base = normalizeBase(rawBase)
  const abs = (() => {
    if (cleanUrl.startsWith('/')) {
      return (base ? base.replace(/\/$/, '') : window.location.origin) + cleanUrl
    }
    return cleanUrl
  })()
  
  try {
    const res = await fetch(abs, init)
    if (!res.ok && res.status >= 500) {
      const u = new URL(abs, window.location.origin)
      const fallback = `http://localhost:3003${u.pathname}${u.search}`
      return await fetch(fallback, init)
    }
    if (res.status === 404 && cleanUrl.startsWith('/')) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    return res
  } catch {
    // 网络错误时，尝试调用客户端API处理
    if (cleanUrl.startsWith('/')) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    // 在 GitHub Pages 环境不再回退到 localhost，直接抛错
    if (isGhPages) throw new Error('Network error')
    const u = new URL(abs, window.location.origin)
    const fallback = `http://localhost:3003${u.pathname}${u.search}`
    return await fetch(fallback, init)
  }
}

export function installApiInterceptor() {
  if (typeof window === 'undefined') return
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // 清理URL中的反引号和空格
      let u = typeof input === 'string' ? input : String((input as any)?.url || '')
      const cleanUrl = u.replace(/[`]/g, '').trim()
      if (cleanUrl.startsWith('/api')) {
        return await fetchWithFallback(cleanUrl, init)
      }
      // Also intercept absolute calls to GitHub Pages domain
      if (/github\.io\/.+\/api\//.test(cleanUrl)) {
        const m = cleanUrl.match(/github\.io\/.+?(\/api\/.*)$/)
        const path = m ? m[1] : ''
        if (path) return await fetchWithFallback(path, init)
      }
      // Inject anon key for Supabase REST (avoid 400 No API key)
      if (/\.supabase\.co\/rest\/v1\//.test(cleanUrl)) {
        const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'
        const headers = new Headers(init?.headers || {})
        if (!headers.has('apikey')) headers.set('apikey', anon)
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${anon}`)
        const patchedInit: RequestInit = { ...(init || {}), headers }
        const method = (patchedInit?.method || 'GET').toUpperCase()
        // rewrite resource names if needed
        let urlStr = cleanUrl
        urlStr = urlStr.replace('/rest/v1/tooling?', '/rest/v1/tooling_info?')
        urlStr = urlStr.replace('/rest/v1/parts?', '/rest/v1/parts_info?')
        // 直接通过REST API获取设备和固定库存选项数据，避免Supabase JS客户端可能的问题
        if (/\/rest\/v1\/devices\?/.test(urlStr)) {
          if (method !== 'GET') return await fetch(urlStr, patchedInit)
          // 直接调用REST API获取设备数据
          try {
            const response = await fetch(urlStr.replace(/\?.*/, ''), {
              headers: {
                'apikey': anon,
                'Authorization': `Bearer ${anon}`
              }
            })
            const data = await response.json()
            return jsonResponse({ data: data || [] })
          } catch (e) {
            return jsonResponse({ data: [] })
          }
        }
        if (/\/rest\/v1\/fixed_inventory_options\?/.test(urlStr)) {
          if (method !== 'GET') return await fetch(urlStr, patchedInit)
          // 直接调用REST API获取固定库存选项数据
          try {
            const response = await fetch(urlStr.replace(/\?.*/, ''), {
              headers: {
                'apikey': anon,
                'Authorization': `Bearer ${anon}`
              }
            })
            const data = await response.json()
            return jsonResponse({ data: data || [] })
          } catch (e) {
            return jsonResponse({ data: [] })
          }
        }
        return await originalFetch(urlStr as any, patchedInit)
      }
      return await originalFetch(input as any, init)
    } catch (e) {
      return await originalFetch(input as any, init)
    }
  }
}

// ---------- Client-side API fallback (Supabase direct) ----------
import { supabase } from '../lib/supabase'
import bcrypt from 'bcryptjs'

// Supabase配置
const supabaseUrl = 'https://oltsiocyesbgezlrcxze.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

function getQuery(url: string): URLSearchParams {
  // 清理URL中的反引号
  const cleanUrl = url.replace(/[`]/g, '')
  const u = new URL(cleanUrl, window.location.origin)
  return u.searchParams
}

async function handleClientSideApi(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    // 清理URL中的反引号和空格
    const cleanUrl = url.replace(/[`]/g, '').trim()
    
    // 无论是否有Supabase实例，都尝试处理请求
    let path = cleanUrl
    
    // 如果是完整URL，提取路径部分
    if (path.startsWith('http')) {
      const u = new URL(path, window.location.origin)
      path = u.pathname
    }
    
    // 提取真正的API路径，移除任何前缀（如/functions/v1）和查询参数
    const apiPathMatch = path.match(/(\/api\/[^?]+)/)
    if (apiPathMatch) {
      path = apiPathMatch[1]
    }
    
    const method = (init?.method || 'GET').toUpperCase()
    if (method === 'OPTIONS') {
      return jsonResponse({ success: true })
    }

    const readBody = async (): Promise<any> => {
      try {
        if (!init?.body) return {}
        try {
          return await new Response(init.body).json()
        } catch {
          const txt = await new Response(init.body).text()
          try { return JSON.parse(txt) } catch { return {} }
        }
      } catch {
        return {}
      }
    }
    
    // 如果Supabase可用，优先从Supabase获取数据
      if (supabase) {

      if (path === '/api/auth/login' && method === 'POST') {
        const body = await readBody()
        const phone = String(body.phone || '')
        const password = String(body.password || '')
        const { data: userRow, error } = await supabase
          .from('users')
          .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
          .eq('phone', phone)
          .single()
        if (error || !userRow) return jsonResponse({ success: false, error: '用户不存在' }, 401)
        const ok = await bcrypt.compare(password, String((userRow as any).password_hash || ''))
        if (!ok) return jsonResponse({ success: false, error: '密码错误' }, 401)
        if (String((userRow as any).status) !== 'active') return jsonResponse({ success: false, error: '账户未激活或已被禁用' }, 401)
        const { password_hash, ...safeUser } = (userRow as any)
        return jsonResponse({ success: true, user: safeUser })
      }

      if (path === '/api/auth/me' && method === 'GET') {
        const qs = getQuery(cleanUrl)
        const userId = String(qs.get('userId') || '')
        if (!userId) return jsonResponse({ success: false, error: '缺少userId' }, 400)
        const { data: userRow, error } = await supabase
          .from('users')
          .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
          .eq('id', userId)
          .single()
        if (error || !userRow) return jsonResponse({ success: false, error: '用户不存在' }, 404)
        const { password_hash, ...safeUser } = (userRow as any)
        return jsonResponse({ success: true, user: safeUser })
      }

      // ---- Production units CRUD ----
      if (path.startsWith('/api/options/production-units')) {
        if (method === 'GET') {
          const { data, error } = await supabase.from('production_units').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
          return jsonResponse({ data: error ? [] : (data || []) })
        }
        if (method === 'POST') {
          const body = await readBody()
          const maxRes = await supabase.from('production_units').select('sort_order').order('sort_order', { ascending: false }).limit(1)
          const maxOrder = Array.isArray(maxRes.data) && maxRes.data.length ? Number(maxRes.data[0].sort_order || 0) : 0
          const nextOrder = maxOrder + 1
          const payload = { name: String(body.name || ''), is_active: Boolean(body.is_active ?? true), sort_order: nextOrder }
          const { data, error } = await supabase.from('production_units').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        const pu = path.match(/^\/api\/options\/production-units\/(\d+)$/)
        if (pu && method === 'PUT') {
          const id = Number(pu[1])
          const body = await readBody()
          const payload = { name: String(body.name || ''), is_active: Boolean(body.is_active ?? true) }
          const { error } = await supabase.from('production_units').update(payload).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (pu && method === 'DELETE') {
          const id = Number(pu[1])
          const { error } = await supabase.from('production_units').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path.endsWith('/reorder')) {
          const body = await readBody()
          const itemId = Number(body.itemId)
          const newIndex = Number(body.newIndex)
          const { error } = await supabase.from('production_units').update({ sort_order: newIndex + 1 }).eq('id', itemId)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

      // ---- Tooling categories CRUD ----
      if (path.startsWith('/api/options/tooling-categories')) {
        if (method === 'GET') {
          const { data, error } = await supabase.from('tooling_categories').select('*').order('created_at', { ascending: true })
          return jsonResponse({ data: error ? [] : (data || []) })
        }
        if (method === 'POST') {
          const body = await readBody()
          const { data, error } = await supabase
            .from('tooling_categories')
            .insert({ name: String(body.name || ''), is_active: Boolean(body.is_active ?? true), description: String(body.description || '') })
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        const m = path.match(/^\/api\/options\/tooling-categories\/(\d+)$/)
        if (m && method === 'PUT') {
          const id = Number(m[1])
          const body = await readBody()
          const { error } = await supabase
            .from('tooling_categories')
            .update({ name: String(body.name || ''), is_active: Boolean(body.is_active ?? true), description: String(body.description || '') })
            .eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (m && method === 'DELETE') {
          const id = Number(m[1])
          const { error } = await supabase.from('tooling_categories').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path.endsWith('/reorder')) {
          // 无排序字段，直接返回成功，避免前端报错
          return jsonResponse({ success: true })
        }
      }

      // ---- Material sources CRUD ----
      if (path.startsWith('/api/options/material-sources')) {
        if (method === 'GET') {
          const { data, error } = await supabase.from('material_sources').select('*').order('created_at', { ascending: true })
          return jsonResponse({ data: error ? [] : (data || []) })
        }
        if (method === 'POST') {
          const body = await readBody()
          const { data, error } = await supabase
            .from('material_sources')
            .insert({ name: String(body.name || ''), description: String(body.description || ''), is_active: Boolean(body.is_active ?? true) })
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        const ms = path.match(/^\/api\/options\/material-sources\/(\d+)$/)
        if (ms && method === 'PUT') {
          const id = Number(ms[1])
          const body = await readBody()
          const { error } = await supabase
            .from('material_sources')
            .update({ name: String(body.name || ''), description: String(body.description || ''), is_active: Boolean(body.is_active ?? true) })
            .eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (ms && method === 'DELETE') {
          const id = Number(ms[1])
          const { error } = await supabase.from('material_sources').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path.endsWith('/reorder')) {
          // 无排序字段，直接返回成功
          return jsonResponse({ success: true })
        }
      }

      // ---- Part types CRUD ----
      if (path.startsWith('/api/part-types')) {
        if (method === 'GET') {
          const { data, error } = await supabase.from('part_types').select('*').order('created_at', { ascending: true })
          return jsonResponse({ data: error ? [] : (data || []) })
        }
        if (method === 'POST') {
          const body = await readBody()
          const payload = { name: String(body.name || ''), description: body.description ?? null, volume_formula: body.volume_formula ?? null }
          const { data, error } = await supabase.from('part_types').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        const pt = path.match(/^\/api\/part-types\/(.+)$/)
        if (pt && method === 'PUT') {
          const id = pt[1]
          const body = await readBody()
          const payload = { name: String(body.name || ''), description: body.description ?? null, volume_formula: body.volume_formula ?? null }
          const { error } = await supabase.from('part_types').update(payload).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (pt && method === 'DELETE') {
          const id = pt[1]
          const { error } = await supabase.from('part_types').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path.endsWith('/reorder')) {
          return jsonResponse({ success: true })
        }
      }

      // ---- Materials CRUD (single current price on materials) ----
      if (path.startsWith('/api/materials')) {
        if (method === 'GET') {
          const { data, error } = await supabase.from('materials').select('*').order('created_at', { ascending: true })
          return jsonResponse({ data: error ? [] : (data || []) })
        }
        if (method === 'POST' && path === '/api/materials') {
          const body = await readBody()
          const payload: any = { name: String(body.name || ''), density: Number(body.density || 0) }
          if (body.unit_price !== undefined && body.unit_price !== null && body.unit_price !== '') {
            payload.unit_price = Number(body.unit_price)
          }
          const { data, error } = await supabase.from('materials').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        const mat = path.match(/^\/api\/materials\/([^\/]+)$/)
        if (mat && method === 'PUT') {
          const id = mat[1]
          const body = await readBody()
          const payload: any = { name: String(body.name || ''), density: Number(body.density || 0) }
          if (body.unit_price !== undefined && body.unit_price !== null && body.unit_price !== '') {
            payload.unit_price = Number(body.unit_price)
          }
          const { error } = await supabase.from('materials').update(payload).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (mat && method === 'DELETE') {
          const id = mat[1]
          const { error } = await supabase.from('materials').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        // Backward compatibility for old endpoints
        const priceProxyList = path.match(/^\/api\/materials\/([^\/]+)\/prices$/)
        if (priceProxyList && method === 'GET') {
          const material_id = priceProxyList[1]
          const { data } = await supabase.from('materials').select('unit_price, created_at').eq('id', material_id).single()
          const items = data && data.unit_price != null ? [{ id: null, material_id, unit_price: data.unit_price, effective_start_date: (data.created_at || null), effective_end_date: null }] : []
          return jsonResponse({ success: true, items })
        }
        const priceProxyCreate = path.match(/^\/api\/materials\/([^\/]+)\/prices$/)
        if (priceProxyCreate && method === 'POST') {
          const material_id = priceProxyCreate[1]
          const body = await readBody()
          const up = Number(body.unit_price)
          const { error } = await supabase.from('materials').update({ unit_price: up }).eq('id', material_id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: { id: null, material_id, unit_price: up } })
        }
        const priceProxyUpdate = path.match(/^\/api\/materials\/([^\/]+)\/prices\/([^\/]+)$/)
        if (priceProxyUpdate && method === 'PUT') {
          const material_id = priceProxyUpdate[1]
          const body = await readBody()
          const up = Number(body.unit_price)
          const { error } = await supabase.from('materials').update({ unit_price: up }).eq('id', material_id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (priceProxyUpdate && method === 'DELETE') {
          const material_id = priceProxyUpdate[1]
          const { error } = await supabase.from('materials').update({ unit_price: null }).eq('id', material_id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

      // ---- Devices CRUD (client handles GET only; writes defer to server) ----
      if (path.startsWith('/api/tooling/devices')) {
        if (method === 'POST' && path === '/api/tooling/devices') {
          const body = await readBody()
          const payload = { device_no: String(body.device_no || ''), device_name: String(body.device_name || ''), max_aux_minutes: body.max_aux_minutes ?? null }
          const { data, error } = await supabase.from('devices').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        if (method === 'POST' && path === '/api/tooling/devices/update') {
          const body = await readBody()
          const id = String(body.id || '')
          const payload = { device_no: String(body.device_no || ''), device_name: String(body.device_name || ''), max_aux_minutes: body.max_aux_minutes ?? null }
          const { error } = await supabase.from('devices').update(payload).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path === '/api/tooling/devices/delete') {
          const body = await readBody()
          const id = String(body.id || '')
          const { error } = await supabase.from('devices').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

      // ---- Fixed inventory options CRUD (client handles GET only; writes defer to server) ----
      if (path.startsWith('/api/tooling/fixed-inventory-options')) {
        if (method === 'POST' && path === '/api/tooling/fixed-inventory-options') {
          const body = await readBody()
          const payload = { option_value: String(body.option_value || ''), option_label: String(body.option_label || ''), is_active: Boolean(body.is_active ?? true) }
          const { data, error } = await supabase.from('fixed_inventory_options').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        if (method === 'POST' && path === '/api/tooling/fixed-inventory-options/update') {
          const body = await readBody()
          const id = String(body.id || '')
          const payload = { option_value: String(body.option_value || ''), option_label: String(body.option_label || ''), is_active: Boolean(body.is_active ?? true) }
          const { error } = await supabase.from('fixed_inventory_options').update(payload).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path === '/api/tooling/fixed-inventory-options/delete') {
          const body = await readBody()
          const id = String(body.id || '')
          const { error } = await supabase.from('fixed_inventory_options').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }
      // Options & meta
      if (method === 'GET' && path.startsWith('/api/options/production-units')) {
        console.log('Fetching production_units from Supabase')
        const { data, error } = await supabase.from('production_units').select('*')
        console.log('production_units result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      if (method === 'GET' && path.startsWith('/api/options/tooling-categories')) {
        console.log('Fetching tooling_categories from Supabase')
        const { data, error } = await supabase.from('tooling_categories').select('*')
        console.log('tooling_categories result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      if (method === 'GET' && path.startsWith('/api/options/material-sources')) {
        console.log('Fetching material_sources from Supabase')
        const { data, error } = await supabase.from('material_sources').select('*')
        console.log('material_sources result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      if (method === 'GET' && path.startsWith('/api/materials')) {
        console.log('Fetching materials from Supabase')
        const { data, error } = await supabase.from('materials').select('*')
        console.log('materials result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      if (method === 'GET' && path.startsWith('/api/part-types')) {
        console.log('Fetching part_types from Supabase')
        const { data, error } = await supabase.from('part_types').select('*')
        console.log('part_types result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      // Devices
      if (method === 'GET' && path.startsWith('/api/tooling/devices')) {
        console.log('Fetching devices from Supabase client')
        const { data, error } = await supabase.from('devices').select('*').order('created_at', { ascending: true })
        if (error) {
          console.error('Error fetching devices:', error)
          return jsonResponse({ data: [] })
        }
        console.log('devices result:', { data })
        return jsonResponse({ data: data || [] })
      }
      // Fixed inventory options
      if (method === 'GET' && path.startsWith('/api/tooling/fixed-inventory-options')) {
        console.log('Fetching fixed_inventory_options from Supabase client')
        const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('created_at', { ascending: true })
        if (error) {
          console.error('Error fetching fixed_inventory_options:', error)
          return jsonResponse({ data: [] })
        }
        console.log('fixed_inventory_options result:', { data })
        return jsonResponse({ data: data || [] })
      }

    }


    
    // 移除模拟数据，确保所有请求都从数据库获取数据
    
    // 如果Supabase可用，继续处理其他API端点
    if (supabase) {
      // Tooling list
      if (method === 'GET' && path === '/api/tooling') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 50)
        const sortField = String(qs.get('sortField') || 'created_at')
        const sortOrder = String(qs.get('sortOrder') || 'asc').toLowerCase() === 'asc'
        const { data, error } = await supabase
          .from('tooling_info')
          .select('id,inventory_number,production_unit,category,received_date,demand_date,completed_date,project_name')
          .order(sortField as any, { ascending: sortOrder })
          .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        if (error) return jsonResponse({ success: true, items: [], total: 0, page, pageSize })
        const items = (data || []).map((x: any) => ({
          id: x.id,
          inventory_number: x.inventory_number || '',
          production_unit: x.production_unit || '',
          category: x.category || '',
          received_date: x.received_date || '',
          demand_date: x.demand_date || '',
          completed_date: x.completed_date || '',
          project_name: x.project_name || ''
        }))
        return jsonResponse({ success: true, items, total: items.length, page, pageSize, data: items })
      }
      
      // Create tooling
      if (method === 'POST' && path === '/api/tooling') {
        const body = await readBody()
        const { data, error } = await supabase
          .from('tooling')
          .insert({
            inventory_number: body.inventory_number || '',
            production_unit: body.production_unit || '',
            category: body.category || '',
            received_date: body.received_date || null,
            demand_date: body.demand_date || null,
            completed_date: body.completed_date || null,
            project_name: body.project_name || '',
            production_date: body.production_date || null,
            recorder: body.recorder || '',
            sets_count: body.sets_count || 1
          })
          .select('*')
          .single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      
      // Update tooling
      if (method === 'PUT' && path.match(/^\/api\/tooling\/[^\/]+$/)) {
        const toolingId = path.split('/').pop()
        if (!toolingId) return jsonResponse({ success: false, error: 'Invalid tooling ID' }, 400)
        const body = await readBody()
        const { data, error } = await supabase
          .from('tooling')
          .update(body)
          .eq('id', toolingId)
          .select('*')
          .single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      
      // Batch delete tooling
      if (method === 'POST' && path === '/api/tooling/batch-delete') {
        const body = await readBody()
        const { ids } = body
        if (!ids || !Array.isArray(ids)) return jsonResponse({ success: false, error: 'Invalid IDs' }, 400)
        
        const { error } = await supabase
          .from('tooling')
          .delete()
          .in('id', ids)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }
      
      // Batch delete parts
      if (method === 'POST' && path === '/api/tooling/parts/batch-delete') {
        const body = await readBody()
        const { ids } = body
        if (!ids || !Array.isArray(ids)) return jsonResponse({ success: false, error: 'Invalid IDs' }, 400)
        
        const { error } = await supabase
          .from('parts')
          .delete()
          .in('id', ids)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }
      
      // Batch delete child items
      if (method === 'POST' && path === '/api/tooling/child-items/batch-delete') {
        const body = await readBody()
        const { ids } = body
        if (!ids || !Array.isArray(ids)) return jsonResponse({ success: false, error: 'Invalid IDs' }, 400)
        
        const { error } = await supabase
          .from('child_items')
          .delete()
          .in('id', ids)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      // Tooling batch info
      if (method === 'GET' && path.startsWith('/api/tooling/batch')) {
        const qs = getQuery(url)
        const ids = qs.getAll('ids')
        if (ids.length === 0) return jsonResponse({ data: [] })
        const { data, error } = await supabase
          .from('tooling_info')
          .select('id,recorder')
          .in('id', ids)
        if (error) return jsonResponse({ data: [] })
        // 兼容字段名
        const items = (data || []).map((x: any) => ({ id: x.id, recorder: x.recorder }))
        return jsonResponse({ data: items })
      }

      // Tooling users basic
      if (method === 'GET' && path.startsWith('/api/tooling/users/basic')) {
        const { data, error } = await supabase.from('users').select('id,real_name,phone,workshop,team,aux_coeff,proc_coeff,capability_coeff')
        if (error) return jsonResponse({ success: false, error: error.message })
        const items = (data || []).map((u: any) => ({
          id: String(u.id ?? u.uuid ?? ''),
          real_name: String(u.real_name ?? ''),
          phone: String(u.phone ?? ''),
          workshop: String(u.workshop ?? ''),
          team: String(u.team ?? ''),
          aux_coeff: Number(u.aux_coeff ?? 1),
          proc_coeff: Number(u.proc_coeff ?? 1),
          capability_coeff: Number(u.capability_coeff ?? 1)
        }))
        return jsonResponse({ success: true, items })
      }

      // Tooling parts by toolingId
      const partsMatch = path.match(/^\/api\/tooling\/([^\/]+)\/parts$/)
      if (method === 'GET' && partsMatch) {
        const toolingId = partsMatch[1]
        const { data, error } = await supabase
          .from('parts_info')
          .select('*')
          .eq('tooling_id', toolingId)
        if (error) return jsonResponse({ success: true, items: [], data: [] })
        return jsonResponse({ success: true, items: data || [], data: data || [] })
      }

      // Child items by toolingId
      const childMatch = path.match(/^\/api\/tooling\/([^\/]+)\/child-items$/)
      if (method === 'GET' && childMatch) {
        const toolingId = childMatch[1]
        const { data, error } = await supabase
          .from('child_items')
          .select('*')
          .eq('tooling_id', toolingId)
        if (error) return jsonResponse({ success: true, items: [], data: [] })
        return jsonResponse({ success: true, items: data || [], data: data || [] })
      }

      // Work hours
      if (method === 'GET' && path === '/api/tooling/work-hours') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 200)
        const order = qs.get('order') || 'work_date'
        const orderDir = (qs.get('order_dir') || 'desc').toLowerCase() === 'asc'
        const { data, error } = await supabase.from('work_hours').select('*')
          .order(order, { ascending: orderDir })
          .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        if (error) return jsonResponse({ success: true, items: [], total: 0, page, pageSize, totals: { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }, data: [] })
        const items = data || []
        const totals = (items as any[]).reduce(
          (acc, r: any) => {
            acc.total_hours += Number(r.hours || 0)
            acc.aux_hours += Number(r.aux_hours || 0)
            acc.proc_hours += Number(r.proc_hours || 0)
            acc.completed_quantity += Number(r.completed_quantity || 0)
            return acc
          },
          { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }
        )
        return jsonResponse({ success: true, items, total: items.length, page, pageSize, totals, data: items })
      }

      // Cutting orders list
      if (method === 'GET' && path === '/api/cutting-orders') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 1000)
        let q = supabase.from('cutting_orders').select('*')
        q = q.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        const { data, error } = await q
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Purchase orders list
      if (method === 'GET' && path === '/api/purchase-orders') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 1000)
        let q = supabase.from('purchase_orders').select('*')
        q = q.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        const { data, error } = await q
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Workshops & teams (organization data)
      if (method === 'GET' && path === '/api/tooling/org/workshops') {
        const { data, error } = await supabase.from('workshops').select('*')
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }
      if (method === 'GET' && path === '/api/tooling/org/teams') {
        const { data, error } = await supabase.from('teams').select('*')
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Parts inventory list
      if (method === 'GET' && path === '/api/tooling/parts/inventory-list') {
        const qs = getQuery(url)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 500)
        const { data, error } = await supabase
          .from('parts_info')
          .select('*')
          .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        if (error) return jsonResponse({ success: false, error: error.message })
        const items = (data || []).map((p: any) => ({
          id: String(p.id ?? p.uuid ?? ''),
          part_inventory_number: String(p.part_inventory_number ?? ''),
          part_name: String(p.part_name ?? ''),
          part_drawing_number: String(p.part_drawing_number ?? ''),
          process_route: String(p.process_route ?? '')
        }))
        return jsonResponse({ success: true, items })
      }
    }
    return null
  } catch (e: any) {
    console.error('Error in handleClientSideApi:', { error: e?.message || String(e), stack: e?.stack })
    return null
  }
}
