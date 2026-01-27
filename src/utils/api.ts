export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  // 清理URL中的反引号和空格
  const cleanUrl = url.replace(/[`]/g, '').trim()
  
  // 所有API路径都直接使用客户端API处理，不经过外部API
  const apiPaths = [
    '/api/options/', 
    '/api/materials', 
    '/api/part-types',
    '/api/tooling',
    '/api/tooling/devices', 
    '/api/tooling/fixed-inventory-options',
    '/api/auth',
    '/api/cutting-orders',
    '/api/purchase-orders'
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
      // 在本地或非 GitHub Pages 环境下，直接使用相对路径以走 Vite 代理到本地后端
      const isLocal = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(String(window.location?.host || ''))
      if (!isGhPages && isLocal) return cleanUrl
      // 在 GitHub Pages 等静态环境下，转向 Supabase Functions
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
  } catch (err) {
    console.error('fetchWithFallback: Network error or similar', err)
    // 网络错误时，尝试调用客户端API处理
    if (cleanUrl.startsWith('/')) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    // 在 GitHub Pages 环境不再回退到 localhost，直接抛错
    if (isGhPages) {
      console.error('fetchWithFallback: isGhPages=true, throwing Network error')
      throw new Error('Network error')
    }
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
        const isLocal = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(String(window.location?.host || ''))
        const abs = (!isGhPages && isLocal) ? cleanUrl : (base ? base.replace(/\/$/, '') : window.location.origin) + cleanUrl
        return await originalFetch(abs as any, init)
      }
      // Also intercept absolute calls to GitHub Pages domain
      if (/github\.io\/.+\/api\//.test(cleanUrl)) {
        const m = cleanUrl.match(/github\.io\/.+?(\/api\/.*)$/)
        const path = m ? m[1] : ''
        if (path) return await originalFetch(path as any, init)
      }
      if (/functions\.supabase\.co\/functions\/v1\/api\//.test(cleanUrl)) {
        const m = cleanUrl.match(/functions\.supabase\.co\/functions\/v1(\/api\/[^?#]+)/)
        const path = m ? m[1] : ''
        if (path) return await originalFetch(path as any, init)
      }
      // Inject API key for Supabase REST (avoid 400 No API key) and respect user auth
      if (/\.supabase\.co\/rest\/v1\//.test(cleanUrl)) {
        const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'
        const baseReq = input instanceof Request ? input : null
        const headers = new Headers(baseReq?.headers || undefined)
        const h = (init as any)?.headers
        if (h instanceof Headers) {
          for (const [k, v] of h.entries()) headers.set(k, v)
        } else if (Array.isArray(h)) {
          for (const [k, v] of h) {
            if (k && v != null) headers.set(String(k), String(v))
          }
        } else if (h && typeof h === 'object') {
          for (const [k, v] of Object.entries(h)) {
            if (v != null) headers.set(String(k), String(v))
          }
        }
        headers.set('apikey', anon)
        const hasAuthHeader = headers.has('Authorization') || headers.has('authorization')
        if (!hasAuthHeader) {
          try {
            const { data } = await (await import('../lib/supabase')).supabase.auth.getSession()
            const token = data?.session?.access_token
            if (token) headers.set('Authorization', `Bearer ${token}`)
          } catch {
            // no-op: keep request without Authorization to use anon role
          }
        }
        console.log('[API Interceptor] Adding API key to Supabase request:', cleanUrl)
        const patchedInit: RequestInit = { ...(init || {}), headers, method: (init as any)?.method || baseReq?.method || (init as any)?.method }
        const method = ((init as any)?.method || baseReq?.method || 'GET').toUpperCase()
        // rewrite resource names if needed
        let urlStr = cleanUrl

        if (!/([?&])apikey=/.test(urlStr)) {
          const u = new URL(urlStr)
          u.searchParams.set('apikey', anon)
          urlStr = u.toString()
        }
        urlStr = urlStr.replace('/rest/v1/tooling?', '/rest/v1/tooling_info?')
        urlStr = urlStr.replace('/rest/v1/parts?', '/rest/v1/parts_info?')
        // 直接通过REST API获取设备和固定库存选项数据，避免Supabase JS客户端可能的问题
        if (/\/rest\/v1\/devices\?/.test(urlStr)) {
          if (method !== 'GET') return await fetch(urlStr, patchedInit)
          try {
            const response = await originalFetch(urlStr.replace(/\?.*/, ''), { headers })
            const data = await response.json()
            return jsonResponse({ data: data || [] })
          } catch (e) {
            return jsonResponse({ data: [] })
          }
        }
        if (/\/rest\/v1\/fixed_inventory_options\?/.test(urlStr)) {
          if (method !== 'GET') return await fetch(urlStr, patchedInit)
          try {
            const response = await originalFetch(urlStr.replace(/\?.*/, ''), { headers })
            const data = await response.json()
            return jsonResponse({ data: data || [] })
          } catch (e) {
            return jsonResponse({ data: [] })
          }
        }
        if (baseReq) {
          const req = new Request(urlStr, baseReq)
          return await originalFetch(req, patchedInit)
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms)
    promise
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
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

      // Tooling users basic
      if (method === 'GET' && path.startsWith('/api/tooling/users/basic')) {
        return jsonResponse({ success: true, items: [] })
      }

      if (path.startsWith('/api/auth')) {
        if (method === 'POST' && path === '/api/auth/login') {
          const body = await readBody()
          const phone = String(body.phone || '').trim()
          const password = String(body.password || '')
          if (!phone || !password) return jsonResponse({ success: false, error: '手机号和密码不能为空' }, 400)
          const { data: user, error } = await supabase
            .from('users')
            .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
            .eq('phone', phone)
            .single()
          if (error || !user) return jsonResponse({ success: false, error: '用户不存在' }, 401)
          const ok = await bcrypt.compare(password, String((user as any).password_hash || ''))
          if (!ok) return jsonResponse({ success: false, error: '密码错误' }, 401)
          if (String((user as any).status) !== 'active') return jsonResponse({ success: false, error: '账户未激活或已被禁用' }, 401)
          const { password_hash, ...safeUser } = (user as any)
          return jsonResponse({ success: true, user: safeUser })
        }
        if (method === 'POST' && path === '/api/auth/register') {
          const body = await readBody()
          const phone = String(body.phone || '').trim()
          const realName = String(body.realName || '').trim()
          const idCard = String(body.idCard || '').trim()
          const companyId = String(body.companyId || '').trim()
          const roleId = String(body.roleId || '').trim()
          const password = String(body.password || '')
          const workshopId = body.workshopId ? String(body.workshopId) : null
          const teamId = body.teamId ? String(body.teamId) : null
          if (!phone || !realName || !idCard || !companyId || !roleId || !password) {
            return jsonResponse({ success: false, error: '所有字段都是必填的' }, 400)
          }
          const { data: existingPhone } = await supabase.from('users').select('id').eq('phone', phone).single()
          if (existingPhone) return jsonResponse({ success: false, error: '手机号已被注册' }, 400)
          const { data: existingIdCard } = await supabase.from('users').select('id').eq('id_card', idCard).single()
          if (existingIdCard) return jsonResponse({ success: false, error: '身份证号已被注册' }, 400)
          const passwordHash = await bcrypt.hash(password, 10)
          const { error } = await supabase.from('users').insert({
            phone,
            real_name: realName,
            id_card: idCard,
            company_id: companyId,
            role_id: roleId,
            workshop_id: workshopId,
            team_id: teamId,
            password_hash: passwordHash,
            status: 'pending'
          })
          if (error) return jsonResponse({ success: false, error: '注册失败' }, 500)
          return jsonResponse({ success: true, message: '注册成功，请等待管理员审核' })
        }
        if (method === 'POST' && path === '/api/auth/reset-password') {
          const body = await readBody()
          const idCard = String(body.idCard || '').trim()
          const newPassword = String(body.newPassword || '')
          if (!idCard || !newPassword) return jsonResponse({ success: false, error: '身份证号和新密码不能为空' }, 400)
          const { data: user, error } = await supabase.from('users').select('id').eq('id_card', idCard).single()
          if (error || !user) return jsonResponse({ success: false, error: '用户不存在' }, 404)
          const passwordHash = await bcrypt.hash(newPassword, 10)
          const { error: updateError } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', (user as any).id)
          if (updateError) return jsonResponse({ success: false, error: '密码重置失败' }, 500)
          return jsonResponse({ success: true, message: '密码重置成功' })
        }
        if (method === 'GET' && path.startsWith('/api/auth/me')) {
          const qs = getQuery(url)
          const userId = String(qs.get('userId') || '').trim()
          if (!userId) return jsonResponse({ success: false, error: '缺少用户ID' }, 400)
          const { data: user, error } = await supabase
            .from('users')
            .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
            .eq('id', userId)
            .single()
          if (error || !user) return jsonResponse({ success: false, error: '用户不存在' }, 404)
          const { password_hash, ...safeUser } = (user as any)
          return jsonResponse({ success: true, user: safeUser })
        }
        return null
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
          .select('id,inventory_number,production_unit,category,received_date,demand_date,completed_date,project_name,production_date,sets_count,recorder')
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
          project_name: x.project_name || '',
          production_date: x.production_date || '',
          sets_count: typeof x.sets_count === 'number' ? x.sets_count : 1,
          recorder: x.recorder || ''
        }))
        return jsonResponse({ success: true, items, total: items.length, page, pageSize, data: items })
      }
      
      // Create tooling
      if (method === 'POST' && path === '/api/tooling') {
        const body = await readBody()
        const { data, error } = await supabase
          .from('tooling_info')
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
          .from('tooling_info')
          .update(body)
          .eq('id', toolingId)
          .select('*')
          .single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      
      // Batch delete tooling (cascade children)
      if (method === 'POST' && path === '/api/tooling/batch-delete') {
        const body = await readBody()
        const { ids } = body
        if (!ids || !Array.isArray(ids)) return jsonResponse({ success: false, error: 'Invalid IDs' }, 400)

        const { error: partsErr } = await supabase
          .from('parts_info')
          .delete()
          .in('tooling_id', ids)
        if (partsErr) return jsonResponse({ success: false, error: partsErr.message }, 500)

        const { error: childErr } = await supabase
          .from('child_items')
          .delete()
          .in('tooling_id', ids)
        if (childErr) return jsonResponse({ success: false, error: childErr.message }, 500)

        const { error } = await supabase
          .from('tooling_info')
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
          .from('parts_info')
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
      if (method === 'POST' && partsMatch) {
        const toolingId = partsMatch[1]
        const body = await readBody()
        const rawSource = String(body.source || '').trim()
        const source = (rawSource === '下料' || rawSource === '自备' || rawSource === '外购')
          ? rawSource
          : '自备'
        const msRaw = body.material_source_id
        const msNum = msRaw === null || msRaw === undefined || String(msRaw).trim() === '' ? null : Number(msRaw)
        const material_source_id = typeof msNum === 'number' && !Number.isNaN(msNum) ? msNum : null
        const qtyRaw = body.part_quantity
        const qtyNum = qtyRaw === null || qtyRaw === undefined || String(qtyRaw).trim() === '' ? null : Number(qtyRaw)
        const part_quantity = typeof qtyNum === 'number' && !Number.isNaN(qtyNum) ? qtyNum : null
        const payload: any = {
          tooling_id: toolingId,
          part_inventory_number: String(body.part_inventory_number || ''),
          inventory_number: String(body.part_inventory_number || ''),
          part_drawing_number: String(body.part_drawing_number || ''),
          part_name: String(body.part_name || ''),
          part_quantity,
          material_id: body.material_id ?? null,
          material_source_id,
          part_category: String(body.part_category || ''),
          specifications: body.specifications ?? {},
          remarks: body.remarks ?? '',
          source
        }
        const { data, error } = await supabase.from('parts_info').insert(payload).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }

      // Parts update/delete by id
      const partIdMatch = path.match(/^\/api\/tooling\/parts\/([^\/]+)$/)
      if (partIdMatch && method === 'PUT') {
        const id = partIdMatch[1]
        const body = await readBody()
        const payload: any = {}
        if (Object.prototype.hasOwnProperty.call(body, 'part_inventory_number')) payload.part_inventory_number = String(body.part_inventory_number ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'part_drawing_number')) payload.part_drawing_number = String(body.part_drawing_number ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'part_name')) payload.part_name = String(body.part_name ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'part_quantity')) {
          const num = typeof body.part_quantity === 'number' ? body.part_quantity : Number(body.part_quantity)
          payload.part_quantity = (body.part_quantity === '' || body.part_quantity === null || Number.isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'material_id')) payload.material_id = body.material_id ?? null
        if (Object.prototype.hasOwnProperty.call(body, 'material_source_id')) {
          const ms = body.material_source_id
          const msNum = ms === null || ms === undefined || String(ms).trim() === '' ? null : Number(ms)
          payload.material_source_id = typeof msNum === 'number' && !Number.isNaN(msNum) ? msNum : null
        }
        if (Object.prototype.hasOwnProperty.call(body, 'part_category')) payload.part_category = String(body.part_category ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'specifications')) payload.specifications = body.specifications ?? {}
        if (Object.prototype.hasOwnProperty.call(body, 'remarks')) payload.remarks = String(body.remarks ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'weight')) {
          const w = typeof body.weight === 'number' ? body.weight : Number(body.weight)
          payload.weight = Number.isNaN(w) ? null : w
        }
        const { error } = await supabase.from('parts_info').update(payload).eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }
      if (partIdMatch && method === 'DELETE') {
        const id = partIdMatch[1]
        const { error } = await supabase.from('parts_info').delete().eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
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
      if (method === 'POST' && childMatch) {
        const toolingId = childMatch[1]
        const body = await readBody()
        const payload: any = {
          tooling_id: toolingId,
          name: String(body.name || ''),
          model: String(body.model || ''),
          quantity: body.quantity ?? null,
          unit: String(body.unit || ''),
          required_date: String(body.required_date || '') || null
        }
        const { data, error } = await supabase.from('child_items').insert(payload).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }

      // Child items update/delete by id
      const childIdMatch = path.match(/^\/api\/tooling\/child-items\/([^\/]+)$/)
      if (childIdMatch && method === 'PUT') {
        const id = childIdMatch[1]
        const body = await readBody()
        const payload: any = {}
        if (Object.prototype.hasOwnProperty.call(body, 'name')) payload.name = String(body.name ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'model')) payload.model = String(body.model ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'quantity')) {
          const num = typeof body.quantity === 'number' ? body.quantity : Number(body.quantity)
          payload.quantity = (body.quantity === '' || body.quantity === null || Number.isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'unit')) payload.unit = String(body.unit ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'required_date')) payload.required_date = String(body.required_date ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'remark')) payload.remark = String(body.remark ?? '') || null
        if (Object.prototype.hasOwnProperty.call(body, 'type')) payload.type = String(body.type ?? '') || null
        const { error } = await supabase.from('child_items').update(payload).eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }
      if (childIdMatch && method === 'DELETE') {
        const id = childIdMatch[1]
        const { error } = await supabase.from('child_items').delete().eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
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
        const startTime = Date.now()
        const selectCols = [
          'id','inventory_number','project_name','part_drawing_number','part_name','material','specifications','part_quantity','total_weight','material_source','created_date','tooling_id','part_id'
        ].join(',')
        let q = supabase.from('cutting_orders').select(selectCols)
        q = q.eq('is_deleted', false)
        q = q.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        const { data, error } = await q
        if (error) return jsonResponse({ success: true, items: [], total: 0, page, pageSize, queryTime: Date.now() - startTime, data: [] })
        let items = (data || []) as any[]
        const missingProj = items.filter(r => !r.project_name || r.project_name === '未命名项目')
        if (missingProj.length > 0) {
          const ids = Array.from(new Set(missingProj.map(r => r.tooling_id).filter(Boolean)))
          if (ids.length) {
            const { data: tinfo } = await supabase.from('tooling_info').select('id, project_name').in('id', ids)
            const map = new Map<string, string>()
            ;(tinfo || []).forEach(t => map.set(String((t as any).id), String((t as any).project_name || '')))
            items = items.map(r => ({
              ...r,
              project_name: (r.project_name && r.project_name !== '未命名项目') ? r.project_name : (map.get(String(r.tooling_id)) || r.project_name || '')
            }))
          }
        }
        return jsonResponse({ success: true, items, total: items.length, page, pageSize, queryTime: Date.now() - startTime, data: items })
      }

      // Cutting orders create (optimize & normalize)
      if (method === 'POST' && path === '/api/cutting-orders') {
        const body = await readBody()
        const rows = Array.isArray(body?.orders) ? body.orders : []
        if (rows.length === 0) return jsonResponse({ success: false, error: '缺少orders' }, 400)
        const nowIso = new Date().toISOString()
        const normalized = rows.map((raw: any) => {
          const payload: any = {
            inventory_number: String(raw.inventory_number || '').trim(),
            project_name: String(raw.project_name || '').trim(),
            part_drawing_number: String(raw.part_drawing_number || ''),
            part_name: String(raw.part_name || '').trim(),
            specifications: raw.specifications ?? '',
            part_quantity: Number(raw.part_quantity || 0),
            material_source: String(raw.material_source || '').trim() || '锯切',
            created_date: raw.created_date || nowIso,
            material: raw.material || '',
            total_weight: raw.total_weight ?? null,
            tooling_id: raw.tooling_id || null,
            part_id: raw.part_id || null,
            tooling_info_id: raw.tooling_id || null,
            is_deleted: false,
          }
          if (typeof raw.remarks === 'string' && raw.remarks.trim()) payload.remarks = String(raw.remarks).trim()
          else if (raw.heat_treatment) payload.remarks = '需调质'
          return payload
        }).filter((p: any) => p.inventory_number && p.part_name && p.part_quantity > 0)
        const { error } = await supabase.from('cutting_orders').upsert(normalized, { onConflict: 'inventory_number' })
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      // Cutting orders batch delete -> soft delete for speed
      if (method === 'POST' && path === '/api/cutting-orders/batch-delete') {
        const body = await readBody()
        const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
        if (ids.length === 0) return jsonResponse({ success: false, error: '缺少ids' }, 400)
        const { error } = await supabase.from('cutting_orders').update({ is_deleted: true, updated_date: new Date().toISOString() }).in('id', ids)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
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

      // 重要：创建采购单需要服务端权限，客户端不处理POST
      if (method === 'POST' && path === '/api/purchase-orders') {
        return null
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

      // Update parts process routes (client-side fallback)
      if (method === 'POST' && path === '/api/tooling/parts/process-routes') {
        const body = await readBody()
        const mappings: any[] = Array.isArray(body?.mappings) ? body.mappings : []
        if (!mappings.length) return jsonResponse({ success: false, error: '缺少mappings' }, 400)
        try {
          for (const m of mappings) {
            const inv = String(m?.part_inventory_number || '').trim().toUpperCase()
            const drawing = String(m?.part_drawing_number || '').trim()
            const route = String(m?.process_route || '')
            if (!route) continue
            if (inv) {
              await withTimeout(
                supabase.from('parts_info').update({ process_route: route }).eq('inventory_number', inv),
                8000
              )
            } else if (drawing) {
              await withTimeout(
                supabase.from('parts_info').update({ process_route: route }).eq('part_drawing_number', drawing),
                8000
              )
            }
          }
          return jsonResponse({ success: true })
        } catch (e: any) {
          const msg = String(e?.message || '更新工艺路线失败')
          return jsonResponse({ success: false, error: msg }, /TIMEOUT/.test(msg) ? 504 : 500)
        }
      }
    }
    return null
  } catch (e: any) {
    console.error('Error in handleClientSideApi:', { error: e?.message || String(e), stack: e?.stack })
    return null
  }
}
