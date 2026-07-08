export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  // 清理URL中的反引号和空格
  const cleanUrl = url.replace(/[`]/g, '').trim()
  
  const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
  const isGhPages = /github\.io/i.test(host)
  // 统一的本地环境检测
  const isLocal = (
    /localhost|127\.0\.0\.1|::1/i.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    (/:[0-9]+$/.test(host) && !isGhPages) ||
    (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !isGhPages)
  )

  const forceBackend = !isGhPages && (
    /^\/api\/tooling\/status/.test(cleanUrl)
    || /^\/api\/tooling\/[^\/]+\/parts/.test(cleanUrl)
    || /^\/api\/tooling\/[^\/]+\/child-items/.test(cleanUrl)
    || /^\/api\/tooling\/parts\//.test(cleanUrl)
    || /^\/api\/tooling\/child-items\//.test(cleanUrl)
    || /^\/api\/tooling\/parts\/process-routes/.test(cleanUrl)
    || /^\/api\/tooling\/program-entries(\/|$)/.test(cleanUrl)
    || /^\/api\/tooling\/program-management(\/|$)/.test(cleanUrl)
    || /^\/api\/standard-parts(\/|$)/.test(cleanUrl)
    || /^\/api\/material-assets(\/|$)/.test(cleanUrl)
    || /^\/api\/temporary-plan-groups(\/|$)/.test(cleanUrl)
  )
  const allowClientFallbackOn404 = /^\/api\/tooling\/[^\/]+\/parts/.test(cleanUrl)
    || /^\/api\/tooling\/[^\/]+\/child-items/.test(cleanUrl)
    || /^\/api\/tooling\/parts\//.test(cleanUrl)
    || /^\/api\/tooling\/child-items\//.test(cleanUrl)
    || /^\/api\/tooling\/status/.test(cleanUrl)
    || /^\/api\/tooling\/parts\/process-routes/.test(cleanUrl)
  const method = String(init?.method || 'GET').toUpperCase()
  const clientOnly = isGhPages && (
    /^\/api\/tooling\/parts\/[^\/]+$/.test(cleanUrl) ||
    /^\/api\/tooling\/child-items\/[^\/]+$/.test(cleanUrl)
  ) && (method === 'PUT' || method === 'DELETE')
  // 所有API路径都直接使用客户端API处理，不经过外部API
  const apiPaths = [
    '/api/options/', 
    '/api/materials', 
    '/api/part-types',
    '/api/tooling',
    '/api/tooling/devices', 
    '/api/tooling/fixed-inventory-options',
    '/api/tooling/org',
    '/api/auth',
    '/api/cutting-orders',
    '/api/purchase-orders',
    '/api/backup-materials',
    '/api/manual-plans',
    '/api/temporary-plan-groups',
    '/api/standard-parts',
    '/api/material-assets',
    '/api/users',
    '/api/companies'
  ]
  const isApiPath = apiPaths.some(path => cleanUrl.startsWith(path))
  
  // 如果是本地环境且不是在 GitHub Pages 上，优先走本地后端
  // 注意：这里我们移除了对 isLocal 的严格依赖，如果是在开发模式下（import.meta.env.DEV），也应该优先走本地
  const isDev = (import.meta as any).env?.DEV === true
  const ghPagesClientHandledPath =
    isGhPages && (
      cleanUrl.startsWith('/api/tooling/program-entries') ||
      cleanUrl.startsWith('/api/tooling/program-management')
    )

  if (cleanUrl.startsWith('/') && isApiPath && ghPagesClientHandledPath) {
    const handled = await handleClientSideApi(cleanUrl, init)
    if (handled) return handled
  }
  
  if (cleanUrl.startsWith('/') && isApiPath) {
    // 特殊处理采购单和下料单：在本地环境下必须优先走后端以避免 RLS 问题
    const isCriticalOrderPath =
      cleanUrl.startsWith('/api/purchase-orders') ||
      cleanUrl.startsWith('/api/cutting-orders') ||
      cleanUrl.startsWith('/api/tooling/devices') ||
      cleanUrl.startsWith('/api/tooling/fixed-inventory-options') ||
      cleanUrl.startsWith('/api/tooling/program-entries') ||
      cleanUrl.startsWith('/api/tooling/program-management') ||
      cleanUrl.startsWith('/api/standard-parts') ||
      cleanUrl.startsWith('/api/material-assets') ||
      cleanUrl.startsWith('/api/temporary-plan-groups')
    
    // 如果是本地开发环境且是关键订单路径，跳过 handleClientSideApi，
    // 让 fetchWithFallback 继续执行并最终调用本地后端
    if ((isLocal || isDev) && isCriticalOrderPath && !isGhPages) {
      console.log(`[API] Critical path ${cleanUrl} detected in local environment, bypassing client-side handler to use backend.`)
      // 不返回，继续向下执行
    } else {
      if (clientOnly) {
        const handled = await handleClientSideApi(cleanUrl, init)
        if (handled) return handled
      }
      // 只有在明确是 GitHub Pages 或者是远程生产环境且没有本地后端时，才走 client-side API
      if ((isGhPages || (!isLocal && !isDev)) && !forceBackend) {
        if (cleanUrl.startsWith('/api/tooling/work-hours/aggregates')) {
          // #region debug-point A:fetch-route-client-fallback
          fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'tooling-work-hours-400', runId: 'pre-fix', hypothesisId: 'A', location: 'src/utils/api.ts:101', msg: '[DEBUG] work-hours aggregates routed to client fallback', data: { cleanUrl, host, isGhPages, isLocal, isDev, forceBackend }, ts: Date.now() }) }).catch(() => {})
          // #endregion
        }
        const handled = await handleClientSideApi(cleanUrl, init)
        if (handled) return handled
      }
    }
  }
  
  // 下面的代码只处理其他类型的请求
  const DEFAULT_FUNCTION_BASE = 'https://oltsiocyesbgezlrcxze.functions.supabase.co'
  
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
      // 在本地或局域网环境下，直接使用相对路径以走 Vite 代理到本地后端
      if (!isGhPages && (isLocal || isDev)) return cleanUrl
      // 在 GitHub Pages 等静态环境下，转向 Supabase Functions
      return (base ? base.replace(/\/$/, '') : window.location.origin) + cleanUrl
    }
    return cleanUrl
  })()
  const shouldUseLocalhostFallback = !isGhPages && (isLocal || isDev)
  
  try {
    if (!forceBackend && isGhPages && /functions\.supabase\.co/.test(abs)) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    const res = await fetch(abs, init)
    if (!res.ok && res.status >= 500) {
      if (shouldUseLocalhostFallback) {
        const u = new URL(abs, window.location.origin)
        const fallback = `http://localhost:3003${u.pathname}${u.search}`
        return await fetch(fallback, init)
      }
    }
    if (res.status === 404 && cleanUrl.startsWith('/') && (!forceBackend || allowClientFallbackOn404)) {
      const handled = await handleClientSideApi(cleanUrl, init)
      if (handled) return handled
    }
    return res
  } catch (err) {
    console.error('fetchWithFallback: Network error or similar', err)
    // 网络错误时，尝试调用客户端API处理
    if (cleanUrl.startsWith('/') && (!forceBackend || allowClientFallbackOn404)) {
      const handled = await handleClientSideApi(cleanUrl, init)
      if (handled) return handled
    }
    // 生产环境不回退到 localhost，避免 HTTPS 页面触发不安全请求
    if (!shouldUseLocalhostFallback) {
      console.error('fetchWithFallback: production mode, throwing Network error')
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

      // 1. 本地环境检测：如果是本地 localhost 且请求 /api/ 开头，直接放行，走 Vite 代理到本地 Express 后端
      const isDev = (import.meta as any).env?.DEV === true
      const debugLog = (() => {
        if (isDev) return true
        try {
          return (typeof localStorage !== 'undefined' && localStorage.getItem('debug_api') === '1')
        } catch {
          return false
        }
      })()
      const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
      const isGhPages = /github\.io/i.test(host)
      
      const isLocal = (
        /localhost|127\.0\.0\.1|::1/i.test(host) ||
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        // 如果包含端口号且不是 github.io，极大概率是本地开发或局域网部署
        (/:[0-9]+$/.test(host) && !isGhPages) ||
        // 如果是纯 IP 地址且不是 github.io
        (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !isGhPages)
      )
      
      if (cleanUrl.startsWith('/api/')) {
        const strictBackendPath =
          cleanUrl.startsWith('/api/standard-parts') ||
          cleanUrl.startsWith('/api/tooling/program-entries') ||
          cleanUrl.startsWith('/api/tooling/program-management') ||
          cleanUrl.startsWith('/api/material-assets')
        // 在本地环境或开发模式下，强制优先走本地后端
        if ((isLocal || isDev) && !isGhPages) {
          try {
            if (debugLog) console.log(`[API Interceptor] Local/Dev env detected (host: ${host}), routing ${cleanUrl} to backend.`)
            const res = await originalFetch(input, init)
            // 如果后端返回 502/504，说明代理目标（后端服务）可能未启动
            if (res.status === 502 || res.status === 504) {
              if (strictBackendPath) return res
              if (debugLog) console.warn(`[API Interceptor] Backend gateway error (${res.status}) for ${cleanUrl}, falling back to client-side Supabase.`)
              return await handleClientSideApi(cleanUrl, init)
            }
            return res
          } catch (err) {
            if (strictBackendPath) throw err
            // 捕获 ERR_CONNECTION_REFUSED 等网络错误，并自动回退到客户端直接连接 Supabase
            if (debugLog) console.warn(`[API Interceptor] Backend connection failed for ${cleanUrl}, falling back to client-side Supabase. Error:`, err)
            return await handleClientSideApi(cleanUrl, init)
          }
        }
      }

      // 2. 网页端环境（GitHub Pages 等）：拦截 API 请求并用 handleClientSideApi 模拟后端
      if (cleanUrl.startsWith('/api')) {
        return await fetchWithFallback(cleanUrl, init)
      }
      // Also intercept absolute calls to GitHub Pages domain
      if (/github\.io\/(?:.+\/)?api\//.test(cleanUrl)) {
        const m = cleanUrl.match(/github\.io\/(?:.+?\/)?(\/api\/.*)$/)
        const path = m ? m[1] : ''
        if (path) return await fetchWithFallback(path, init)
      }
      // Intercept Supabase Functions requests and route to client handler regardless of environment
      // REMOVED: Caused infinite loop for purchase-orders
      
      // Inject anon key for Supabase REST (avoid 400 No API key)
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
        if (!headers.has('authorization') && !headers.has('Authorization')) {
          headers.set('authorization', `Bearer ${anon}`)
          headers.set('Authorization', `Bearer ${anon}`)
        }
        if (debugLog) console.log('[API Interceptor] Adding API key to Supabase request:', cleanUrl)
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
          if (method !== 'GET') {
            const first = await fetch(urlStr, patchedInit)
            if (first.status !== 400) return first
            const rawBody = (patchedInit as any)?.body
            if (!rawBody || typeof rawBody !== 'string') return first
            try {
              const parsed = JSON.parse(rawBody)
              if (!Object.prototype.hasOwnProperty.call(parsed, 'process_unit_price')) return first
              delete parsed.process_unit_price
              const retryInit: RequestInit = {
                ...patchedInit,
                body: JSON.stringify(parsed)
              }
              return await fetch(urlStr, retryInit)
            } catch {
              return first
            }
          }
          // 直接调用REST API获取设备数据
          try {
            const response = await originalFetch(urlStr.replace(/\?.*/, ''), {
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
            const response = await originalFetch(urlStr.replace(/\?.*/, ''), {
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
import { createClient } from '@supabase/supabase-js'
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

export async function handleClientSideApi(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    // 清理URL中的反引号和空格
    const cleanUrl = url.replace(/[`]/g, '').trim()
    
    // 统一的本地环境检测
    const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
    const isGhPages = /github\.io/i.test(host)
    const isLocal = (
      /localhost|127\.0\.0\.1|::1/i.test(host) ||
      /^192\.168\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      (/:[0-9]+$/.test(host) && !isGhPages) ||
      (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !isGhPages)
    )
    const isDev = (import.meta as any).env?.DEV === true

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

    // Extract Auth Token
    let authToken = ''
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        authToken = init.headers.get('Authorization') || init.headers.get('authorization') || ''
      } else if (Array.isArray(init.headers)) {
        const found = init.headers.find(([k]) => k.toLowerCase() === 'authorization')
        if (found) authToken = found[1]
      } else {
        const h = init.headers as Record<string, string>
        authToken = h['Authorization'] || h['authorization'] || ''
      }
    }

    // Auto-recover token if missing from headers to fix RLS 401/42501 errors
    if (!authToken) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          authToken = `Bearer ${session.access_token}`
        } else {
          // Fallback 1: Standard Supabase v2 key
          const keyPattern = /^sb-.*-auth-token$/;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && keyPattern.test(key)) {
              const item = localStorage.getItem(key);
              if (item) {
                const parsed = JSON.parse(item);
                const token = parsed.access_token || parsed.session?.access_token || (parsed.session && parsed.session.access_token);
                if (token) {
                  authToken = `Bearer ${token}`;
                  break;
                }
              }
            }
          }

          // Fallback 2: Check auth-storage (zustand store)
          if (!authToken) {
            const authStorage = localStorage.getItem('auth-storage');
            if (authStorage) {
              try {
                const parsed = JSON.parse(authStorage);
                const token = parsed.state?.user?.access_token || parsed.state?.token || parsed.state?.accessToken;
                if (token) {
                  authToken = `Bearer ${token}`;
                  console.log('[API Interceptor] Recovered token from auth-storage');
                }
              } catch (e) {}
            }
          }

          // Fallback 3: Check common token keys
          if (!authToken) {
            const commonKeys = ['token', 'accessToken', 'access_token', 'supabase.auth.token'];
            for (const key of commonKeys) {
              const val = localStorage.getItem(key);
              if (val) {
                // Check if it looks like a JWT or a JSON with a token
                if (val.startsWith('ey') && val.split('.').length === 3) {
                  authToken = `Bearer ${val}`;
                  break;
                } else {
                  try {
                    const parsed = JSON.parse(val);
                    const token = parsed.access_token || parsed.token || parsed.accessToken;
                    if (token) {
                      authToken = `Bearer ${token}`;
                      break;
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[API Interceptor] Failed to recover token automatically', e)
      }
    }

    // Initialize scoped client with token for RLS
    const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || 'https://oltsiocyesbgezlrcxze.supabase.co'
    const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'
    
    let scopedClient = supabase
    if (authToken && authToken.startsWith('Bearer ')) {
       scopedClient = createClient(supabaseUrl, supabaseKey, {
         global: {
           headers: {
             'Authorization': authToken,
             'apikey': supabaseKey
           }
         },
         auth: {
           persistSession: false,
           autoRefreshToken: false,
           detectSessionInUrl: false
         }
       })
    }

    const method = (init?.method || 'GET').toUpperCase()
    const adminPhone = '18004499801'
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
        try {
          const companyId = String(getQuery(url).get('company_id') || '').trim()
          // 返回与后端一致的数据结构：操作者 -> 车间/班组/辅系数/加系数/能力系数
          let usersQuery = supabase.from('users').select('real_name, workshop_id, team_id, capability_coeff, company_id, role_id, status')
          if (companyId) usersQuery = usersQuery.eq('company_id', companyId)
          const [usersRes, teamsRes, workshopsRes] = await Promise.all([
            usersQuery,
            supabase.from('teams').select('id, name, aux_coeff, proc_coeff'),
            supabase.from('workshops').select('id, name')
          ])
          const roleIds = Array.from(new Set(((usersRes.data || []) as any[]).map((u: any) => String(u.role_id || '')).filter(Boolean)))
          const rolesRes = roleIds.length > 0
            ? await supabase.from('roles').select('id, name').in('id', roleIds)
            : { data: [], error: null as any }
          
          const teamsMap = new Map<string, { name: string; aux_coeff: number; proc_coeff: number }>()
          if (teamsRes.data) {
            teamsRes.data.forEach((t: any) => teamsMap.set(String(t.id), {
              name: String(t.name || ''),
              aux_coeff: Number(t.aux_coeff ?? 1),
              proc_coeff: Number(t.proc_coeff ?? 1)
            }))
          }
          const workshopsMap = new Map<string, string>()
          if (workshopsRes.data) {
            workshopsRes.data.forEach((w: any) => workshopsMap.set(String(w.id), String(w.name || '')))
          }
          const roleNameMap = new Map<string, string>()
          ;((rolesRes.data || []) as any[]).forEach((r: any) => roleNameMap.set(String(r.id), String(r.name || '')))

          const items = ((usersRes.data || []) as any[])
            .filter((u: any) => String(u?.status || '').trim() === 'active' && String(roleNameMap.get(String(u?.role_id || '')) || '').trim() === '员工')
            .map((u: any) => ({
            real_name: u.real_name,
            workshop: u.workshop_id ? (workshopsMap.get(String(u.workshop_id)) || '') : '',
            team: u.team_id ? (teamsMap.get(String(u.team_id))?.name || '') : '',
            aux_coeff: Number(teamsMap.get(String(u.team_id))?.aux_coeff ?? 1),
            proc_coeff: Number(teamsMap.get(String(u.team_id))?.proc_coeff ?? 1),
            capability_coeff: Number(u.capability_coeff ?? 1)
          }))
          
          return jsonResponse({ success: true, items })
        } catch (e) {
          console.error('Error fetching users/basic:', e)
          return jsonResponse({ success: true, items: [] })
        }
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

      // ---- Users / Roles / Companies ----
      if (path.startsWith('/api/users')) {
        // GET /api/users/roles
        if (method === 'GET' && path === '/api/users/roles') {
          const { data, error } = await supabase.from('roles').select('*').order('created_at', { ascending: true })
          return jsonResponse({ success: true, roles: error ? [] : data })
        }
        // GET /api/users/companies
        if (method === 'GET' && path === '/api/users/companies') {
          const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: true })
          return jsonResponse({ success: true, companies: error ? [] : data })
        }
        // GET /api/users
        if (method === 'GET' && path === '/api/users') {
          const { data, error } = await supabase.from('users').select(`
            *,
            company:companies(id, name),
            role:roles(id, name),
            workshop:workshops(id, name),
            team:teams(id, name)
          `).order('created_at', { ascending: false })
          return jsonResponse({ success: true, users: error ? [] : data })
        }

        if (method === 'PUT' && path.match(/^\/api\/users\/[^\/]+$/)) {
          const userId = path.split('/').pop()
          if (!userId) return jsonResponse({ success: false, error: 'Invalid user ID' }, 400)
          const body = await readBody()
          const existing = await scopedClient.from('users').select('id, phone, real_name').eq('id', userId).single()
          const existingPhone = String((existing?.data as any)?.phone || '')
          const oldRealNameRaw = String((existing?.data as any)?.real_name || '')
          const newRealNameRaw = String(body?.real_name || '')
          const oldRealName = oldRealNameRaw.trim()
          const newRealName = newRealNameRaw.trim()
          const payload: any = {
            real_name: body.real_name,
            phone: body.phone,
            id_card: body.id_card,
            company_id: body.company_id ?? null,
            role_id: body.role_id ?? null,
            capability_coeff: body.capability_coeff ?? 1,
            workshop_id: body.workshop_id ?? null,
            team_id: body.team_id ?? null,
            status: body.status
          }
          if (existingPhone === adminPhone || String(body.phone || '') === adminPhone) {
            payload.status = 'active'
          }
          const { data, error } = await scopedClient.from('users').update(payload).eq('id', userId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          // 用户改名时，同步工时表 operator，保证工时管理展示名称一致
          if (oldRealName && newRealName && oldRealName !== newRealName) {
            const { error: syncErr } = await supabase
              .from('work_hours')
              .update({ operator: newRealName })
              .eq('operator', oldRealName)
            if (syncErr) return jsonResponse({ success: false, error: `用户已更新，但工时同步失败: ${syncErr.message}` }, 500)
            // 兜底：全量分页扫描，避免历史数据量大时遗漏
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
                if (scanErr) return jsonResponse({ success: false, error: `用户已更新，但工时补同步失败: ${scanErr.message}` }, 500)
                const list = rows || []
                if (list.length === 0) break
                list.forEach((r: any) => {
                  if (normalizeName((r as any)?.operator) === targetOld) ids.push(String((r as any).id || ''))
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
                if (patchErr) return jsonResponse({ success: false, error: `用户已更新，但工时补同步失败: ${patchErr.message}` }, 500)
              }
            }
          }
          return jsonResponse({ success: true, data })
        }
        if (method === 'PUT' && path.match(/^\/api\/users\/[^\/]+\/status$/)) {
          const parts = path.split('/')
          const userId = parts.length >= 4 ? parts[3] : ''
          if (!userId) return jsonResponse({ success: false, error: 'Invalid user ID' }, 400)
          const body = await readBody()
          const status = String(body?.status || '').trim()
          if (!status) return jsonResponse({ success: false, error: '缺少状态' }, 400)
          const existing = await scopedClient.from('users').select('id, phone').eq('id', userId).single()
          const existingPhone = String((existing?.data as any)?.phone || '')
          const nextStatus = existingPhone === adminPhone ? 'active' : status
          const { data, error } = await scopedClient.from('users').update({ status: nextStatus }).eq('id', userId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data })
        }
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
          return jsonResponse({ success: true, data: items, items })
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
          const payload = {
            device_no: String(body.device_no || ''),
            device_name: String(body.device_name || ''),
            max_aux_minutes: body.max_aux_minutes ?? null,
            process_unit_price: body.process_unit_price ?? null
          }
          let { data, error } = await supabase.from('devices').insert(payload).select('*').single()
          if (error && Object.prototype.hasOwnProperty.call(payload, 'process_unit_price')) {
            const fallbackPayload = {
              device_no: payload.device_no,
              device_name: payload.device_name,
              max_aux_minutes: payload.max_aux_minutes
            }
            const retried = await supabase.from('devices').insert(fallbackPayload).select('*').single()
            data = retried.data
            error = retried.error
          }
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, item: data })
        }
        if (method === 'POST' && path === '/api/tooling/devices/update') {
          const body = await readBody()
          const id = String(body.id || '')
          const payload = {
            device_no: String(body.device_no || ''),
            device_name: String(body.device_name || ''),
            max_aux_minutes: body.max_aux_minutes ?? null,
            process_unit_price: body.process_unit_price ?? null
          }
          let { error } = await supabase.from('devices').update(payload).eq('id', id)
          if (error && Object.prototype.hasOwnProperty.call(payload, 'process_unit_price')) {
            const fallbackPayload = {
              device_no: payload.device_no,
              device_name: payload.device_name,
              max_aux_minutes: payload.max_aux_minutes
            }
            const retried = await supabase.from('devices').update(fallbackPayload).eq('id', id)
            error = retried.error
          }
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
          return jsonResponse({ success: true, items: [], data: [] })
        }
        console.log('devices result:', { data })
        return jsonResponse({ success: true, items: data || [], data: data || [] })
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

      // Suppliers options
      if (method === 'GET' && path.startsWith('/api/options/suppliers')) {
        const { data, error } = await supabase
          .from('suppliers')
          .select('*')
          .order('created_at', { ascending: true })
        if (error) {
          console.error('Error fetching suppliers:', error)
          return jsonResponse({ data: [] })
        }
        return jsonResponse({ data: data || [] })
      }

      // Backup materials CRUD
      if (path.startsWith('/api/backup-materials')) {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('backup_materials')
            .select('*')
            .order('created_date', { ascending: false })
          if (error) {
            console.error('Error fetching backup_materials:', error)
            return jsonResponse({ data: [] })
          }
          return jsonResponse({ data: data || [] })
        }
        if (method === 'POST' && path === '/api/backup-materials/batch-delete') {
          const body = await readBody()
          const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
          if (!ids.length) return jsonResponse({ success: false, error: '缺少ids' }, 400)
          const { error } = await supabase.from('backup_materials').delete().in('id', ids)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path === '/api/backup-materials') {
          const body = await readBody()
          const payload: any = {
            material_name: String(body.material_name || ''),
            model: String(body.model || ''),
            quantity: body.quantity == null || body.quantity === '' ? null : Number(body.quantity),
            unit: String(body.unit || ''),
            project_name: String(body.project_name || ''),
            supplier: String(body.supplier || body.production_unit || ''),
            price: body.price == null || body.price === '' ? null : Number(body.price),
            demand_date: String(body.demand_date || '') || null,
            created_date: String(body.created_date || '') || null,
            applicant: String(body.applicant || ''),
            is_manual: Boolean(body.is_manual ?? true),
            material: String(body.material || ''),
            material_type: String(body.material_type || '')
          }
          const { data, error } = await supabase
            .from('backup_materials')
            .insert(payload)
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data })
        }
        const bm = path.match(/^\/api\/backup-materials\/([^\/]+)$/)
        if (bm && method === 'PUT') {
          const id = bm[1]
          const body = await readBody()
          const updateData: any = {}
          if (Object.prototype.hasOwnProperty.call(body, 'material_name')) updateData.material_name = String(body.material_name || '')
          if (Object.prototype.hasOwnProperty.call(body, 'model')) updateData.model = String(body.model || '')
          if (Object.prototype.hasOwnProperty.call(body, 'quantity')) updateData.quantity = body.quantity == null || body.quantity === '' ? null : Number(body.quantity)
          if (Object.prototype.hasOwnProperty.call(body, 'unit')) updateData.unit = String(body.unit || '')
          if (Object.prototype.hasOwnProperty.call(body, 'project_name')) updateData.project_name = String(body.project_name || '')
          if (Object.prototype.hasOwnProperty.call(body, 'supplier') || Object.prototype.hasOwnProperty.call(body, 'production_unit')) {
            updateData.supplier = String(body.supplier || body.production_unit || '')
          }
          if (Object.prototype.hasOwnProperty.call(body, 'price')) updateData.price = body.price == null || body.price === '' ? null : Number(body.price)
          if (Object.prototype.hasOwnProperty.call(body, 'demand_date')) updateData.demand_date = String(body.demand_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'created_date')) updateData.created_date = String(body.created_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'applicant')) updateData.applicant = String(body.applicant || '')
          if (Object.prototype.hasOwnProperty.call(body, 'is_manual')) updateData.is_manual = Boolean(body.is_manual)
          if (Object.prototype.hasOwnProperty.call(body, 'material')) updateData.material = String(body.material || '')
          if (Object.prototype.hasOwnProperty.call(body, 'material_type')) updateData.material_type = String(body.material_type || '')
          const { error } = await supabase
            .from('backup_materials')
            .update(updateData)
            .eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (bm && method === 'DELETE') {
          const id = bm[1]
          const { error } = await supabase.from('backup_materials').delete().eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

      // Standard parts
      if (path.startsWith('/api/standard-parts')) {
        const toNum = (v: any) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : 0
        }
        const normText = (v: any) => String(v || '').trim()
        const today = () => new Date().toISOString().slice(0, 10)
        const excludedStatuses = ['已删除', '已退库', '退库', '退库入库']
        const q = getQuery(cleanUrl)
        const requestOperator = normText(q.get('operator') || '')
        const requestUserId = normText(q.get('userId') || '')
        const requestViewAll = normText(q.get('view') || '') === 'all'
        const getVisibilityByOperator = async (operator: string, userId?: string) => {
          const op = normText(operator)
          const uid = normText(userId)
          if (!op && !uid) return { isSuperAdmin: false, shouldScopeTeam: false, teamName: '' }
          const usersQuery = supabase.from('users').select('role_id, team_id')
          const { data: usersData } = uid
            ? await usersQuery.eq('id', uid).limit(1)
            : await usersQuery.eq('real_name', op).limit(1)
          const u = (usersData || [])[0] as any
          if (!u) return { isSuperAdmin: false, shouldScopeTeam: false, teamName: '' }
          let roleName = ''
          let teamName = ''
          if (u.role_id) {
            const { data: roleData } = await supabase.from('roles').select('name').eq('id', String(u.role_id)).limit(1)
            roleName = String((roleData || [])[0]?.name || '')
          }
          if (u.team_id) {
            const { data: teamData } = await supabase.from('teams').select('name').eq('id', String(u.team_id)).limit(1)
            teamName = String((teamData || [])[0]?.name || '')
          }
          const isSuperAdmin = roleName.includes('超级管理员')
          const shouldScopeTeam = !isSuperAdmin && !!normText(teamName)
          return {
            isSuperAdmin,
            shouldScopeTeam,
            teamName: normText(teamName)
          }
        }
        const visibility = await getVisibilityByOperator(requestOperator, requestUserId)
        const forcedGroup = normText(q.get('tech_group') || '')
        const [usersTeamRes, teamsRes] = await Promise.all([
          supabase.from('users').select('real_name,team_id'),
          supabase.from('teams').select('id,name')
        ])
        const teamNameById = new Map<string, string>()
        for (const t of (teamsRes.data || [])) {
          teamNameById.set(String((t as any).id), normText((t as any).name))
        }
        const teamNameByOperator = new Map<string, string>()
        for (const u of (usersTeamRes.data || [])) {
          const operator = normText((u as any).real_name)
          const teamName = teamNameById.get(String((u as any).team_id || '')) || ''
          if (operator) teamNameByOperator.set(operator, teamName)
        }
        const resolveRowTeam = (row: any) => {
          const direct = normText(row?.tech_group)
          if (direct) return direct
          return teamNameByOperator.get(normText(row?.operator)) || ''
        }
        const canViewRow = (row: any) => {
          const rowTeam = resolveRowTeam(row)
          if (forcedGroup) return rowTeam === forcedGroup
          if (requestViewAll) return true
          if (!visibility.shouldScopeTeam) return true
          return rowTeam === visibility.teamName
        }
        const canOperateRow = (row: any, opVisibility: { isSuperAdmin: boolean; shouldScopeTeam: boolean; teamName: string }) => {
          if (opVisibility.isSuperAdmin) return true
          const rowTeam = resolveRowTeam(row)
          if (!opVisibility.shouldScopeTeam) return true
          return !!rowTeam && rowTeam === opVisibility.teamName
        }
        const keyOf = (r: any) => `${normText(r.name)}|${normText(r.spec_model)}|${normText(r.location)}|${normText(r.unit)}`
        const calcAverageMonthlyUsage = (totalQty: number, minDate: string | null, maxDate: string | null) => {
          if (!minDate || !maxDate || totalQty <= 0) return 0
          const start = new Date(`${minDate}T00:00:00`)
          const end = new Date(`${maxDate}T00:00:00`)
          const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1)
          return totalQty / months
        }

        if (method === 'GET' && path === '/api/standard-parts/inbound') {
          const { data, error } = await supabase
            .from('standard_part_inbound')
            .select('*')
            .order('in_date', { ascending: false })
            .order('created_at', { ascending: false })
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const items = (data || []).filter((r: any) =>
            !excludedStatuses.includes(String(r.status || ''))
            && canViewRow(r)
          )
          return jsonResponse({ success: true, items })
        }

        if (method === 'GET' && path === '/api/standard-parts/outbound') {
          const { data, error } = await supabase
            .from('standard_part_outbound')
            .select('*')
            .order('out_date', { ascending: false })
            .order('created_at', { ascending: false })
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const items = (data || []).filter((r: any) =>
            !excludedStatuses.includes(String(r.status || ''))
            && canViewRow(r)
          )
          return jsonResponse({ success: true, items })
        }

        if (method === 'GET' && path === '/api/standard-parts/stock-ledger') {
          const [inRes, outRes] = await Promise.all([
            supabase.from('standard_part_inbound').select('name,spec_model,tech_group,location,unit,unit_price,quantity,status,in_date,operator,created_at'),
            supabase.from('standard_part_outbound').select('name,spec_model,tech_group,location,unit,unit_price,quantity,status,out_date,operator,created_at')
          ])
          if (inRes.error) return jsonResponse({ success: false, error: inRes.error.message }, 500)
          if (outRes.error) return jsonResponse({ success: false, error: outRes.error.message }, 500)
          const inboundRows = (inRes.data || []).filter((r: any) =>
            !excludedStatuses.includes(String(r.status || ''))
            && canViewRow(r)
          )
          const outboundRows = (outRes.data || []).filter((r: any) =>
            !excludedStatuses.includes(String(r.status || ''))
            && canViewRow(r)
          )

          const inboundMap = new Map<string, any>()
          for (const row of inboundRows) {
            const key = keyOf(row)
            const prev = inboundMap.get(key) || {
              name: normText(row.name),
              spec_model: normText(row.spec_model),
              location: normText(row.location),
              unit: normText(row.unit),
              inbound_total: 0,
              unit_price: 0,
              operator: '',
              latest_at: ''
            }
            prev.inbound_total += toNum(row.quantity)
            prev.unit_price = Math.max(toNum(prev.unit_price), toNum(row.unit_price))
            const rowAt = normText(row.created_at) || `${normText(row.in_date)}T00:00:00`
            if (!prev.latest_at || rowAt >= prev.latest_at) {
              prev.latest_at = rowAt
              prev.operator = normText(row.operator)
            }
            inboundMap.set(key, prev)
          }

          const outboundMap = new Map<string, any>()
          for (const row of outboundRows) {
            const key = keyOf(row)
            const prev = outboundMap.get(key) || {
              name: normText(row.name),
              spec_model: normText(row.spec_model),
              location: normText(row.location),
              unit: normText(row.unit),
              outbound_total: 0,
              total_used_qty: 0,
              min_out_date: null as string | null,
              max_out_date: null as string | null,
              operator: '',
              latest_at: ''
            }
            prev.outbound_total += toNum(row.quantity)
            prev.total_used_qty += toNum(row.quantity)
            const d = normText(row.out_date)
            if (d) {
              if (!prev.min_out_date || d < prev.min_out_date) prev.min_out_date = d
              if (!prev.max_out_date || d > prev.max_out_date) prev.max_out_date = d
            }
            const rowAt = normText(row.created_at) || `${normText(row.out_date)}T00:00:00`
            if (!prev.latest_at || rowAt >= prev.latest_at) {
              prev.latest_at = rowAt
              prev.operator = normText(row.operator)
            }
            outboundMap.set(key, prev)
          }

          const mergedKeys = new Set<string>([...inboundMap.keys(), ...outboundMap.keys()])
          const items = Array.from(mergedKeys).map((k) => {
            const i = inboundMap.get(k) || {}
            const o = outboundMap.get(k) || {}
            const inboundTotal = toNum(i.inbound_total)
            const outboundTotal = toNum(o.outbound_total)
            const balance = inboundTotal - outboundTotal
            const unitPrice = toNum(i.unit_price)
            const avgMonthly = calcAverageMonthlyUsage(toNum(o.total_used_qty), o.min_out_date || null, o.max_out_date || null)
            const iAt = normText(i.latest_at)
            const oAt = normText(o.latest_at)
            const operator = oAt >= iAt ? normText(o.operator) : normText(i.operator)
            return {
              name: normText(i.name || o.name),
              spec_model: normText(i.spec_model || o.spec_model),
              tech_group: '',
              location: normText(i.location || o.location),
              inbound_total: inboundTotal,
              outbound_total: outboundTotal,
              balance,
              unit: normText(i.unit || o.unit),
              unit_price: unitPrice,
              total_amount: unitPrice * balance,
              safety_stock: avgMonthly,
              max_stock: avgMonthly * 3,
              operator
            }
          }).sort((a, b) =>
            String(a.name).localeCompare(String(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
            || String(a.spec_model).localeCompare(String(b.spec_model), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
            || String(a.location).localeCompare(String(b.location), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
          )
          return jsonResponse({ success: true, items })
        }

        if (method === 'POST' && path === '/api/standard-parts/inbound/batch') {
          const body = await readBody()
          const items = Array.isArray(body?.items) ? body.items : []
          if (items.length === 0) return jsonResponse({ success: false, error: '缺少入库数据' }, 400)
          const writeOperator = normText(body?.operator) || normText(items?.[0]?.operator) || requestOperator
          const writeVisibility = await getVisibilityByOperator(writeOperator)
          const payload = items.map((raw: any) => ({
            name: normText(raw?.name),
            spec_model: normText(raw?.spec_model),
            tech_group: writeVisibility.shouldScopeTeam ? writeVisibility.teamName : normText(raw?.tech_group),
            location: normText(raw?.location),
            quantity: toNum(raw?.quantity),
            unit: normText(raw?.unit),
            unit_price: toNum(raw?.unit_price),
            in_date: normText(raw?.in_date) || today(),
            operator: normText(raw?.operator),
            status: normText(raw?.status) || '正常'
          }))
          const bad = payload.find((x: any) => !x.name || !x.spec_model || !x.location || !x.unit || x.quantity < 0)
          if (bad) return jsonResponse({ success: false, error: '入库数据不完整，名称/规格/库位/单位为必填，数量不能小于0' }, 400)
          const { data, error } = await scopedClient.from('standard_part_inbound').insert(payload).select('*')
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, items: data || [] })
        }

        if (method === 'POST' && path === '/api/standard-parts/outbound/batch') {
          const body = await readBody()
          const items = Array.isArray(body?.items) ? body.items : []
          if (items.length === 0) return jsonResponse({ success: false, error: '缺少出库数据' }, 400)
          const writeOperator = normText(body?.operator) || normText(items?.[0]?.operator) || requestOperator
          const writeVisibility = await getVisibilityByOperator(writeOperator)

          const [inRes, outRes] = await Promise.all([
            scopedClient.from('standard_part_inbound').select('name,spec_model,location,unit,quantity,status'),
            scopedClient.from('standard_part_outbound').select('name,spec_model,location,unit,quantity,status')
          ])
          if (inRes.error) return jsonResponse({ success: false, error: inRes.error.message }, 500)
          if (outRes.error) return jsonResponse({ success: false, error: outRes.error.message }, 500)
          const balMap = new Map<string, number>()
          for (const r of (inRes.data || [])) {
            if (excludedStatuses.includes(String(r.status || ''))) continue
            const k = keyOf(r)
            balMap.set(k, toNum(balMap.get(k)) + toNum(r.quantity))
          }
          for (const r of (outRes.data || [])) {
            if (excludedStatuses.includes(String(r.status || ''))) continue
            const k = keyOf(r)
            balMap.set(k, toNum(balMap.get(k)) - toNum(r.quantity))
          }

          const payload: any[] = []
          for (const raw of items) {
            const row = {
              name: normText(raw?.name),
              spec_model: normText(raw?.spec_model),
              tech_group: writeVisibility.shouldScopeTeam ? writeVisibility.teamName : normText(raw?.tech_group),
              location: normText(raw?.location),
              quantity: toNum(raw?.quantity),
              unit: normText(raw?.unit),
              unit_price: toNum(raw?.unit_price),
              out_date: normText(raw?.out_date) || today(),
              operator: normText(raw?.operator),
              status: normText(raw?.status) || '正常'
            }
            if (!row.name || !row.spec_model || !row.location || !row.unit || row.quantity <= 0) {
              return jsonResponse({ success: false, error: '出库数据不完整，名称/规格/库位/单位/数量为必填' }, 400)
            }
            const k = keyOf(row)
            const current = toNum(balMap.get(k))
            if (row.quantity > current) {
              return jsonResponse({ success: false, error: `${row.name} ${row.spec_model} 在 ${row.location} 库存不足，当前结余 ${current}` }, 400)
            }
            balMap.set(k, current - row.quantity)
            payload.push(row)
          }
          const { data, error } = await scopedClient.from('standard_part_outbound').insert(payload).select('*')
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, items: data || [] })
        }

        if (method === 'POST' && path === '/api/standard-parts/inbound/delete') {
          const body = await readBody()
          const ids = Array.isArray(body?.ids) ? body.ids : []
          if (ids.length === 0) return jsonResponse({ success: false, error: '请选择要删除的数据' }, 400)
          const opVisibility = await getVisibilityByOperator(normText(body?.operator), normText(body?.userId))
          const { data: selected, error: selErr } = await scopedClient
            .from('standard_part_inbound')
            .select('*')
            .in('id', ids as any)
          if (selErr) return jsonResponse({ success: false, error: selErr.message }, 500)
          const rows = selected || []
          if (rows.some((r: any) => !canOperateRow(r, opVisibility))) {
            return jsonResponse({ success: false, error: '仅允许操作本组数据' }, 403)
          }
          const { error } = await scopedClient
            .from('standard_part_inbound')
            .update({ status: '已删除', updated_at: new Date().toISOString() })
            .in('id', ids as any)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }

        if (method === 'POST' && path === '/api/standard-parts/outbound/delete') {
          const body = await readBody()
          const ids = Array.isArray(body?.ids) ? body.ids : []
          if (ids.length === 0) return jsonResponse({ success: false, error: '请选择要删除的数据' }, 400)
          const opVisibility = await getVisibilityByOperator(normText(body?.operator), normText(body?.userId))
          const { data: selected, error: selErr } = await scopedClient
            .from('standard_part_outbound')
            .select('*')
            .in('id', ids as any)
          if (selErr) return jsonResponse({ success: false, error: selErr.message }, 500)
          const rows = selected || []
          if (rows.some((r: any) => !canOperateRow(r, opVisibility))) {
            return jsonResponse({ success: false, error: '仅允许操作本组数据' }, 403)
          }
          const { error } = await scopedClient
            .from('standard_part_outbound')
            .update({ status: '已删除', updated_at: new Date().toISOString() })
            .in('id', ids as any)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }

        if (method === 'POST' && path === '/api/standard-parts/inbound/return') {
          const body = await readBody()
          const ids = Array.isArray(body?.ids) ? body.ids : []
          const operator = normText(body?.operator)
          if (ids.length === 0) return jsonResponse({ success: false, error: '请选择要退库的数据' }, 400)
          const { data: selected, error: selectErr } = await scopedClient
            .from('standard_part_inbound')
            .select('*')
            .in('id', ids as any)
            .neq('status', '已删除')
          if (selectErr) return jsonResponse({ success: false, error: selectErr.message }, 500)
          const rows = (selected || []).filter((x: any) => String(x.status || '') !== '已退库')
          if (rows.length > 0) {
            const inserts = rows.map((r: any) => ({
              name: r.name,
              spec_model: r.spec_model,
              tech_group: r.tech_group || '',
              location: r.location,
              quantity: toNum(r.quantity),
              unit: r.unit,
              unit_price: toNum(r.unit_price),
              out_date: today(),
              operator: operator || normText(r.operator),
              status: '退库',
              source_inbound_id: r.id
            }))
            const { error: insertErr } = await scopedClient.from('standard_part_outbound').insert(inserts)
            if (insertErr) return jsonResponse({ success: false, error: insertErr.message }, 500)
            const { error: updateErr } = await scopedClient
              .from('standard_part_inbound')
              .update({ status: '已退库', updated_at: new Date().toISOString() })
              .in('id', rows.map((x: any) => x.id) as any)
            if (updateErr) return jsonResponse({ success: false, error: updateErr.message }, 500)
          }
          return jsonResponse({ success: true })
        }

        if (method === 'POST' && path === '/api/standard-parts/outbound/return') {
          const body = await readBody()
          const ids = Array.isArray(body?.ids) ? body.ids : []
          const operator = normText(body?.operator)
          if (ids.length === 0) return jsonResponse({ success: false, error: '请选择要退库的数据' }, 400)
          const { data: selected, error: selectErr } = await scopedClient
            .from('standard_part_outbound')
            .select('*')
            .in('id', ids as any)
            .neq('status', '已删除')
          if (selectErr) return jsonResponse({ success: false, error: selectErr.message }, 500)
          const rows = (selected || []).filter((x: any) => String(x.status || '') !== '已退库')
          if (rows.length > 0) {
            const inserts = rows.map((r: any) => ({
              name: r.name,
              spec_model: r.spec_model,
              tech_group: r.tech_group || '',
              location: r.location,
              quantity: toNum(r.quantity),
              unit: r.unit,
              unit_price: toNum(r.unit_price),
              in_date: today(),
              operator: operator || normText(r.operator),
              status: '退库入库',
              source_outbound_id: r.id
            }))
            const { error: insertErr } = await scopedClient.from('standard_part_inbound').insert(inserts)
            if (insertErr) return jsonResponse({ success: false, error: insertErr.message }, 500)
            const { error: updateErr } = await scopedClient
              .from('standard_part_outbound')
              .update({ status: '已退库', updated_at: new Date().toISOString() })
              .in('id', rows.map((x: any) => x.id) as any)
            if (updateErr) return jsonResponse({ success: false, error: updateErr.message }, 500)
          }
          return jsonResponse({ success: true })
        }
      }

      // Material assets
      if (path.startsWith('/api/material-assets')) {
        const normTextSafe = (v: any) => String(v || '').trim()
        const nowIso = () => new Date().toISOString()
        const normalizeDateInput = (value: any) => {
          const text = normTextSafe(value)
          return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
        }
        const normalizeRemindDays = (value: any) => {
          const num = Math.floor(Number(value))
          return Number.isFinite(num) && num >= 0 ? num : 30
        }
        const toDayStart = (value: Date | string) => {
          const date = value instanceof Date ? new Date(value) : new Date(value)
          if (Number.isNaN(date.getTime())) return null
          date.setHours(0, 0, 0, 0)
          return date
        }
        const getCertificateMeta = (asset: any) => {
          const expireDate = normalizeDateInput(asset?.certificate_expire_date)
          const remindDays = normalizeRemindDays(asset?.certificate_remind_days)
          if (!expireDate) {
            return {
              certificate_expire_date: null,
              certificate_remind_days: remindDays,
              last_certificate_reminded_at: asset?.last_certificate_reminded_at || null,
              certificate_status: '未维护',
              certificate_remaining_days: null,
              certificate_need_reminder: normTextSafe(asset?.asset_status) !== '报废'
            }
          }
          const today = toDayStart(new Date())!
          const target = toDayStart(expireDate)!
          const remainingDays = Math.ceil((target.getTime() - today.getTime()) / 86400000)
          const status = remainingDays < 0 ? '过期' : remainingDays <= remindDays ? '临期' : '有效'
          const needReminder = normTextSafe(asset?.asset_status) !== '报废' && status === '过期'
          return {
            certificate_expire_date: expireDate,
            certificate_remind_days: remindDays,
            last_certificate_reminded_at: asset?.last_certificate_reminded_at || null,
            certificate_status: status,
            certificate_remaining_days: remainingDays,
            certificate_need_reminder: needReminder
          }
        }
        const withCertificateMeta = (asset: any) => ({
          ...asset,
          ...getCertificateMeta(asset)
        })
        const isManagerRole = (roleName: string) => {
          const normalized = normTextSafe(roleName)
          return normalized.includes('超级管理员')
            || normalized.includes('库管')
            || normalized.includes('仓管')
            || normalized.includes('库房')
        }
        const getActor = async (userIdInput?: any, operatorInput?: any) => {
          const userId = normTextSafe(userIdInput)
          const operator = normTextSafe(operatorInput)
          let userRow: any = null
          if (userId) {
            const { data } = await supabase.from('users').select('id, real_name, role_id').eq('id', userId).limit(1)
            userRow = (data || [])[0] || null
          } else if (operator) {
            const { data } = await supabase.from('users').select('id, real_name, role_id').eq('real_name', operator).limit(1)
            userRow = (data || [])[0] || null
          }
          let roleName = ''
          if (userRow?.role_id) {
            const { data: roleRows } = await supabase.from('roles').select('name').eq('id', String(userRow.role_id)).limit(1)
            roleName = String((roleRows || [])[0]?.name || '')
          }
          return {
            userId: normTextSafe(userRow?.id || userId),
            actorName: normTextSafe(userRow?.real_name || operator),
            roleName,
            isManager: isManagerRole(roleName)
          }
        }
        const resolveUser = async (userIdInput?: any, userNameInput?: any) => {
          const userId = normTextSafe(userIdInput)
          const userName = normTextSafe(userNameInput)
          if (userId) {
            const { data } = await supabase.from('users').select('id, real_name').eq('id', userId).limit(1)
            const row = (data || [])[0]
            if (row) {
              return {
                userId: normTextSafe((row as any).id),
                realName: normTextSafe((row as any).real_name)
              }
            }
          }
          if (userName) {
            const { data } = await supabase.from('users').select('id, real_name').eq('real_name', userName).limit(1)
            const row = (data || [])[0]
            if (row) {
              return {
                userId: normTextSafe((row as any).id),
                realName: normTextSafe((row as any).real_name)
              }
            }
          }
          return { userId, realName: userName }
        }
        const insertHistory = async (payload: any) => {
          const { error } = await scopedClient.from('measure_tool_asset_histories').insert(payload)
          if (error) throw error
        }
        const loadAsset = async (assetId: string) => {
          const { data, error } = await scopedClient.from('measure_tool_assets').select('*').eq('id', assetId).single()
          if (error) throw error
          return data
        }
        const canMatchActor = (asset: any, actor: any, fieldName: 'responsible' | 'pending') => {
          if (actor.isManager) return true
          if (fieldName === 'responsible') {
            return (
              (actor.userId && actor.userId === normTextSafe(asset?.responsible_user_id))
              || (actor.actorName && actor.actorName === normTextSafe(asset?.responsible_person))
            )
          }
          return (
            (actor.userId && actor.userId === normTextSafe(asset?.pending_responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(asset?.pending_responsible_person))
          )
        }

        if (method === 'GET' && path === '/api/material-assets/ledger') {
          const qs = getQuery(cleanUrl)
          const search = normTextSafe(qs.get('search') || '').toLowerCase()
          const assetStatus = normTextSafe(qs.get('assetStatus') || '')
          const responsibilityStatus = normTextSafe(qs.get('responsibilityStatus') || '')
          const scrapStatus = normTextSafe(qs.get('scrapStatus') || '')
          const certificateStatus = normTextSafe(qs.get('certificateStatus') || '')
          const page = Math.max(Number(qs.get('page') || '1') || 1, 1)
          const pageSize = Math.max(Number(qs.get('pageSize') || '200') || 200, 1)
          const [assetsRes, historiesRes] = await Promise.all([
            scopedClient.from('measure_tool_assets').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
            scopedClient.from('measure_tool_asset_histories').select('asset_id')
          ])
          if (assetsRes.error) return jsonResponse({ success: false, error: assetsRes.error.message }, 500)
          if (historiesRes.error) return jsonResponse({ success: false, error: historiesRes.error.message }, 500)
          const historyCountMap = new Map<string, number>()
          ;(historiesRes.data || []).forEach((row: any) => {
            const key = normTextSafe(row?.asset_id)
            historyCountMap.set(key, Number(historyCountMap.get(key) || 0) + 1)
          })
          let items = (assetsRes.data || []).filter((row: any) => {
            const textHit = !search || [
              row?.name,
              row?.code,
              row?.model_spec,
              row?.responsible_person,
              row?.pending_responsible_person,
              row?.borrower_name,
              row?.remark,
              row?.scrap_reason,
              row?.borrow_note,
              row?.borrow_return_note
            ].some((v) => String(v || '').toLowerCase().includes(search))
            const assetHit = !assetStatus || normTextSafe(row?.asset_status) === assetStatus
            const responsibilityHit = !responsibilityStatus || normTextSafe(row?.responsibility_status) === responsibilityStatus
            const scrapHit = !scrapStatus || normTextSafe(row?.scrap_status) === scrapStatus
            const certMeta = getCertificateMeta(row)
            const certificateHit = !certificateStatus || normTextSafe(certMeta.certificate_status) === certificateStatus
            return textHit && assetHit && responsibilityHit && scrapHit && certificateHit
          }).map((row: any) => ({
            ...row,
            ...getCertificateMeta(row),
            history_count: Number(historyCountMap.get(normTextSafe(row?.id)) || 0)
          }))
          const total = items.length
          const start = (page - 1) * pageSize
          items = items.slice(start, start + pageSize)
          return jsonResponse({ success: true, items, total, page, pageSize })
        }

        if (method === 'GET' && path === '/api/material-assets/mine') {
          const qs = getQuery(cleanUrl)
          const actor = await getActor(qs.get('userId') || '', qs.get('operator') || '')
          if (!actor.userId && !actor.actorName) return jsonResponse({ success: false, error: '缺少当前用户信息' }, 400)
          const { data, error } = await scopedClient
            .from('measure_tool_assets')
            .select('*')
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const rows = data || []
          const ownedItems = rows.filter((row: any) =>
            (actor.userId && actor.userId === normTextSafe(row?.responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(row?.responsible_person))
          ).map(withCertificateMeta)
          const pendingConfirmItems = rows.filter((row: any) =>
            ['待确认', '待转移确认'].includes(normTextSafe(row?.responsibility_status))
            && (
              (actor.userId && actor.userId === normTextSafe(row?.pending_responsible_user_id))
              || (actor.actorName && actor.actorName === normTextSafe(row?.pending_responsible_person))
            )
          ).map(withCertificateMeta)
          const borrowedItems = rows.filter((row: any) =>
            ['借用中', '待归还确认'].includes(normTextSafe(row?.borrow_status))
            && (
              (actor.userId && actor.userId === normTextSafe(row?.borrower_user_id))
              || (actor.actorName && actor.actorName === normTextSafe(row?.borrower_name))
            )
          ).map(withCertificateMeta)
          return jsonResponse({ success: true, ownedItems, pendingConfirmItems, borrowedItems })
        }

        if (method === 'GET' && path === '/api/material-assets/reminder-summary') {
          const qs = getQuery(cleanUrl)
          const actor = await getActor(qs.get('userId') || '', qs.get('operator') || '')
          const { data, error } = await scopedClient
            .from('measure_tool_assets')
            .select('*')
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const rows = data || []
          const allItems = rows.map(withCertificateMeta)
          const mineItems = rows.filter((row: any) =>
            (actor.userId && actor.userId === normTextSafe(row?.responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(row?.responsible_person))
            || (actor.userId && actor.userId === normTextSafe(row?.pending_responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(row?.pending_responsible_person))
            || (actor.userId && actor.userId === normTextSafe(row?.borrower_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(row?.borrower_name))
          ).map(withCertificateMeta)
          const summarize = (items: any[]) => {
            const pending = items.filter((item) => normTextSafe(item?.responsibility_status) === '待确认').length
            const expired = items.filter((item) => item.certificate_status === '过期').length
            const missing = items.filter((item) => item.certificate_status === '未维护').length
            const total = pending + expired + missing
            return { total, pending, expired, missing }
          }
          return jsonResponse({ success: true, ledger: summarize(allItems), mine: summarize(mineItems) })
        }

        if (method === 'GET' && /^\/api\/material-assets\/[^/]+\/history$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/history$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const { data, error } = await scopedClient
            .from('measure_tool_asset_histories')
            .select('*')
            .eq('asset_id', assetId)
            .order('created_at', { ascending: false })
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, items: data || [] })
        }

        if (method === 'POST' && path === '/api/material-assets') {
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const name = normTextSafe(body?.name)
          const code = normTextSafe(body?.code)
          const modelSpec = normTextSafe(body?.model_spec)
          const certificateExpireDate = normalizeDateInput(body?.certificate_expire_date)
          const certificateRemindDays = normalizeRemindDays(body?.certificate_remind_days)
          const isManagerCreate = actor.isManager
          const responsibleInput = isManagerCreate ? normTextSafe(body?.responsible_person) : normTextSafe(actor.actorName)
          const remark = normTextSafe(body?.remark)
          const assetStatus = isManagerCreate && normTextSafe(body?.asset_status) === '报废' ? '报废' : '在用'
          if (!name || !code || !responsibleInput) return jsonResponse({ success: false, error: '名称、编号、责任人不能为空' }, 400)
          if (!isManagerCreate && !actor.userId && !actor.actorName) {
            return jsonResponse({ success: false, error: '缺少当前用户信息，无法新增量具' }, 400)
          }
          const resolvedUser = isManagerCreate
            ? await resolveUser(body?.responsible_user_id, responsibleInput)
            : { userId: actor.userId, realName: actor.actorName }
          const payload = {
            name,
            code,
            model_spec: modelSpec,
            responsible_person: isManagerCreate ? '' : (resolvedUser.realName || responsibleInput),
            responsible_user_id: isManagerCreate ? '' : resolvedUser.userId,
            pending_responsible_person: isManagerCreate ? (resolvedUser.realName || responsibleInput) : '',
            pending_responsible_user_id: isManagerCreate ? resolvedUser.userId : '',
            responsibility_status: isManagerCreate ? '待确认' : '已确认',
            asset_status: assetStatus,
            scrap_status: assetStatus === '报废' ? '已报废' : '无',
            scrap_reason: assetStatus === '报废' ? normTextSafe(body?.scrap_reason || body?.remark) : '',
            certificate_expire_date: certificateExpireDate,
            certificate_remind_days: certificateRemindDays,
            remark,
            created_by: actor.actorName,
            created_by_user_id: actor.userId
          }
          const { data, error } = await scopedClient.from('measure_tool_assets').insert(payload).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: data.id,
            action_type: 'create',
            action_label: isManagerCreate ? '新增量具' : '员工新增量具',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            target_name: resolvedUser.realName || responsibleInput,
            target_user_id: resolvedUser.userId,
            remark,
            detail_json: {
              name,
              code,
              model_spec: modelSpec,
              asset_status: assetStatus,
              certificate_expire_date: certificateExpireDate,
              create_mode: isManagerCreate ? 'manager_assign' : 'self_create'
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && path === '/api/material-assets/batch-import') {
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          if (!actor.isManager) return jsonResponse({ success: false, error: '仅库管或超级管理员可以导入量具' }, 403)
          const items = Array.isArray(body?.items) ? body.items : []
          if (!items.length) return jsonResponse({ success: false, error: '缺少导入数据' }, 400)
          const payload: any[] = []
          for (const raw of items) {
            const name = normTextSafe(raw?.name)
            const code = normTextSafe(raw?.code)
            const modelSpec = normTextSafe(raw?.model_spec)
            const responsibleInput = normTextSafe(raw?.responsible_person)
            const certificateExpireDate = normalizeDateInput(raw?.certificate_expire_date)
            const certificateRemindDays = normalizeRemindDays(raw?.certificate_remind_days)
            const remark = normTextSafe(raw?.remark)
            const assetStatus = normTextSafe(raw?.asset_status) === '报废' ? '报废' : '在用'
            if (!name || !code || !responsibleInput) {
              return jsonResponse({ success: false, error: `编号 ${code || '-'} 的名称、编号、责任人不能为空` }, 400)
            }
            const resolvedUser = await resolveUser(raw?.responsible_user_id, responsibleInput)
            payload.push({
              name,
              code,
              model_spec: modelSpec,
              responsible_person: '',
              responsible_user_id: '',
              pending_responsible_person: resolvedUser.realName || responsibleInput,
              pending_responsible_user_id: resolvedUser.userId,
              responsibility_status: '待确认',
              asset_status: assetStatus,
              scrap_status: assetStatus === '报废' ? '已报废' : '无',
              scrap_reason: assetStatus === '报废' ? normTextSafe(raw?.scrap_reason || raw?.remark) : '',
              certificate_expire_date: certificateExpireDate,
              certificate_remind_days: certificateRemindDays,
              remark,
              created_by: actor.actorName,
              created_by_user_id: actor.userId
            })
          }
          const { data, error } = await scopedClient.from('measure_tool_assets').insert(payload).select('*')
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          for (const row of (data || [])) {
            await insertHistory({
              asset_id: row.id,
              action_type: 'import',
              action_label: 'Excel导入',
              operator_name: actor.actorName,
              operator_user_id: actor.userId,
              target_name: normTextSafe(row.pending_responsible_person),
              target_user_id: normTextSafe(row.pending_responsible_user_id),
              remark: normTextSafe(row.remark),
              detail_json: {
                name: normTextSafe(row.name),
                code: normTextSafe(row.code),
                model_spec: normTextSafe(row.model_spec),
                asset_status: normTextSafe(row.asset_status),
                certificate_expire_date: normalizeDateInput(row.certificate_expire_date)
              }
            })
          }
          return jsonResponse({ success: true, items: data || [], count: (data || []).length })
        }

        if (method === 'PUT' && /^\/api\/material-assets\/[^/]+$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          if (!actor.isManager) return jsonResponse({ success: false, error: '仅库管或超级管理员可以编辑量具基础信息' }, 403)
          const existing = await loadAsset(assetId)
          const payload = {
            name: normTextSafe(body?.name),
            code: normTextSafe(body?.code),
            model_spec: normTextSafe(body?.model_spec),
            certificate_expire_date: normalizeDateInput(body?.certificate_expire_date),
            certificate_remind_days: normalizeRemindDays(body?.certificate_remind_days),
            remark: normTextSafe(body?.remark),
            updated_at: nowIso()
          }
          if (!payload.name || !payload.code) return jsonResponse({ success: false, error: '名称、编号不能为空' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update(payload).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'edit_basic_info',
            action_label: '编辑基础信息',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            remark: payload.remark,
            detail_json: {
              before: {
                name: normTextSafe(existing?.name),
                code: normTextSafe(existing?.code),
                model_spec: normTextSafe(existing?.model_spec),
                certificate_expire_date: normalizeDateInput(existing?.certificate_expire_date),
                certificate_remind_days: normalizeRemindDays(existing?.certificate_remind_days),
                remark: normTextSafe(existing?.remark)
              },
              after: payload
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'PUT' && /^\/api\/material-assets\/[^/]+\/remark$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/remark$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          const canEdit = actor.isManager
            || (actor.userId && actor.userId === normTextSafe(asset?.responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(asset?.responsible_person))
            || (actor.userId && actor.userId === normTextSafe(asset?.pending_responsible_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(asset?.pending_responsible_person))
          if (!canEdit) return jsonResponse({ success: false, error: '仅责任人或库管可以修改备注' }, 403)
          const remark = normTextSafe(body?.remark)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            remark,
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'edit_remark',
            action_label: '修改备注',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            remark,
            detail_json: {
              before: normTextSafe(asset?.remark),
              after: remark
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'PUT' && /^\/api\/material-assets\/[^/]+\/certificate$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/certificate$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          const canEdit = canMatchActor(asset, { ...actor, isManager: false }, 'responsible')
          if (!canEdit) return jsonResponse({ success: false, error: '仅当前责任人可以维护有效期' }, 403)
          const payload = {
            certificate_expire_date: normalizeDateInput(body?.certificate_expire_date),
            certificate_remind_days: normalizeRemindDays(body?.certificate_remind_days),
            updated_at: nowIso()
          }
          const { data, error } = await scopedClient.from('measure_tool_assets').update(payload).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'edit_certificate',
            action_label: '维护有效期',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            target_name: normTextSafe(asset?.responsible_person),
            target_user_id: normTextSafe(asset?.responsible_user_id),
            detail_json: {
              before: {
                certificate_expire_date: normalizeDateInput(asset?.certificate_expire_date),
                certificate_remind_days: normalizeRemindDays(asset?.certificate_remind_days)
              },
              after: {
                certificate_expire_date: payload.certificate_expire_date,
                certificate_remind_days: payload.certificate_remind_days
              }
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'DELETE' && /^\/api\/material-assets\/[^/]+$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          if (!actor.isManager) return jsonResponse({ success: false, error: '仅库管或超级管理员可以删除量具' }, 403)
          const asset = await loadAsset(assetId)
          if (['借用中', '待归还确认'].includes(normTextSafe(asset?.borrow_status))) {
            return jsonResponse({ success: false, error: '借用中的量具不能删除，请先完成归还流程' }, 400)
          }
          const { error } = await scopedClient.from('measure_tool_assets').delete().eq('id', assetId)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/confirm-responsible$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/confirm-responsible$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (!normTextSafe(asset?.pending_responsible_person)) return jsonResponse({ success: false, error: '当前没有待确认责任人' }, 400)
          if (!canMatchActor(asset, actor, 'pending')) return jsonResponse({ success: false, error: '仅待确认责任人本人可以确认' }, 403)
          const updatePayload = {
            responsible_person: normTextSafe(asset?.pending_responsible_person) || actor.actorName,
            responsible_user_id: normTextSafe(asset?.pending_responsible_user_id) || actor.userId,
            pending_responsible_person: '',
            pending_responsible_user_id: '',
            responsibility_status: '已确认',
            updated_at: nowIso()
          }
          const { data, error } = await scopedClient.from('measure_tool_assets').update(updatePayload).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'confirm_responsible',
            action_label: '确认责任人',
            operator_name: actor.actorName || updatePayload.responsible_person,
            operator_user_id: actor.userId || updatePayload.responsible_user_id,
            target_name: updatePayload.responsible_person,
            target_user_id: updatePayload.responsible_user_id,
            detail_json: {
              previous_responsible_person: normTextSafe(asset?.responsible_person),
              confirmed_responsible_person: updatePayload.responsible_person
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/transfer$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/transfer$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (!canMatchActor(asset, actor, 'responsible')) return jsonResponse({ success: false, error: '仅当前责任人本人可以发起转移' }, 403)
          if (normTextSafe(asset?.asset_status) === '报废') return jsonResponse({ success: false, error: '已报废量具不能转移责任人' }, 400)
          const target = await resolveUser(body?.target_user_id, body?.target_name)
          if (!target.realName) return jsonResponse({ success: false, error: '请选择接收责任人' }, 400)
          if (
            target.realName === normTextSafe(asset?.responsible_person)
            || (target.userId && target.userId === normTextSafe(asset?.responsible_user_id))
          ) {
            return jsonResponse({ success: false, error: '不能转移给当前责任人本人' }, 400)
          }
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            pending_responsible_person: target.realName,
            pending_responsible_user_id: target.userId,
            responsibility_status: '待转移确认',
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'transfer_responsible',
            action_label: '发起责任人转移',
            operator_name: actor.actorName || normTextSafe(asset?.responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.responsible_user_id),
            target_name: target.realName,
            target_user_id: target.userId,
            remark: normTextSafe(body?.remark),
            detail_json: {
              from: normTextSafe(asset?.responsible_person),
              to: target.realName
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/borrow$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/borrow$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (!canMatchActor(asset, actor, 'responsible')) return jsonResponse({ success: false, error: '仅当前责任人本人可以登记借出' }, 403)
          if (normTextSafe(asset?.asset_status) === '报废') return jsonResponse({ success: false, error: '已报废量具不能借出' }, 400)
          if (normTextSafe(asset?.responsibility_status) !== '已确认') return jsonResponse({ success: false, error: '责任人未确认完成前不能借出' }, 400)
          if (normTextSafe(asset?.borrow_status) !== '无') return jsonResponse({ success: false, error: '该量具当前已有借用记录，请先完成归还流程' }, 400)
          const target = await resolveUser(body?.borrower_user_id, body?.borrower_name)
          if (!target.realName) return jsonResponse({ success: false, error: '请选择借用人' }, 400)
          if (
            target.realName === normTextSafe(asset?.responsible_person)
            || (target.userId && target.userId === normTextSafe(asset?.responsible_user_id))
          ) {
            return jsonResponse({ success: false, error: '责任人本人无需借用登记' }, 400)
          }
          const note = normTextSafe(body?.borrow_note)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            borrower_name: target.realName,
            borrower_user_id: target.userId,
            borrow_status: '借用中',
            borrow_note: note,
            borrow_return_note: '',
            borrowed_at: nowIso(),
            return_requested_at: null,
            returned_at: null,
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'borrow_register',
            action_label: '登记借出',
            operator_name: actor.actorName || normTextSafe(asset?.responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.responsible_user_id),
            target_name: target.realName,
            target_user_id: target.userId,
            remark: note,
            detail_json: {
              responsible_person: normTextSafe(asset?.responsible_person),
              borrower_name: target.realName
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/request-return$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/request-return$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.borrow_status) !== '借用中') return jsonResponse({ success: false, error: '当前量具没有可申请归还的借用记录' }, 400)
          const isBorrower = (
            (actor.userId && actor.userId === normTextSafe(asset?.borrower_user_id))
            || (actor.actorName && actor.actorName === normTextSafe(asset?.borrower_name))
          )
          if (!isBorrower && !actor.isManager) return jsonResponse({ success: false, error: '仅借用人本人可以申请归还' }, 403)
          const note = normTextSafe(body?.return_note)
          if (!note) return jsonResponse({ success: false, error: '请填写归还说明' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            borrow_status: '待归还确认',
            borrow_return_note: note,
            return_requested_at: nowIso(),
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'request_return',
            action_label: '申请归还',
            operator_name: actor.actorName || normTextSafe(asset?.borrower_name),
            operator_user_id: actor.userId || normTextSafe(asset?.borrower_user_id),
            target_name: normTextSafe(asset?.responsible_person),
            target_user_id: normTextSafe(asset?.responsible_user_id),
            remark: note,
            detail_json: {
              borrower_name: normTextSafe(asset?.borrower_name),
              responsible_person: normTextSafe(asset?.responsible_person)
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/confirm-return$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/confirm-return$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.borrow_status) !== '待归还确认') return jsonResponse({ success: false, error: '当前没有待确认的归还申请' }, 400)
          if (!canMatchActor(asset, actor, 'responsible')) return jsonResponse({ success: false, error: '仅当前责任人本人可以确认归还' }, 403)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            borrower_name: '',
            borrower_user_id: '',
            borrow_status: '无',
            borrow_note: '',
            borrow_return_note: '',
            borrowed_at: null,
            return_requested_at: null,
            returned_at: nowIso(),
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'confirm_return',
            action_label: '确认归还',
            operator_name: actor.actorName || normTextSafe(asset?.responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.responsible_user_id),
            target_name: normTextSafe(asset?.borrower_name),
            target_user_id: normTextSafe(asset?.borrower_user_id),
            remark: normTextSafe(asset?.borrow_return_note),
            detail_json: {
              borrower_name: normTextSafe(asset?.borrower_name),
              responsible_person: normTextSafe(asset?.responsible_person)
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/cancel-transfer$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/cancel-transfer$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.responsibility_status) !== '待转移确认') return jsonResponse({ success: false, error: '当前没有可撤销的转移申请' }, 400)
          if (!canMatchActor(asset, actor, 'responsible')) return jsonResponse({ success: false, error: '仅当前责任人本人可以撤销转移' }, 403)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            pending_responsible_person: '',
            pending_responsible_user_id: '',
            responsibility_status: '已确认',
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'cancel_transfer',
            action_label: '撤销责任人转移',
            operator_name: actor.actorName || normTextSafe(asset?.responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.responsible_user_id),
            target_name: normTextSafe(asset?.pending_responsible_person),
            target_user_id: normTextSafe(asset?.pending_responsible_user_id),
            detail_json: {
              canceled_target: normTextSafe(asset?.pending_responsible_person)
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/reject-transfer$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/reject-transfer$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.responsibility_status) !== '待转移确认') return jsonResponse({ success: false, error: '当前没有待拒绝的责任人转移' }, 400)
          if (!canMatchActor(asset, actor, 'pending')) return jsonResponse({ success: false, error: '仅待接收责任人本人可以拒绝接收' }, 403)
          const reason = normTextSafe(body?.reason)
          if (!reason) return jsonResponse({ success: false, error: '请填写拒绝原因' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            pending_responsible_person: '',
            pending_responsible_user_id: '',
            responsibility_status: '已确认',
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'reject_transfer',
            action_label: '拒绝接收责任人',
            operator_name: actor.actorName || normTextSafe(asset?.pending_responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.pending_responsible_user_id),
            target_name: normTextSafe(asset?.responsible_person),
            target_user_id: normTextSafe(asset?.responsible_user_id),
            remark: reason,
            detail_json: {
              rejected_target: normTextSafe(asset?.pending_responsible_person),
              reverted_to: normTextSafe(asset?.responsible_person),
              reason
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/scrap-request$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/scrap-request$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          const asset = await loadAsset(assetId)
          if (!canMatchActor(asset, actor, 'responsible')) return jsonResponse({ success: false, error: '仅当前责任人本人可以申请报废' }, 403)
          if (normTextSafe(asset?.asset_status) === '报废') return jsonResponse({ success: false, error: '该量具已报废' }, 400)
          const reason = normTextSafe(body?.reason)
          if (!reason) return jsonResponse({ success: false, error: '请填写报废原因' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            scrap_status: '待报废',
            scrap_reason: reason,
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'scrap_request',
            action_label: '申请报废',
            operator_name: actor.actorName || normTextSafe(asset?.responsible_person),
            operator_user_id: actor.userId || normTextSafe(asset?.responsible_user_id),
            remark: reason,
            detail_json: {
              reason
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/approve-scrap$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/approve-scrap$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          if (!actor.isManager) return jsonResponse({ success: false, error: '仅库管或超级管理员可以确认报废' }, 403)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.scrap_status) !== '待报废') return jsonResponse({ success: false, error: '当前没有待确认的报废申请' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            asset_status: '报废',
            scrap_status: '已报废',
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'approve_scrap',
            action_label: '确认报废',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            remark: normTextSafe(asset?.scrap_reason),
            detail_json: {
              reason: normTextSafe(asset?.scrap_reason)
            }
          })
          return jsonResponse({ success: true, item: data })
        }

        if (method === 'POST' && /^\/api\/material-assets\/[^/]+\/reject-scrap$/.test(path)) {
          const matched = path.match(/^\/api\/material-assets\/([^/]+)\/reject-scrap$/)
          const assetId = normTextSafe(matched?.[1] || '')
          const body = await readBody()
          const actor = await getActor(body?.userId, body?.operator)
          if (!actor.isManager) return jsonResponse({ success: false, error: '仅库管或超级管理员可以驳回报废申请' }, 403)
          const asset = await loadAsset(assetId)
          if (normTextSafe(asset?.scrap_status) !== '待报废') return jsonResponse({ success: false, error: '当前没有待驳回的报废申请' }, 400)
          const reason = normTextSafe(body?.reason)
          if (!reason) return jsonResponse({ success: false, error: '请填写驳回原因' }, 400)
          const { data, error } = await scopedClient.from('measure_tool_assets').update({
            scrap_status: '无',
            scrap_reason: '',
            updated_at: nowIso()
          }).eq('id', assetId).select('*').single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          await insertHistory({
            asset_id: assetId,
            action_type: 'reject_scrap',
            action_label: '驳回报废申请',
            operator_name: actor.actorName,
            operator_user_id: actor.userId,
            target_name: normTextSafe(asset?.responsible_person),
            target_user_id: normTextSafe(asset?.responsible_user_id),
            remark: reason,
            detail_json: {
              original_reason: normTextSafe(asset?.scrap_reason),
              reject_reason: reason
            }
          })
          return jsonResponse({ success: true, item: data })
        }
      }

      // Manual purchase plans (临时计划)
      if (path.startsWith('/api/manual-plans')) {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('manual_purchase_plans')
            .select('*')
            .order('created_date', { ascending: false })
          if (error) {
            console.error('Error fetching manual_purchase_plans:', error)
            return jsonResponse({ data: [] })
          }
          return jsonResponse({ data: data || [] })
        }
        if (method === 'POST' && path === '/api/manual-plans/batch-delete') {
          const body = await readBody()
          const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
          if (!ids.length) return jsonResponse({ success: false, error: '缺少ids' }, 400)
          const { error } = await supabase.from('manual_purchase_plans').delete().in('id', ids)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        if (method === 'POST' && path === '/api/manual-plans') {
          const body = await readBody()
          const payload: any = {
            inventory_number: String(body.inventory_number || ''),
            project_name: String(body.project_name || ''),
            part_name: String(body.part_name || ''),
            part_quantity: body.part_quantity == null || body.part_quantity === '' ? null : Number(body.part_quantity),
            unit: String(body.unit || '件'),
            model: String(body.model || ''),
            supplier: String(body.supplier || body.production_unit || ''),
            required_date: String(body.required_date || '') || null,
            remark: String(body.remark || ''),
            status: String(body.status || 'draft'),
            created_date: String(body.created_date || '') || null,
            updated_date: String(body.updated_date || '') || null,
            production_unit: String(body.production_unit || ''),
            demand_date: String(body.demand_date || '') || null,
            applicant: String(body.applicant || '')
          }
          const { data, error } = await supabase
            .from('manual_purchase_plans')
            .insert(payload)
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data })
        }
        const mp = path.match(/^\/api\/manual-plans\/([^\/]+)$/)
        if (mp && method === 'PUT') {
          const id = mp[1]
          const body = await readBody()
          const updateData: any = {}
          if (Object.prototype.hasOwnProperty.call(body, 'inventory_number')) updateData.inventory_number = String(body.inventory_number || '')
          if (Object.prototype.hasOwnProperty.call(body, 'project_name')) updateData.project_name = String(body.project_name || '')
          if (Object.prototype.hasOwnProperty.call(body, 'part_name')) updateData.part_name = String(body.part_name || '')
          if (Object.prototype.hasOwnProperty.call(body, 'part_quantity')) updateData.part_quantity = body.part_quantity == null || body.part_quantity === '' ? null : Number(body.part_quantity)
          if (Object.prototype.hasOwnProperty.call(body, 'unit')) updateData.unit = String(body.unit || '')
          if (Object.prototype.hasOwnProperty.call(body, 'model')) updateData.model = String(body.model || '')
          if (Object.prototype.hasOwnProperty.call(body, 'supplier')) updateData.supplier = String(body.supplier || '')
          if (Object.prototype.hasOwnProperty.call(body, 'required_date')) updateData.required_date = String(body.required_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'remark')) updateData.remark = String(body.remark || '')
          if (Object.prototype.hasOwnProperty.call(body, 'status')) updateData.status = String(body.status || '')
          if (Object.prototype.hasOwnProperty.call(body, 'created_date')) updateData.created_date = String(body.created_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'updated_date')) updateData.updated_date = String(body.updated_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'production_unit')) updateData.production_unit = String(body.production_unit || '')
          if (Object.prototype.hasOwnProperty.call(body, 'demand_date')) updateData.demand_date = String(body.demand_date || '') || null
          if (Object.prototype.hasOwnProperty.call(body, 'applicant')) updateData.applicant = String(body.applicant || '')
          const { error } = await supabase
            .from('manual_purchase_plans')
            .update(updateData)
            .eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

      // ========== 临时计划分组 API ==========
      if (path.startsWith('/api/temporary-plan-groups')) {
        if (method === 'GET' && path === '/api/temporary-plan-groups') {
          const { data, error } = await supabase
            .from('temporary_plan_groups')
            .select('*')
            .order('created_at', { ascending: true })
          if (error) {
            console.error('Error fetching temporary_plan_groups:', error)
            return jsonResponse({ data: [] })
          }
          return jsonResponse({ data: data || [] })
        }
        if (method === 'POST' && path === '/api/temporary-plan-groups') {
          const body = await readBody()
          const payload: any = {
            code: String(body.code || ''),
            month_key: String(body.month_key || ''),
            items: body.items || [],
            created_by: String(body.created_by || ''),
            created_at: new Date().toISOString()
          }
          const { data, error } = await supabase
            .from('temporary_plan_groups')
            .insert(payload)
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data })
        }
        if (method === 'POST' && path === '/api/temporary-plan-groups/batch-delete') {
          const body = await readBody()
          const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
          if (!ids.length) return jsonResponse({ success: false, error: '缺少ids' }, 400)
          const { error } = await supabase.from('temporary_plan_groups').delete().in('id', ids)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        const tpg = path.match(/^\/api\/temporary-plan-groups\/([^\/]+)$/)
        if (tpg && method === 'PUT') {
          const id = tpg[1]
          const body = await readBody()
          const updateData: any = { updated_at: new Date().toISOString() }
          if (body.items !== undefined) updateData.items = body.items
          const { error } = await supabase.from('temporary_plan_groups').update(updateData).eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
      }

    }


    
    // 移除模拟数据，确保所有请求都从数据库获取数据
    
    // 如果Supabase可用，继续处理其他API端点
    if (supabase) {
      // Tooling list
      if (method === 'GET' && path === '/api/tooling') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 0)
        const sortField = String(qs.get('sortField') || 'created_at')
        const sortOrder = String(qs.get('sortOrder') || 'asc').toLowerCase() === 'asc'
        const search = String(qs.get('search') || '').trim()
        const productionUnit = String(qs.get('production_unit') || '').trim()
        const category = String(qs.get('category') || '').trim()
        const priorityLevel = String(qs.get('priority_level') || '').trim()
        
        // 当 pageSize <= 0 时，获取所有数据
        const noPagination = pageSize <= 0
        
        let query = supabase
          .from('tooling_info')
          .select('*', { count: 'planned' })
        
        if (search) {
          const keyword = `%${search}%`
          let partsToolingIds: string[] = []
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
          const baseExpr = `inventory_number.ilike.${keyword},project_name.ilike.${keyword},recorder.ilike.${keyword}`
          if (partsToolingIds.length > 0) {
            const inList = partsToolingIds
              .map((id) => `"${String(id || '').replace(/"/g, '')}"`)
              .join(',')
            query = query.or(`${baseExpr},id.in.(${inList})`)
          } else {
            query = query.or(baseExpr)
          }
        }
        if (productionUnit) query = query.eq('production_unit', productionUnit)
        if (category) query = query.eq('category', category)
        if (priorityLevel) {
          const pv = Number(priorityLevel)
          if (!Number.isNaN(pv)) query = query.eq('priority_level', pv)
        }
        
        query = query.order(sortField as any, { ascending: sortOrder })
        
        // 分页处理：当 noPagination 为 true 时，使用循环获取所有数据
        let data: any[] = []
        let count: number | null = null
        
        if (noPagination) {
          // 使用循环获取所有数据，绕过 Supabase 的 1000 条限制
          const BATCH_SIZE = 1000
          let offset = 0
          
          while (true) {
            const { data: batch, error: batchErr, count: c } = await query
              .range(offset, offset + BATCH_SIZE - 1)
            if (batchErr) {
              console.error('Fetch tooling_info batch error:', batchErr)
              return jsonResponse({ success: true, items: [], total: 0, page, pageSize })
            }
            if (offset === 0) count = c
            if (!batch || batch.length === 0) break
            data.push(...batch)
            if (batch.length < BATCH_SIZE) break
            offset += BATCH_SIZE
          }
        } else {
          const result = await query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
          data = result.data || []
          count = result.count
        }
        
        const items = (data || []).map((x: any) => ({
          id: x.id,
          inventory_number: x.inventory_number || '',
          production_unit: x.production_unit || '',
          category: x.category || '',
          priority_level: typeof x.priority_level === 'number' ? x.priority_level : Number(x.priority_level || 0),
          received_date: x.received_date || '',
          demand_date: x.demand_date || '',
          completed_date: x.completed_date || '',
          project_name: x.project_name || '',
          production_date: x.production_date || '',
          sets_count: typeof x.sets_count === 'number' ? x.sets_count : 1,
          recorder: x.recorder || '',
          material_total: x.material_total === null || typeof x.material_total === 'undefined' || x.material_total === '' ? null : Number(x.material_total),
          process_total: x.process_total === null || typeof x.process_total === 'undefined' || x.process_total === '' ? null : Number(x.process_total),
          totals_updated_at: x.totals_updated_at || ''
        }))
        return jsonResponse({ success: true, items, total: typeof count === 'number' ? count : items.length, page, pageSize, data: items })
      }

      if (method === 'POST' && path === '/api/tooling/status/batch') {
        const body = await readBody()
        const type = String(body.type || '').trim()
        const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => String(x || '')).filter(Boolean) : []
        if (!type || (type !== 'part' && type !== 'child')) return jsonResponse({ success: false, error: 'Invalid type' }, 400)
        if (ids.length === 0) return jsonResponse({ success: true, map: {} })
        const map: Record<string, string> = {}
        const STATUS_BATCH_SIZE = 120
        for (let i = 0; i < ids.length; i += STATUS_BATCH_SIZE) {
          const slice = ids.slice(i, i + STATUS_BATCH_SIZE)
          const { data, error } = await supabase
            .from('tooling_status')
            .select('item_id,status')
            .eq('item_type', type)
            .in('item_id', slice as any)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          ;(data || []).forEach((row: any) => {
            const k = String(row.item_id || '')
            if (k) map[k] = String(row.status || '')
          })
        }
        return jsonResponse({ success: true, map })
      }

      if (method === 'POST' && path === '/api/tooling/status') {
        const body = await readBody()
        const type = String(body.type || '').trim()
        const id = String(body.id || '').trim()
        const status = body.status === null || typeof body.status === 'undefined' ? '' : String(body.status || '').trim()
        if (!type || !id || (type !== 'part' && type !== 'child')) return jsonResponse({ success: false, error: 'Invalid payload' }, 400)
        if (!status) {
          const { error } = await supabase
            .from('tooling_status')
            .delete()
            .eq('item_type', type)
            .eq('item_id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
        const { error } = await supabase
          .from('tooling_status')
          .upsert({
            item_type: type,
            item_id: id,
            status,
            updated_by: body.updated_by ? String(body.updated_by) : null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'item_type,item_id' })
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
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

      if (method === 'POST' && path.match(/^\/api\/tooling\/[^\/]+\/refresh-totals$/)) {
        const match = path.match(/^\/api\/tooling\/([^\/]+)\/refresh-totals$/)
        const toolingId = String(match?.[1] || '').trim()
        if (!toolingId) return jsonResponse({ success: false, error: '缺少工装ID' }, 400)
        const hasPartMeaningfulContent = (part: any) => {
          const inv = String(part?.part_inventory_number || part?.inventory_number || '').trim()
          const name = String(part?.part_name || '').trim()
          const qty = Number(part?.part_quantity || 0)
          const weight = Number(part?.weight || 0)
          return !!(inv || name || qty > 0 || weight > 0)
        }
        const normalizeDeviceNo = (v: any) => {
          const raw = String(v || '').trim()
          if (!raw) return ''
          const dash = raw.split('-')[0]
          const leadingDigits = dash.match(/^\d+/)?.[0]
          if (leadingDigits) return leadingDigits
          return dash.trim()
        }
        const chunkArray = <T,>(items: T[], size: number): T[][] => {
          const safeSize = Math.max(1, size)
          const chunks: T[][] = []
          for (let i = 0; i < items.length; i += safeSize) {
            chunks.push(items.slice(i, i + safeSize))
          }
          return chunks
        }
        try {
          const { data: parts, error: partsError } = await supabase
            .from('parts_info')
            .select('id,tooling_id,part_inventory_number,inventory_number,part_name,part_quantity,weight,material_id')
            .eq('tooling_id', toolingId)
          if (partsError) return jsonResponse({ success: false, error: partsError.message }, 500)

          const { data: existingTotals } = await supabase
            .from('tooling_info')
            .select('material_total,process_total,totals_updated_at')
            .eq('id', toolingId)
            .single()

          const validParts = (parts || []).filter((part: any) => !String(part?.id || '').startsWith('blank-'))
          const meaningfulParts = validParts.filter((part: any) => hasPartMeaningfulContent(part))

          let materialTotal: number | null = existingTotals?.material_total ?? null
          let processTotal: number | null = existingTotals?.process_total ?? null
          const updatedAt = existingTotals?.totals_updated_at || new Date().toISOString()
          const partProcessAmountMap: Record<string, number> = {}
          if (meaningfulParts.length > 0) {
            const materialIds = Array.from(new Set(
              meaningfulParts
                .map((part: any) => String(part?.material_id || '').trim())
                .filter(Boolean)
            ))
            const materialUnitPriceMap = new Map<string, number>()
            for (const materialChunk of chunkArray(materialIds, 120)) {
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

            const invList = Array.from(new Set(
              meaningfulParts
                .map((part: any) => String(part?.part_inventory_number || part?.inventory_number || '').trim().toUpperCase())
                .filter(Boolean)
            ))
            const workHourRowMap = new Map<string, any>()
            for (const invChunk of chunkArray(invList, 120)) {
              const { data: rowsByPartInv, error: rowsError } = await supabase
                .from('work_hours')
                .select('part_inventory_number,aux_hours,proc_hours,device_no')
                .in('part_inventory_number', invChunk)
              if (rowsError) continue
              ;([...(rowsByPartInv || [])] as any[]).forEach((row: any, idx: number) => {
                const key = String(row?.id || `${row?.part_inventory_number || ''}|${row?.device_no || ''}|${row?.aux_hours || ''}|${row?.proc_hours || ''}|${idx}`)
                if (!workHourRowMap.has(key)) workHourRowMap.set(key, row)
              })
            }
            const workHourRows = Array.from(workHourRowMap.values())

            const deviceNoSet = new Set<string>()
            const normalizedRows = workHourRows.map((row: any) => {
              const inv = String(row?.part_inventory_number || '').trim().toUpperCase()
              const totalHours = Number(row?.aux_hours || 0) + Number(row?.proc_hours || 0)
              const deviceNo = normalizeDeviceNo(row?.device_no)
              if (deviceNo) deviceNoSet.add(deviceNo)
              return { inv, totalHours, deviceNo }
            })

            const devicePriceMap = new Map<string, number>()
            for (const deviceChunk of chunkArray(Array.from(deviceNoSet), 120)) {
              const { data: devices } = await supabase
                .from('devices')
                .select('device_no,process_unit_price')
                .in('device_no', deviceChunk)
              ;(devices || []).forEach((device: any) => {
                const no = normalizeDeviceNo(device?.device_no)
                if (!no) return
                devicePriceMap.set(no, Number(device?.process_unit_price || 0))
              })
            }

            const amountByInv: Record<string, number> = {}
            normalizedRows.forEach(({ inv, totalHours, deviceNo }: any) => {
              if (!inv || !deviceNo || !Number.isFinite(totalHours) || totalHours <= 0) return
              const unitPrice = Number(devicePriceMap.get(deviceNo) || 0)
              if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
              amountByInv[inv] = Number(amountByInv[inv] || 0) + totalHours * unitPrice
            })
            meaningfulParts.forEach((part: any) => {
              const id = String(part?.id || '')
              const inv = String(part?.part_inventory_number || part?.inventory_number || '').trim().toUpperCase()
              if (!id) return
              partProcessAmountMap[id] = Number(amountByInv[inv] || 0)
            })
            processTotal = meaningfulParts.reduce((sum: number, part: any) => {
              const id = String(part?.id || '')
              return sum + Number(partProcessAmountMap[id] || 0)
            }, 0)

            if (existingTotals?.process_total != null) {
              processTotal = existingTotals.process_total
            }
          }

          const payload = {
            material_total: materialTotal,
            process_total: processTotal,
            totals_updated_at: updatedAt,
            part_process_amounts: partProcessAmountMap
          }
          return jsonResponse({ success: true, data: payload })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '刷新工装总额失败' }, 500)
        }
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

      // Tooling parts summary by toolingIds
      if (method === 'POST' && path === '/api/tooling/parts/summary') {
        const body = await readBody()
        const ids = Array.isArray(body?.ids) ? body.ids : []
        const toolingIds = ids.map((x: any) => String(x || '').trim()).filter(Boolean)
        if (toolingIds.length === 0) return jsonResponse({ success: true, items: [] })

        const BATCH_SIZE = 1000
        const STATUS_BATCH_SIZE = 120
        let offset = 0
        const parts: any[] = []
        while (true) {
          const { data, error } = await supabase
            .from('parts_info')
            .select('id, tooling_id, purchase_status')
            .in('tooling_id', toolingIds as any)
            .range(offset, offset + BATCH_SIZE - 1)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const rows = Array.isArray(data) ? data : []
          parts.push(...rows)
          if (rows.length < BATCH_SIZE) break
          offset += BATCH_SIZE
        }

        const missingIds = parts
          .filter(r => !String(r.purchase_status || '').trim())
          .map(r => String(r.id || ''))
          .filter(Boolean)
        if (missingIds.length > 0) {
          const statusMap = new Map<string, string>()
          for (let i = 0; i < missingIds.length; i += STATUS_BATCH_SIZE) {
            const slice = missingIds.slice(i, i + STATUS_BATCH_SIZE)
            const { data: statusRows } = await supabase
              .from('tooling_status')
              .select('item_id,status')
              .eq('item_type', 'part')
              .in('item_id', slice as any)
            ;(statusRows || []).forEach((r: any) => {
              const k = String(r.item_id || '')
              if (k) statusMap.set(k, String(r.status || ''))
            })
          }
          parts.forEach((r: any) => {
            if (!String(r.purchase_status || '').trim()) {
              const s = statusMap.get(String(r.id || '')) || ''
              if (s) r.purchase_status = s
            }
          })
        }

        const isDate = (s: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(s || '').trim())
        const map = new Map<string, { total: number; completed: number }>()
        parts.forEach((p: any) => {
          const tid = String(p.tooling_id || '')
          if (!tid) return
          const cur = map.get(tid) || { total: 0, completed: 0 }
          cur.total += 1
          if (isDate(String(p.purchase_status || ''))) cur.completed += 1
          map.set(tid, cur)
        })
        const items = toolingIds.map((tid: string) => {
          const cur = map.get(tid) || { total: 0, completed: 0 }
          const total = cur.total
          const completed = cur.completed
          return { tooling_id: tid, total, completed, incomplete: Math.max(total - completed, 0) }
        })
        return jsonResponse({ success: true, items })
      }

      if (method === 'POST' && path === '/api/tooling/totals/summary') {
        const body = await readBody()
        const ids = Array.isArray(body?.ids) ? body.ids : []
        const toolingIds = ids.map((x: any) => String(x || '').trim()).filter(Boolean)
        if (toolingIds.length === 0) return jsonResponse({ success: true, items: [] })

        const BATCH_SIZE = 1000
        let offset = 0
        const parts: any[] = []
        while (true) {
          const { data, error } = await supabase
            .from('parts_info')
            .select('id, tooling_id, part_quantity, weight, material_id, process_amount')
            .in('tooling_id', toolingIds as any)
            .range(offset, offset + BATCH_SIZE - 1)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          const rows = Array.isArray(data) ? data : []
          parts.push(...rows)
          if (rows.length < BATCH_SIZE) break
          offset += BATCH_SIZE
        }

        const validParts = parts.filter((part: any) => !String(part?.id || '').startsWith('blank-'))
        const materialIds = Array.from(new Set(
          validParts
            .map((part: any) => String(part?.material_id || '').trim())
            .filter(Boolean)
        ))
        const materialPriceMap = new Map<string, number>()
        for (let i = 0; i < materialIds.length; i += 120) {
          const slice = materialIds.slice(i, i + 120)
          if (slice.length === 0) continue
          const { data: materials, error } = await supabase
            .from('materials')
            .select('id,unit_price')
            .in('id', slice as any)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          ;(materials || []).forEach((material: any) => {
            const materialId = String(material?.id || '').trim()
            if (!materialId) return
            const price = Number(material?.unit_price || 0)
            materialPriceMap.set(materialId, Number.isFinite(price) ? price : 0)
          })
        }

        const map = new Map<string, { hasParts: boolean; material_total: number; process_total: number }>()
        toolingIds.forEach((toolingId: string) => {
          map.set(toolingId, { hasParts: false, material_total: 0, process_total: 0 })
        })
        validParts.forEach((part: any) => {
          const toolingId = String(part?.tooling_id || '')
          if (!toolingId) return
          const current = map.get(toolingId) || { hasParts: false, material_total: 0, process_total: 0 }
          current.hasParts = true
          const qty = Number(part?.part_quantity || 0)
          const unitWeight = Number(part?.weight || 0)
          const materialId = String(part?.material_id || '').trim()
          const unitPrice = materialId ? Number(materialPriceMap.get(materialId) || 0) : 0
          const materialAmount = qty > 0 && unitWeight > 0 && unitPrice > 0 ? qty * unitWeight * unitPrice : 0
          if (Number.isFinite(materialAmount)) current.material_total += materialAmount
          const processAmount = Number(part?.process_amount || 0)
          if (Number.isFinite(processAmount)) current.process_total += processAmount
          map.set(toolingId, current)
        })

        const items = toolingIds.map((toolingId: string) => {
          const summary = map.get(toolingId) || { hasParts: false, material_total: 0, process_total: 0 }
          return {
            tooling_id: toolingId,
            material_total: summary.hasParts ? Math.round(summary.material_total) : null,
            process_total: summary.hasParts ? Math.round(summary.process_total) : null
          }
        })
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
          .order('created_at', { ascending: true })
        if (error) return jsonResponse({ success: true, items: [], data: [] })
        const items = (data || []) as any[]
        const missingIds = items.filter(r => !String(r.purchase_status || '').trim()).map(r => String(r.id || '')).filter(Boolean)
        if (missingIds.length > 0) {
          const statusMap = new Map<string, string>()
          const STATUS_BATCH_SIZE = 120
          for (let i = 0; i < missingIds.length; i += STATUS_BATCH_SIZE) {
            const slice = missingIds.slice(i, i + STATUS_BATCH_SIZE)
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
        return jsonResponse({ success: true, items, data: items })
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
        if (Object.prototype.hasOwnProperty.call(body, 'weight')) {
          const w = typeof body.weight === 'number' ? body.weight : Number(body.weight)
          payload.weight = Number.isNaN(w) ? null : w
        }
        if (Object.prototype.hasOwnProperty.call(body, 'total_price')) {
          const t = typeof body.total_price === 'number' ? body.total_price : Number(body.total_price)
          payload.total_price = Number.isNaN(t) ? null : t
        }
        let { data, error } = await supabase.from('parts_info').insert(payload).select('*').single()
        if (error) {
          const msg = String(error.message || '')
          if (Object.prototype.hasOwnProperty.call(payload, 'total_price') && msg.includes('total_price')) {
            const retryPayload = { ...payload }
            delete retryPayload.total_price
            const retry = await supabase.from('parts_info').insert(retryPayload).select('*').single()
            data = retry.data as any
            error = retry.error as any
          }
        }
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }

      // Parts update/delete by id
      const partIdMatch = path.match(/^\/api\/tooling\/parts\/([^\/]+)$/)
      if (partIdMatch && method === 'PUT') {
        const id = partIdMatch[1]
        const body = await readBody()
        const payload: any = {}
        const hasStatus = Object.prototype.hasOwnProperty.call(body, 'purchase_status')
        if (Object.prototype.hasOwnProperty.call(body, 'part_inventory_number')) {
          const s = body.part_inventory_number
          payload.part_inventory_number = (s === null) ? null : String(s || '')
          payload.inventory_number = payload.part_inventory_number
        }
        if (Object.prototype.hasOwnProperty.call(body, 'part_drawing_number')) {
          const s = body.part_drawing_number
          payload.part_drawing_number = (s === null) ? null : String(s || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'part_name')) {
          const s = body.part_name
          payload.part_name = (s === null) ? null : String(s || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'part_quantity')) {
          const num = typeof body.part_quantity === 'number' ? body.part_quantity : Number(body.part_quantity)
          payload.part_quantity = (body.part_quantity === '' || body.part_quantity === null || Number.isNaN(Number(num)) || Number(num) <= 0) ? null : Number(num)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'material_id')) payload.material_id = (body.material_id === null) ? null : body.material_id
        if (Object.prototype.hasOwnProperty.call(body, 'material_source_id')) {
          const ms = body.material_source_id
          payload.material_source_id = (ms === null) ? null : String(ms || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'part_category')) {
          const s = body.part_category
          payload.part_category = (s === null) ? null : String(s || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'specifications')) payload.specifications = body.specifications ?? {}
        if (Object.prototype.hasOwnProperty.call(body, 'remarks')) {
          const s = body.remarks
          payload.remarks = (s === null) ? null : String(s || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'weight')) {
          const w = typeof body.weight === 'number' ? body.weight : Number(body.weight)
          payload.weight = Number.isNaN(w) ? null : w
        }
        if (Object.prototype.hasOwnProperty.call(body, 'total_price')) {
          const t = typeof body.total_price === 'number' ? body.total_price : Number(body.total_price)
          payload.total_price = Number.isNaN(t) ? null : t
        }
        if (Object.prototype.hasOwnProperty.call(body, 'process_route')) {
          const s = body.process_route
          payload.process_route = (s === null) ? null : String(s || '')
        }
        if (Object.prototype.hasOwnProperty.call(body, 'completed_steps')) {
          const cs = body.completed_steps
          payload.completed_steps = Array.isArray(cs) ? cs : []
        }
        const updateStatus = async () => {
          if (!hasStatus) return
          const s = body.purchase_status
          const status = (s === null || typeof s === 'undefined') ? '' : String(s || '').trim()
          payload.purchase_status = status ? status : null
          if (!status) {
            await supabase.from('tooling_status').delete().eq('item_type', 'part').eq('item_id', id)
            return
          }
          await supabase
            .from('tooling_status')
            .upsert({ item_type: 'part', item_id: id, status, updated_at: new Date().toISOString() }, { onConflict: 'item_type,item_id' })
        }
        const hasOtherFields = Object.keys(payload).length > 0
        if (hasOtherFields) {
          let { error } = await supabase.from('parts_info').update(payload).eq('id', id)
          if (error && Object.prototype.hasOwnProperty.call(payload, 'total_price')) {
            const msg = String(error.message || '')
            if (msg.includes('total_price')) {
              const retryPayload = { ...payload }
              delete retryPayload.total_price
              const retry = await supabase.from('parts_info').update(retryPayload).eq('id', id)
              error = retry.error
            }
          }
          if (error && hasStatus && Object.prototype.hasOwnProperty.call(payload, 'purchase_status')) {
            const msg = String(error.message || '')
            if (msg.includes('purchase_status')) {
              const retryPayload = { ...payload }
              delete retryPayload.purchase_status
              const retry = await supabase.from('parts_info').update(retryPayload).eq('id', id)
              error = retry.error
            }
          }
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
        }
        await updateStatus()
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
          .order('created_at', { ascending: true })
        if (error) return jsonResponse({ success: true, items: [], data: [] })
        const items = (data || []) as any[]
        const missingIds = items.filter(r => !String(r.purchase_status || '').trim()).map(r => String(r.id || '')).filter(Boolean)
        if (missingIds.length > 0) {
          const statusMap = new Map<string, string>()
          const STATUS_BATCH_SIZE = 120
          for (let i = 0; i < missingIds.length; i += STATUS_BATCH_SIZE) {
            const slice = missingIds.slice(i, i + STATUS_BATCH_SIZE)
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
        return jsonResponse({ success: true, items, data: items })
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
        const hasStatus = Object.prototype.hasOwnProperty.call(body, 'purchase_status')
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
        const updateStatus = async () => {
          if (!hasStatus) return
          const s = body.purchase_status
          const status = (s === null || typeof s === 'undefined') ? '' : String(s || '').trim()
          payload.purchase_status = status ? status : null
          if (!status) {
            await supabase.from('tooling_status').delete().eq('item_type', 'child').eq('item_id', id)
            return
          }
          await supabase
            .from('tooling_status')
            .upsert({ item_type: 'child', item_id: id, status, updated_at: new Date().toISOString() }, { onConflict: 'item_type,item_id' })
        }
        const hasOtherFields = Object.keys(payload).length > 0
        if (hasOtherFields) {
          let { error } = await supabase.from('child_items').update(payload).eq('id', id)
          if (error && hasStatus && Object.prototype.hasOwnProperty.call(payload, 'purchase_status')) {
            const msg = String(error.message || '')
            if (msg.includes('purchase_status')) {
              const retryPayload = { ...payload }
              delete retryPayload.purchase_status
              const retry = await supabase.from('child_items').update(retryPayload).eq('id', id)
              error = retry.error
            }
          }
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
        }
        await updateStatus()
        return jsonResponse({ success: true })
      }
      if (childIdMatch && method === 'DELETE') {
        const id = childIdMatch[1]
        const { error } = await supabase.from('child_items').delete().eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      // Maintenance options (client-side fallback)
      if (method === 'GET' && path === '/api/options/maintenance-options') {
        try {
          const { data, error } = await supabase.from('maintenance_options').select('*').order('inventory_number')
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data: data || [] })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message }, 500)
        }
      }

      // Work hours aggregates
      if (method === 'GET' && path === '/api/tooling/work-hours/aggregates') {
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
        const qs = getQuery(cleanUrl)
        const invsParam = (qs.get('invs') || '').trim()
        const invs = invsParam ? invsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : []
        // #region debug-point B:client-aggregate-entry
        fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'tooling-work-hours-400', runId: 'pre-fix', hypothesisId: 'B', location: 'src/utils/api.ts:3273', msg: '[DEBUG] client aggregate handler entered', data: { invCount: invs.length, sampleInvs: invs.slice(0, 8), cleanUrl }, ts: Date.now() }) }).catch(() => {})
        // #endregion
        if (invs.length === 0) return jsonResponse({ success: true, data: {}, completedQtyData: {}, processCompletedQtyData: {}, processHoursData: {}, processAmountData: {}, amountData: {}, processLatestMetaData: {} })
        try {
          const chunkArray = <T,>(items: T[], size: number): T[][] => {
            const safeSize = Math.max(1, size)
            const chunks: T[][] = []
            for (let i = 0; i < items.length; i += safeSize) {
              chunks.push(items.slice(i, i + safeSize))
            }
            return chunks
          }
          const rows: any[] = []
          let lastQueryError: any = null
          for (const invChunk of chunkArray(invs, 120)) {
            // #region debug-point C:client-aggregate-chunk
            fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'tooling-work-hours-400', runId: 'pre-fix', hypothesisId: 'C', location: 'src/utils/api.ts:3286', msg: '[DEBUG] client aggregate querying supabase chunk', data: { chunkSize: invChunk.length, sampleInvs: invChunk.slice(0, 8) }, ts: Date.now() }) }).catch(() => {})
            // #endregion
            const { data: partRows, error: partRowsErr } = await supabase
              .from('work_hours')
              .select('id,part_inventory_number,process_name,completed_quantity,aux_hours,proc_hours,operator,shift,device_no,created_at,work_date')
              .in('part_inventory_number', invChunk)
            if (partRowsErr) {
              // #region debug-point D:client-aggregate-query-error
              fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'tooling-work-hours-400', runId: 'pre-fix', hypothesisId: 'D', location: 'src/utils/api.ts:3296', msg: '[DEBUG] client aggregate supabase query error', data: { partRowsErr: { message: partRowsErr.message, code: (partRowsErr as any).code, details: (partRowsErr as any).details, hint: (partRowsErr as any).hint }, chunkSize: invChunk.length, sampleInvs: invChunk.slice(0, 8) }, ts: Date.now() }) }).catch(() => {})
              // #endregion
              lastQueryError = partRowsErr
              continue
            }
            const mergeMap = new Map<string, any>()
            ;(((partRows || []) as any[])).forEach((r: any, idx: number) => {
              const key = String(r?.id || `${r?.part_inventory_number || ''}|${r?.process_name || ''}|${r?.created_at || ''}|${idx}`)
              if (!mergeMap.has(key)) mergeMap.set(key, r)
            })
            rows.push(...Array.from(mergeMap.values()))
          }
          if (rows.length === 0 && lastQueryError) return jsonResponse({ success: false, error: lastQueryError.message }, 500)
          const map: Record<string, string[]> = {}
          const completedQtyMap: Record<string, number> = {}
          const processCompletedQtyMap: Record<string, Record<string, number>> = {}
          const processHoursMap: Record<string, Record<string, number>> = {}
          const processAmountMap: Record<string, Record<string, number>> = {}
          const processLatestMetaData: Record<string, Record<string, { process_name: string; operator: string; shift: string; team_name: string; device_no: string; device_name: string; process_unit_price: number; completed_quantity: number; at: number }>> = {}
          const deviceSet = new Set<string>()
          const normalizedRows = rows.map((r: any) => {
            const inv = String(r.part_inventory_number || '').trim().toUpperCase()
            const name = String(r.process_name || '').trim()
            const processKey = normalizeProcessKey(name)
            const completedQty = Number(r.completed_quantity || 0)
            const auxHours = Number(r.aux_hours || 0)
            const procHours = Number(r.proc_hours || 0)
            const totalHours = (Number.isFinite(auxHours) ? auxHours : 0) + (Number.isFinite(procHours) ? procHours : 0)
            const deviceNo = normalizeDeviceNo(r.device_no)
            if (deviceNo) deviceSet.add(deviceNo)
            return { r, inv, name, processKey, completedQty, totalHours, deviceNo }
          })
          ;normalizedRows.forEach(({ r, inv, name, processKey, completedQty, totalHours, deviceNo }: any) => {
            if (!inv || !name) return
            const norm = name.trim().toLowerCase()
            const arr = map[inv] || []
            if (!arr.some(x => String(x).trim().toLowerCase() === norm)) arr.push(name)
            map[inv] = arr
            completedQtyMap[inv] = Number(completedQtyMap[inv] || 0) + completedQty
            if (processKey) {
              if (!processCompletedQtyMap[inv]) processCompletedQtyMap[inv] = {}
              processCompletedQtyMap[inv][processKey] = Number(processCompletedQtyMap[inv][processKey] || 0) + completedQty
              if (!processHoursMap[inv]) processHoursMap[inv] = {}
              processHoursMap[inv][processKey] = Number(processHoursMap[inv][processKey] || 0) + totalHours
              if (!processLatestMetaData[inv]) processLatestMetaData[inv] = {}
              const prev = processLatestMetaData[inv][processKey]
              const at = toTime(r)
              if (!prev || at >= Number(prev.at || 0)) {
                processLatestMetaData[inv][processKey] = {
                  process_name: name,
                  operator: String(r.operator || '').trim(),
                  shift: String(r.shift || '').trim(),
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

          const deviceNos = Array.from(deviceSet)
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
          if (deviceNos.length > 0 || operatorList.length > 0) {
            const [devicesResult, usersResult] = await Promise.all([
              (async () => {
                const deviceNameMap = new Map<string, string>()
                const devicePriceMap = new Map<string, number>()
                if (deviceNos.length > 0) {
                  const { data: devices } = await supabase
                    .from('devices')
                    .select('device_no,device_name,process_unit_price')
                    .in('device_no', deviceNos)
                  ;(devices || []).forEach((d: any) => {
                    const no = normalizeDeviceNo(d.device_no)
                    if (!no) return
                    deviceNameMap.set(no, String(d.device_name || '').trim())
                    const price = Number(d.process_unit_price || 0)
                    devicePriceMap.set(no, Number.isFinite(price) ? price : 0)
                  })
                }
                return { deviceNameMap, devicePriceMap }
              })(),
              (async () => {
                const normalizeName = (v: any) => String(v || '').replace(/\s+/g, '').trim().toLowerCase()
                let userTeamByName = new Map<string, string>()
                if (operatorList.length > 0) {
                  const { data: users } = await supabase
                    .from('users')
                    .select('real_name,team_id')
                    .in('real_name', operatorList)
                  const teamIds = Array.from(new Set((users || []).map((u: any) => String(u.team_id || '')).filter(Boolean)))
                  let teamMap = new Map<string, string>()
                  if (teamIds.length > 0) {
                    const { data: teams } = await supabase
                      .from('teams')
                      .select('id,name')
                      .in('id', teamIds)
                    teamMap = new Map((teams || []).map((t: any) => [String(t.id || ''), String(t.name || '')]))
                  }
                  userTeamByName = new Map<string, string>()
                  ;(users || []).forEach((u: any) => {
                    const k = normalizeName(u.real_name)
                    const teamName = teamMap.get(String(u.team_id || '')) || ''
                    if (k && teamName && !userTeamByName.has(k)) userTeamByName.set(k, teamName)
                  })
                }
                return { userTeamByName }
              })()
            ])
            const { deviceNameMap, devicePriceMap } = devicesResult
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
              if (!inv || !processKey || !Number.isFinite(totalHours) || totalHours <= 0) return
              const unitPrice = deviceNo ? Number(devicePriceMap.get(deviceNo) || 0) : 0
              if (!processAmountMap[inv]) processAmountMap[inv] = {}
              processAmountMap[inv][processKey] = Number(processAmountMap[inv][processKey] || 0) + (Number.isFinite(unitPrice) ? totalHours * unitPrice : 0)
            })
            const { userTeamByName } = usersResult
            Object.keys(processLatestMetaData).forEach((inv) => {
              const processMap = processLatestMetaData[inv] || {}
              Object.keys(processMap).forEach((pk) => {
                const meta = processMap[pk]
                const teamName = userTeamByName.get(normalizeName(meta?.operator))
                if (teamName) meta.team_name = teamName
              })
            })
          }
          const amountData: Record<string, number> = {}
          Object.keys(processAmountMap).forEach((inv) => {
            amountData[inv] = Object.values(processAmountMap[inv] || {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0)
          })
          return jsonResponse({ success: true, data: map, completedQtyData: completedQtyMap, processCompletedQtyData: processCompletedQtyMap, processHoursData: processHoursMap, processAmountData: processAmountMap, amountData, processLatestMetaData })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '聚合失败' }, 500)
        }
      }

      // Program management list
      if (method === 'GET' && path === '/api/tooling/program-management') {
        const qs = getQuery(cleanUrl)
        const page = Math.max(Number(qs.get('page') || 1), 1)
        const pageSize = Math.max(Number(qs.get('pageSize') || 50), 1)
        const keyword = String(qs.get('search') || '').trim()
        const status = String(qs.get('status') || 'all').trim() || 'all'
        const normalizeInventoryNo = (v: any) => String(v || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .trim()
          .toUpperCase()
        const normalizeProcessKey = (v: any) => String(v || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s+/g, '')
          .trim()
          .toLowerCase()
        const normalizeProcessBaseKey = (v: any) => String(v || '')
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
        const addMinutesToDate = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000)
        const resolveProcessWindow = (row: any) => {
          const procHours = Number(row?.proc_hours || 0)
          if (!Number.isFinite(procHours) || procHours <= 0) return null
          const workDateRaw = String(row?.work_date || '').trim()
          const baseDate = workDateRaw ? new Date(`${workDateRaw}T00:00:00`) : new Date(String(row?.created_at || ''))
          if (Number.isNaN(baseDate.getTime())) return null
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
          return { startAt, endAt }
        }
        const formatDateTime = (value: Date | null) => {
          if (!value || Number.isNaN(value.getTime())) return '-'
          const month = String(value.getMonth() + 1).padStart(2, '0')
          const day = String(value.getDate()).padStart(2, '0')
          const hour = String(value.getHours()).padStart(2, '0')
          const minute = String(value.getMinutes()).padStart(2, '0')
          return `${month}-${day} ${hour}:${minute}`
        }
        const formatHours = (value: number) => {
          const num = Number(value || 0)
          if (!Number.isFinite(num) || num <= 0) return '0.00'
          return num.toFixed(2)
        }
        const formatQuantity = (value: number) => {
          const num = Number(value || 0)
          if (!Number.isFinite(num) || num <= 0) return '0'
          if (Math.abs(num - Math.round(num)) < 0.000001) return String(Math.round(num))
          return num.toFixed(2)
        }
        try {
          let programQuery = supabase
            .from('program_entries')
            .select('id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer')
            .order('programmed_at', { ascending: false })
          if (keyword) {
            const kw = `%${keyword}%`
            programQuery = programQuery.or(`part_inventory_number.ilike.${kw},part_drawing_number.ilike.${kw},process_name.ilike.${kw},program_no.ilike.${kw},programmer.ilike.${kw}`)
          }
          const { data: programRows, error: programError } = await programQuery
          if (programError) return jsonResponse({ success: false, error: programError.message }, 500)

          const groupedMap = new Map<string, any>()
          ;(programRows || []).forEach((row: any, index: number) => {
            const inventoryNo = normalizeInventoryNo(row?.part_inventory_number)
            const processName = String(row?.process_name || '').trim()
            const processKey = normalizeProcessKey(processName)
            const processBaseKey = normalizeProcessBaseKey(processName)
            if (!inventoryNo || !processKey) return
            const groupKey = `${inventoryNo}__${processKey}`
            if (!groupedMap.has(groupKey)) {
              groupedMap.set(groupKey, {
                key: groupKey,
                part_inventory_number: String(row?.part_inventory_number || '').trim(),
                part_drawing_number: String(row?.part_drawing_number || '').trim(),
                process_name: processName,
                process_base_key: processBaseKey,
                latest_programmed_at: String(row?.programmed_at || '').trim(),
                latest_programmed_at_ms: Date.parse(String(row?.programmed_at || '')) || 0,
                program_segment_set: new Set<string>(),
                program_total_minutes: 0,
                programmer_set: new Set<string>(),
                sort_index: index
              })
            }
            const group = groupedMap.get(groupKey)
            const programNo = String(row?.program_no || '').trim()
            const programmer = String(row?.programmer || '').trim()
            const durationMinutes = Number(row?.program_duration_minutes || 0)
            const programmedAtText = String(row?.programmed_at || '').trim()
            const programmedAtMs = Date.parse(programmedAtText)
            if (!group.part_drawing_number) group.part_drawing_number = String(row?.part_drawing_number || '').trim()
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
            const inventoryNo = normalizeInventoryNo(group?.part_inventory_number)
            const baseKey = String(group?.process_base_key || '').trim()
            if (!inventoryNo || !baseKey) return
            const mapKey = `${inventoryNo}__${baseKey}`
            const list = groupedBaseMap.get(mapKey) || []
            list.push(group)
            groupedBaseMap.set(mapKey, list)
          })

          const inventoryNos = Array.from(new Set(Array.from(groupedMap.values()).map((item: any) => normalizeInventoryNo(item?.part_inventory_number)).filter(Boolean)))
          const chunkArray = <T,>(items: T[], size: number): T[][] => {
            const safeSize = Math.max(1, size)
            const chunks: T[][] = []
            for (let i = 0; i < items.length; i += safeSize) chunks.push(items.slice(i, i + safeSize))
            return chunks
          }
          const partMetaMap = new Map<string, {
            part_name: string
            part_drawing_number: string
            part_quantity: number
            tooling_id: string
            project_name: string
          }>()
          try {
            for (const chunk of chunkArray(inventoryNos, 120)) {
              const rows: any[] = []
              const [{ data: byPartInv }, { data: byInventory }] = await Promise.all([
                supabase
                  .from('parts_info')
                  .select('part_inventory_number, inventory_number, part_name, part_drawing_number, part_quantity, tooling_id')
                  .in('part_inventory_number', chunk),
                supabase
                  .from('parts_info')
                  .select('part_inventory_number, inventory_number, part_name, part_drawing_number, part_quantity, tooling_id')
                  .in('inventory_number', chunk)
              ])
              rows.push(...((byPartInv || []) as any[]), ...((byInventory || []) as any[]))
              rows.forEach((row: any) => {
                const inventoryNo = normalizeInventoryNo(row?.part_inventory_number || row?.inventory_number)
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
            const toolingIds = Array.from(new Set(Array.from(partMetaMap.values()).map((item) => String(item.tooling_id || '').trim()).filter(Boolean)))
            if (toolingIds.length > 0) {
              for (const toolingChunk of chunkArray(toolingIds, 120)) {
                const { data } = await supabase
                  .from('tooling_info')
                  .select('id, project_name')
                  .in('id', toolingChunk)
                ;(data || []).forEach((row: any) => {
                  const id = String(row?.id || '').trim()
                  if (!id) return
                  const projectName = String(row?.project_name || '').trim()
                  partMetaMap.forEach((meta) => {
                    if (meta.tooling_id === id && !meta.project_name) meta.project_name = projectName
                  })
                })
              }
            }
          } catch (metaErr) {
            console.error('Client program management metadata skipped:', metaErr)
          }
          Array.from(groupedMap.values()).forEach((group: any) => {
            const meta = partMetaMap.get(normalizeInventoryNo(group?.part_inventory_number))
            if (!meta) return
            if (!group.part_drawing_number) group.part_drawing_number = meta.part_drawing_number || ''
            group.part_name = meta.part_name || ''
            group.part_quantity = Number(meta.part_quantity || 0)
            group.tooling_id = meta.tooling_id || ''
            group.project_name = meta.project_name || ''
          })
          const workHourMap = new Map<string, any>()
          try {
            for (const chunk of chunkArray(inventoryNos, 120)) {
              const baseSelect = 'id, inventory_no, part_inventory_number, process_name, completed_quantity, operator, device_no, work_date, aux_start_time, aux_end_time, aux_hours, proc_hours, created_at'
              const fallbackSelect = 'id, part_inventory_number, process_name, completed_quantity, operator, device_no, work_date, aux_start_time, aux_end_time, aux_hours, proc_hours, created_at'
              let mergedRows: any[] = []
              try {
                const [{ data: rowsByInv, error: rowsByInvErr }, { data: rowsByPartInv, error: rowsByPartInvErr }] = await Promise.all([
                  supabase.from('work_hours').select(baseSelect).in('inventory_no', chunk),
                  supabase.from('work_hours').select(baseSelect).in('part_inventory_number', chunk)
                ])
                if (rowsByInvErr && rowsByPartInvErr) throw rowsByInvErr
                mergedRows = [...((rowsByInv || []) as any[]), ...((rowsByPartInv || []) as any[])]
              } catch {
                const { data: fallbackRows, error: fallbackErr } = await supabase
                  .from('work_hours')
                  .select(fallbackSelect)
                  .in('part_inventory_number', chunk)
                if (fallbackErr) throw fallbackErr
                mergedRows = (fallbackRows || []) as any[]
              }
              ;(mergedRows || []).forEach((row: any, idx: number) => {
                const key = String(row?.id || `${row?.inventory_no || ''}|${row?.part_inventory_number || ''}|${row?.process_name || ''}|${row?.created_at || ''}|${idx}`)
                if (!workHourMap.has(key)) workHourMap.set(key, row)
              })
            }
          } catch (workHourErr) {
            console.error('Client program management work hours skipped:', workHourErr)
          }

          Array.from(workHourMap.values()).forEach((row: any) => {
            const inventoryCandidates = Array.from(new Set([
              normalizeInventoryNo(row?.part_inventory_number),
              normalizeInventoryNo(row?.inventory_no)
            ].filter(Boolean)))
            const processKey = normalizeProcessKey(row?.process_name)
            const processBaseKey = normalizeProcessBaseKey(row?.process_name)
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
              if (operator) group.operator_hours_map[operator] = Number(group.operator_hours_map[operator] || 0) + procHours
              const windowInfo = resolveProcessWindow(row)
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

          const allItems = Array.from(groupedMap.values()).map((group: any) => {
            const runtimeHours = Number(group.work_hours_total || 0)
            const operatorEntries = Object.entries(group.operator_hours_map || {}) as Array<[string, any]>
            const operatorSummary = operatorEntries
              .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
              .map(([name, hours]) => {
                const hourValue = Number(hours || 0)
                if (operatorEntries.length <= 1 || runtimeHours <= 0) return name
                return `${name} ${((hourValue / runtimeHours) * 100).toFixed(0)}%`
              })
              .join('、')
            const startAt = group.program_start_at instanceof Date ? group.program_start_at : null
            const endAt = group.program_end_at instanceof Date ? group.program_end_at : null
            const spanHours = startAt && endAt ? Math.max(0, (endAt.getTime() - startAt.getTime()) / 3600000) : 0
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
              ? `${formatQuantity(displayCompletedQuantity)}/${formatQuantity(totalQuantity)}`
              : formatQuantity(completedQuantity)
            const runtimeDisplay = runtimeHours > 0 ? `${formatHours(runtimeHours)}小时` : '-'
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
              program_count: group.program_segment_set instanceof Set ? group.program_segment_set.size : 0,
              program_total_hours: Number((Number(group.program_total_minutes || 0) / 60).toFixed(2)),
              average_runtime_hours: avgRuntimeHours == null ? null : Number(avgRuntimeHours.toFixed(2)),
              average_runtime_hours_display: avgRuntimeHours == null ? '-' : formatHours(avgRuntimeHours),
              program_runtime_hours: Number(runtimeHours.toFixed(2)),
              program_span_hours: Number(spanHours.toFixed(2)),
              program_runtime_display: runtimeDisplay,
              program_start_end_display: startAt && endAt
                ? `${formatDateTime(startAt)} - ${formatDateTime(endAt)}`
                : '-',
              operator_display: operatorSummary || '-',
              device_no_display: deviceNos.length ? deviceNos.join('、') : '-',
              latest_programmed_at: group.latest_programmed_at || '',
              programmers: group.programmer_set instanceof Set ? Array.from(group.programmer_set).join('、') : ''
            }
          }).sort((a: any, b: any) => {
            const diff = Date.parse(String(b.latest_programmed_at || '')) - Date.parse(String(a.latest_programmed_at || ''))
            if (Number.isFinite(diff) && diff !== 0) return diff
            return String(a.part_inventory_number || '').localeCompare(String(b.part_inventory_number || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
          })

          const from = (page - 1) * pageSize
          const filteredItems = allItems.filter((item: any) => {
            if (status === 'all') return true
            return String(item?.completion_status_key || '') === status
          })
          const items = filteredItems.slice(from, from + pageSize)
          return jsonResponse({ success: true, items, total: filteredItems.length, page, pageSize })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '加载程序管理数据失败' }, 500)
        }
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

      // Work hours
      if (method === 'GET' && path === '/api/tooling/work-hours') {
        const normalizePartLookupKey = (value: any) => String(value || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/[^A-Za-z0-9]/g, '')
          .trim()
          .toUpperCase()
        const enrichWorkHourPartMeta = async (rows: any[]) => {
          const list = Array.isArray(rows) ? rows : []
          if (list.length === 0) return list
          const invValues = Array.from(new Set(
            list
              .map((row: any) => String(row?.part_inventory_number || '').trim())
              .filter(Boolean)
          ))
          if (invValues.length === 0) return list
          const partMetaMap = new Map<string, { name: string; drawing: string }>()
          const upsertMeta = (row: any) => {
            const name = String(row?.part_name || '').trim()
            const drawing = String(row?.part_drawing_number || '').trim()
            const invKey = normalizePartLookupKey(row?.part_inventory_number)
            const parentInvKey = normalizePartLookupKey(row?.inventory_number)
            const meta = { name, drawing }
            if (invKey && !partMetaMap.has(invKey)) partMetaMap.set(invKey, meta)
            if (parentInvKey && !partMetaMap.has(parentInvKey)) partMetaMap.set(parentInvKey, meta)
          }
          const { data: partsByPartInv } = await supabase
            .from('parts_info')
            .select('part_inventory_number,inventory_number,part_name,part_drawing_number')
            .in('part_inventory_number', invValues)
          ;(partsByPartInv || []).forEach(upsertMeta)
          const { data: partsByInv } = await supabase
            .from('parts_info')
            .select('part_inventory_number,inventory_number,part_name,part_drawing_number')
            .in('inventory_number', invValues)
          ;(partsByInv || []).forEach(upsertMeta)
          return list.map((row: any) => {
            const key = normalizePartLookupKey(row?.part_inventory_number)
            const meta = (key && partMetaMap.get(key)) || null
            if (!meta) return row
            return {
              ...row,
              part_name: meta.name || String(row?.part_name || ''),
              part_drawing_number: meta.drawing || String(row?.part_drawing_number || '')
            }
          })
        }
        const qs = getQuery(cleanUrl)
        const invsParam = (qs.get('invs') || '').trim()
        if (invsParam) {
          const invs = invsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
          try {
            let q = supabase.from('work_hours').select('*')
            if (invs.length > 0) q = q.in('part_inventory_number', invs)
            const { data, error } = await q
            if (error) return jsonResponse({ success: true, items: [], total: 0, page: 1, pageSize: invs.length || 0, totals: { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }, data: [] })
            const items = dedupeWorkHoursRows(await enrichWorkHourPartMeta(data || []))
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
            return jsonResponse({ success: true, items, total: items.length, page: 1, pageSize: invs.length || items.length, totals, data: items })
          } catch (e: any) {
            return jsonResponse({ success: false, error: e?.message || '查询失败' }, 500)
          }
        }
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 200)
        const order = qs.get('order') || 'work_date'
        const orderDir = (qs.get('order_dir') || 'desc').toLowerCase() === 'asc'
        const operator = String(qs.get('operator') || '').trim()
        const shift = String(qs.get('shift') || '').trim()
        const deviceNo = String(qs.get('device_no') || '').trim()
        const processName = String(qs.get('process_name') || '').trim()
        const start = String(qs.get('start_date') || qs.get('start') || '').trim()
        const end = String(qs.get('end_date') || qs.get('end') || '').trim()
        const keyword = String(qs.get('keyword') || '').trim()

        let query = supabase.from('work_hours').select('*', { count: 'planned' })
        if (operator) query = query.eq('operator', operator)
        if (shift) query = query.eq('shift', shift)
        if (deviceNo) query = query.eq('device_no', deviceNo)
        if (processName) query = query.eq('process_name', processName)
        if (start) query = query.gte('work_date', start)
        if (end) query = query.lte('work_date', end)
        if (keyword) {
          const kw = `%${keyword}%`
          query = query.or(
            `part_inventory_number.ilike.${kw},part_drawing_number.ilike.${kw},process_name.ilike.${kw},device_no.ilike.${kw},operator.ilike.${kw}`
          )
        }

        query = query.order(order, { ascending: orderDir })
        query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        const { data, error, count } = await query
        if (error) return jsonResponse({ success: true, items: [], total: 0, page, pageSize, totals: { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }, data: [] })
        const items = dedupeWorkHoursRows(await enrichWorkHourPartMeta(data || []))
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
        return jsonResponse({ success: true, items, total: count || items.length, page, pageSize, totals, data: items })
      }

      // Work hours create
      if (method === 'POST' && path === '/api/tooling/work-hours') {
        const body = await readBody()
        const required = ['part_inventory_number']
        for (const k of required) {
          if (!body[k]) return jsonResponse({ success: false, error: `缺少必填字段: ${k}` }, 400)
        }
        const auxMinutes = Math.max(0, Math.round(Number(body.aux_hours || 0) * 60))
        const procMinutes = Math.max(0, Math.round(Number(body.proc_hours || 0) * 60))
        if (auxMinutes > 660) return jsonResponse({ success: false, error: '辅助时长不能超过660分钟' }, 400)
        if (procMinutes > 660) return jsonResponse({ success: false, error: '程序时长不能超过660分钟' }, 400)
        let canonicalOperator = String(body.operator || '').trim()
        try {
          const userId = String(body.user_id || '').trim()
          const userPhone = String(body.user_phone || '').trim()
          let uq = supabase.from('users').select('id, real_name').limit(1)
          if (userId) uq = uq.eq('id', userId)
          else if (userPhone) uq = uq.eq('phone', userPhone)
          else if (canonicalOperator) uq = uq.ilike('real_name', canonicalOperator)
          const { data: userRows } = await uq
          const userRow = Array.isArray(userRows) ? userRows[0] : null
          if ((userId || userPhone) && !userRow) {
            return jsonResponse({ success: false, error: '用户信息已变更，请重新登录后再提交' }, 400)
          }
          if (userRow?.real_name) canonicalOperator = String(userRow.real_name || '').trim() || canonicalOperator
        } catch {}
        try {
          const requestedOperator = String(body.operator || '').trim()
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
                if (normalizeName((r as any)?.operator) === targetOld) ids.push(String((r as any).id || ''))
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
        const payload: any = {
          part_inventory_number: String(body.part_inventory_number || ''),
          part_drawing_number: String(body.part_drawing_number || ''),
          part_name: String(body.part_name || ''),
          hours: Number(body.hours || 0),
          aux_hours: Number(body.aux_hours || 0),
          proc_hours: Number(body.proc_hours || 0),
          aux_start_time: body.aux_start_time ? String(body.aux_start_time || '') : null,
          aux_end_time: body.aux_end_time ? String(body.aux_end_time || '') : null,
          work_date: String(body.work_date || ''),
          shift_date: String(body.shift_date || ''),
          process_name: String(body.process_name || ''),
          operator: canonicalOperator,
          completed_quantity: Number(body.completed_quantity || 0),
          device_no: String(body.device_no || ''),
          shift: String(body.shift || '')
        }
        try {
          let dupQuery = supabase
            .from('work_hours')
            .select('*')
            .eq('work_date', payload.work_date)
            .eq('part_inventory_number', payload.part_inventory_number)
            .eq('operator', payload.operator)
            .order('created_at', { ascending: false })
            .limit(50)
          if (payload.process_name) dupQuery = dupQuery.eq('process_name', payload.process_name)
          if (payload.device_no) dupQuery = dupQuery.eq('device_no', payload.device_no)
          if (payload.shift) dupQuery = dupQuery.eq('shift', payload.shift)
          const { data: dupRows } = await dupQuery
          const incomingKey = buildWorkHourDedupKey(payload)
          const duplicated = (dupRows || []).find((r: any) => buildWorkHourDedupKey(r) === incomingKey)
          if (duplicated) return jsonResponse({ success: true, data: duplicated, deduplicated: true, message: '检测到重复提交，已自动忽略' })
        } catch {}
        try {
          let result = await supabase.from('work_hours').insert(payload).select('*').single()
          if (result.error) {
            const errMsg = String(result.error.message || '').toLowerCase()
            const hitPartNameColumnError = errMsg.includes('part_name') && (
              errMsg.includes('column') || errMsg.includes('schema cache')
            )
            if (hitPartNameColumnError) {
              const fallbackPayload = { ...payload }
              delete (fallbackPayload as any).part_name
              result = await supabase.from('work_hours').insert(fallbackPayload).select('*').single()
            }
          }
          if (result.error) return jsonResponse({ success: false, error: result.error.message }, 500)
          return jsonResponse({ success: true, data: result.data })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '提交失败' }, 500)
        }
      }

      // Program entries list
      if (method === 'GET' && path === '/api/tooling/program-entries') {
        const qs = getQuery(cleanUrl)
        const page = Math.max(Number(qs.get('page') || 1), 1)
        const pageSize = Math.max(Number(qs.get('pageSize') || 200), 1)
        const offset = (page - 1) * pageSize
        try {
          const { data, error, count } = await supabase
            .from('program_entries')
            .select('id, part_inventory_number, part_drawing_number, process_name, program_no, program_duration_minutes, programmed_at, programmer', { count: 'exact' })
            .order('programmed_at', { ascending: false })
            .range(offset, offset + pageSize - 1)
          if (error) {
            return jsonResponse({ success: false, error: error.message }, 500)
          }
          return jsonResponse({
            success: true,
            items: Array.isArray(data) ? data : [],
            total: Number(count || 0),
            page,
            pageSize
          })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '读取程序录入失败' }, 500)
        }
      }

      // Program entry delete
      if (method === 'DELETE' && /^\/api\/tooling\/program-entries\/[^/]+$/.test(path)) {
        const rowId = decodeURIComponent(path.split('/').pop() || '').trim()
        if (!rowId) {
          return jsonResponse({ success: false, error: '缺少程序录入ID' }, 400)
        }
        try {
          const { data, error } = await supabase
            .from('program_entries')
            .delete()
            .eq('id', rowId)
            .select('id')
          if (error) {
            return jsonResponse({ success: false, error: error.message }, 500)
          }
          return jsonResponse({
            success: true,
            deleted: Array.isArray(data) ? data.length : 0
          })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '删除程序录入失败' }, 500)
        }
      }

      // Program entries batch upsert
      if (method === 'POST' && path === '/api/tooling/program-entries/batch') {
        const body = await readBody()
        const rawItems = Array.isArray(body?.items) ? body.items : []
        if (rawItems.length === 0) return jsonResponse({ success: false, error: '缺少程序录入数据' }, 400)

        let canonicalProgrammer = String(body?.operator || '').trim() || '系统用户'
        try {
          const userId = String(body?.user_id || '').trim()
          const userPhone = String(body?.user_phone || '').trim()
          let uq = supabase.from('users').select('id, real_name').limit(1)
          if (userId) uq = uq.eq('id', userId)
          else if (userPhone) uq = uq.eq('phone', userPhone)
          else if (canonicalProgrammer) uq = uq.ilike('real_name', canonicalProgrammer)
          const { data: userRows } = await uq
          const userRow = Array.isArray(userRows) ? userRows[0] : null
          if ((userId || userPhone) && !userRow) {
            return jsonResponse({ success: false, error: '用户信息已变更，请重新登录后再提交' }, 400)
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

          if (!partInventoryNumber) throw new Error(`第 ${index + 1} 行缺少盘存编号`)
          if (!partDrawingNumber) throw new Error(`第 ${index + 1} 行缺少零件编号`)
          if (!processName) throw new Error(`第 ${index + 1} 行缺少工艺工序`)
          if (!programNo) throw new Error(`第 ${index + 1} 行缺少程序编号`)
          if (!Number.isFinite(programDurationMinutes) || programDurationMinutes < 0) {
            throw new Error(`第 ${index + 1} 行程序时长不合法`)
          }

          return {
            id: rowId || undefined,
            part_inventory_number: partInventoryNumber,
            part_drawing_number: partDrawingNumber,
            process_name: processName,
            program_no: programNo,
            program_duration_minutes: programDurationMinutes,
            programmed_at: programmedAt,
            programmer: canonicalProgrammer
          }
        })

        try {
          let result = await supabase
            .from('program_entries')
            .upsert(items as any, { onConflict: 'id' })
            .select('*')
          if (result.error) {
            const noIdItems = items.map((item: any) => {
              const next = { ...item }
              delete next.id
              return next
            })
            result = await supabase
              .from('program_entries')
              .insert(noIdItems as any)
              .select('*')
          }
          if (result.error) return jsonResponse({ success: false, error: result.error.message }, 500)
          return jsonResponse({
            success: true,
            items: result.data || [],
            inserted: Array.isArray(result.data) ? result.data.length : 0
          })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '保存失败' }, 500)
        }
      }

      const normTextSafe = (v: any) => String(v || '').trim()
      const getWorkHoursDeleteContext = async (operator: string, userId: string) => {
        const uid = normTextSafe(userId)
        const op = normTextSafe(operator)
        const usersQuery = supabase.from('users').select('id, real_name, role_id')
        const { data: userRows } = uid
          ? await usersQuery.eq('id', uid).limit(1)
          : await usersQuery.eq('real_name', op).limit(1)
        const userRow = Array.isArray(userRows) ? (userRows[0] as any) : null
        const actorName = normTextSafe(userRow?.real_name || op)
        let roleName = ''
        if (userRow?.role_id) {
          const { data: roleRows } = await supabase
            .from('roles')
            .select('name')
            .eq('id', String(userRow.role_id))
            .limit(1)
          roleName = String((roleRows || [])[0]?.name || '')
        }
        return {
          actorName,
          isSuperAdmin: roleName.includes('超级管理员')
        }
      }

      // Work hours delete
      {
        const m = path.match(/^\/api\/tooling\/work-hours\/([^\/]+)$/)
        if (m && method === 'DELETE') {
          const id = m[1]
          if (!id) return jsonResponse({ success: false, error: '缺少ID' }, 400)
          const body = await readBody()
          // 注意：这里不能构造 Headers(init.headers)，中文姓名会触发非 ISO-8859-1 异常
          const userId = normTextSafe((body?.userId || getQuery(cleanUrl).get('userId') || ''))
          const operator = normTextSafe((body?.operator || getQuery(cleanUrl).get('operator') || ''))
          const auth = await getWorkHoursDeleteContext(operator, userId)
          if (!auth.isSuperAdmin) {
            const normalizeName = (v: any) =>
              String(v || '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/\s+/g, '')
                .toLowerCase()
            const { data: row, error: rowErr } = await supabase
              .from('work_hours')
              .select('id, operator')
              .eq('id', id)
              .single()
            if (rowErr || !row) return jsonResponse({ success: false, error: '记录不存在' }, 404)
            if (normalizeName((row as any).operator) !== normalizeName(auth.actorName)) {
              return jsonResponse({ success: false, error: '仅可删除自己提交的数据' }, 403)
            }
          }
          try {
            const { error, count } = await supabase.from('work_hours').delete({ count: 'exact' }).eq('id', id)
            if (error) return jsonResponse({ success: false, error: error.message }, 500)
            if (Number(count || 0) === 0) return jsonResponse({ success: false, error: '记录不存在或无权限删除' }, 404)
            return jsonResponse({ success: true })
          } catch (e: any) {
            return jsonResponse({ success: false, error: e?.message || '删除失败' }, 500)
          }
        }
      }

      // Work hours batch delete
      if (method === 'POST' && path === '/api/tooling/work-hours/batch-delete') {
        const body = await readBody()
        const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
        if (ids.length === 0) return jsonResponse({ success: false, error: '缺少ids' }, 400)
        const userId = normTextSafe(body?.userId)
        const operator = normTextSafe(body?.operator)
        const auth = await getWorkHoursDeleteContext(operator, userId)
        if (!auth.isSuperAdmin) return jsonResponse({ success: false, error: '仅超级管理员可删除工时数据' }, 403)
        try {
          const { error } = await supabase.from('work_hours').delete().in('id', ids)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, deleted: ids.length })
        } catch (e: any) {
          return jsonResponse({ success: false, error: e?.message || '删除失败' }, 500)
        }
      }

      // Cutting orders list
      if (method === 'GET' && path === '/api/cutting-orders') {
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 1000)
        const startTime = Date.now()
        const materialSource = String(qs.get('material_source') || '').trim()
        const startDate = qs.get('startDate')
        const endDate = qs.get('endDate')
        const keyword = String(qs.get('keyword') || '').trim()
        const sortField = String(qs.get('sortField') || 'created_date')
        const sortOrderAsc = String(qs.get('sortOrder') || 'desc').toLowerCase() === 'asc'

        const selectCols = [
          'id','inventory_number','project_name','part_drawing_number','part_name','material','specifications','part_quantity','total_weight','material_source','created_date','tooling_id','tooling_info_id','part_id','remarks'
        ].join(',')

        let query = supabase.from('cutting_orders').select(selectCols, { count: 'planned' })
        query = query.eq('is_deleted', false)

        if (materialSource) query = query.eq('material_source', materialSource)
        if (startDate) query = query.gte('created_date', startDate)
        if (endDate) query = query.lte('created_date', endDate)
        if (keyword) {
          const kw = `%${keyword}%`
          query = query.or(
            `inventory_number.ilike.${kw},project_name.ilike.${kw},part_name.ilike.${kw},part_drawing_number.ilike.${kw}`
          )
        }

        query = query.order(sortField, { ascending: sortOrderAsc })

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)

        const { data, error, count } = await query
        if (error) return jsonResponse({ success: true, items: [], total: 0, page, pageSize, queryTime: Date.now() - startTime, data: [] })

        let items = (data || []) as any[]
        items = items.map((row: any) => ({
          ...row,
          tooling_id: row.tooling_id || row.tooling_info_id || row.tooling_id
        }))
        const missingTooling = items.filter(r => !r.tooling_id && r.inventory_number)
        if (missingTooling.length > 0) {
          const parentInvs = Array.from(new Set(missingTooling.map(r => String(r.inventory_number || '').trim().slice(0, 10)).filter(Boolean)))
          if (parentInvs.length > 0) {
            const { data: tinfo } = await supabase
              .from('tooling_info')
              .select('id, inventory_number')
              .in('inventory_number', parentInvs)
            const invToId = new Map<string, string>()
            ;(tinfo || []).forEach(t => invToId.set(String((t as any).inventory_number || ''), String((t as any).id || '')))
            items = items.map(r => {
              if (r.tooling_id) return r
              const parentInv = String(r.inventory_number || '').trim().slice(0, 10)
              const tid = invToId.get(parentInv) || ''
              return { ...r, tooling_id: tid || r.tooling_id }
            })
          }
        }
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
        return jsonResponse({ success: true, items, total: count || items.length, page, pageSize, queryTime: Date.now() - startTime, data: items })
      }

      // Cutting orders create (optimize & normalize, no upsert)
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
          const rawRemark = typeof raw.remarks === 'string' ? String(raw.remarks).trim() : ''
          const isHeat = (() => {
            if (!rawRemark) return false
            const v = rawRemark.toLowerCase()
            return v.includes('调质') || v.includes('热处理') || v === '是' || v === '1' || v === 'yes' || v === 'true'
          })()
          if (isHeat || raw.heat_treatment) payload.remarks = '需调质'
          else if (rawRemark) payload.remarks = rawRemark
          return payload
        }).filter((p: any) => p.inventory_number && p.part_name && p.part_quantity > 0)

        const invs = Array.from(new Set(normalized.map((p: any) => p.inventory_number)))
        const { data: existing } = await supabase
          .from('cutting_orders')
          .select('id, inventory_number, created_date')
          .in('inventory_number', invs)
          .eq('is_deleted', false)

        const keepIdByInv = new Map<string, string>()
        const dupIdsToDelete: string[] = []
        const groups = new Map<string, any[]>()
        ;(existing || []).forEach((e: any) => {
          const inv = String(e?.inventory_number || '')
          if (!inv) return
          const list = groups.get(inv) || []
          list.push(e)
          groups.set(inv, list)
        })
        for (const [inv, list] of groups.entries()) {
          const sorted = list.slice().sort((a: any, b: any) => {
            const ad = String(a?.created_date || '')
            const bd = String(b?.created_date || '')
            if (ad && bd) return ad.localeCompare(bd)
            return String(a?.id || '').localeCompare(String(b?.id || ''))
          })
          const keep = sorted[0]
          const keepId = String(keep?.id || '')
          if (keepId) keepIdByInv.set(inv, keepId)
          for (let i = 1; i < sorted.length; i++) {
            const id = String(sorted[i]?.id || '')
            if (id) dupIdsToDelete.push(id)
          }
        }
        if (dupIdsToDelete.length) {
          const { error: delErr } = await supabase
            .from('cutting_orders')
            .update({ is_deleted: true, updated_date: nowIso })
            .in('id', dupIdsToDelete)
          if (delErr) return jsonResponse({ success: false, error: delErr.message }, 500)
        }

        const existingSet = new Set<string>(Array.from(keepIdByInv.keys()))
        const toInsert = normalized.filter((p: any) => !existingSet.has(String(p.inventory_number)))
        const toUpdate = normalized.filter((p: any) => existingSet.has(String(p.inventory_number)))

        let inserted = 0
        let updated = 0
        if (toInsert.length) {
          const { error: insErr } = await supabase.from('cutting_orders').insert(toInsert)
          if (insErr) return jsonResponse({ success: false, error: insErr.message }, 500)
          inserted = toInsert.length
        }
        for (const row of toUpdate) {
          const keepId = keepIdByInv.get(String(row.inventory_number)) || ''
          if (!keepId) continue
          const { error: updErr } = await supabase.from('cutting_orders').update({
            project_name: row.project_name,
            part_drawing_number: row.part_drawing_number,
            part_name: row.part_name,
            specifications: row.specifications,
            part_quantity: row.part_quantity,
            material_source: row.material_source,
            material: row.material,
            total_weight: row.total_weight,
            tooling_id: row.tooling_id,
            part_id: row.part_id,
            tooling_info_id: row.tooling_info_id,
            is_deleted: false,
            updated_date: nowIso,
            remarks: row.remarks || null
          }).eq('id', keepId)
          if (updErr) return jsonResponse({ success: false, error: updErr.message }, 500)
          updated++
        }
        const skipped = rows.length - inserted - updated
        return jsonResponse({ success: true, stats: { inserted, updated, skipped } })
      }

      // Cutting orders delete (single -> soft delete)
      {
        const m = path.match(/^\/api\/cutting-orders\/([^\/]+)$/)
        if (m && method === 'PUT') {
          const id = m[1]
          const body = await readBody()
          const payload: any = {}
          if (Object.prototype.hasOwnProperty.call(body, 'part_quantity')) {
            const qtyNum = Number(body.part_quantity)
            if (!Number.isFinite(qtyNum) || qtyNum <= 0) return jsonResponse({ success: false, error: '数量必须为大于0的数字' }, 400)
            payload.part_quantity = qtyNum
          }
          if (Object.prototype.hasOwnProperty.call(body, 'total_weight')) {
            const weightNum = Number(body.total_weight)
            payload.total_weight = Number.isFinite(weightNum) ? weightNum : null
          }
          if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
            payload.notes = String(body.notes ?? '').trim() || null
          }
          if (Object.keys(payload).length === 0) return jsonResponse({ success: false, error: '缺少可更新字段' }, 400)
          payload.updated_date = new Date().toISOString()
          const { data, error } = await supabase
            .from('cutting_orders')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single()
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true, data })
        }
        if (m && method === 'DELETE') {
          const id = m[1]
          if (!id) return jsonResponse({ success: false, error: '缺少ID' }, 400)
          const { error } = await supabase
            .from('cutting_orders')
            .update({ is_deleted: true, updated_date: new Date().toISOString() })
            .eq('id', id)
          if (error) return jsonResponse({ success: false, error: error.message }, 500)
          return jsonResponse({ success: true })
        }
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

      // Purchase orders API handled by client-side fallback
      if (method === 'GET' && path === '/api/purchase-orders') {
        console.log('[API] GET /api/purchase-orders called')
        const qs = getQuery(cleanUrl)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 20)
        const status = qs.get('status')
        const start_date = qs.get('start_date')
        const end_date = qs.get('end_date')
        const search = qs.get('search')
        const sortField = qs.get('sortField') || 'created_date'
        const sortOrder = (qs.get('sortOrder') || 'desc').toLowerCase() === 'asc'

        let query = scopedClient
          .from('purchase_orders')
          .select(`*, 
            tooling_info(
              production_unit,
              recorder
            )`, { count: 'planned' })

        // Search
        if (search && search.trim()) {
          const keyword = `%${search.trim()}%`
          query = query.or(`inventory_number.ilike.${keyword},project_name.ilike.${keyword},part_name.ilike.${keyword},supplier.ilike.${keyword}`)
        }

        // Filters
        if (status) query = query.eq('status', status)
        if (start_date) query = query.gte('created_date', start_date)
        if (end_date) query = query.lte('created_date', end_date)

        // Sort
        query = query.order(sortField, { ascending: sortOrder })

        // Pagination
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)

        console.log('[API] Executing purchase orders query with auth:', !!authToken)
        const { data, error, count } = await query
        console.log('[API] Purchase orders query result:', { count, dataLength: data?.length, error })
        
        if (error) return jsonResponse({ success: false, error: error.message }, 500)

        // Process data to match backend format
        const items = (data || []).map((item: any) => {
          // Extract tooling_info
          let production_unit = item.production_unit
          let recorder = item.applicant

          if (item.tooling_info) {
             // Handle array or object (Supabase returns array for 1:N but we expect 1:1 here usually)
             const info = Array.isArray(item.tooling_info) ? item.tooling_info[0] : item.tooling_info
             if (info) {
               if (!production_unit) production_unit = info.production_unit
               if (!recorder) recorder = info.recorder
             }
          }

          return {
            ...item,
            production_unit,
            applicant: recorder, // Map recorder to applicant if needed or keep separate
            demand_date: item.demand_date || item.required_date, // Fallback
            source: (item.tooling_id || item.child_item_id || item.part_id) ? '工装信息' : '临时计划'
          }
        })

        return jsonResponse({ 
          success: true, 
          items, 
          total: count || 0, 
          page, 
          pageSize 
        })
      }

      if (method === 'POST' && path === '/api/purchase-orders') {
         const body = await readBody()
         const orders = Array.isArray(body?.orders) ? body.orders : []
         if (orders.length === 0) return jsonResponse({ success: false, error: '缺少orders' }, 400)
 
         // Verify Authentication
         // Use token from headers if available, otherwise check current session
         let session = null
         if (authToken && authToken.startsWith('Bearer ')) {
             const token = authToken.split(' ')[1]
             const { data } = await scopedClient.auth.getUser(token)
             if (data.user) {
                 session = { user: data.user }
             }
         }
         
         if (!session) {
            const { data } = await supabase.auth.getSession()
            session = data.session
         }

         if (!session) {
             console.warn('[PurchaseOrders] No active session found during create')
         } else {
             // console.log('[PurchaseOrders] Active session found for user:', session.user.id)
         }
 
         let inserted = 0
        let updated = 0
        let skipped = 0
        const results = []

        for (const order of orders) {
           // Basic validation
           if (!order.part_name || !order.part_quantity) {
             skipped++
             continue
           }

           const payload: any = {
             project_name: order.project_name || '',
             part_name: order.part_name || '',
             part_quantity: Number(order.part_quantity),
             unit: order.unit || '件',
             model: order.model || null,
             supplier: order.supplier || null,
             required_date: order.required_date || null,
             remark: order.remark || null,
             status: order.status || 'pending',
             tooling_id: order.tooling_id || null,
             child_item_id: order.child_item_id || null,
             part_id: order.part_id || null,
             production_unit: order.production_unit || null,
             demand_date: order.demand_date || null,
             applicant: order.applicant || order.recorder || session?.user?.id || null, // Prefer session user ID if applicant missing
             weight: order.weight ?? null,
            total_price: order.total_price ?? null,
            created_date: order.created_date || new Date().toISOString()
          }
            
          if (order.inventory_number) {
             payload.inventory_number = order.inventory_number
             // Check existence - use maybeSingle to avoid 406
             const { data: existing, error: findError } = await scopedClient
               .from('purchase_orders')
               .select('id, status')
               .eq('inventory_number', order.inventory_number)
               .maybeSingle()
             
             if (existing) {
               // Update if exists
               // Only update if not completed/cancelled? Or always update?
               // Backend logic was: update if status is pending/draft
               if (existing.status !== 'completed' && existing.status !== 'cancelled') {
                 const { error } = await scopedClient
                   .from('purchase_orders')
                   .update({ ...payload, updated_date: new Date().toISOString() })
                   .eq('id', existing.id)
                 if (!error) {
                   updated++
                   results.push({ ...existing, ...payload })
                 } else {
                    console.error('Update failed:', error)
                 }
               } else {
                 skipped++
                 results.push(existing)
               }
               continue
             }
           }

           const { data: newOrder, error } = await scopedClient
             .from('purchase_orders')
             .insert(payload)
             .select()
             .single()
           
           if (!error) {
             inserted++
             results.push(newOrder)
           } else {
             console.error('Insert purchase order failed:', error)
             // 针对 RLS 错误提供更详细的提示
             if (error.code === '42501') {
                 // 如果是非 GitHub Pages 环境下的 RLS 错误，极有可能是因为没有 Token，
                 // 此时如果是在本地或局域网环境，我们应该提示用户检查后端连接，或者直接报错引导其使用后端
                 if (!isGhPages) {
                    console.error('[API] RLS error detected on critical table. This usually means your token is missing or invalid. In local environment, requests should have been routed to the backend.')
                 }
                 return jsonResponse({ 
                   success: false, 
                   error: '权限不足：无法创建采购单 (RLS)', 
                   details: {
                     code: '42501',
                     message: 'new row violates row-level security policy for table "purchase_orders"',
                     hint: '请检查数据库 purchase_orders 表的 RLS 策略。如果是本地运行，请确保本地后端已启动并能正常连接数据库。如果需要彻底解决 RLS 限制，请在 Supabase SQL Editor 执行: ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;'
                   } 
                 }, 403)
             }
             return jsonResponse({ success: false, error: error.message, details: error }, 500)
           }
        }

        return jsonResponse({ success: true, stats: { inserted, updated, skipped }, items: results })
      }

      // Purchase orders rollback
      if (method === 'POST' && path === '/api/purchase-orders/rollback') {
        const body = await readBody()
        const orders = Array.isArray(body?.orders) ? body.orders : []
        if (orders.length === 0) return jsonResponse({ success: false, error: '缺少orders' }, 400)

        try {
          console.log(`[PurchaseOrders] Rolling back ${orders.length} orders...`)
          const manualRestores: any[] = []
          const backupRestores: any[] = []
          const idsToDelete: string[] = []

          const parseModel = (modelText: string) => {
            if (!modelText) return { material: '', specs: '' }
            const match = modelText.match(/^(.*?) \((.*?)\)$/)
            if (match) return { material: match[1], specs: match[2] }
            return { material: modelText, specs: modelText }
          }
          const parseMaterialTypeFromRemark = (remarkText: string) => {
            const text = String(remarkText || '')
            const m = text.match(/\[MT:([^\]]+)\]/)
            return m ? String(m[1] || '').trim() : ''
          }

          for (const item of orders) {
            if (!item?.id) continue
            idsToDelete.push(item.id)

            const inv = String(item.inventory_number || '').trim()
            if (inv.toUpperCase().startsWith('MANUAL-')) {
              const originalId = inv.slice(7).trim()
              manualRestores.push({
                id: originalId,
                part_name: item.part_name,
                model: item.model,
                part_quantity: item.part_quantity,
                unit: item.unit,
                project_name: item.project_name,
                production_unit: item.production_unit,
                demand_date: item.demand_date,
                applicant: item.applicant,
                created_date: new Date().toISOString(),
                status: 'draft'
              })
            } else if (inv.toUpperCase().startsWith('BACKUP-')) {
              const originalId = inv.slice(7).trim()
              const { material, specs } = parseModel(item.model || '')
              const qtyNum = Number(item.part_quantity)
              const totalPriceNum = Number(item.total_price)
              const weightNum = Number(item.weight)
              backupRestores.push({
                id: originalId,
                material_name: item.part_name,
                material: material,
                model: specs,
                quantity: Number.isFinite(qtyNum) ? qtyNum : 0,
                unit: item.unit,
                project_name: item.project_name,
                supplier: item.supplier || item.production_unit,
                material_type: String(item.material_source || '').trim() || parseMaterialTypeFromRemark(String(item.remark || '')),
                material_source: String(item.material_source || '').trim() || parseMaterialTypeFromRemark(String(item.remark || '')),
                demand_date: item.demand_date,
                applicant: item.applicant,
                ...(Number.isFinite(weightNum) && weightNum >= 0 ? { weight: weightNum } : {}),
                ...(Number.isFinite(totalPriceNum) && totalPriceNum >= 0 && Number.isFinite(qtyNum) && qtyNum > 0
                  ? { unit_price: Number((totalPriceNum / qtyNum).toFixed(6)) }
                  : {}),
                ...(Number.isFinite(totalPriceNum) && totalPriceNum >= 0 ? { total_price: totalPriceNum } : {}),
                // 与后端保持一致：同时兼容仅有 price 的库结构
                ...(Number.isFinite(totalPriceNum) && totalPriceNum >= 0 ? { price: totalPriceNum } : {}),
                created_date: new Date().toISOString(),
                is_manual: true
              })
            }
          }

          if (manualRestores.length > 0) {
            console.log(`[PurchaseOrders] Restoring manual records: ${manualRestores.length}`)
            const { error: mError } = await scopedClient.from('manual_purchase_plans').insert(manualRestores)
            if (mError) throw mError
          }

          if (backupRestores.length > 0) {
            console.log(`[PurchaseOrders] Restoring backup records: ${backupRestores.length}`)
            // 兼容不同环境列差异：若提示缺少列则自动移除该列后重试
            let backupPayload = backupRestores.map((x) => ({ ...x }))
            for (let i = 0; i < 6; i += 1) {
              const { error: bError } = await scopedClient.from('backup_materials').insert(backupPayload)
              if (!bError) break
              const msg = String((bError as any)?.message || '')
              const missing = msg.match(/Could not find the '([^']+)' column/i)?.[1]
              if (missing) {
                backupPayload = backupPayload.map((row) => {
                  const next = { ...row } as any
                  delete next[missing]
                  return next
                })
                continue
              }
              throw bError
            }
          }

          if (idsToDelete.length > 0) {
            console.log(`[PurchaseOrders] Deleting purchase_orders: ${idsToDelete.length}`)
            const { error: delError } = await scopedClient
              .from('purchase_orders')
              .delete()
              .in('id', idsToDelete)
            if (delError) throw delError
          }

          return jsonResponse({ success: true })
        } catch (err) {
          console.error('[PurchaseOrders] Rollback failed:', err)
          return jsonResponse({ success: false, error: (err as Error).message }, 500)
        }
      }

      if (method === 'POST' && path === '/api/purchase-orders/batch-delete') {
        const body = await readBody()
        const ids = Array.isArray(body?.ids) ? body.ids : []
        if (ids.length === 0) return jsonResponse({ success: false, error: '缺少ids' }, 400)

        const { error } = await supabase
          .from('purchase_orders')
          .delete()
          .in('id', ids)

        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      // PUT /api/purchase-orders/:id - 更新采购单字段（申请日期、需求日期）
      if (method === 'PUT' && path.match(/^\/api\/purchase-orders\/[^\/]+$/) && !path.endsWith('/status')) {
        const id = path.split('/').pop()
        const body = await readBody()
        if (!id || (!body.created_date && !body.demand_date)) return jsonResponse({ success: false, error: '缺少参数' }, 400)

        const updateData: Record<string, any> = {}
        if (body.created_date) updateData.created_date = body.created_date
        if (body.demand_date) updateData.demand_date = body.demand_date
        updateData.updated_date = new Date().toISOString()

        const { data, error } = await supabase.from('purchase_orders').update(updateData).eq('id', id).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }


      // Companies
      if (method === 'GET' && path === '/api/companies') {
        const qs = getQuery(cleanUrl)
        const id = qs.get('id')
        let query = scopedClient.from('companies').select('*')
        if (id) query = query.eq('id', id)
        const { data, error } = await query
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        const items = Array.isArray(data) ? data : []
        const first = items[0]
        return jsonResponse({ success: true, items, data: first })
      }

      // Workshops & teams (organization data)
      if (method === 'GET' && path === '/api/tooling/org/workshops') {
        const qs = getQuery(cleanUrl)
        const companyId = qs.get('company_id')
        let query = scopedClient.from('workshops').select('*')
        if (companyId) query = query.eq('company_id', companyId)
        const { data, error } = await query
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, items: data || [], data: data || [] })
      }
      if (method === 'POST' && path === '/api/tooling/org/workshops') {
        const body = await readBody()
        const { data, error } = await scopedClient
          .from('workshops')
          .insert({ company_id: body.company_id || null, name: body.name || '' })
          .select('*')
          .single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      if (method === 'PUT' && path.match(/^\/api\/tooling\/org\/workshops\/[^\/]+$/)) {
        const id = path.split('/').pop()
        if (!id) return jsonResponse({ success: false, error: 'Invalid workshop ID' }, 400)
        const body = await readBody()
        const { data, error } = await scopedClient.from('workshops').update(body).eq('id', id).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      if (method === 'DELETE' && path.match(/^\/api\/tooling\/org\/workshops\/[^\/]+$/)) {
        const id = path.split('/').pop()
        if (!id) return jsonResponse({ success: false, error: 'Invalid workshop ID' }, 400)
        const { error } = await scopedClient.from('workshops').delete().eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      if (method === 'GET' && path === '/api/tooling/org/teams') {
        const qs = getQuery(cleanUrl)
        const companyId = qs.get('company_id')
        const workshopId = qs.get('workshop_id')
        let query = scopedClient.from('teams').select('*')
        if (companyId) query = query.eq('company_id', companyId)
        if (workshopId) query = query.eq('workshop_id', workshopId)
        const { data, error } = await query
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, items: data || [], data: data || [] })
      }
      if (method === 'POST' && path === '/api/tooling/org/teams') {
        const body = await readBody()
        const payload: any = {
          company_id: body.company_id || null,
          workshop_id: body.workshop_id || null,
          name: body.name || ''
        }
        if (body.aux_coeff !== undefined) payload.aux_coeff = body.aux_coeff
        if (body.proc_coeff !== undefined) payload.proc_coeff = body.proc_coeff
        const { data, error } = await scopedClient.from('teams').insert(payload).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      if (method === 'PUT' && path.match(/^\/api\/tooling\/org\/teams\/[^\/]+$/)) {
        const id = path.split('/').pop()
        if (!id) return jsonResponse({ success: false, error: 'Invalid team ID' }, 400)
        const body = await readBody()
        const { data, error } = await scopedClient.from('teams').update(body).eq('id', id).select('*').single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true, data })
      }
      if (method === 'DELETE' && path.match(/^\/api\/tooling\/org\/teams\/[^\/]+$/)) {
        const id = path.split('/').pop()
        if (!id) return jsonResponse({ success: false, error: 'Invalid team ID' }, 400)
        const { error } = await scopedClient.from('teams').delete().eq('id', id)
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ success: true })
      }

      // Parts inventory list
      if (method === 'GET' && path === '/api/tooling/parts/inventory-list') {
        const qs = getQuery(url)
        const page = Math.max(Number(qs.get('page') || 1) || 1, 1)
        const pageSize = Math.max(Number(qs.get('pageSize') || 50) || 50, 1)
        const search = String(qs.get('search') || '').trim()
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        const expr = search ? `%${search}%` : ''
        const BATCH_SIZE = 1000
        const withRetry = async (build: () => Promise<any>) => {
          let last: any = null
          for (let i = 0; i < 3; i += 1) {
            const res = await build()
            if (!res?.error) return res
            last = res
            await new Promise(resolve => setTimeout(resolve, 180 * (i + 1)))
          }
          return last
        }
        const fetchBatched = async (build: (offset: number, limit: number) => any) => {
          const all: any[] = []
          let offset = 0
          while (true) {
            if (!search && from + offset > to) break
            const { data, error } = await withRetry(() => build(offset, BATCH_SIZE))
            if (error) return { error }
            const rows = Array.isArray(data) ? data : []
            all.push(...rows)
            if (rows.length < BATCH_SIZE) break
            offset += BATCH_SIZE
          }
          return { data: all as any[] }
        }
        const { data: partsData, error: partsError } = await fetchBatched((offset, limit) => {
          let q = supabase
            .from('parts_info')
            .select('id, part_inventory_number, inventory_number, part_name, part_drawing_number, tooling_id, process_route')
          if (expr) {
            q = q.or(`part_inventory_number.ilike.${expr},inventory_number.ilike.${expr},part_name.ilike.${expr},part_drawing_number.ilike.${expr}`)
          }
          if (!search) {
            return q.order('part_inventory_number', { ascending: true }).range(from + offset, Math.min(to, from + offset + limit - 1))
          }
          return q.order('part_inventory_number', { ascending: true }).range(offset, offset + limit - 1)
        })
        if (partsError) return jsonResponse({ success: false, error: partsError.message }, 500)
        const mergedMap = new Map<string, any>()
        ;(partsData || []).forEach((p: any) => {
          const inv = String(p.part_inventory_number || p.inventory_number || '').trim()
          if (!inv) return
          mergedMap.set(inv.toUpperCase(), {
            id: String(p.id ?? p.uuid ?? ''),
            part_inventory_number: inv,
            part_name: String(p.part_name ?? ''),
            part_drawing_number: String(p.part_drawing_number ?? ''),
            tooling_id: String(p.tooling_id ?? ''),
            process_route: String(p.process_route ?? '')
          })
        })
        const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => String(a.part_inventory_number || '').localeCompare(String(b.part_inventory_number || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
        const items = merged.slice(from, to + 1)
        return jsonResponse({ success: true, items, total: merged.length, page, pageSize })
      }

      // Update parts process routes (client-side fallback)
      if (method === 'POST' && path === '/api/tooling/parts/process-routes') {
        const body = await readBody()
        const mappings: any[] = Array.isArray(body?.mappings) ? body.mappings : []
        if (!mappings.length) return jsonResponse({ success: false, error: '缺少mappings' }, 400)
        try {
          let updated = 0
          const failed: Array<{ key: string; reason: string }> = []
          for (const m of mappings) {
            const inv = String(m?.part_inventory_number || '').trim().toUpperCase()
            const drawing = String(m?.part_drawing_number || '').trim()
            const route = String(m?.process_route || '')
            if (!route) continue
            if (inv) {
              const result: any = await withTimeout(
                supabase.from('parts_info').update({ process_route: route }).eq('part_inventory_number', inv).select('id'),
                8000
              )
              const { data, error } = result || {}
              if (error) throw error
              const affected = Array.isArray(data) ? data.length : 0
              if (affected > 0) updated += affected
              else failed.push({ key: inv, reason: '未匹配到记录' })
            } else if (drawing) {
              const result: any = await withTimeout(
                supabase.from('parts_info').update({ process_route: route }).eq('part_drawing_number', drawing).select('id'),
                8000
              )
              const { data, error } = result || {}
              if (error) throw error
              const affected = Array.isArray(data) ? data.length : 0
              if (affected > 0) updated += affected
              else failed.push({ key: drawing, reason: '未匹配到记录' })
            }
          }
          return jsonResponse({ success: true, updated, failedCount: failed.length, failed: failed.slice(0, 50) })
        } catch (e: any) {
          const msg = String(e?.message || '更新工艺路线失败')
          return jsonResponse({ success: false, error: msg }, /TIMEOUT/.test(msg) ? 504 : 500)
        }
      }

      // 💚💚💚 save-totals-direct: 直接保存材料总额和加工总额到数据库
      if (method === 'POST' && path.match(/^\/api\/tooling\/[^/]+\/save-totals-direct$/)) {
        try {
          const body = await readBody()
          const { material_total, process_total } = body || {}
          
          console.log(`[API] 💚💚💚 save-totals-direct 收到:`, { material_total, process_total })
          
          // URL格式: /api/tooling/{toolingId}/save-totals-direct
          const pathParts = path.split('/').filter(Boolean)
          // toolingId 是倒数第二个部分（最后一个是 'save-totals-direct'）
          const toolingId = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : null
          if (!toolingId) return jsonResponse({ success: false, error: '缺少工具ID' }, 400)
          
          const updatedAt = new Date().toISOString()
          
          // 🔧 关键修复: 先尝试确保列存在（通过 RPC 或直接尝试）
          // 如果列不存在，Supabase 会报错，我们捕获后给出明确提示
          const { data: updateResult, error: updateError } = await supabase
            .from('tooling_info')
            .update({
              material_total: material_total ?? null,
              process_total: process_total ?? null,
              totals_updated_at: updatedAt
            })
            .eq('id', toolingId)
            .select('id, material_total, process_total, totals_updated_at')
            .single()
          
          if (updateError) {
            const errorMsg = String(updateError?.message || '')
            
            // 🎯 特殊处理：列不存在的错误
            if (errorMsg.includes('column') && errorMsg.includes('not find') || errorMsg.includes('schema cache')) {
              console.error(`[API] ❌ save-totals-direct 列不存在，需要先执行SQL迁移`)
              return jsonResponse({ 
                success: false, 
                error: 'DATABASE_SCHEMA_MISSING',
                details: 'tooling_info 表缺少 material_total/process_total/tot_updated_at 列。请在 Supabase Dashboard → SQL Editor 中执行: supabase/migrations/20260526_add_tooling_totals_columns.sql',
                hint: '需要数据库管理员执行 ALTER TABLE 添加缺失的列'
              }, 503)  // Service Unavailable - 需要管理员操作
            }
            
            console.error(`[API] ❌ save-totals-direct 更新失败:`, errorMsg)
            return jsonResponse({ success: false, error: errorMsg }, 500)
          }
          
          console.log(`[API] ✅✅✅ save-totals-direct 成功:`, updateResult)
          
          return jsonResponse({ 
            success: true, 
            data: updateResult,
            received: { material_total, process_total },
            message: '直接保存完成'
          })
        } catch (e: any) {
          console.error('[API] save-totals-direct 异常:', e)
          return jsonResponse({ success: false, error: e?.message || '保存失败' }, 500)
        }
      }

      // 💚💚 update-process-amount: 更新单个零件的加工金额
      if (method === 'POST' && path.match(/^\/api\/parts\/[^/]+\/update-process-amount$/)) {
        try {
          const body = await readBody()
          const { process_amount, amounts_updated_at } = body || {}
          
          const partId = path.split('/').filter(Boolean)[2]  // /api/parts/{id}/update-process-amount
          if (!partId) return jsonResponse({ success: false, error: '缺少零件ID' }, 400)
          
          const updatedAt = amounts_updated_at || new Date().toISOString()
          
          const { data: updateResult, error: updateError } = await supabase
            .from('parts_info')
            .update({
              process_amount: process_amount ?? null,
              amounts_updated_at: updatedAt
            })
            .eq('id', partId)
            .select('id, process_amount')
            .single()
          
          if (updateError) {
            console.error(`[API] ❌ update-process-amount 失败:`, updateError.message)
            return jsonResponse({ success: false, error: updateError.message }, 500)
          }
          
          return jsonResponse({ 
            success: true, 
            data: updateResult,
            message: '零件加工金额更新完成'
          })
        } catch (e: any) {
          console.error('[API] update-process-amount 异常:', e)
          return jsonResponse({ success: false, error: e?.message || '更新失败' }, 500)
        }
      }

      // Tooling users basic (Fallback if not caught by earlier check)
      if (method === 'GET' && path === '/api/tooling/users/basic') {
        try {
          const companyId = String(getQuery(url).get('company_id') || '').trim()
          // 返回与后端一致的数据结构：操作者 -> 车间/班组/辅系数/加系数/能力系数
          let usersQuery = supabase.from('users').select('real_name, workshop_id, team_id, capability_coeff, company_id, role_id, status')
          if (companyId) usersQuery = usersQuery.eq('company_id', companyId)
          const [usersRes, teamsRes, workshopsRes] = await Promise.all([
            usersQuery,
            supabase.from('teams').select('id, name, aux_coeff, proc_coeff'),
            supabase.from('workshops').select('id, name')
          ])
          const roleIds = Array.from(new Set(((usersRes.data || []) as any[]).map((u: any) => String(u.role_id || '')).filter(Boolean)))
          const rolesRes = roleIds.length > 0
            ? await supabase.from('roles').select('id, name').in('id', roleIds)
            : { data: [], error: null as any }
          
          const teamsMap = new Map<string, { name: string; aux_coeff: number; proc_coeff: number }>()
          if (teamsRes.data) {
            teamsRes.data.forEach((t: any) => teamsMap.set(String(t.id), {
              name: String(t.name || ''),
              aux_coeff: Number(t.aux_coeff ?? 1),
              proc_coeff: Number(t.proc_coeff ?? 1)
            }))
          }
          const workshopsMap = new Map<string, string>()
          if (workshopsRes.data) {
            workshopsRes.data.forEach((w: any) => workshopsMap.set(String(w.id), String(w.name || '')))
          }
          const roleNameMap = new Map<string, string>()
          ;((rolesRes.data || []) as any[]).forEach((r: any) => roleNameMap.set(String(r.id), String(r.name || '')))

          const items = ((usersRes.data || []) as any[])
            .filter((u: any) => String(u?.status || '').trim() === 'active' && String(roleNameMap.get(String(u?.role_id || '')) || '').trim() === '员工')
            .map((u: any) => ({
            real_name: u.real_name,
            workshop: u.workshop_id ? (workshopsMap.get(String(u.workshop_id)) || '') : '',
            team: u.team_id ? (teamsMap.get(String(u.team_id))?.name || '') : '',
            aux_coeff: Number(teamsMap.get(String(u.team_id))?.aux_coeff ?? 1),
            proc_coeff: Number(teamsMap.get(String(u.team_id))?.proc_coeff ?? 1),
            capability_coeff: Number(u.capability_coeff ?? 1)
          }))
          
          return jsonResponse({ success: true, items })
        } catch (e) {
          console.error('Error fetching users/basic:', e)
          return jsonResponse({ success: true, items: [] })
        }
      }
    }
    // Default fallback for unhandled paths - return 404 instead of null
    console.warn(`[API] Path not handled in handleClientSideApi: ${method} ${path}`)
    return jsonResponse({ success: false, error: `Path not handled: ${path}` }, 404)
  } catch (e: any) {
    console.error('Error in handleClientSideApi:', { error: e?.message || String(e), stack: e?.stack })
    return jsonResponse({ success: false, error: 'Internal Client API Error', details: e?.message }, 500)
  }
}
