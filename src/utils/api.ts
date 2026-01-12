export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  const DEFAULT_FUNCTION_BASE = 'https://oltsiocyesbgezlrcxze.functions.supabase.co'
  const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
  const rawBase = (import.meta as any)?.env?.VITE_API_URL || (isGhPages ? DEFAULT_FUNCTION_BASE : '')
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
    if (url.startsWith('/')) {
      return (base ? base.replace(/\/$/, '') : window.location.origin) + url
    }
    return url
  })()

  // Prefer client-side handling first on GitHub Pages to avoid 404 noise
  if (isGhPages && url.startsWith('/')) {
    const handled = await handleClientSideApi(abs, init)
    if (handled) return handled
  }
  try {
    const res = await fetch(abs, init)
    if (!res.ok && res.status >= 500) {
      if (isGhPages) return res
      const u = new URL(abs, window.location.origin)
      const fallback = `http://localhost:3003${u.pathname}${u.search}`
      return await fetch(fallback, init)
    }
    if (isGhPages && res.status === 404) {
      const handled = await handleClientSideApi(abs, init)
      if (handled) return handled
    }
    return res
  } catch {
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
      const u = typeof input === 'string' ? input : String((input as any)?.url || '')
      if (u.startsWith('/api')) {
        return await fetchWithFallback(u, init)
      }
      // Also intercept absolute calls to GitHub Pages domain
      if (/github\.io\/.+\/api\//.test(u)) {
        const m = u.match(/github\.io\/.+?(\/api\/.*)$/)
        const path = m ? m[1] : ''
        if (path) return await fetchWithFallback(path, init)
      }
      // Inject anon key for Supabase REST (avoid 400 No API key)
      if (/\.supabase\.co\/rest\/v1\//.test(u)) {
        const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'
        const headers = new Headers(init?.headers || {})
        if (!headers.has('apikey')) headers.set('apikey', anon)
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${anon}`)
        const patchedInit: RequestInit = { ...(init || {}), headers }
        // rewrite resource names if needed
        let urlStr = u
        urlStr = urlStr.replace('/rest/v1/tooling?', '/rest/v1/tooling_info?')
        urlStr = urlStr.replace('/rest/v1/parts?', '/rest/v1/parts_info?')
        // handle devices and fixed_inventory_options via supabase-js to avoid REST 400
        if (supabase) {
          if (/\/rest\/v1\/devices\?/.test(urlStr)) {
            const { data, error } = await supabase.from('devices').select('*')
            if (error) return jsonResponse({ success: false, error: error.message }, 500)
            return jsonResponse(data || [])
          }
          if (/\/rest\/v1\/fixed_inventory_options\?/.test(urlStr)) {
            const { data, error } = await supabase.from('fixed_inventory_options').select('*')
            if (error) return jsonResponse({ success: false, error: error.message }, 500)
            return jsonResponse(data || [])
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
  const u = new URL(url, window.location.origin)
  return u.searchParams
}

async function handleClientSideApi(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    console.log('handleClientSideApi called:', { url, init })
    
    // 无论是否有Supabase实例，都尝试处理请求
    const u = new URL(url, window.location.origin)
    let path = u.pathname
    
    // 提取真正的API路径，移除任何前缀（如/functions/v1）
    const apiPathMatch = path.match(/(\/api\/.*)/)
    if (apiPathMatch) {
      path = apiPathMatch[1]
    }
    
    console.log('Extracted API path:', path)
    const method = (init?.method || 'GET').toUpperCase()
    
    // 如果Supabase可用，优先从Supabase获取数据
    if (supabase) {
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
      // Devices & fixed inventory options
      if (method === 'GET' && path === '/api/tooling/devices') {
        console.log('Fetching devices from Supabase')
        const { data, error } = await supabase.from('devices').select('*')
        console.log('devices result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
      if (method === 'GET' && path === '/api/tooling/fixed-inventory-options') {
        console.log('Fetching fixed_inventory_options from Supabase')
        const { data, error } = await supabase.from('fixed_inventory_options').select('*')
        console.log('fixed_inventory_options result:', { data, error })
        return jsonResponse({ data: error ? [] : (data || []) })
      }
    }
    
    // 只有在Supabase不可用或查询失败时，才使用模拟数据
    const mockData = {
      '/api/options/production-units': { data: [{ id: 1, name: '测试投产单位', description: '测试描述', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] },
      '/api/options/tooling-categories': { data: [{ id: 1, name: '测试工装类别', description: '测试描述', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] },
      '/api/options/material-sources': { data: [{ id: 1, name: '测试材料来源', description: '测试描述', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] },
      '/api/materials': { data: [{ id: 1, name: '测试材料', density: 7.85, unit_price: 100, effective_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] },
      '/api/part-types': { data: [{ id: 1, name: '测试部件类型', description: '测试描述', volume_formula: '长*宽*高', input_format: 'A*B*C', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] },
      '/api/tooling/devices': { data: [{ id: '1', device_no: 'DEV001', device_name: '测试设备', max_aux_minutes: 60 }] },
      '/api/tooling/fixed-inventory-options': { data: [{ id: '1', option_value: 'TEST', option_label: '测试选项', is_active: true }] }
    }
    
    if (mockData[path as keyof typeof mockData]) {
      console.log('Returning mock data for:', path)
      return jsonResponse(mockData[path as keyof typeof mockData])
    }
    
    // 如果Supabase可用，继续处理其他API端点
    if (supabase) {
      // Tooling list
      if (method === 'GET' && path === '/api/tooling') {
        const qs = getQuery(url)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 50)
        const { data, error } = await supabase
          .from('tooling_info')
          .select('id,inventory_number,production_unit,category,received_date,demand_date,completed_date,project_name')
          .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        if (error) return jsonResponse({ data: [] })
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
        return jsonResponse({ data: items })
      }
      
      // Create tooling
      if (method === 'POST' && path === '/api/tooling') {
        const body = init?.body ? await new Response(init.body).json() : {}
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
        return jsonResponse({ data: data })
      }
      
      // Update tooling
      if (method === 'PUT' && path.match(/^\/api\/tooling\/[^\/]+$/)) {
        const toolingId = path.split('/').pop()
        if (!toolingId) return jsonResponse({ success: false, error: 'Invalid tooling ID' }, 400)
        const body = init?.body ? await new Response(init.body).json() : {}
        const { data, error } = await supabase
          .from('tooling')
          .update(body)
          .eq('id', toolingId)
          .select('*')
          .single()
        if (error) return jsonResponse({ success: false, error: error.message }, 500)
        return jsonResponse({ data: data })
      }
      
      // Batch delete tooling
      if (method === 'POST' && path === '/api/tooling/batch-delete') {
        const body = init?.body ? await new Response(init.body).json() : {}
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
        const body = init?.body ? await new Response(init.body).json() : {}
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
        const body = init?.body ? await new Response(init.body).json() : {}
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
        const { data, error } = await supabase.from('users').select('id,real_name,phone')
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Tooling parts by toolingId
      const partsMatch = path.match(/^\/api\/tooling\/([^\/]+)\/parts$/)
      if (method === 'GET' && partsMatch) {
        const toolingId = partsMatch[1]
        const { data, error } = await supabase
          .from('parts_info')
          .select('*')
          .eq('tooling_id', toolingId)
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Child items by toolingId
      const childMatch = path.match(/^\/api\/tooling\/([^\/]+)\/child-items$/)
      if (method === 'GET' && childMatch) {
        const toolingId = childMatch[1]
        const { data, error } = await supabase
          .from('child_items')
          .select('*')
          .eq('tooling_id', toolingId)
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Work hours
      if (method === 'GET' && path === '/api/tooling/work-hours') {
        const qs = getQuery(url)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 200)
        const order = qs.get('order') || 'work_date'
        const orderDir = (qs.get('order_dir') || 'desc').toLowerCase() === 'asc'
        const { data, error } = await supabase.from('work_hours').select('*')
          .order(order, { ascending: orderDir })
          .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Cutting orders list
      if (method === 'GET' && path === '/api/cutting-orders') {
        const qs = getQuery(url)
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
        const qs = getQuery(url)
        const page = Number(qs.get('page') || 1)
        const pageSize = Number(qs.get('pageSize') || 1000)
        let q = supabase.from('purchase_orders').select('*')
        q = q.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
        const { data, error } = await q
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }

      // Devices / fixed inventory options
      if (method === 'GET' && path === '/api/tooling/devices') {
        const { data, error } = await supabase.from('devices').select('*')
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }
      if (method === 'GET' && path === '/api/tooling/fixed-inventory-options') {
        const { data, error } = await supabase.from('fixed_inventory_options').select('*')
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
        if (error) return jsonResponse({ data: [] })
        return jsonResponse({ data: data || [] })
      }
    }
    return null
  } catch (e: any) {
    return jsonResponse({ success: false, error: e?.message || 'Client-side API error' }, 500)
  }
}
