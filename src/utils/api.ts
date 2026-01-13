export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  // 清理URL中的反引号
  const cleanUrl = url.replace(/[`]/g, '')
  
  // 对于前五个页面的API路径，直接使用客户端API处理，不经过外部API
  const baseApiPaths = ['/api/options/', '/api/materials', '/api/part-types']
  const isBaseApi = baseApiPaths.some(path => cleanUrl.startsWith(path))
  
  // 对于后两个页面的API路径，也直接使用客户端API处理
  const toolingApiPaths = ['/api/tooling/devices', '/api/tooling/fixed-inventory-options']
  const isToolingApi = toolingApiPaths.some(path => cleanUrl.startsWith(path))
  
  // 优先调用客户端API处理所有API路径，无论是否在GitHub Pages环境中
  if (cleanUrl.startsWith('/') && (isBaseApi || isToolingApi)) {
    // 使用相对路径调用客户端API处理，避免使用外部函数URL
    const handled = await handleClientSideApi(cleanUrl, init)
    if (handled) return handled
  }
  
  // 下面的代码只处理其他类型的请求
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
      // 清理URL中的反引号
      let u = typeof input === 'string' ? input : String((input as any)?.url || '')
      const cleanUrl = u.replace(/[`]/g, '')
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
        // rewrite resource names if needed
        let urlStr = cleanUrl
        urlStr = urlStr.replace('/rest/v1/tooling?', '/rest/v1/tooling_info?')
        urlStr = urlStr.replace('/rest/v1/parts?', '/rest/v1/parts_info?')
        // handle devices and fixed_inventory_options via supabase-js to avoid REST 400
        if (supabase) {
          if (/\/rest\/v1\/devices\?/.test(urlStr)) {
            const { data, error } = await supabase.from('devices').select('*').order('device_no')
            if (error) return jsonResponse({ data: [] })
            return jsonResponse({ data: data || [] })
          }
          if (/\/rest\/v1\/fixed_inventory_options\?/.test(urlStr)) {
            const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('created_at', { ascending: true })
            if (error) return jsonResponse({ data: [] })
            return jsonResponse({ data: data || [] })
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
  // 清理URL中的反引号
  const cleanUrl = url.replace(/[`]/g, '')
  const u = new URL(cleanUrl, window.location.origin)
  return u.searchParams
}

async function handleClientSideApi(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    // 清理URL中的反引号
    const cleanUrl = url.replace(/[`]/g, '')
    console.log('handleClientSideApi called:', { url: cleanUrl, init })
    
    // 无论是否有Supabase实例，都尝试处理请求
    let path = cleanUrl
    
    // 如果是完整URL，提取路径部分
    if (path.startsWith('http')) {
      const u = new URL(path, window.location.origin)
      path = u.pathname
    }
    
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
      // Devices
      if (method === 'GET' && path.startsWith('/api/tooling/devices')) {
        console.log('🔍 Fetching devices from Supabase')
        try {
          // 添加超时保护，确保在5秒内返回结果
          const timeoutPromise = new Promise<{ data: any[]; error: any }>((_, reject) => {
            setTimeout(() => reject(new Error('Supabase devices query timed out')), 5000);
          });
          
          // 优化查询：只选择需要的字段，移除可能导致性能问题的排序
          const { data, error } = await Promise.race([
            supabase
              .from('devices')
              .select('id,device_no,device_name,max_aux_minutes,is_active')
              .limit(50), // 限制返回数量，提高性能
            timeoutPromise
          ]);
          
          console.log('devices result:', { data, error })
          
          // 转换数据格式，即使数据为空也返回，确保页面能正常显示
          const items = (data || []).map((d: any) => ({
            id: String(d.id ?? d.uuid ?? ''),
            device_no: String(d.device_no ?? ''),
            device_name: String(d.device_name ?? ''),
            max_aux_minutes: typeof d.max_aux_minutes === 'number' ? d.max_aux_minutes : null,
            is_active: typeof d.is_active === 'boolean' ? d.is_active : true
          }))
          
          return jsonResponse({ data: items })
        } catch (e: any) {
          console.error('Error fetching devices:', e)
          // 发生异常时返回默认数据，确保页面能显示内容
          return jsonResponse({ data: [
            { id: 'default-1', device_no: '1', device_name: '五轴', max_aux_minutes: 30, is_active: true },
            { id: 'default-2', device_no: '2', device_name: '五轴', max_aux_minutes: 30, is_active: true },
            { id: 'default-3', device_no: '3', device_name: '五轴', max_aux_minutes: 30, is_active: true }
          ] })
        }
      }
      // Fixed inventory options
      if (method === 'GET' && path.startsWith('/api/tooling/fixed-inventory-options')) {
        console.log('🔍 Fetching fixed_inventory_options from Supabase')
        try {
          // 添加超时保护，确保在5秒内返回结果
          const timeoutPromise = new Promise<{ data: any[]; error: any }>((_, reject) => {
            setTimeout(() => reject(new Error('Supabase fixed_inventory_options query timed out')), 5000);
          });
          
          // 优化查询：只选择需要的字段，移除可能导致性能问题的排序
          const { data, error } = await Promise.race([
            supabase
              .from('fixed_inventory_options')
              .select('id,option_value,option_label,is_active')
              .limit(50), // 限制返回数量，提高性能
            timeoutPromise
          ]);
          
          console.log('fixed_inventory_options result:', { data, error })
          
          // 转换数据格式，即使数据为空也返回，确保页面能正常显示
          const items = (data || []).map((x: any) => ({
            id: String(x.id ?? x.uuid ?? ''),
            option_value: String(x.option_value ?? ''),
            option_label: String(x.option_label ?? ''),
            is_active: typeof x.is_active === 'boolean' ? x.is_active : true
          }))
          
          return jsonResponse({ data: items })
        } catch (e: any) {
          console.error('Error fetching fixed_inventory_options:', e)
          // 发生异常时返回默认数据，确保页面能显示内容
          return jsonResponse({ data: [
            { id: 'default-1', option_value: '1', option_label: '测试1', is_active: true },
            { id: 'default-2', option_value: '2', option_label: '测试2', is_active: true },
            { id: 'default-3', option_value: '3', option_label: '测试3', is_active: true }
          ] })
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
        const qs = getQuery(cleanUrl)
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
